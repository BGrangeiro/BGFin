import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { openDatabase } from '../lib/database.js';
import { createApp } from '../support/http-fixture.js';
import { investmentAlerts, localDate } from '../public/investments-model.js';

const investment = (overrides = {}) => ({ name: 'Minha reserva', type: 'fixed', institution: 'Banco teste', start_date: '2020-01-01', initial_amount: 100000, liquidity: 'Diária', review_date: '2026-10-01', maturity_date: '2027-12-31', notes: 'Objetivo: reserva\n100% do CDI', ...overrides });
const entry = (kind, amount, date = '2020-02-01') => ({ kind, amount, date, notes: 'Registro de teste' });
function fixture(t) { const store = openDatabase(':memory:'); t.after(() => store.close()); return store; }

test('carteira calcula aportes, ganhos, perdas, taxas e resgates sem alterar o mês', t => {
  const store = fixture(t), before = store.list('2026-09').totals, i = store.investments.add(investment());
  store.investments.addEntry(i.id, entry('contribution', 20000));
  store.investments.addEntry(i.id, entry('gain', 8000));
  store.investments.addEntry(i.id, entry('loss', 1500));
  store.investments.addEntry(i.id, entry('fee', 500));
  const next = store.investments.addEntry(i.id, entry('withdrawal', 30000));
  assert.deepEqual(next.totals, { contribution: 120000, withdrawal: 30000, gain: 8000, loss: 1500, fee: 500, balance: 96000, result: 6000 });
  assert.equal(next.entries.length, 6);
  assert.equal(next.notes, i.notes);
  assert.deepEqual(store.list('2026-09').totals, before);
  assert.deepEqual(store.list('2026-10').transactions, []);
});

test('edição e exclusão recalculam o histórico, bloqueando saldo negativo mesmo no passado', t => {
  const store = fixture(t), api = store.investments, i = api.add(investment());
  let next = api.addEntry(i.id, entry('withdrawal', 90000, '2020-02-01'));
  const withdrawal = next.entries[0];
  next = api.addEntry(i.id, entry('contribution', 100000, '2020-03-01'));
  assert.throws(() => api.addEntry(i.id, entry('loss', 20000, '2020-02-02')), /negativo/);
  assert.throws(() => api.updateEntry(i.id, i.entries[0].id, entry('contribution', 50000, '2020-01-01')), /negativo/);
  assert.throws(() => api.removeEntry(i.id, i.entries[0].id), /negativo/);
  assert.deepEqual(api.get(i.id), next);
  assert.equal(api.updateEntry(i.id, withdrawal.id, entry('withdrawal', 20000)).totals.balance, 180000);
  assert.equal(api.removeEntry(i.id, withdrawal.id).totals.balance, 200000);
  assert.throws(() => api.update(i.id, { ...i, start_date: '2020-01-02' }), /anteriores/);
  const other = api.add(investment({ name: 'Outro' }));
  assert.throws(() => api.removeEntry(other.id, i.entries[0].id), /não encontrada/);
});

test('encerramento exige saldo zerado, preserva resultados e permite reabrir', t => {
  const api = fixture(t).investments, i = api.add(investment());
  assert.throws(() => api.update(i.id, { ...i, status: 'closed' }), /encerrar/);
  api.addEntry(i.id, entry('gain', 10000));
  api.addEntry(i.id, entry('withdrawal', 110000));
  const closed = api.update(i.id, { ...i, status: 'closed' });
  assert.equal(closed.totals.result, 10000); assert.equal(closed.totals.balance, 0);
  assert.throws(() => api.addEntry(i.id, entry('contribution', 100)), /Reabra/);
  assert.throws(() => api.removeEntry(i.id, closed.entries[0].id), /Reabra/);
  api.update(i.id, { ...closed, status: 'active', notes: 'Novo objetivo', review_date: null });
  assert.equal(api.addEntry(i.id, entry('contribution', 100)).totals.balance, 100);
});

test('valida datas, valores em centavos, campos e limites; transações inválidas não deixam resíduos', t => {
  const api = fixture(t).investments;
  for (const overrides of [{ name: '' }, { type: 'constructor' }, { start_date: '2025-02-29' }, { start_date: '2099-01-01' }, { maturity_date: '2019-12-31' }, { review_date: '2019-12-31' }, { initial_amount: -1 }, { initial_amount: 1.5 }, { initial_amount: '100' }, { initial_amount: 100000000000 }, { status: 'closed' }, { notes: 'a'.repeat(10001) }]) assert.throws(() => api.add(investment(overrides)));
  assert.equal(api.list().length, 0);
  const i = api.add(investment({ initial_amount: 0 }));
  assert.throws(() => api.addEntry(i.id, entry('loss', 1)), /negativo/);
  for (const value of [0, -1, NaN, 1.1, Number.MAX_SAFE_INTEGER, '100']) assert.throws(() => api.addEntry(i.id, entry('gain', value)));
  for (const day of ['2019-01-01', '2025-02-30', '2099-01-01']) assert.throws(() => api.addEntry(i.id, entry('contribution', 100, day)));
  assert.throws(() => api.addEntry(i.id, entry('__proto__', 100)));
  assert.equal(api.get(i.id).entries.length, 0);
  api.addEntry(i.id, entry('contribution', 99999999999));
  assert.throws(() => api.addEntry(i.id, entry('gain', 1)), /limite/);
  assert.equal(api.get(i.id).totals.balance, 99999999999);
});

test('backup v5 valida carteira antes de restaurar, recalcula totais e reverte falha na restauração', t => {
  const store = fixture(t), api = store.investments, i = api.add(investment());
  api.addEntry(i.id, entry('gain', 1234));
  const original = store.exportData();
  assert.equal(original.version,12);
  api.remove(i.id); store.restoreData(original);
  assert.deepEqual(api.list(), original.investments);
  const badVariants = [
    b => { delete b.investments; },
    b => { b.investments.push(b.investments[0]); },
    b => { b.investments[0].entries[0].investment_id = 999; },
    b => { b.investments[0].entries[0].kind = 'withdrawal'; b.investments[0].entries[0].amount = 200000; },
    b => { b.investments[0].entries.push(b.investments[0].entries[0]); },
    b => { b.investments[0].status = 'closed'; },
    b => { b.investments[0].updated_at = 'inválido'; }
  ];
  for (const corrupt of badVariants) { const bad = structuredClone(original); corrupt(bad); assert.throws(() => store.restoreData(bad)); assert.deepEqual(api.list(), original.investments); }
  const derived = structuredClone(original); derived.investments[0].totals.balance = 999;
  store.restoreData(derived); assert.equal(api.get(i.id).totals.balance, 101234);
  store.db.exec("CREATE TRIGGER fail_restore BEFORE INSERT ON investment_entries BEGIN SELECT RAISE(ABORT,'Simulated failure'); END;");
  assert.throws(() => store.restoreData(original), /Simulated/);
  assert.deepEqual(api.list(), original.investments);
});

test('backups antigos preservam investimentos e backup v5 vazio substitui explicitamente', t => {
  const store = fixture(t), i = store.investments.add(investment());
  for (const version of [1, 2, 3, 4]) {
    store.restoreData({ version, bills: [], debts: [], transactions: [], notes: [] });
    assert.deepEqual(store.investments.list(), [i]);
  }
  store.restoreData({ version: 5, bills: [], debts: [], transactions: [], notes: [], investments: [] });
  assert.equal(store.investments.list().length, 0);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM investment_entries').get().n, 0);
});

test('migração v4 e reabertura mantêm finanças, notas e histórico de investimentos', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bgfin-investments-'));
  let store;
  try {
    const path = join(dir, 'db.sqlite'); store = openDatabase(path);
    store.addTransaction({ description: 'Preservar', type: 'income', amount: 500, category: 'Outros', date: '2026-09-20' });
    store.db.exec('DROP TABLE investment_entries; DROP TABLE investments; PRAGMA user_version=4;'); store.close();
    store = openDatabase(path); const i = store.investments.add(investment());
    store.investments.addEntry(i.id, entry('gain', 77)); const expected = store.investments.get(i.id); store.close();
    store = openDatabase(path);
    assert.equal(store.list('2026-09').totals.income, 500);
    assert.deepEqual(store.investments.get(i.id), expected);
    assert.equal(store.db.prepare('PRAGMA user_version').get().user_version,12);
  } finally {
    store?.close();
    const rel = relative(tmpdir(), dir); assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel)); rmSync(dir, { recursive: true, force: true });
  }
});

test('alertas incluem vencidos, hoje e próximos sete dias e ignoram encerrados', () => {
  const base = { id: 1, name: 'Reserva', status: 'active', review_date: '2026-12-31', maturity_date: '2027-01-07' };
  const records = [base, { ...base, id: 2, review_date: '2026-12-30', maturity_date: '2027-01-08' }, { ...base, id: 3, status: 'closed' }, { ...base, id: 4, review_date: null, maturity_date: null }];
  assert.deepEqual(investmentAlerts(records, '2026-12-31').map(a => `${a.id}:${a.kind}`), ['2:review', '1:review', '1:maturity']);
  assert.equal(localDate(new Date(2026, 0, 2, 23)), '2026-01-02');
});

test('API de investimentos: CRUD completo, validação, backup, recursos estáticos e proteção de origem', async t => {
  const {server,fetch}=createApp({ databasePath: ':memory:' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (path, method, data, headers = {}) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(data ? { body: JSON.stringify(data) } : {}) });
  let res = await send('/api/investments', 'POST', investment()); assert.equal(res.status, 201); const i = await res.json();
  const path = `/api/investments/${i.id}`;
  assert.equal((await send(path, 'PUT', { ...i, notes: 'Nota salva' })).status, 200);
  res = await send(path + '/entries', 'POST', entry('gain', 500)); assert.equal(res.status, 201); const next = await res.json();
  const e = next.entries[0];
  assert.equal((await send(`${path}/entries/${e.id}`, 'PUT', entry('gain', 700))).status, 200);
  assert.equal((await (await fetch(base + path)).json()).totals.balance, 100700);
  assert.equal((await send(`${path}/entries/${e.id}`, 'DELETE')).status, 200);
  assert.equal((await send(path + '/entries', 'POST', entry('withdrawal', 100001))).status, 400);
  assert.equal((await send('/api/investments', 'POST', investment(), { Origin: 'https://example.com' })).status, 403);
  assert.equal((await send('/api/investments/999', 'DELETE')).status, 404);
  assert.equal((await send(path + '/entries/999', 'DELETE')).status, 404);
  const backup = await (await fetch(base + '/api/backup')).json();
  assert.equal((await send(path, 'DELETE')).status, 200);
  assert.equal((await (await fetch(base + '/api/investments')).json()).length, 0);
  assert.equal((await send('/api/restore', 'POST', backup)).status, 200);
  assert.equal((await (await fetch(base + path)).json()).notes, 'Nota salva');
  for (const asset of ['/investments.js', '/investments-model.js', '/investments.css']) assert.equal((await fetch(base + asset)).status, 200);
});
