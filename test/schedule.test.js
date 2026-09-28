import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {openDatabase} from '../lib/database.js';
import {createApp} from '../support/http-fixture.js';
import {scheduleDay,swapScheduleTimes,moveScheduleTime,weekdayOf,samePlan} from '../public/schedule-model.js';
const setup=t=>{const store=openDatabase(':memory:');t.after(()=>store.close());return store;};
const tabId=store=>store.personal.list().tabs.find(tab=>tab.layout==='schedule').id;
const base=[{id:'study',title:'Estudar',start:'08:00',end:'09:00',color:'#5274cb',notes:'Revisar conteúdo'},{id:'work',title:'Trabalhar',start:'10:00',end:'12:00',color:'#36a37d',notes:''}];
const save=(store,mode,blocks,date='2026-09-28',extra={})=>store.personal.saveSchedule({tab_id:tabId(store),mode,blocks,date,...extra});
const read=(store,date='2026-09-28')=>scheduleDay(store.personal.list().items,tabId(store),date);

test('padrão repete no mesmo dia da semana e exceção altera só a data escolhida',t=>{
 const store=setup(t);save(store,'template',base);assert.deepEqual(read(store).blocks,base);assert.deepEqual(read(store,'2026-10-05').blocks,base);assert.deepEqual(read(store,'2026-09-29').blocks,[]);
 const modified=base.map(block=>block.id==='study'?{...block,title:'Consulta',color:'#b45181'}:block);save(store,'exception',modified);
 assert.equal(read(store).modified,true);assert.deepEqual(read(store).blocks,modified);assert.deepEqual(read(store,'2026-10-05').blocks,base);
 save(store,'template',[{...base[0],start:'07:00',end:'08:00'}]);assert.deepEqual(read(store).blocks,modified);assert.equal(read(store,'2026-10-05').blocks[0].start,'07:00');
 save(store,'reset',[]);assert.equal(read(store).modified,false);assert.equal(read(store).blocks[0].start,'07:00');assert.equal(store.list('2026-09').transactions.length,0);
});

test('dia vazio pode ser exceção, voltar ao padrão remove exceção e cores/notas persistem',t=>{
 const store=setup(t);save(store,'template',base);save(store,'exception',[]);assert.deepEqual(read(store).blocks,[]);assert.ok(read(store).exception);assert.deepEqual(read(store,'2026-10-05').blocks,base);
 save(store,'exception',base);assert.equal(read(store).exception,undefined);assert.equal(read(store).modified,false);assert.equal(read(store).blocks[0].notes,'Revisar conteúdo');assert.equal(read(store).blocks[1].color,'#36a37d');
});

test('arrastar troca intervalos e mover para hora vazia preserva duração, cor e notas',()=>{
 const swapped=swapScheduleTimes(base,'study','work');assert.equal(swapped[0].start,'10:00');assert.equal(swapped[0].end,'12:00');assert.equal(swapped[1].start,'08:00');assert.equal(swapped[0].notes,base[0].notes);assert.equal(swapped[0].color,base[0].color);assert.equal(base[0].start,'08:00');
 const moved=moveScheduleTime(base,'study','14:00');assert.equal(moved[0].end,'15:00');assert.equal(moved[1],base[1]);assert.throws(()=>moveScheduleTime(base,'work','23:00'),/23:59/);assert.equal(samePlan(base,[...base].reverse()),true);assert.equal(weekdayOf('2028-02-29'),2);
});

test('valida cronogramas e evita sobrescrever uma versão alterada por outra janela',t=>{
 const store=setup(t);save(store,'template',base);const before=store.personal.list();
 for(const invalid of [[{...base[0],start:'25:00'}],[{...base[0],end:'07:00'}],[{...base[0],title:''}],[{...base[0],color:'red'}],[base[0],base[0]],{}])assert.throws(()=>save(store,'template',invalid));
 assert.throws(()=>save(store,'template',base,'2026-02-30'));assert.throws(()=>save(store,'invalid',base));assert.throws(()=>save(store,'template',base,'2026-09-28',{expected_revision:0}),error=>error.status===409);
 assert.throws(()=>save(store,'exception',base,'2026-09-28',{expected_template_revision:0}),error=>error.status===409);assert.deepEqual(store.personal.list(),before);
 const record=read(store).template;assert.throws(()=>store.personal.add({...record,id:undefined}),/Já existe/);
});

test('backup v12 preserva padrões e exceções, rejeita duplicação atomicamente e migra v11',t=>{
 const store=setup(t);save(store,'template',base);save(store,'exception',moveScheduleTime(base,'study','14:00'));
 const backup=store.exportData();assert.equal(backup.version,12);store.restoreData(backup);assert.deepEqual(store.personal.list(),backup.personal);
 const duplicate=structuredClone(backup);duplicate.personal.items.push({...duplicate.personal.items[0],id:999});assert.throws(()=>store.restoreData(duplicate),/duplicados/);assert.deepEqual(store.personal.list(),backup.personal);
 const invalid=structuredClone(backup);invalid.personal.items[0].blocks[0].color='javascript:bad';assert.throws(()=>store.restoreData(invalid));assert.deepEqual(store.personal.list(),backup.personal);
 const old=structuredClone(backup);old.version=11;old.personal.items=[];old.personal.tabs=old.personal.tabs.filter(tab=>tab.layout!=='schedule');store.restoreData(old);assert.equal(store.personal.list().tabs.filter(tab=>tab.layout==='schedule').length,1);assert.deepEqual(read(store).blocks,[]);
});

test('migração cria Cronograma uma vez e padrões e exceções sobrevivem à reabertura',()=>{
 const directory=mkdtempSync(join(tmpdir(),'persona-schedule-')),file=join(directory,'test.sqlite');let store;
 try{store=openDatabase(file);store.personal.removeTab(tabId(store));store.db.exec('PRAGMA user_version=11');store.close();store=openDatabase(file);assert.equal(store.personal.list().tabs.filter(tab=>tab.layout==='schedule').length,1);save(store,'template',base);save(store,'exception',[]);const before=store.personal.list();store.close();store=openDatabase(file);assert.deepEqual(store.personal.list(),before);store.personal.removeTab(tabId(store));store.close();store=openDatabase(file);assert.equal(store.personal.list().tabs.filter(tab=>tab.layout==='schedule').length,0);}
 finally{store?.close();const child=relative(tmpdir(),directory);assert.ok(child.startsWith('persona-schedule-')&&!child.includes('..')&&!isAbsolute(child));rmSync(directory,{recursive:true,force:true});}
});

test('API de cronograma salva padrão, exceção e restauração e protege a origem',async t=>{
 const {server,store,fetch}=createApp({databasePath:':memory:'});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const baseUrl=`http://127.0.0.1:${server.address().port}`,payload={tab_id:tabId(store),mode:'template',blocks:base,date:'2026-09-28'};
 const request=(body,origin)=>fetch(baseUrl+'/api/personal/schedule',{method:'PUT',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
 assert.equal((await request(payload,'https://example.com')).status,403);assert.equal((await request(payload)).status,200);assert.equal((await request({...payload,mode:'exception',blocks:[]})).status,200);assert.deepEqual(read(store).blocks,[]);assert.equal((await request({...payload,mode:'reset'})).status,200);assert.deepEqual(read(store).blocks,base);
 for(const path of ['/schedule.js','/schedule-model.js','/schedule.css'])assert.equal((await fetch(baseUrl+path)).status,200);
});
