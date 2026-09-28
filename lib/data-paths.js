import { dirname, resolve, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function databaseFiles(primary = process.env.DB_PATH || resolve(projectRoot, 'data', 'saldo.sqlite')) {
  if (primary === ':memory:') return { bruno: primary, ana: primary };
  const file = parse(resolve(primary));
  return { bruno: resolve(primary), ana: resolve(file.dir, `${file.name}-ana${file.ext || '.sqlite'}`) };
}
