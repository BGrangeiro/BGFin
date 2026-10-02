import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { openDatabase } from '../lib/database.js';
import { createApp } from '../support/http-fixture.js';
import { overdue, dueReminder, matchesPeriod, sortNotes, localDay, localMinute } from '../public/notes-model.js';

const note = (extra = {}) => ({ title: 'Preparar projeto', content: 'Referências\nPróximos passos', kind: 'task', status: 'todo', priority: 'high', category: 'Pessoal', scheduled_date: '2026-09-22', due_date: '2026-09-25', reminder_at: '2026-09-22T15:30', checklist: [{ text: 'Pesquisar', done: false }], pinned: true, ...extra });
function fixture(t) { const store = openDatabase(':memory:'); t.after(() => store.close()); return store; }

test('anotações: CRUD, checklist, conclusão e reabertura não alteram as finanças', t => {
  const store = fixture(t), before = store.list('2026-09').totals;
  const n = store.notes.add(note());
  assert.equal(n.pinned, true);
  assert.equal(n.completed_at, null);
  const done = store.notes.update(n.id, { ...n, status: 'done', checklist: [{ text: 'Pesquisar', done: true }] });
  assert.ok(done.completed_at);
  assert.equal(done.created_at, n.created_at);
  assert.equal(done.checklist[0].done, true);
  assert.equal(store.notes.update(n.id, { ...done, content: 'Finalizado' }).completed_at, done.completed_at);
  const reopened = store.notes.update(n.id, { ...done, status: 'doing' });
  assert.equal(reopened.completed_at, null);
  assert.equal(reopened.checklist[0].done, true);
  assert.deepEqual(store.list('2026-09').totals, before);
  store.notes.remove(n.id);
  assert.equal(store.notes.list().length, 0);
  assert.throws(() => store.notes.update(n.id, note()), /não encontrada/);
  assert.throws(() => store.notes.remove(n.id), /não encontrada/);
});

test('anotações: validação de datas, prazos, horários, campos e checklist', t => {
  const store = fixture(t);
  for (const extra of [
    { title: ' ' }, { title: 'x'.repeat(161) }, { content: 'x'.repeat(20001) },
    { status: 'invalid' }, { kind: 'invalid' }, { priority: 'urgent' }, { pinned: 1 },
    { scheduled_date: '2026-02-30' }, { due_date: '2026-09-21' }, { scheduled_date: '1999-01-01' },
    { reminder_at: '2026-02-30T09:00' }, { reminder_at: '2026-09-22T24:00' }, { reminder_at: '2026-09-22T10:60' },
    { kind: 'reminder', reminder_at: null }, { checklist: [{ text: 'Passo', done: 'true' }] },
    { checklist: [{ text: '', done: false }] }, { checklist: Array.from({ length: 51 }, () => ({ text: 'Passo', done: false })) }
  ]) assert.throws(() => store.notes.add(note(extra)), JSON.stringify(extra).slice(0, 100));
  assert.equal(store.notes.list().length, 0);
  assert.equal(store.notes.add(note({ scheduled_date: '2024-02-29', due_date: '2024-02-29' })).scheduled_date, '2024-02-29');
});

test('lembrete visto só é reativado quando o horário muda', t => {
  const store = fixture(t), n = store.notes.add(note({ kind: 'reminder' }));
  const seen = store.notes.update(n.id, { ...n, reminder_seen: true });
  assert.equal(seen.reminder_seen, true);
  assert.equal(store.notes.update(n.id, { ...seen, title: 'Outro título' }).reminder_seen, true);
  assert.equal(store.notes.update(n.id, { ...seen, reminder_at: '2026-09-23T09:00' }).reminder_seen, false);
});

test('backup atual restaura anotações e rejeita corrupção antes de substituir dados', t => {
  const store = fixture(t);
  store.addTransaction({ description: 'Entrada existente', type: 'income', amount: 1000, date: '2026-09-22', category: 'Outros' });
  store.notes.add(note({ status: 'done' }));
  const backup = store.exportData();
  assert.equal(backup.version,14);
  store.notes.add(note({ title: 'Temporária' }));
  store.restoreData(backup);
  assert.deepEqual(store.notes.list(), backup.notes);
  for (const mutate of [b => delete b.notes, b => b.notes.push(b.notes[0]), b => b.notes[0].id = -1, b => b.notes[0].checklist[0].done = 3, b => b.notes[0].completed_at = null, b => b.notes[0].created_at = 'invalid']) {
    const invalid = structuredClone(backup); mutate(invalid);
    assert.throws(() => store.restoreData(invalid));
    assert.deepEqual(store.notes.list(), backup.notes);
    assert.equal(store.list('2026-09').totals.income, 1000);
  }
  store.db.exec("CREATE TRIGGER notes_restore_failure BEFORE INSERT ON notes BEGIN SELECT RAISE(ABORT, 'Simulated write failure'); END;");
  assert.throws(() => store.restoreData({ ...backup, transactions: [] }), /Simulated/);
  assert.deepEqual(store.notes.list(), backup.notes);
  assert.equal(store.list('2026-09').totals.income, 1000);
});

test('backups antigos preservam anotações; v4 vazio remove-as explicitamente', t => {
  const store = fixture(t), n = store.notes.add(note());
  for (const version of [1, 2, 3]) {
    store.restoreData({ version, bills: [], debts: [], transactions: [] });
    assert.deepEqual(store.notes.list(), [n]);
  }
  store.restoreData({ version: 4, bills: [], debts: [], transactions: [], notes: [] });
  assert.equal(store.notes.list().length, 0);
});

test('migração v3 e reabertura preservam finanças, anotações e checklists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bgfin-notes-')), filename = join(dir, 'test.sqlite');
  let store;
  try {
    store = openDatabase(filename);
    store.addTransaction({ description: 'Registro anterior', type: 'income', amount: 3000, date: '2026-09-22', category: 'Outros' });
    store.db.exec('DROP TABLE notes; PRAGMA user_version=3;'); store.close();
    store = openDatabase(filename);
    assert.equal(store.notes.list().length, 0);
    assert.equal(store.list('2026-09').totals.income, 3000);
    const n = store.notes.add(note()); store.close();
    store = openDatabase(filename);
    assert.deepEqual(store.notes.list(), [n]);
    assert.equal(store.db.prepare('PRAGMA user_version').get().user_version,14);
  } finally {
    store?.close();
    const child = relative(tmpdir(), dir);
    assert.ok(child.startsWith('bgfin-notes-') && !child.includes('..') && !isAbsolute(child));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('API de anotações: CRUD, backup, validação, recursos estáticos e origem local', async t => {
  const {server,fetch}=createApp({ databasePath: ':memory:' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (path, method, data, headers = {}) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const response = await send('/api/notes', 'POST', note());
  assert.equal(response.status, 201); const n = await response.json();
  assert.equal((await send(`/api/notes/${n.id}`, 'PUT', { ...n, status: 'doing' })).status, 200);
  assert.equal((await (await fetch(base + '/api/notes')).json())[0].status, 'doing');
  assert.equal((await send('/api/notes', 'POST', note({ due_date: '2026-09-01' }))).status, 400);
  assert.equal((await send('/api/notes', 'POST', note(), { Origin: 'https://example.com' })).status, 403);
  assert.equal((await send('/api/notes/999', 'DELETE')).status, 404);
  const backup = await (await fetch(base + '/api/backup')).json();
  assert.equal((await send(`/api/notes/${n.id}`, 'DELETE')).status, 200);
  assert.equal((await send('/api/restore', 'POST', backup)).status, 200);
  assert.equal((await (await fetch(base + '/api/notes')).json()).length, 1);
  for (const path of ['/notes.js', '/notes.css', '/notes-model.js']) assert.equal((await fetch(base + path)).status, 200);
});

test('filtros usam datas de calendário, limites inclusivos e ignoram tarefas concluídas', () => {
  const n = note(), day = '2026-09-22';
  assert.equal(overdue(n, '2026-09-25'), false);
  assert.equal(overdue(n, '2026-09-26'), true);
  assert.equal(overdue({ ...n, status: 'done' }, '2026-09-26'), false);
  assert.equal(matchesPeriod(n, 'today', day), true);
  assert.equal(matchesPeriod({ ...n, status: 'done' }, 'today', day), false);
  assert.equal(matchesPeriod({ ...n, scheduled_date: null, due_date: '2027-01-03', reminder_at: null }, 'week', '2026-12-28'), true);
  assert.equal(matchesPeriod({ ...n, scheduled_date: null, due_date: '2027-01-04', reminder_at: null }, 'week', '2026-12-28'), false);
  assert.equal(dueReminder(n, '2026-09-22T15:29'), false);
  assert.equal(dueReminder(n, '2026-09-22T15:30'), true);
  assert.equal(dueReminder({ ...n, reminder_seen: true }, '2026-09-23T10:00'), false);
  assert.equal(dueReminder({ ...n, status: 'done' }, '2026-09-23T10:00'), false);
  const date = new Date(2026, 8, 22, 7, 5);
  assert.equal(localDay(date), day); assert.equal(localMinute(date), `${day}T07:05`);
  const base = { ...n, updated_at: '2026-09-22T00:00:00.000Z', pinned: false };
  assert.deepEqual(sortNotes([{ ...base, id: 1 }, { ...base, id: 2, pinned: true }]).map(n => n.id), [2, 1]);
});
