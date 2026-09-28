import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { createApp } from '../server.js';
import { createAuth } from '../lib/auth.js';
import { openDatabase } from '../lib/database.js';
import { testAccounts, testPassword } from '../support/http-fixture.js';

async function fixture(t, options = {}) {
  const app = createApp({ databasePath: ':memory:', auth: createAuth({ accounts: testAccounts }), ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const close = () => new Promise(resolve => app.server.close(resolve));
  t.after(() => app.server.listening ? close() : undefined);
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const request = (path, { cookie, body, headers, method = body === undefined ? 'GET' : 'POST' } = {}) => fetch(base + path, {
    method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const login = async (username = 'Bruno', password = testPassword, previousCookie) => {
    const response = await request('/api/auth/login', { body: { username, password }, cookie: previousCookie });
    return { response, cookie: response.headers.get('set-cookie')?.split(';')[0], data: await response.json() };
  };
  return { ...app, request, login, close };
}

test('sem sessão: tela de login e APIs bloqueadas, inclusive backup e gravações', async t => {
  const { request, store } = await fixture(t);
  const before = store.exportData();
  const page = await request('/');
  assert.match(await page.text(), /id="login-form"/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  for (const path of ['/api/state?month=2026-09', '/api/notes', '/api/investments', '/api/personal', '/api/preferences', '/api/backup', '/api/auth/session']) {
    assert.equal((await request(path)).status, 401, path);
  }
  for (const [path, method] of [['/api/transactions', 'POST'], ['/api/restore', 'POST'], ['/api/personal/schedule', 'PUT'], ['/api/notes/1', 'DELETE']]) {
    assert.equal((await request(path, { method, body: {} })).status, 401);
  }
  assert.deepEqual({ ...store.exportData(), exported_at: null }, { ...before, exported_at: null });
  for (const path of ['/login.js', '/login.css', '/favicon.svg']) assert.equal((await request(path)).status, 200);
  for (const path of ['/lib/auth-accounts.js', '/data/saldo.sqlite', '/data/saldo-ana.sqlite']) assert.equal((await request(path)).status, 404);
});

test('login aceita ambos os usuários sem distinguir caixa, rejeita credenciais inválidas e troca a sessão', async t => {
  const { login, request } = await fixture(t);
  for (const [username, password] of [['outro', testPassword], ['Bruno', 'wrong'], ['Ana', ''], ['Ana', null]]) {
    const result = await login(username, password);
    assert.equal(result.response.status, 401);
    assert.equal(result.cookie, undefined);
    assert.equal(result.data.error, 'Usuário ou senha incorretos.');
  }
  const bruno = await login('bRuNo', testPassword.toUpperCase());
  assert.equal(bruno.response.status, 200);
  assert.deepEqual(bruno.data, { user: { id: 'bruno', name: 'Bruno' } });
  const header = bruno.response.headers.get('set-cookie');
  assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Strict/); assert.match(header, /Path=\//); assert.match(header, /Max-Age=43200/);
  assert.match(await (await request('/', { cookie: bruno.cookie })).text(), /id="logout"/);
  assert.equal((await request('/login', { cookie: bruno.cookie })).status, 303);
  const ana = await login('aNA', testPassword.toLowerCase(), bruno.cookie);
  assert.equal(ana.data.user.name, 'Ana'); assert.notEqual(ana.cookie, bruno.cookie);
  assert.equal((await request('/api/auth/session', { cookie: bruno.cookie })).status, 401);
  assert.equal((await request('/api/auth/session', { cookie: ana.cookie })).status, 200);
  assert.equal((await request('/api/auth/session', { cookie: 'persona_session=forged' })).status, 401);
});

test('sessões expiram, logout revoga acesso e origem externa não consegue entrar ou sair', async t => {
  let time = 1000;
  const { request, login } = await fixture(t, { auth: createAuth({ accounts: testAccounts, now: () => time }) });
  const first = await login();
  assert.equal((await request('/api/auth/logout', { method: 'POST', cookie: first.cookie, headers: { Origin: 'https://example.com' } })).status, 403);
  assert.equal((await request('/api/auth/login', { body: { username: 'Bruno', password: testPassword }, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await request('/api/auth/session', { cookie: first.cookie })).status, 200);
  const logout = await request('/api/auth/logout', { method: 'POST', cookie: first.cookie });
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await request('/api/backup', { cookie: first.cookie })).status, 401);
  const second = await login(); time += 12 * 60 * 60 * 1000;
  assert.equal((await request('/api/state?month=2026-09', { cookie: second.cookie })).status, 401);
});

test('limita tentativas repetidas e libera novamente depois do intervalo', async t => {
  let time = 0;
  const { login } = await fixture(t, { auth: createAuth({ accounts: testAccounts, now: () => time }) });
  for (let i = 0; i < 10; i++) assert.equal((await login('Bruno', 'wrong')).response.status, 401);
  const blocked = await login(); assert.equal(blocked.response.status, 429); assert.ok(Number(blocked.response.headers.get('retry-after')) > 0);
  time += 15 * 60 * 1000;
  assert.equal((await login()).response.status, 200);
});

test('cada conta tem registros e backup próprios; uma aba antiga não grava na outra conta', async t => {
  const { request, login, store } = await fixture(t);
  store.addTransaction({ description: 'Registro anterior ao login', type: 'income', amount: 5000, category: 'Salário', date: '2026-09-28' });
  const bruno = await login(), ana = await login('Ana');
  const a = (path, options = {}) => request(path, { cookie: ana.cookie, ...options });
  const b = (path, options = {}) => request(path, { cookie: bruno.cookie, ...options });
  const original = await (await b('/api/backup')).json();
  assert.equal((await (await a('/api/state?month=2026-09')).json()).transactions.length, 0);
  assert.equal((await (await b('/api/state?month=2026-09')).json()).transactions.length, 1);
  const note = await a('/api/notes', { body: { kind: 'note', status: 'todo', priority: 'medium', title: 'Somente Ana', content: 'Nota privada' } });
  assert.equal(note.status, 201); const { id } = await note.json();
  assert.equal((await (await b('/api/notes')).json()).length, 0);
  assert.equal((await b(`/api/notes/${id}`, { method: 'DELETE' })).status, 404);
  assert.equal((await a('/api/notes', { headers: { 'X-Persona-User': 'bruno' }, body: { kind: 'note', status: 'todo', priority: 'medium', title: 'Aba antiga' } })).status, 401);
  assert.equal((await (await a('/api/notes')).json()).length, 1);
  const personal = await (await a('/api/personal')).json();
  assert.equal((await a('/api/personal/items', { body: { tab_id: personal.tabs.find(tab => tab.name === 'Filmes pra ver').id, title: 'Filme da Ana', status: 'active' } })).status, 201);
  assert.equal((await (await b('/api/personal')).json()).items.length, 0);
  const anaBackup = await (await a('/api/backup')).json();
  assert.equal(anaBackup.transactions.length, 0); assert.equal(anaBackup.notes[0].title, 'Somente Ana');
  assert.equal((await b('/api/restore', { body: original })).status, 200);
  assert.deepEqual({ ...await (await a('/api/backup')).json(), exported_at: null }, { ...anaBackup, exported_at: null });
});

test('preserva o SQLite existente para Bruno e persiste o arquivo separado de Ana ao reiniciar', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'persona-auth-')), databasePath = join(directory, 'saldo.sqlite');
  t.after(() => { const child = relative(tmpdir(), directory); assert.ok(child.startsWith('persona-auth-') && !child.includes('..') && !isAbsolute(child)); rmSync(directory, { recursive: true, force: true }); });
  const previous = openDatabase(databasePath);
  previous.notes.add({ kind: 'note', status: 'todo', priority: 'medium', title: 'Nota antiga do Bruno', content: '' }); previous.close();
  const first = await fixture(t, { databasePath });
  const ana = await first.login('Ana');
  assert.equal((await first.request('/api/notes', { cookie: ana.cookie, body: { kind: 'note', status: 'todo', priority: 'medium', title: 'Nota da Ana', content: '' } })).status, 201);
  await first.close();
  const second = await fixture(t, { databasePath });
  assert.equal((await second.request('/api/auth/session', { cookie: ana.cookie })).status, 401);
  for (const [name, title] of [['Bruno', 'Nota antiga do Bruno'], ['Ana', 'Nota da Ana']]) {
    const session = await second.login(name);
    const notes = await (await second.request('/api/notes', { cookie: session.cookie })).json();
    assert.deepEqual(notes.map(note => note.title), [title]);
  }
  await second.close();
});
