/**
 * Contrats du runtime d'agents — SPEC.md §7, à implémenter tels quels.
 * Toute action de classe C est créée pending, JAMAIS exécutée par un agent.
 */

export type AgentRole = 'ceo' | 'researcher' | 'builder' | 'marketer';

export type ActionKind =
  | 'draft_post'
  | 'publish_post'
  | 'send_email_batch'
  | 'deploy_preview'
  | 'deploy_prod'
  | 'code_change'
  | 'research_report'
  | 'dns_change'
  | 'spend';

export interface Mission {
  id: string;
  ventureId: string;
  agentRole: AgentRole;
  title: string;
  instruction: string;
  priority: number;
}

export interface MemoryDoc {
  slug: string;
  version: number;
  content: string;
}

export interface MemoryChunk {
  content: string;
  source: string;
}

export interface Skill {
  name: string;
  version: number;
  content: string;
}

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

/** Contexte injecté dans chaque exécution d'agent (mémoire de la venture incluse). */
export interface AgentContext {
  ventureId: string;
  ventureName: string;
  pitch: string;
  locale: 'fr' | 'en';
}

/** Phase 4 : poignée de sandbox Docker du Builder. */
export interface SandboxHandle {
  exec(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

/** Lecture des comptes connectés, jamais les secrets (SPEC.md §11). */
export interface IntegrationsReadOnly {
  list(): Promise<Array<{ kind: string; config: Record<string, unknown> }>>;
}

export interface Toolbox {
  web: {
    search(q: string): Promise<WebResult[]>;
    fetch(url: string): Promise<string>;
  }; // allowlist en code
  memory: {
    readDocs(slugs: string[]): Promise<MemoryDoc[]>;
    proposeDocUpdate(slug: string, content: string): Promise<void>; // versionné, pas d'écrasement
    recall(query: string, k?: number): Promise<MemoryChunk[]>; // pgvector
  };
  skills: {
    find(query: string): Promise<Skill[]>;
    create(name: string, markdown: string): Promise<void>;
  };
  actions: {
    propose(
      kind: ActionKind,
      payload: unknown,
    ): Promise<{ actionId: string; class: 'A' | 'B' | 'C'; requiresApproval: boolean }>;
  };
  sandbox?: SandboxHandle; // non-null uniquement pour builder
  integrations: IntegrationsReadOnly;
}

export type AgentEvent =
  | { type: 'thought'; summary: string }
  | { type: 'tool'; name: string; args: unknown }
  | { type: 'usage'; model: string; inputTokens: number; outputTokens: number; costUsd: number }
  | { type: 'error'; message: string };

export interface AgentResult {
  summary: string;
  actionIds: string[];
  memoryUpdates: string[];
}

export interface Agent {
  role: AgentRole;
  /** Exécute une mission. Toute action de classe C est créée pending, JAMAIS exécutée ici. */
  run(
    ctx: AgentContext,
    mission: Mission,
    tools: Toolbox,
    emit: (e: AgentEvent) => Promise<void>,
  ): Promise<AgentResult>;
}
