import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase, AppError } from '../lib/database.js';
import { createPersonalStore } from '../lib/personal.js';
import { matchesLibrarySearch } from '../public/personal-library.js';
import { createApp } from '../support/http-fixture.js';
const setup=t=>{const store=openDatabase(':memory:');t.after(()=>store.close());return store;};
const tab=(store,layout)=>store.personal.list().tabs.find(t=>t.layout===layout).id;
test('estudos aceitam prazo indefinido, alternam para data e preservam no backup',t=>{
  const s=setup(t),id=tab(s,'studies');
  let study=s.personal.add({tab_id:id,title:'Inglês',start_date:'2026-10-01',due_date:null});
  assert.equal(study.due_date,null);
  study=s.personal.update(study.id,{due_date:'2026-12-01'});assert.equal(study.due_date,'2026-12-01');
  study=s.personal.update(study.id,{due_date:null});assert.equal(study.due_date,null);assert.equal(study.start_date,'2026-10-01');
  const backup=s.exportData();s.restoreData(backup);assert.deepEqual(s.personal.list(),backup.personal);
});

test('migração preserva aba Filmes, registros e assinatura e cria Estudos uma vez',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys=ON;CREATE TABLE personal_tabs(id INTEGER PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL);
    CREATE TABLE personal_items(id INTEGER PRIMARY KEY,tab_id INTEGER NOT NULL REFERENCES personal_tabs(id) ON DELETE CASCADE,title TEXT NOT NULL,notes TEXT NOT NULL,amount INTEGER,due_date TEXT,cycle TEXT NOT NULL,status TEXT NOT NULL);
    INSERT INTO personal_tabs VALUES(1,'Assinaturas','subscriptions'),(8,'Filmes pra ver','custom');
    INSERT INTO personal_items VALUES(12,8,'Um filme','Romântico',NULL,NULL,'once','active');`);
  try{let store=createPersonalStore(db,AppError),data=store.list();assert.equal(data.tabs.find(t=>t.id===8).layout,'movies');assert.equal(data.items[0].title,'Um filme');assert.equal(data.items[0].watched,false);assert.equal(data.tabs.filter(t=>t.layout==='studies').length,1);store=createPersonalStore(db,AppError);assert.equal(store.list().tabs.length,3);}finally{db.close();}
});
test('filmes: alternar assistido preserva resenha e pasta, busca encontra notas e resenha sem acento',t=>{
  const store=setup(t),id=tab(store,'movies');
  const folder=store.personal.addFolder({tab_id:id,name:'Romance'});
  let movie=store.personal.add({tab_id:id,title:'Antes do amanhecer',notes:'romântico, drama',folder_id:folder.id});
  movie=store.personal.update(movie.id,{watched:true,review:'Fotografia incrível e ótimos diálogos'});
  assert.equal(movie.watched,true);assert.equal(matchesLibrarySearch(movie,'ROMANTICO'),true);assert.equal(matchesLibrarySearch(movie,'incrivel dialogos'),true);assert.equal(matchesLibrarySearch(movie,'terror'),false);
  movie=store.personal.update(movie.id,{watched:false});assert.equal(movie.folder_id,folder.id);assert.match(movie.review,/Fotografia/);
  store.personal.removeFolder(folder.id);assert.equal(store.personal.list().items[0].folder_id,null);assert.equal(store.personal.list().items[0].title,movie.title);
});
test('pastas isoladas por aba; estudos validam prazos e aceitam muitos links seguros',t=>{
  const s=setup(t),movies=tab(s,'movies'),studies=tab(s,'studies');
  const f=s.personal.addFolder({tab_id:movies,name:'Ação'});
  assert.throws(()=>s.personal.add({tab_id:studies,title:'JS',start_date:'2026-10-02',due_date:'2026-10-01'}),/posterior/);
  assert.throws(()=>s.personal.add({tab_id:studies,title:'JS'}),/prazo/);
  const study={tab_id:studies,title:'JS',start_date:'2026-10-01',due_date:'2026-10-02',links:Array.from({length:120},(_,i)=>`https://example.org/material/${i}`)};
  assert.throws(()=>s.personal.add({...study,folder_id:f.id}),/desta aba/);
  for(const url of ['javascript:alert(1)','data:text/html,x','file:///a','https://user:pass@example.com','não é link'])assert.throws(()=>s.personal.add({...study,links:[url]}),/links completos/);
  assert.equal(s.personal.add(study).links.length,120);
});
test('backup v7 restaura pastas, estudos, estado assistido e resenhas; rejeita vínculos cruzados atomicamente',t=>{
  const s=setup(t),movies=tab(s,'movies'),studies=tab(s,'studies');const f=s.personal.addFolder({tab_id:movies,name:'Terror'});
  s.personal.add({tab_id:movies,title:'Filme',watched:true,review:'Muito bom',folder_id:f.id});
  s.personal.add({tab_id:studies,title:'Estudo',start_date:'2026-10-01',due_date:'2026-10-02',links:['https://example.org']});
  const backup=s.exportData();assert.equal(backup.version,14);s.restoreData(backup);assert.deepEqual(s.personal.list(),backup.personal);
  const bad=structuredClone(backup);bad.personal.items.find(i=>i.tab_id===studies).folder_id=f.id;assert.throws(()=>s.restoreData(bad));assert.deepEqual(s.personal.list(),backup.personal);
  const old=structuredClone(backup);old.version=6;delete old.personal.folders;for(const t of old.personal.tabs)delete t.layout;for(const i of old.personal.items){delete i.folder_id;delete i.watched;delete i.review;delete i.start_date;delete i.links;}s.restoreData(old);assert.equal(s.personal.list().items.length,2);assert.equal(s.personal.list().tabs.find(t=>t.id===movies).layout,'movies');
});
test('API de pastas e atualizações diretas do cartão preservam outros campos',async t=>{
  const {server,store,fetch}=createApp({databasePath:':memory:'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=async(path,method,body)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const id=tab(store,'movies');const folder=await call('/api/personal/folders','POST',{tab_id:id,name:'Ação'});assert.equal(folder.status,201);
  const movie=await call('/api/personal/items','POST',{tab_id:id,title:'Teste',notes:'Aventura'});
  const watched=await call(`/api/personal/items/${movie.data.id}`,'PUT',{watched:true});assert.equal(watched.data.watched,true);assert.equal(watched.data.notes,'Aventura');
  assert.equal((await call(`/api/personal/folders/${folder.data.id}`,'PUT',{name:'Aventura'})).data.name,'Aventura');
  assert.equal((await call(`/api/personal/items/${movie.data.id}`,'PUT',{folder_id:folder.data.id})).data.folder_id,folder.data.id);
  assert.equal((await call(`/api/personal/folders/${folder.data.id}`,'DELETE')).status,200);assert.equal(store.personal.list().items[0].folder_id,null);
  assert.equal((await fetch(base+'/personal-library.js')).status,200);
});
