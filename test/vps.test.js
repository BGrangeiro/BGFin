import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../lib/database.js';
import { databaseFiles } from '../lib/data-paths.js';
import { createSnapshot, verifySnapshot, pruneSnapshots, removeChild } from '../lib/backups.js';
import { restoreSnapshot } from '../lib/restore.js';
import { runtimeConfig, loadAccounts, validateRequestOrigin, clientAddress } from '../lib/config.js';
import { createApp } from '../server.js';
import { createAuth } from '../lib/auth.js';
import { request as httpRequest } from 'node:http';
import { testAccounts, testPassword } from '../support/http-fixture.js';

const note = title => ({ kind: 'note', status: 'todo', priority: 'medium', title, content: '' });
function directory(t) { const path = mkdtempSync(join(tmpdir(), 'persona-vps-')); t.after(() => removeChild(tmpdir(), path)); return path; }

test('produção exige HTTPS e domínio explícito; proxy não altera a origem permitida', () => {
  assert.throws(() => runtimeConfig({ NODE_ENV: 'production' }), /PUBLIC_ORIGIN/);
  assert.throws(() => runtimeConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'http://persona.example.com' }), /https/);
  for (const origin of ['https://persona.example.com/path', 'https://user:pass@persona.example.com', 'https://persona.example.com/?x=1']) assert.throws(() => runtimeConfig({ PUBLIC_ORIGIN: origin }));
  const config = runtimeConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://persona.example.com', TRUST_PROXY: '1', HOST: '0.0.0.0' });
  assert.equal(config.secureCookies, true);
  const req = { method: 'POST', headers: { host: 'persona.example.com', origin: 'https://persona.example.com' } };
  assert.equal(validateRequestOrigin(req, config), 'https://persona.example.com');
  assert.throws(() => validateRequestOrigin({ ...req, headers: { ...req.headers, host: 'evil.example.com' } }, config), error => error.status === 403);
  assert.throws(() => validateRequestOrigin({ ...req, headers: { ...req.headers, origin: 'http://persona.example.com', 'x-forwarded-proto': 'https' } }, config));
  assert.throws(() => validateRequestOrigin({ ...req, headers: { ...req.headers, 'sec-fetch-site': 'cross-site' } }, config));
  assert.equal(validateRequestOrigin({ method: 'GET', headers: { host: 'persona.example.com', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' } }, config), config.publicOrigin);
});

test('IP encaminhado só vale para proxy privado autorizado e precisa ser um endereço válido', () => {
  const config = { trustProxy: true }, req = { socket: { remoteAddress: '::ffff:172.20.0.2' }, headers: { 'x-persona-client-ip': '203.0.113.4' } };
  assert.equal(clientAddress(req, config), '203.0.113.4');
  assert.equal(clientAddress(req, { trustProxy: false }), '172.20.0.2');
  assert.equal(clientAddress({ ...req, socket: { remoteAddress: '198.51.100.8' } }, config), '198.51.100.8');
  assert.equal(clientAddress({ ...req, headers: { 'x-persona-client-ip': 'forged, 203.0.113.4' } }, config), '172.20.0.2');
});

test('HTTPS atrás de proxy mantém login, cookie Secure, host/origem e isolamento', async t => {
  const config = runtimeConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://persona.example.com', TRUST_PROXY: '1' });
  const auth = createAuth({ accounts: testAccounts, secureCookies: config.secureCookies, clientAddress: req => clientAddress(req, config) });
  const { server } = createApp({ databasePath: ':memory:', config, auth });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) => new Promise((resolve, reject) => {
    const outgoing = httpRequest(base + path, options, incoming => {
      const chunks = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('end', () => resolve({ status: incoming.statusCode, headers: { get: key => { const value = incoming.headers[key.toLowerCase()]; return Array.isArray(value) ? value[0] : value; } }, json: async () => JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    outgoing.on('error', reject); outgoing.end(options.body);
  });
  const headers = { Host: 'persona.example.com', Origin: config.publicOrigin, 'Content-Type': 'application/json', 'X-Persona-Client-IP': '203.0.113.10' };
  assert.equal((await fetch(base + '/healthz')).status, 200);
  assert.equal((await fetch(base + '/')).status, 403);
  const login = await request('/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ username: 'BRUNO', password: testPassword }) });
  assert.equal(login.status, 200); assert.match(login.headers.get('set-cookie'), /; Secure/);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/personal', { headers: { ...headers, Cookie: cookie } })).status, 200);
  assert.equal((await request('/api/personal', { headers: { ...headers, Cookie: cookie, Origin: 'https://evil.example.com' } })).status, 403);
  assert.equal((await request('/secrets/accounts.json', { headers })).status, 404);
  assert.equal((await request('/backups/latest.json', { headers })).status, 404);
});

test('backup online inclui gravações do WAL de ambas as contas e restaura depois de reiniciar', async t => {
  const root = directory(t), databasePath = join(root, 'data', 'saldo.sqlite'), outputDir = join(root, 'backups');
  const paths = databaseFiles(databasePath), bruno = openDatabase(paths.bruno), ana = openDatabase(paths.ana);
  let closed = false;
  try {
    bruno.notes.add(note('Bruno antes')); ana.notes.add(note('Ana antes'));
    assert.equal(bruno.db.prepare('PRAGMA synchronous').get().synchronous, 2);
    assert.ok(existsSync(paths.bruno + '-wal'));
    const snapshot = await createSnapshot({ databasePath, outputDir }); verifySnapshot(snapshot);
    bruno.notes.add(note('Bruno depois')); ana.notes.add(note('Ana depois'));
    await assert.rejects(restoreSnapshot({ snapshotDir: snapshot, databasePath, backupDir: outputDir }), /Encerre/);
    bruno.close(); ana.close(); closed = true;
    const restored = await restoreSnapshot({ snapshotDir: snapshot, databasePath, backupDir: outputDir });
    assert.ok(restored.previous); verifySnapshot(restored.previous);
    for (const [id, title] of [['bruno', 'Bruno antes'], ['ana', 'Ana antes']]) {
      const db = openDatabase(paths[id]); try { assert.deepEqual(db.notes.list().map(item => item.title), [title]); } finally { db.close(); }
    }
  } finally { if (!closed) { bruno.close(); ana.close(); } }
});

test('backup corrompido não modifica os dados; retenção não apaga pastas desconhecidas', async t => {
  const root = directory(t), databasePath = join(root, 'saldo.sqlite'), outputDir = join(root, 'backups');
  const store = openDatabase(databasePath); store.notes.add(note('Preservar')); store.close();
  const snapshots = [];
  for (let i = 0; i < 3; i++) snapshots.push(await createSnapshot({ databasePath, outputDir, now: new Date(Date.UTC(2026, 8, 28, i)) }));
  const anaBackup = openDatabase(join(snapshots[2], 'ana.sqlite'));
  assert.equal(anaBackup.notes.list().length, 0); anaBackup.close();
  mkdirSync(join(outputDir, 'copia-manual'));
  pruneSnapshots(outputDir, 2);
  assert.equal(existsSync(snapshots[0]), false); assert.equal(existsSync(snapshots[1]), true); assert.ok(existsSync(join(outputDir, 'copia-manual')));
  const original = readFileSync(databasePath);
  writeFileSync(join(snapshots[1], 'ana.sqlite'), 'corrompido');
  await assert.rejects(restoreSnapshot({ snapshotDir: snapshots[1], databasePath, backupDir: outputDir }), /alterado/);
  assert.deepEqual(readFileSync(databasePath), original);
  assert.equal(readdirSync(outputDir).some(name => name.startsWith('.partial-')), false);
  assert.throws(() => removeChild(root, root), /inválido/);
  assert.throws(() => removeChild(root, '..'), /inválido/);
});

test('arquivo de contas externo valida hashes e não permite usuários diferentes', t => {
  const root = directory(t), path = join(root, 'accounts.json');
  const accounts = loadAccounts(null); writeFileSync(path, JSON.stringify(accounts));
  assert.deepEqual(loadAccounts(path), accounts);
  writeFileSync(path, JSON.stringify([{ ...accounts[0], id: 'admin' }, accounts[1]]));
  assert.throws(() => loadAccounts(path), /inválido/);
});
