import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { openDatabase } from '../lib/database.js';
import { createApp } from '../server.js';
import { installmentSchedule, installmentProgress, paidBeforeToday } from '../public/debts-model.js';

const debt = extra => ({ description:'Notebook', amount:120000, category:'Compras', debt_type:'installment',
  first_installment_date:'2026-01-24', last_installment_date:'2026-12-24', color:'#3d9b84', ...extra });
const fixture = t => { const store=openDatabase(':memory:');t.after(()=>store.close());return store; };

test('parcelas mensais incluem os extremos e estimam somente vencimentos anteriores a hoje', () => {
  const d=debt(),paid=paidBeforeToday(d,'2026-09-24'),progress=installmentProgress(d,paid);
  assert.equal(paid,80000);
  assert.equal(progress.installment_count,12);
  assert.equal(progress.installments_remaining,4);
  assert.equal(progress.installment_amount,10000);
  assert.equal(progress.remaining,40000);
  assert.equal(paidBeforeToday(d,'2025-12-31'),0);
  assert.equal(paidBeforeToday(d,'2027-01-01'),120000);
  assert.equal(installmentProgress(d,70000).installments_remaining,5);
  assert.equal(installmentProgress(d,75000).installments_remaining,5);
  assert.equal(installmentProgress(d,120000).installments_remaining,0);
});

test('calendário trata meses curtos, ano bissexto, ano novo e centavos sem perder o total', () => {
  const d=debt({amount:10000,first_installment_date:'2027-12-31',last_installment_date:'2028-03-31'});
  assert.deepEqual(installmentSchedule(d).map(item=>item.date),['2027-12-31','2028-01-31','2028-02-29','2028-03-31']);
  const thirds=installmentSchedule(debt({amount:10000,first_installment_date:'2026-12-31',last_installment_date:'2027-02-28'}));
  assert.deepEqual(thirds.map(item=>item.amount),[3334,3333,3333]);
  assert.equal(thirds.reduce((sum,item)=>sum+item.amount,0),10000);
  assert.equal(installmentSchedule(debt({first_installment_date:'2026-10-01',last_installment_date:'2026-10-01'})).length,1);
  for(const extra of [
    {first_installment_date:'2026-02-30'}, {last_installment_date:'2025-12-24'},
    {last_installment_date:''}, {first_installment_date:'2026-12-01'}, {amount:5}
  ]) assert.throws(()=>installmentSchedule(debt(extra)));
});

test('cadastro estima pago pelas datas, permite corrigir atrasos e mantém saídas somente dos pagamentos', t => {
  const store=fixture(t),d=store.addDebt(debt());
  assert.equal(d.initial_paid,paidBeforeToday(debt()));
  store.updateDebt(d.id,debt({initial_paid:70000}));
  assert.equal(store.listDebts()[0].installments_remaining,5);
  assert.equal(store.list('2026-09').totals.expense,0);
  const payment=store.payDebt(d.id,{amount:5000,date:'2026-09-24'});
  let saved=store.listDebts()[0];
  assert.equal(saved.installments_remaining,5);
  assert.equal(saved.remaining,45000);
  assert.equal(saved.schedule[7].remaining,5000);
  assert.equal(store.list('2026-09').totals.expense,5000);
  store.updateTransaction(payment.id,{description:'Parcela',type:'expense',amount:10000,date:'2026-09-24',category:'Compras'});
  assert.equal(store.listDebts()[0].installments_remaining,4);
  store.deleteTransaction(payment.id);
  assert.equal(store.listDebts()[0].remaining,50000);
  assert.equal(store.listDebts()[0].installments_remaining,5);
  assert.deepEqual(store.agenda('2026-09-24').map(item=>item.date),['2026-08-24','2026-09-24']);
  assert.throws(()=>store.updateDebt(d.id,debt({initial_paid:120001})),/já pago/);
});

test('parcelas aparecem só no período das datas, encerram no fim e preservam pendências em atraso', t => {
  const store=fixture(t),d=store.addDebt(debt({amount:30000,initial_paid:0,first_installment_date:'2026-10-10',last_installment_date:'2026-12-10'}));
  assert.equal(store.list('2026-09').monthlyDebts[0].due_date,'2026-10-10');
  assert.equal(store.list('2026-09').monthlyDebts[0].scheduled,10000);
  assert.equal(store.list('2026-10').monthlyDebts[0].due_date,'2026-11-10');
  assert.equal(store.list('2026-11').monthlyDebts[0].due_date,'2026-12-10');
  assert.equal(store.list('2026-12').monthlyDebts.length,0);
  assert.equal(store.agenda('2027-02-01').length,3);
  store.payDebt(d.id,{amount:5000,date:'2026-10-10'});
  assert.equal(store.list('2026-09').monthlyDebts[0].month_remaining,5000);
  store.payDebt(d.id,{amount:15000,date:'2026-10-11'});
  assert.equal(store.list('2026-10').monthlyDebts[0].month_remaining,0);
  assert.equal(store.list('2026-11').monthlyDebts[0].scheduled,10000);
  store.payDebt(d.id,{amount:10000,date:'2026-12-10'});
  assert.equal(store.listDebts()[0].installments_remaining,0);
  assert.equal(store.agenda('2027-02-01').length,0);
});

test('primeira data exata e duas parcelas no mesmo período não perdem ou duplicam valores', t => {
  const store=fixture(t);
  store.addDebt(debt({amount:20000,initial_paid:0,first_installment_date:'2026-09-30',last_installment_date:'2026-10-05'}));
  assert.equal(store.list('2026-09').monthlyDebts[0].scheduled,20000);
  assert.equal(store.list('2026-10').monthlyDebts.length,0);
  store.addDebt(debt({amount:10000,initial_paid:0,first_installment_date:'2026-09-10',last_installment_date:'2026-09-10'}));
  assert.equal(store.list('2026-09').monthlyDebts.find(d=>d.amount===10000).due_date,'2026-09-10');
});

test('dívida fixa dispensa parcelas; valida tipo, datas e cor; backup preserva os novos campos', t => {
  const store=fixture(t);
  const d=store.addDebt(debt({initial_paid:80000,color:'#CB748C'}));
  const fixed=store.addDebt({description:'Acordo',amount:50000,category:'Outros',debt_type:'fixed',color:'#748294'});
  assert.equal(fixed.installment_amount,0);
  assert.equal(fixed.first_installment_date,null);
  assert.equal(fixed.due_date,null);
  for(const extra of [{debt_type:'bad'},{color:'red'},{color:'#fff; color:red'},{first_installment_date:null,last_installment_date:null}])assert.throws(()=>store.addDebt(debt(extra)));
  const backup=store.exportData();
  assert.equal(backup.version,8);
  store.restoreData(backup);
  assert.equal(store.listDebts().find(item=>item.id===d.id).color,'#cb748c');
  assert.equal(store.listDebts().find(item=>item.id===d.id).installments_remaining,4);
  assert.deepEqual(store.exportData().debts,backup.debts);
  const bad=structuredClone(backup);bad.debts[0].last_installment_date='2025-01-01';
  assert.throws(()=>store.restoreData(bad));
  assert.deepEqual(store.exportData().debts,backup.debts);
  store.restoreData({version:3,bills:[],transactions:[],debts:[{id:19,description:'Antiga',amount:25000,category:'Outros',installment_amount:10000,installment_day:10,start_month:'2026-09'}]});
  assert.equal(store.listDebts()[0].debt_type,'installment');
  assert.equal(store.list('2026-09').monthlyDebts[0].scheduled,10000);
  store.restoreData(store.exportData());
  assert.equal(store.list('2026-09').monthlyDebts[0].scheduled,10000);
});

test('migração v7 preserva parcelas, saldos e cores padrão ao reabrir', () => {
  const dir=mkdtempSync(join(tmpdir(),'debt-schedule-test-')),file=join(dir,'legacy.sqlite');
  let store;
  try {
    const old=new DatabaseSync(file);
    old.exec(`CREATE TABLE debts(id INTEGER PRIMARY KEY,description TEXT,amount INTEGER,initial_paid INTEGER,creditor TEXT,category TEXT,due_date TEXT,notes TEXT,installment_amount INTEGER,installment_day INTEGER,start_month TEXT);
      INSERT INTO debts VALUES(1,'Antiga',25000,5000,'Banco','Outros',NULL,'',10000,10,'2026-09'); PRAGMA user_version=7;`);
    old.close();
    store=openDatabase(file);
    const saved=store.listDebts()[0];
    assert.equal(saved.remaining,20000);
    assert.equal(saved.debt_type,'installment');
    assert.equal(saved.color,'#537ddb');
    assert.equal(store.list('2026-09').monthlyDebts[0].scheduled,10000);
    store.payDebt(1,{amount:10000,date:'2026-09-24'});
    store.close();store=openDatabase(file);
    assert.equal(store.db.prepare('PRAGMA user_version').get().user_version,8);
    assert.equal(store.listDebts()[0].remaining,10000);
    assert.equal(store.listDebts()[0].payments.length,1);
  } finally {
    store?.close();const child=relative(tmpdir(),dir);
    assert.ok(child.startsWith('debt-schedule-test-')&&!child.includes('..')&&!isAbsolute(child));
    rmSync(dir,{recursive:true,force:true});
  }
});

test('API retorna cálculos e recursos do formulário e preserva edição e restauração', async t => {
  const {server}=createApp({databasePath:':memory:'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const send=(path,method='GET',body)=>fetch(base+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const res=await send('/api/debts','POST',debt({initial_paid:70000}));assert.equal(res.status,201);
  const {id}=await res.json();
  assert.equal((await send(`/api/debts/${id}`,'PUT',debt({initial_paid:80000,color:'#8b6ec1'}))).status,200);
  const state=await(await send('/api/state?month=2026-09')).json();
  assert.equal(state.debts[0].installments_remaining,4);
  assert.equal(state.debts[0].remaining,40000);
  assert.equal(state.monthlyDebts[0].color,'#8b6ec1');
  for(const path of ['/debts-model.js','/debts.css'])assert.equal((await send(path)).status,200);
});
