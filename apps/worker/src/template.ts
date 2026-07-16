import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FileMap } from './sandbox/tar';

/**
 * Charge un template de venture (SPEC.md §2.4) depuis templates/ en FileMap.
 * Les templates sont hors du workspace pnpm : on lit les fichiers directement.
 */

const TEMPLATES_DIR = fileURLToPath(new URL('../../../templates', import.meta.url));
const IGNORE = new Set(['node_modules', '.next', '.turbo', '.git']);

export type TemplateName = 'landing' | 'vitrine';

function walk(dir: string, root: string, out: FileMap): void {
  for (const entry of readdirSync(dir)) {
    if (IGNORE.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, root, out);
    } else {
      out[relative(root, full).split('\\').join('/')] = readFileSync(full, 'utf8');
    }
  }
}

export function loadTemplate(name: TemplateName): FileMap {
  const root = join(TEMPLATES_DIR, name);
  const files: FileMap = {};
  walk(root, root, files);
  if (Object.keys(files).length === 0) {
    throw new Error(`template « ${name} » vide ou introuvable dans ${TEMPLATES_DIR}`);
  }
  return files;
}
