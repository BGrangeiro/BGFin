import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../lib/database.js';
import { createApp } from '../server.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const record=(tab_id,more={})=>({tab_id,title:'Streaming',notes:'Plano família',amount:3990,due_date:'2026-09-23',cycle:'monthly',status:'active',...more});
const fixture=t=>{const s=openDatabase(':memory:');t.after(()=>s.close());return s;};
test('Pessoal: abas e registros isolados, edição, arquivamento e exclusão',t=>{
  const s=fixture(t), fixed=s.personal.list().tabs[0];assert.equal(fixed.name,'Assinaturas');
  const item=s.personal.add(record(fixed.id));assert.equal(item.amount,3990);
  const custom=s.personal.addTab({name:'Viagens'});s.personal.renameTab(custom.id,{name:'Meus planos'});
  s.personal.add(record(custom.id,{title:'Viagem',amount:null,due_date:null}));
  assert.equal(s.personal.update(item.id,record(fixed.id,{status:'archived'})).status,'archived');
  assert.equal(s.list('2026-09').transactions.length,0);
  s.personal.removeTab(custom.id);assert.equal(s.personal.list().items.length,1);
  assert.throws(()=>s.personal.removeTab(fixed.id),/fixa/);assert.throws(()=>s.personal.renameTab(fixed.id,{name:'Outro'}),/fixa/);
  s.personal.remove(item.id);assert.equal(s.personal.list().items.length,0);
});
test('Pessoal: valida valores, referências, datas e nomes duplicados',t=>{
  const s=fixture(t),id=s.personal.list().tabs[0].id;
  for(const changes of [{amount:-1},{amount:1.2},{amount:null},{due_date:null},{due_date:'2026-02-30'},{tab_id:999},{title:''},{cycle:'daily'},{status:'bad'}])assert.throws(()=>s.personal.add(record(id,changes)));
  assert.throws(()=>s.personal.addTab({name:'ASSINATURAS'}),/existe/);
  assert.equal(s.personal.add(record(id,{amount:0})).amount,0);
});
test('Pessoal: ordem de todas as abas persiste ao reabrir e restaurar backup',t=>{
  const directory=mkdtempSync(join(tmpdir(),'persona-tabs-')),path=join(directory,'test.sqlite');
  let s=openDatabase(path);t.after(()=>{s.close();rmSync(directory,{recursive:true,force:true});});
  const original=s.personal.list().tabs,subscription=original.find(tab=>tab.kind==='subscriptions');
  const item=s.personal.add(record(subscription.id));
  const ids=[...original].reverse().map(tab=>tab.id);
  assert.deepEqual(s.personal.reorderTabs({ids}).map(tab=>tab.id),ids);
  s.close();s=openDatabase(path);
  assert.deepEqual(s.personal.list().tabs.map(tab=>tab.id),ids);
  const backup=s.exportData(),added=s.personal.addTab({name:'Viagens'});
  assert.deepEqual(s.personal.list().tabs.map(tab=>tab.id),[...ids,added.id]);
  s.restoreData(backup);assert.deepEqual(s.personal.list(),backup.personal);
  assert.equal(s.personal.list().items[0].id,item.id);
  assert.throws(()=>s.personal.removeTab(subscription.id),/fixa/);
});
test('Pessoal: rejeita ordens incompletas, duplicadas ou inválidas sem alterar os dados',t=>{
  const s=fixture(t),before=s.personal.list(),ids=before.tabs.map(tab=>tab.id);
  for(const invalid of [null,{}, {ids:'1,2,3'},{ids:ids.slice(1)},{ids:[...ids,999]},{ids:ids.map(()=>ids[0])},{ids:ids.map(String)},{ids:ids.map((id,index)=>index? id:999)}]){
    assert.throws(()=>s.personal.reorderTabs(invalid),/todas as abas/);
    assert.deepEqual(s.personal.list(),before);
  }
});
test('Pessoal: backup completo e legado, validação atômica',t=>{
  const s=fixture(t);s.personal.add(record(s.personal.list().tabs[0].id));
  const backup=s.exportData();assert.equal(backup.version,8);
  s.personal.addTab({name:'Saúde'});s.restoreData(backup);assert.deepEqual(s.personal.list(),backup.personal);
  const invalid=structuredClone(backup);invalid.personal.items[0].tab_id=999;assert.throws(()=>s.restoreData(invalid));assert.deepEqual(s.personal.list(),backup.personal);
  const old={...backup,version:5};delete old.personal;s.restoreData(old);assert.deepEqual(s.personal.list(),backup.personal);
  const empty=structuredClone(backup);empty.personal.items=[];s.restoreData(empty);assert.equal(s.personal.list().items.length,0);
});
test('Pessoal: API CRUD e arquivos disponíveis',async t=>{
  const {server}=createApp({databasePath:':memory:'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=async(path,method='GET',body)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
  const initial=await call('/api/personal');assert.equal(initial.status,200);
  const ids=initial.data.tabs.map(tab=>tab.id).reverse();
  const ordered=await call('/api/personal/tabs/order','PUT',{ids});assert.equal(ordered.status,200);assert.deepEqual(ordered.data.map(tab=>tab.id),ids);
  assert.equal((await call('/api/personal/tabs/order','PUT',{ids:ids.slice(1)})).status,400);
  assert.deepEqual((await call('/api/personal')).data.tabs.map(tab=>tab.id),ids);
  const created=await call('/api/personal/items','POST',record(initial.data.tabs[0].id));assert.equal(created.status,201);
  assert.equal((await call(`/api/personal/items/${created.data.id}`,'PUT',record(initial.data.tabs[0].id,{amount:4990}))).data.amount,4990);
  const tab=await call('/api/personal/tabs','POST',{name:'Saúde'});assert.equal(tab.status,201);
  assert.equal((await call(`/api/personal/tabs/${tab.data.id}`,'PUT',{name:'Rotina'})).data.name,'Rotina');
  assert.equal((await call(`/api/personal/items/${created.data.id}`,'DELETE')).status,200);
  assert.equal((await call(`/api/personal/tabs/${tab.data.id}`,'DELETE')).status,200);
  assert.equal((await fetch(base+'/personal.js')).status,200);
});
