import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { openDatabase, dueDate } from '../lib/database.js';
import { createApp } from '../server.js';

const transaction = (overrides = {}) => ({ description: 'Mercado', type: 'expense', amount: 12345, category: 'Alimentação', date: '2026-09-20', ...overrides });
const bill = (overrides = {}) => ({ description: 'Internet', amount: 9990, category: 'Moradia', due_day: 31, start_month: '2026-09', ...overrides });
function fixture(t) { const store = openDatabase(':memory:'); t.after(() => store.close()); return store; }

test('soma centavos sem erro de ponto flutuante e separa os meses', t => {
  const store = fixture(t);
  store.addTransaction(transaction({ amount: 10 }));
  store.addTransaction(transaction({ amount: 20 }));
  store.addTransaction(transaction({ type: 'income', amount: 100000 }));
  store.addTransaction(transaction({ amount: 8888, date: '2026-10-11' }));
  store.addBill(bill());
  assert.deepEqual(store.list('2026-09').totals, { income: 100000, expense: 30, pending: 9990, balance: 99970, projected: 89980 });
});

test('recorrência respeita início, meses curtos e anos bissextos', t => {
  const store = fixture(t); store.addBill(bill());
  assert.throws(() => store.list('2026-08'), /setembro de 2026/);
  assert.equal(store.list('2026-09').bills[0].due_date, '2026-09-30');
  assert.equal(store.list('2026-10').bills[0].due_date, '2026-10-31');
  assert.equal(dueDate('2028-02', 31), '2028-02-29');
  assert.equal(dueDate('2027-02', 31), '2027-02-28');
});

test('pagar é atômico, não duplica e mantém cada mês independente', t => {
  const store = fixture(t); const b = store.addBill(bill());
  store.payBill(b.id, { month: '2026-09', date: '2026-09-20' });
  assert.throws(() => store.payBill(b.id, { month: '2026-09', date: '2026-09-21' }), /já está paga/);
  assert.equal(store.list('2026-09').transactions.length, 1);
  assert.equal(store.list('2026-09').totals.pending, 0);
  assert.equal(store.list('2026-09').totals.expense, 9990);
  assert.equal(store.list('2026-10').totals.pending, 9990);
  assert.throws(() => store.payBill(b.id, { month: '2026-10', date: '2026-09-30' }), /mês selecionado/);
});

test('desfazer pagamento reabre a conta e permite pagar novamente', t => {
  const store = fixture(t); const b = store.addBill(bill());
  const payment = store.payBill(b.id, { month: '2026-09', date: '2026-09-20' });
  store.deleteTransaction(payment.id);
  assert.equal(store.list('2026-09').totals.pending, 9990);
  store.payBill(b.id, { month: '2026-09', date: '2026-09-21' });
  assert.equal(store.list('2026-09').totals.expense, 9990);
});

test('editar ou excluir uma conta preserva as saídas já pagas', t => {
  const store = fixture(t); const b = store.addBill(bill());
  store.payBill(b.id, { month: '2026-09', date: '2026-09-20' });
  store.updateBill(b.id, bill({ amount: 15000 }));
  assert.equal(store.list('2026-09').totals.expense, 9990);
  assert.equal(store.list('2026-10').totals.pending, 15000);
  store.deleteBill(b.id);
  assert.equal(store.list('2026-09').transactions[0].bill_id, null);
  assert.equal(store.list('2026-09').totals.expense, 9990);
});

test('pagamento editado permanece uma saída no mês correto', t => {
  const store = fixture(t); const b = store.addBill(bill());
  const p = store.payBill(b.id, { month: '2026-09', date: '2026-09-20' });
  assert.throws(() => store.updateTransaction(p.id, transaction({ type: 'income' })), /saída no mês/);
  assert.throws(() => store.updateTransaction(p.id, transaction({ date: '2026-10-11' })), /saída no mês/);
  store.updateTransaction(p.id, transaction({ amount: 12000 }));
  assert.equal(store.list('2026-09').bills[0].paid_amount, 12000);
});

test('rejeita datas inexistentes, valores inválidos e categorias vazias', t => {
  const store = fixture(t);
  for (const date of ['2026-02-30','2026-13-01','1999-12-31','2026-9-2']) assert.throws(() => store.addTransaction(transaction({ date })));
  for (const amount of [0,-1,1.5,'100',Infinity,100000000000]) assert.throws(() => store.addTransaction(transaction({ amount })));
  assert.throws(() => store.addTransaction(transaction({ category: ' ' })));
  assert.throws(() => store.addBill(bill({ due_day: 32 })));
  assert.equal(store.list('2026-09').transactions.length, 0);
});

test('backup restaura relações e dados; backup inválido preserva tudo', t => {
  const store = fixture(t); const b = store.addBill(bill());
  store.addTransaction(transaction());
  store.payBill(b.id, { month: '2026-09', date: '2026-09-20' });
  const backup = store.exportData();
  store.addTransaction(transaction({ description: 'Temporário' }));
  store.restoreData(backup);
  assert.equal(store.list('2026-09').transactions.length, 2);
  assert.equal(store.list('2026-09').bills[0].payment_id, backup.transactions[1].id);
  const invalid = structuredClone(backup); invalid.transactions[1].bill_id = 999;
  assert.throws(() => store.restoreData(invalid), /Pagamento de conta inválido/);
  assert.equal(store.list('2026-09').transactions.length, 2);
  const duplicate = structuredClone(backup); duplicate.transactions.push({ ...duplicate.transactions[1], id: 999 });
  assert.throws(() => store.restoreData(duplicate));
  assert.equal(store.list('2026-09').totals.expense, 22335);
});

test('os registros persistem após fechar e reabrir o SQLite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'saldo-test-'));
  const path = join(dir, 'database.sqlite');
  try { let store = openDatabase(path); store.addTransaction(transaction()); store.close(); store = openDatabase(path); assert.equal(store.list('2026-09').totals.expense, 12345); store.close(); }
  finally {
    const child = relative(tmpdir(), dir);
    assert.ok(child.startsWith('saldo-test-') && !child.includes('..') && !isAbsolute(child));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('API HTTP: CRUD, validação, restauração, cabeçalhos e bloqueio de origem externa', async t => {
  const { server } = createApp({ databasePath: ':memory:' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (path, method, value, headers = {}) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(value ? { body: JSON.stringify(value) } : {}) });
  const initial = await fetch(base + '/');
  assert.equal(initial.status, 200);
  assert.match(initial.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const created = await send('/api/transactions','POST',transaction());
  assert.equal(created.status, 201); const { id } = await created.json();
  assert.equal((await send(`/api/transactions/${id}`, 'PUT', transaction({ amount: 10 }))).status, 200);
  assert.equal((await send('/api/transactions','POST',transaction(),{ Origin: 'https://example.com' })).status, 403);
  assert.equal((await fetch(base + '/api/state?month=2026-09', { headers: { Origin: 'https://example.com' } })).status, 403);
  assert.equal((await send('/api/transactions','POST',transaction({ date: '2026-02-30' }))).status, 400);
  assert.equal((await fetch(base + '/data/saldo.sqlite')).status, 404);
  assert.equal((await fetch(base + '/api/state?month=invalid')).status, 400);
  const backup = await (await fetch(base + '/api/backup')).json();
  assert.equal((await send(`/api/transactions/${id}`, 'DELETE')).status, 200);
  assert.equal((await send('/api/restore','POST',backup)).status, 200);
  const state = await (await fetch(base + '/api/state?month=2026-09')).json();
  assert.equal(state.totals.expense, 10);
});
