import { PassThrough } from 'node:stream';
import Docker from 'dockerode';
import { pino } from 'pino';
import { type FileMap, filesToTar, tarToFiles } from './tar';

/**
 * Sandbox durcie du Builder (SPEC.md §11) pilotée par dockerode.
 * - non-root, rootfs read-only sauf tmpfs (/workspace, /tmp, $HOME)
 * - caps drop ALL, no-new-privileges, limites pids/mémoire/cpu, timeout dur
 * - egress deny-by-default : réseau `internal` + proxy CONNECT à allowlist api.anthropic.com
 * - AUCUN token utilisateur, AUCUN socket Docker monté
 * Le workspace transite par tar (putArchive/getArchive), pas de bind-mount hôte.
 */

const logger = pino({ name: 'atelier-sandbox' });

const INTERNAL_NET = 'atelier-sandbox-internal';
const EXTERNAL_NET = 'atelier-sandbox-egress';
const PROXY_NAME = 'atelier-egress-proxy';
const PROXY_PORT = 8888;
const ALLOWLIST = 'api.anthropic.com';

let docker: Docker | undefined;
export function getDocker(): Docker {
  docker ??= new Docker();
  return docker;
}

async function ignoreConflict(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 409 && status !== 304) throw err;
  }
}

/** Crée (idempotent) les réseaux et le conteneur proxy egress. */
export async function ensureEgress(image: string): Promise<void> {
  const d = getDocker();

  await ignoreConflict(() =>
    d.createNetwork({ Name: INTERNAL_NET, Internal: true, CheckDuplicate: true }),
  );
  await ignoreConflict(() => d.createNetwork({ Name: EXTERNAL_NET, CheckDuplicate: true }));

  // Le proxy tourne-t-il déjà ?
  const existing = await d.listContainers({ all: true, filters: { name: [PROXY_NAME] } });
  const running = existing.find((c) => c.Names.some((n) => n.replace(/^\//, '') === PROXY_NAME));
  if (running?.State === 'running') return;
  if (running) {
    await ignoreConflict(() => d.getContainer(running.Id).remove({ force: true }));
  }

  const proxy = await d.createContainer({
    name: PROXY_NAME,
    Image: image,
    Cmd: ['node', '/opt/egress-proxy.mjs'],
    Env: [`ALLOWLIST=${ALLOWLIST}`, `PROXY_PORT=${PROXY_PORT}`],
    HostConfig: {
      NetworkMode: INTERNAL_NET,
      RestartPolicy: { Name: 'unless-stopped' },
      Memory: 128 * 1024 * 1024,
      PidsLimit: 64,
    },
  });
  // Deuxième patte : accès internet pour joindre api.anthropic.com.
  await ignoreConflict(() => d.getNetwork(EXTERNAL_NET).connect({ Container: proxy.id }));
  await proxy.start();
  logger.info('proxy egress prêt (allowlist api.anthropic.com)');
}

export interface SandboxEvent {
  type: 'thought' | 'tool' | 'usage' | 'error';
  text?: string;
  toolName?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export interface SandboxResult {
  files: FileMap;
  summary: string;
  costUsd: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  isError: boolean;
}

interface ClaudeResultEvent {
  type: 'result';
  subtype?: string;
  is_error?: boolean;
  result?: string;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  modelUsage?: Record<string, unknown>;
}

function parseStreamLine(line: string, emit: (e: SandboxEvent) => void): ClaudeResultEvent | null {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }
  if (event.type === 'assistant' && typeof event.message === 'object' && event.message !== null) {
    const content = (event.message as { content?: unknown }).content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === 'text' && typeof block.text === 'string') {
          emit({ type: 'thought', text: block.text });
        } else if (block?.type === 'tool_use' && typeof block.name === 'string') {
          emit({ type: 'tool', toolName: block.name });
        }
      }
    }
    return null;
  }
  if (event.type === 'result') return event as unknown as ClaudeResultEvent;
  return null;
}

/**
 * Exécute le Builder : injecte `template` dans /workspace, lance Claude Code headless
 * avec `prompt`, récupère les fichiers modifiés et le coût réel.
 */
export async function runBuilderSandbox(input: {
  image: string;
  anthropicApiKey: string;
  template: FileMap;
  prompt: string;
  onEvent: (e: SandboxEvent) => Promise<void>;
  timeoutMs?: number;
}): Promise<SandboxResult> {
  const d = getDocker();
  const timeoutMs = input.timeoutMs ?? 300_000;
  await ensureEgress(input.image);

  const container = await d.createContainer({
    Image: input.image,
    User: 'builder',
    WorkingDir: '/workspace',
    Cmd: ['sleep', String(Math.ceil(timeoutMs / 1000) + 60)],
    Env: [
      `HTTPS_PROXY=http://${PROXY_NAME}:${PROXY_PORT}`,
      `HTTP_PROXY=http://${PROXY_NAME}:${PROXY_PORT}`,
      'NO_PROXY=',
      `ANTHROPIC_API_KEY=${input.anthropicApiKey}`,
      'HOME=/home/builder',
      'DISABLE_TELEMETRY=1',
      'DISABLE_AUTOUPDATER=1',
      'DISABLE_ERROR_REPORTING=1',
      'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1',
    ],
    HostConfig: {
      NetworkMode: INTERNAL_NET,
      ReadonlyRootfs: true,
      Tmpfs: {
        '/workspace': 'rw,size=256m,mode=1777',
        '/tmp': 'rw,size=64m,mode=1777',
        '/home/builder': 'rw,size=128m,mode=1777',
      },
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      PidsLimit: 512,
      Memory: 2 * 1024 * 1024 * 1024,
      NanoCpus: 2 * 1_000_000_000,
      AutoRemove: false,
    },
  });

  const hardKill = setTimeout(() => {
    container.kill().catch(() => {});
  }, timeoutMs);

  try {
    await container.start();
    await container.putArchive(filesToTar(input.template), { path: '/workspace' });

    const exec = await container.exec({
      Cmd: [
        'claude',
        '-p',
        input.prompt,
        '--output-format',
        'stream-json',
        '--verbose',
        '--permission-mode',
        'acceptEdits',
      ],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: '/workspace',
    });

    const stream = await exec.start({ hijack: true, stdin: false });
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    d.modem.demuxStream(stream, stdout, stderr);

    // Conteneur : l'affectation se fait dans un callback, un objet évite le narrowing CFA.
    const holder: { result: ClaudeResultEvent | null } = { result: null };
    let buffer = '';
    const events: Promise<void>[] = [];
    stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let nl: number;
      // biome-ignore lint/suspicious/noAssignInExpressions: pattern de lecture ligne à ligne
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line === '') continue;
        const r = parseStreamLine(line, (e) => events.push(input.onEvent(e)));
        if (r) holder.result = r;
      }
    });

    await new Promise<void>((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    await Promise.allSettled(events);

    // Récupère le workspace personnalisé.
    const tarStream = await container.getArchive({ path: '/workspace' });
    const files = await tarToFiles(tarStream as unknown as NodeJS.ReadableStream, {
      stripPrefix: 'workspace/',
    });

    const finalResult = holder.result;
    if (!finalResult) {
      throw new Error('sandbox : Claude Code n’a pas produit d’événement result (voir logs).');
    }
    const usage = finalResult.usage ?? {};
    const costUsd = finalResult.total_cost_usd ?? 0;
    await input.onEvent({
      type: 'usage',
      model: 'claude-code',
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      costUsd,
    });

    return {
      files,
      summary: finalResult.result ?? '',
      costUsd,
      model: 'claude-code',
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      isError: finalResult.is_error ?? false,
    };
  } finally {
    clearTimeout(hardKill);
    await container.remove({ force: true }).catch(() => {});
  }
}
