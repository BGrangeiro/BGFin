import { writeFileSync, existsSync } from 'node:fs';
import { ACCOUNTS } from '../lib/auth-accounts.js';
const path = process.argv[2];
if (!path) throw new Error('Informe o caminho do arquivo de contas.');
if (!existsSync(path)) writeFileSync(path, JSON.stringify(ACCOUNTS, null, 2), { flag: 'wx', mode: 0o600, flush: true });
console.log('Arquivo de contas disponível.');
