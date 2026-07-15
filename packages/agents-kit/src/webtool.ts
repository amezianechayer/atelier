/**
 * Outil web des agents (SPEC.md §7) : fetch avec allowlist appliquée EN CODE + garde
 * SSRF (SPEC.md §11 — le contenu web est non fiable, la sécurité ne repose jamais sur
 * les prompts). La recherche vit dans websearch.ts.
 */

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[/, // toute IPv6 littérale ([::1], [fd00::...], etc.)
];

const IP_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

export function validateFetchUrl(rawUrl: string, allowlist: readonly string[]): UrlCheck {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: `URL invalide : ${rawUrl}` };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'seul https:// est autorisé' };
  }
  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: "les identifiants dans l'URL sont interdits" };
  }
  if (url.port !== '') {
    return { ok: false, reason: 'seul le port https par défaut (443) est autorisé' };
  }
  const host = url.hostname;
  if (IP_LITERAL.test(host) || PRIVATE_HOST_PATTERNS.some((re) => re.test(host))) {
    return { ok: false, reason: `hôte « ${host} » hors allowlist (IP ou hôte local interdit)` };
  }
  const allowed = allowlist.some((entry) => host === entry || host.endsWith(`.${entry}`));
  if (!allowed) {
    return { ok: false, reason: `hôte « ${host} » hors allowlist` };
  }
  return { ok: true, url };
}

/** Extraction de texte volontairement fruste : suffisante pour du contexte d'agent. */
export function htmlToText(html: string, maxChars = 50_000): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&eacute;/g, 'é')
    .replace(/&egrave;/g, 'è')
    .replace(/&agrave;/g, 'à')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, maxChars);
}

/** Sous-ensemble de fetch suffisant ici — permet des mocks typés sans lib DOM. */
export type FetchLike = (input: URL | string, init?: RequestInit) => Promise<Response>;

export interface WebFetchOptions {
  allowlist: readonly string[];
  maxChars?: number;
  maxRedirects?: number;
  timeoutMs?: number;
  fetchFn?: FetchLike;
}

export type WebFetchFn = (url: string) => Promise<string>;

export function createWebFetch(options: WebFetchOptions): WebFetchFn {
  const {
    allowlist,
    maxChars = 50_000,
    maxRedirects = 3,
    timeoutMs = 15_000,
    fetchFn = fetch,
  } = options;

  return async function webFetch(rawUrl: string): Promise<string> {
    let current = rawUrl;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const check = validateFetchUrl(current, allowlist);
      if (!check.ok) throw new Error(`web.fetch refusé : ${check.reason}`);

      const res = await fetchFn(check.url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'atelier-agent/1.0', Accept: 'text/html,text/plain' },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) throw new Error('web.fetch : redirection sans en-tête Location');
        current = new URL(location, check.url).toString();
        continue;
      }
      if (!res.ok) {
        throw new Error(`web.fetch : HTTP ${res.status} sur ${check.url.hostname}`);
      }
      const body = await res.text();
      const contentType = res.headers.get('content-type') ?? '';
      return contentType.includes('html') ? htmlToText(body, maxChars) : body.slice(0, maxChars);
    }
    throw new Error('web.fetch : trop de redirections');
  };
}
