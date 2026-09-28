import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../lib/database.js';
import { createApp } from '../support/http-fixture.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';

const debt = (extra={}) => ({description:'Empréstimo',amount:100000,initial_paid:20000,creditor:'Credor',category:'Outros',due_date:'2026-10-11',...extra});
function fixture(t){const store=openDatabase(':memory:');t.after(()=>store.close());return store;}
test('dívidas: saldo global, pagamentos por mês, quitação e estorno',t=>{
  const store=fixture(t),d=store.addDebt(debt());
  assert.equal(store.list('2026-09').totals.expense,0);
  const p=store.payDebt(d.id,{amount:30000,date:'2026-09-21'});
  store.payDebt(d.id,{amount:50000,date:'2026-10-11'});
  assert.equal(store.list('2026-09').totals.expense,30000);
  assert.equal(store.list('2026-10').totals.expense,50000);
  assert.equal(store.list('2027-01').debts[0].remaining,0);
  assert.equal(store.listDebts()[0].payments.length,2);
  assert.throws(()=>store.payDebt(d.id,{amount:1,date:'2026-10-11'}),/saldo restante/);
  store.deleteTransaction(p.id);
  assert.equal(store.listDebts()[0].remaining,30000);
  assert.equal(store.list('2026-09').totals.expense,0);
});
test('dívidas: validações impedem valores excedentes e alteração para entrada',t=>{
  const store=fixture(t);
  for(const initial_paid of [-1,100001,1.5,'10'])assert.throws(()=>store.addDebt(debt({initial_paid})));
  assert.throws(()=>store.addDebt(debt({due_date:'2026-02-30'})));
  const d=store.addDebt(debt({due_date:''}));
  assert.equal(d.due_date,null);
  assert.throws(()=>store.payDebt(d.id,{amount:80001,date:'2026-09-21'}));
  assert.throws(()=>store.payDebt(d.id,{amount:0,date:'2026-09-21'}));
  const p=store.payDebt(d.id,{amount:30000,date:'2026-09-21'});
  assert.throws(()=>store.updateDebt(d.id,debt({amount:40000})),/menor/);
  const tx=store.list('2026-09').transactions[0];
  assert.throws(()=>store.updateTransaction(p.id,{...tx,type:'income'}),/saída/);
  assert.throws(()=>store.updateTransaction(p.id,{...tx,amount:80001}),/saldo/);
  store.updateTransaction(p.id,{...tx,amount:40000,date:'2026-10-12'});
  assert.equal(store.listDebts()[0].remaining,40000);
  store.updateDebt(d.id,debt({description:'Acordo atualizado',initial_paid:10000}));
  assert.equal(store.listDebts()[0].remaining,50000);
  store.deleteDebt(d.id);
  assert.equal(store.list('2026-10').totals.expense,40000);
  assert.equal(store.list('2026-10').transactions[0].debt_id,null);
});
test('backup v2 preserva dívidas e vínculos; rejeita inconsistências sem perder dados',t=>{
  const store=fixture(t),d=store.addDebt(debt());
  store.payDebt(d.id,{amount:10000,date:'2026-09-21'});
  const backup=store.exportData();
  store.restoreData(backup);
  assert.equal(store.listDebts()[0].remaining,70000);
  for(const mutate of [b=>b.transactions[0].debt_id=999,b=>b.transactions[0].amount=90000,b=>b.transactions[0].type='income',b=>b.debts.push(b.debts[0])]){
    const invalid=structuredClone(backup);mutate(invalid);
    assert.throws(()=>store.restoreData(invalid));
    assert.equal(store.listDebts()[0].remaining,70000);
  }
  store.restoreData({version:1,bills:[],transactions:[]});
  assert.equal(store.listDebts().length,0);
});
test('migração de banco antigo preserva registros e cria vínculos de dívida',()=>{
  const dir=mkdtempSync(join(tmpdir(),'saldo-debt-test-')),file=join(dir,'legacy.sqlite');
  let store;
  try{
    const legacy=new DatabaseSync(file);
    legacy.exec(`CREATE TABLE bills(id INTEGER PRIMARY KEY,description TEXT,amount INTEGER,category TEXT,due_day INTEGER,start_month TEXT);
      CREATE TABLE transactions(id INTEGER PRIMARY KEY,description TEXT,type TEXT,amount INTEGER,category TEXT,date TEXT,notes TEXT,bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,bill_month TEXT,created_at TEXT,UNIQUE(bill_id,bill_month));
      INSERT INTO transactions(id,description,type,amount,category,date,notes) VALUES(1,'Registro existente','expense',2500,'Outros','2026-09-20',''); PRAGMA user_version=1;`);
    legacy.close();
    store=openDatabase(file);
    assert.equal(store.list('2026-09').totals.expense,2500);
    const d=store.addDebt(debt());store.payDebt(d.id,{amount:1000,date:'2026-09-21'});
    store.close();store=openDatabase(file);
    assert.equal(store.listDebts()[0].remaining,79000);
    assert.equal(store.list('2026-09').totals.expense,3500);
  }finally{
    store?.close();const child=relative(tmpdir(),dir);
    assert.ok(child.startsWith('saldo-debt-test-')&&!child.includes('..')&&!isAbsolute(child));rmSync(dir,{recursive:true,force:true});
  }
});
test('API de dívidas: cadastro, edição, pagamento, backup e exclusão',async t=>{
  const {server,fetch}=createApp({databasePath:':memory:',dailyVerse:async()=>({text:'Versículo de teste'})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const send=(path,method='GET',data)=>fetch(base+path,{method,headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
  const created=await send('/api/debts','POST',debt());assert.equal(created.status,201);const {id}=await created.json();
  assert.equal((await send(`/api/debts/${id}`,'PUT',debt({creditor:'Outro credor'}))).status,200);
  assert.equal((await send(`/api/debts/${id}/pay`,'POST',{amount:10000,date:'2026-09-21'})).status,201);
  assert.equal((await send(`/api/debts/${id}/pay`,'POST',{amount:999999,date:'2026-09-21'})).status,400);
  const backup=await(await send('/api/backup')).json();assert.equal(backup.debts.length,1);
  assert.equal((await send(`/api/debts/${id}`,'DELETE')).status,200);
  assert.equal((await send('/api/restore','POST',backup)).status,200);
  const state=await(await send('/api/state?month=2026-09')).json();assert.equal(state.debts[0].remaining,70000);
  assert.equal((await(await send('/api/verse')).json()).text,'Versículo de teste');
});
