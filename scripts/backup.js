import { resolve, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { createSnapshot, pruneSnapshots } from '../lib/backups.js';
import { projectRoot } from '../lib/data-paths.js';

process.umask(0o077);
const directory = resolve(process.env.BACKUP_DIR || join(projectRoot, 'backups'));
const hours = Number(process.env.BACKUP_INTERVAL_HOURS || 6), keep = Number(process.env.BACKUP_KEEP || 120);
if (!Number.isFinite(hours) || hours < 1 || !Number.isInteger(keep) || keep < 2) throw new Error('Configuração de backups inválida.');
if (process.argv.includes('--check')) {
  const latest = JSON.parse(readFileSync(join(directory, 'latest.json'), 'utf8'));
  const safeName = typeof latest.name === 'string' && /^[\w.-]+$/.test(latest.name) && !latest.name.startsWith('.');
  if (!safeName || !existsSync(join(directory, latest.name, 'manifest.json')) || !Number.isFinite(Date.parse(latest.created_at)) || Date.now() - Date.parse(latest.created_at) > hours * 2 * 3600000) throw new Error('O backup automático está atrasado ou indisponível.');
} else {
  do {
    const path = await createSnapshot({ outputDir: directory });
    pruneSnapshots(directory, keep);
    console.log(`Backup verificado: ${path}`);
    if (!process.argv.includes('--watch')) break;
    await setTimeout(hours * 3600000);
  } while (true);
}
