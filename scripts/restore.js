import { resolve } from 'node:path';
import { restoreSnapshot } from '../lib/restore.js';
process.umask(0o077);
const path = process.argv[2];
if (!path || !process.argv.includes('--confirm')) throw new Error('Uso: node scripts/restore.js /backups/PASTA --confirm. Pare app e backup antes de executar.');
const result = await restoreSnapshot({ snapshotDir: resolve(path), backupDir: resolve(process.env.BACKUP_DIR || 'backups') });
console.log(`Bancos de Bruno e Ana restaurados.${result.previous ? ` Cópia anterior: ${result.previous}` : ''}`);
