import { Readable } from 'node:stream';
import { extract, pack } from 'tar-stream';

/** Fichiers texte d'un workspace : chemin relatif -> contenu. */
export type FileMap = Record<string, string>;

/** Construit un tar en mémoire (pour dockerode putArchive). */
export function filesToTar(files: FileMap): Readable {
  const p = pack();
  for (const [name, content] of Object.entries(files)) {
    p.entry({ name }, content);
  }
  p.finalize();
  return Readable.from(p);
}

/** Lit un tar (dockerode getArchive) et renvoie les fichiers texte sous `prefix`. */
export async function tarToFiles(
  stream: NodeJS.ReadableStream,
  opts: { stripPrefix?: string; maxBytes?: number } = {},
): Promise<FileMap> {
  const stripPrefix = opts.stripPrefix ?? '';
  const maxBytes = opts.maxBytes ?? 8 * 1024 * 1024;
  const files: FileMap = {};
  const ex = extract();

  return new Promise<FileMap>((resolve, reject) => {
    ex.on('entry', (header, entryStream, next) => {
      if (header.type !== 'file') {
        entryStream.resume();
        entryStream.on('end', next);
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      entryStream.on('data', (c: Buffer) => {
        size += c.length;
        if (size <= maxBytes) chunks.push(c);
      });
      entryStream.on('end', () => {
        let name = header.name;
        if (stripPrefix && name.startsWith(stripPrefix)) name = name.slice(stripPrefix.length);
        name = name.replace(/^\/+/, '');
        if (name && size <= maxBytes) files[name] = Buffer.concat(chunks).toString('utf8');
        next();
      });
      entryStream.on('error', reject);
    });
    ex.on('finish', () => resolve(files));
    ex.on('error', reject);
    stream.pipe(ex);
  });
}
