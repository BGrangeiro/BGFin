import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../lib/database.js';
import { periodMonth, periodRange, periodDueDate } from '../public/period.js';

const debt = extra => ({description:'Empréstimo',amount:25000,category:'Banco pessoal',installment_amount:10000,installment_day:10,start_month:'2026-09',...extra});
const tx = date => ({description:'Entrada',type:'income',amount:100,category:'Categoria própria',date});
const fixture = t => {const store=openDatabase(':memory:');t.after(()=>store.close());return store;};

test('dia 10 fecha o período; dia 11 abre o próximo, inclusive na virada do ano',()=>{
  assert.equal(periodMonth('2026-10-10'),'2026-09');
  assert.equal(periodMonth('2026-10-11'),'2026-10');
  assert.equal(periodMonth('2027-01-10'),'2026-12');
  assert.equal(periodMonth('2027-01-11'),'2027-01');
  assert.deepEqual(periodRange('2026-12'),{start:'2026-12-11',end:'2027-01-10'});
  assert.equal(periodMonth('2026-09-10'),'2026-09');
  assert.equal(periodDueDate('2026-09',10),'2026-10-10');
  assert.equal(periodDueDate('2028-02',31),'2028-02-29');
});

test('filtros incluem fechamento sem duplicar e bloqueiam datas anteriores ao início',t=>{
  const store=fixture(t);
  for(const date of ['2026-09-10','2026-09-11','2026-10-10','2026-10-11'])store.addTransaction(tx(date));
  assert.equal(store.list('2026-09').totals.income,300);
  assert.equal(store.list('2026-10').totals.income,100);
  assert.throws(()=>store.list('2026-08'),/setembro/);
  assert.throws(()=>store.addTransaction(tx('2026-08-31')),/setembro/);
  assert.ok(store.list('2026-09').categories.includes('Categoria própria'));
});

test('parcela parcial, quitação, última parcela e estorno preservam os totais',t=>{
  const store=fixture(t),d=store.addDebt(debt());
  assert.equal(store.list('2026-09').monthlyDebts[0].scheduled,10000);
  assert.equal(store.list('2026-09').totals.expense,0);
  const p=store.payDebt(d.id,{amount:4000,date:'2026-10-09'});
  assert.equal(store.list('2026-09').monthlyDebts[0].month_remaining,6000);
  store.payDebt(d.id,{amount:6000,date:'2026-10-10'});
  assert.equal(store.list('2026-09').monthlyDebts[0].month_remaining,0);
  assert.equal(store.list('2026-09').totals.expense,10000);
  store.payDebt(d.id,{amount:10000,date:'2026-11-10'});
  assert.equal(store.list('2026-11').monthlyDebts[0].scheduled,5000);
  store.payDebt(d.id,{amount:5000,date:'2026-12-10'});
  assert.equal(store.listDebts()[0].remaining,0);
  assert.equal(store.list('2026-12').monthlyDebts.length,0);
  assert.equal(store.list('2026-09').monthlyDebts[0].scheduled,10000);
  store.deleteTransaction(p.id);
  assert.equal(store.listDebts()[0].remaining,4000);
  assert.equal(store.list('2026-09').monthlyDebts[0].month_remaining,4000);
});

test('parcelas respeitam início, vencimento, edição e backup',t=>{
  const store=fixture(t),d=store.addDebt(debt({start_month:'2026-10'}));
  assert.equal(store.list('2026-09').monthlyDebts.length,0);
  assert.equal(store.list('2026-10').monthlyDebts[0].due_date,'2026-11-10');
  store.updateDebt(d.id,debt({installment_amount:8000,installment_day:31}));
  const backup=store.exportData();
  assert.equal(backup.version,14);
  store.restoreData(backup);
  assert.equal(store.list('2026-09').monthlyDebts[0].scheduled,8000);
  assert.equal(store.list('2026-09').monthlyDebts[0].due_date,'2026-09-30');
  for(const installment_amount of [-1,1.5,'10',25001])assert.throws(()=>store.addDebt(debt({installment_amount})));
  assert.throws(()=>store.addDebt(debt({installment_day:32})));
  store.addDebt(debt({installment_amount:0}));
  assert.equal(store.listDebts().length,2);
  assert.equal(store.list('2026-09').monthlyDebts.length,1);
});

test('contas fixas vencem e são pagas no mesmo período financeiro',t=>{
  const store=fixture(t),b=store.addBill({description:'Internet',amount:10000,category:'Moradia',due_day:10,start_month:'2026-09'});
  assert.equal(store.list('2026-09').bills[0].due_date,'2026-10-10');
  const p=store.payBill(b.id,{month:'2026-09',date:'2026-10-10'});
  assert.equal(store.list('2026-09').totals.expense,10000);
  assert.equal(store.list('2026-09').totals.pending,0);
  assert.equal(store.list('2026-10').totals.expense,0);
  assert.throws(()=>store.updateTransaction(p.id,{...tx('2026-10-11'),type:'expense'}),/mês/);
  store.restoreData(store.exportData());
  assert.equal(store.list('2026-09').bills[0].payment_id,p.id);
});
