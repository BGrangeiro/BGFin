import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { randomBytes, scryptSync } from 'node:crypto';
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadAccounts } from '../lib/config.js';

if (!process.stdin.isTTY) throw new Error('Execute este comando em um terminal interativo (Docker: -it).');
process.umask(0o077);
const path = resolve(process.argv[2] || 'secrets/accounts.json');
const accounts = loadAccounts(path);
let hidden = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!hidden) process.stdout.write(chunk, encoding); callback(); } });
const terminal = createInterface({ input: process.stdin, output, terminal: true });
async function secret(prompt) {
  process.stdout.write(prompt); hidden = true;
  try { return await terminal.question(''); } finally { hidden = false; process.stdout.write('\n'); }
}
try {
  const id = (await terminal.question('Conta (Bruno ou Ana): ')).trim().toLowerCase();
  const account = accounts.find(item => item.id === id);
  if (!account) throw new Error('Conta inválida.');
  const password = await secret('Nova senha (pelo menos 12 caracteres): ');
  const confirmation = await secret('Repita a senha: ');
  if (password.length < 12 || password.length > 256 || password !== confirmation) throw new Error('As senhas devem coincidir e conter de 12 a 256 caracteres.');
  const salt = randomBytes(16).toString('hex');
  account.salt = salt;
  account.hash = scryptSync(password.toLowerCase(), salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex');
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(temporary, JSON.stringify(accounts, null, 2), { mode: 0o600, flush: true });
  renameSync(temporary, path);
  console.log('Senha atualizada. Reinicie o aplicativo para aplicar.');
} finally { terminal.close(); }
