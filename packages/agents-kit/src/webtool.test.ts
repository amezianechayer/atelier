import { describe, expect, it, vi } from 'vitest';
import { createWebFetch, htmlToText, validateFetchUrl } from './webtool';

const ALLOWLIST = ['example.com', 'docs.python.org'];

describe('validateFetchUrl (allowlist en code + garde SSRF, SPEC.md §7/§11)', () => {
  it.each([
    ['https://example.com/page', true, ''],
    ['https://sub.example.com/x?q=1', true, ''],
    ['https://docs.python.org/3/', true, ''],
  ])('autorise %s', (url, ok) => {
    const res = validateFetchUrl(url, ALLOWLIST);
    expect(res.ok).toBe(ok);
  });

  it.each([
    ['http://example.com/', /https/i],
    ['https://evil.com/', /allowlist/i],
    ['https://example.com.evil.com/', /allowlist/i],
    ['https://notexample.com/', /allowlist/i],
    ['https://127.0.0.1/', /allowlist|IP/i],
    ['https://[::1]/', /allowlist|IP/i],
    ['https://192.168.1.10/admin', /allowlist|IP/i],
    ['https://10.0.0.1/', /allowlist|IP/i],
    ['https://169.254.169.254/latest/meta-data', /allowlist|IP/i],
    ['https://localhost/', /allowlist|localhost/i],
    ['https://user:pass@example.com/', /identifiants/i],
    ['https://example.com:8443/', /port/i],
    ['ftp://example.com/', /https/i],
    ['pas-une-url', /invalide/i],
  ])('rejette %s', (url, reason) => {
    const res = validateFetchUrl(url, ALLOWLIST);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(reason);
  });
});

describe('htmlToText', () => {
  it('supprime scripts, styles et balises, garde le texte', () => {
    const html =
      '<html><head><style>.x{}</style><script>evil()</script></head>' +
      '<body><h1>Titre</h1><p>Un <b>texte</b> &amp; des entit&eacute;s.</p></body></html>';
    const text = htmlToText(html);
    expect(text).toContain('Titre');
    expect(text).toContain('Un texte & des entités.');
    expect(text).not.toContain('evil');
    expect(text).not.toContain('<');
  });

  it('tronque au plafond demandé', () => {
    expect(htmlToText(`<p>${'a'.repeat(100)}</p>`, 10)).toHaveLength(10);
  });
});

describe('createWebFetch', () => {
  it('refuse une URL hors allowlist sans faire de requête', async () => {
    const fetchFn = vi.fn();
    const web = createWebFetch({ allowlist: ALLOWLIST, fetchFn });
    await expect(web('https://evil.com/')).rejects.toThrowError(/allowlist/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('récupère et convertit une page autorisée', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response('<html><body><p>Contenu utile</p></body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    );
    const web = createWebFetch({ allowlist: ALLOWLIST, fetchFn });
    await expect(web('https://example.com/doc')).resolves.toContain('Contenu utile');
  });

  it('suit une redirection uniquement si la cible passe aussi le garde', async () => {
    const fetchFn = vi.fn(async (input: URL | string) => {
      const url = String(input);
      if (url === 'https://example.com/a') {
        return new Response(null, { status: 302, headers: { location: 'https://evil.com/b' } });
      }
      return new Response('ok', { status: 200 });
    });
    const web = createWebFetch({ allowlist: ALLOWLIST, fetchFn });
    await expect(web('https://example.com/a')).rejects.toThrowError(/allowlist/);
  });

  it('remonte une erreur actionnable sur HTTP non-2xx', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 404 }));
    const web = createWebFetch({ allowlist: ALLOWLIST, fetchFn });
    await expect(web('https://example.com/x')).rejects.toThrowError(/404/);
  });
});
