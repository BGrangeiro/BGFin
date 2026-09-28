import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { openDatabase } from '../lib/database.js';
import { createApp } from '../support/http-fixture.js';
import { studySchedule,nextStudyReview,localStudyTime,studyMatchesStatus,studyAgenda } from '../public/study-model.js';
import { matchesLibrarySearch } from '../public/personal-library.js';

const setup=t=>{const store=openDatabase(':memory:');t.after(()=>store.close());return store;};
const fixture=store=>({tab_id:store.personal.list().tabs.find(tab=>tab.layout==='studies').id,title:'Biologia',start_date:'2026-01-01',studied_at:'2026-01-31T15:00:00.000Z',questions:[{question:'O que é mitose?',answer:'Divisão celular.'},{question:'Quais são as fases?'}]});

test('seis revisões usam o estudo inicial, respeitam meses curtos e anos bissextos',()=>{
  const initial=new Date(2026,0,31,12,30).toISOString(),schedule=studySchedule({studied_at:initial});
  assert.deepEqual(schedule.map(stage=>stage.label),['24 horas','7 dias','30 dias','6 meses','1 ano','3 anos']);
  assert.deepEqual(schedule.map(stage=>localStudyTime(stage.due_at)),['2026-02-01T12:30','2026-02-07T12:30','2026-03-02T12:30','2026-07-31T12:30','2027-01-31T12:30','2029-01-31T12:30']);
  const august=studySchedule({studied_at:new Date(2026,7,31,12,0).toISOString()});assert.equal(localStudyTime(august[3].due_at),'2027-02-28T12:00');
  const leap=studySchedule({studied_at:new Date(2028,1,29,12,0).toISOString()});assert.equal(localStudyTime(leap[4].due_at),'2029-02-28T12:00');assert.equal(localStudyTime(leap[5].due_at),'2031-02-28T12:00');
  assert.deepEqual(studySchedule({}),[]);assert.equal(nextStudyReview({}),null);
});

test('24 horas continuam exatas ao atravessar uma mudança de horário de verão',()=>{
  const output=execFileSync(process.execPath,['--input-type=module','-e',`import {studySchedule,localStudyTime} from './public/study-model.js';const base='2026-03-07T17:00:00.000Z';const next=studySchedule({studied_at:base})[0];console.log(JSON.stringify({hours:(Date.parse(next.due_at)-Date.parse(base))/3600000,local:localStudyTime(next.due_at)}));`],{encoding:'utf8',env:{...process.env,TZ:'America/New_York'}});
  assert.deepEqual(JSON.parse(output),{hours:24,local:'2026-03-08T13:00'});
});

test('perguntas sem limite de quantidade, respostas opcionais e busca por conteúdo',t=>{
  const store=setup(t),questions=Array.from({length:250},(_,index)=>({question:`Pergunta ${index+1}`,answer:index===249?'Fotossíntese':''}));
  const saved=store.personal.add({...fixture(store),questions});assert.equal(saved.questions.length,250);
  assert.equal(matchesLibrarySearch(saved,'fotossintese'),true);
  const updated=store.personal.update(saved.id,{questions:[{question:'Nova pergunta'}]});assert.deepEqual(updated.questions,[{question:'Nova pergunta',answer:''}]);assert.equal(updated.studied_at,saved.studied_at);
});

test('revisões avançam uma etapa, preservam o cronograma e rejeitam requisições repetidas',t=>{
  const store=setup(t),item=store.personal.add(fixture(store)),before=studySchedule(item).map(stage=>stage.due_at);
  let saved=store.personal.reviewStudy(item.id,{action:'complete',stage:0});assert.equal(saved.study_reviews.length,1);assert.equal(nextStudyReview(saved).label,'7 dias');
  assert.deepEqual(studySchedule(saved).map(stage=>stage.due_at),before);
  assert.throws(()=>store.personal.reviewStudy(item.id,{action:'complete',stage:0}),error=>error.status===409);
  saved=store.personal.update(item.id,{notes:'Observação',questions:[{question:'Outra pergunta'}]});assert.equal(saved.study_reviews.length,1);
  for(let stage=1;stage<6;stage++)saved=store.personal.reviewStudy(item.id,{action:'complete',stage});
  assert.equal(saved.study_reviews.length,6);assert.equal(nextStudyReview(saved),null);
  assert.throws(()=>store.personal.reviewStudy(item.id,{action:'complete',stage:6}),/já mudou/);
  assert.throws(()=>store.personal.reviewStudy(item.id,{action:'undo',stage:0}),/última/);
  saved=store.personal.reviewStudy(item.id,{action:'undo',stage:5});assert.equal(nextStudyReview(saved).label,'3 anos');assert.equal(saved.questions[0].question,'Outra pergunta');
  saved=store.personal.update(item.id,{studied_at:'2026-02-02T12:00:00.000Z'});assert.deepEqual(saved.study_reviews,[]);assert.equal(nextStudyReview(saved).label,'24 horas');
  saved=store.personal.update(item.id,{studied_at:null});assert.deepEqual(saved.study_reviews,[]);assert.equal(nextStudyReview(saved),null);
});

test('validação rejeita histórico inconsistente, datas inválidas e perguntas vazias',t=>{
  const store=setup(t),item=store.personal.add(fixture(store));
  for(const changes of [{studied_at:'2026-02-30T12:00:00.000Z'},{studied_at:'2026-01-01'},
    {questions:{}},{questions:[null]},{questions:[{question:' '}]},{questions:[{question:'Q',answer:42}]},
    {study_reviews:{}},{study_reviews:Array(7).fill('2026-02-01T15:00:00.000Z')},
    {study_reviews:['2026-01-01T15:00:00.000Z']},{study_reviews:['2026-02-02T15:00:00.000Z','2026-02-01T15:00:00.000Z']}])assert.throws(()=>store.personal.update(item.id,changes));
  assert.deepEqual(store.personal.list().items[0],item);
  const future=store.personal.add({...fixture(store),studied_at:'2090-01-01T12:00:00.000Z'});assert.throws(()=>store.personal.reviewStudy(future.id,{action:'complete',stage:0}),/ainda não chegou/);
  const planned=store.personal.add({...fixture(store),studied_at:null});assert.throws(()=>store.personal.reviewStudy(planned.id,{action:'complete',stage:0}),/quando/);
});

test('filtros e agenda só mostram a próxima revisão pendente no horário local correto',()=>{
  const item={id:1,tab_id:3,title:'Estudo',status:'active',studied_at:'2026-09-26T15:00:00.000Z',study_reviews:[]},tabs=[{id:3,name:'Estudos',layout:'studies'}];
  const before=Date.parse('2026-09-27T14:59:59.000Z'),due=before+1000;
  assert.equal(studyMatchesStatus(item,'scheduled',before),true);assert.equal(studyMatchesStatus(item,'due',before),false);assert.deepEqual(studyAgenda([item],tabs,before),[]);
  assert.equal(studyMatchesStatus(item,'due',due),true);assert.equal(studyAgenda([item],tabs,due).length,1);
  assert.equal(studyAgenda([item],tabs,due)[0].date,localStudyTime('2026-09-27T15:00:00.000Z'));
  assert.deepEqual(studyAgenda([{...item,status:'archived'}],tabs,due),[]);
  const finished={...item,study_reviews:Array(6).fill('2026-09-27T15:00:00.000Z')};assert.equal(studyMatchesStatus(finished,'finished',due),true);assert.deepEqual(studyAgenda([finished],tabs,due),[]);
  assert.equal(studyMatchesStatus({studied_at:null},'unstarted'),true);
});

test('backup v10 preserva perguntas e revisões, v9 migra sem criar revisões automaticamente',t=>{
  const store=setup(t),item=store.personal.add(fixture(store));store.personal.reviewStudy(item.id,{action:'complete',stage:0});
  const backup=store.exportData();assert.equal(backup.version,12);store.restoreData(backup);assert.deepEqual(store.personal.list(),backup.personal);
  const bad=structuredClone(backup);bad.personal.items[0].study_reviews[0]='2001-01-01T12:00:00.000Z';assert.throws(()=>store.restoreData(bad));assert.deepEqual(store.personal.list(),backup.personal);
  const old=structuredClone(backup);old.version=9;for(const key of ['studied_at','questions','study_reviews','study_periods'])delete old.personal.items[0][key];store.restoreData(old);
  const migrated=store.personal.list().items[0];assert.equal(migrated.studied_at,null);assert.deepEqual(migrated.questions,[]);assert.deepEqual(migrated.study_reviews,[]);assert.equal(migrated.title,item.title);
});

test('API de revisão salva, desfaz, protege origem e serve os recursos de Estudos',async t=>{
  const {server,store,fetch}=createApp({databasePath:':memory:'});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`,item=store.personal.add(fixture(store)),path=base+`/api/personal/items/${item.id}/review`;
  const send=(body,origin)=>fetch(path,{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
  assert.equal((await send({action:'complete',stage:0},'https://example.com')).status,403);
  const completed=await send({action:'complete',stage:0});assert.equal(completed.status,200);assert.equal((await completed.json()).study_reviews.length,1);
  assert.equal((await send({action:'complete',stage:0})).status,409);
  const undone=await send({action:'undo',stage:0});assert.equal(undone.status,200);assert.deepEqual((await undone.json()).study_reviews,[]);
  for(const path of ['/study-model.js','/study-reviews.js','/studies.css'])assert.equal((await fetch(base+path)).status,200);
});

test('períodos independentes preservam comentários ao pular, concluir fora de ordem e reabrir',t=>{
  const store=setup(t),item=store.personal.add(fixture(store));
  const save=(stage,status,comment)=>store.personal.reviewStudy(item.id,{action:'set',stage,status,comment});
  let saved=save(0,'skipped','Rever exemplos depois');assert.equal(nextStudyReview(saved).index,1);assert.equal(saved.study_periods[0].status,'skipped');
  saved=save(3,'completed','Anotação de seis meses');assert.equal(saved.study_periods[3].status,'completed');
  saved=save(0,'completed');assert.equal(saved.study_periods[0].comment,'Rever exemplos depois');
  saved=save(0,'pending');assert.equal(nextStudyReview(saved).index,0);assert.equal(saved.study_periods[0].completed_at,null);assert.equal(saved.study_periods[3].comment,'Anotação de seis meses');
  store.personal.update(item.id,{notes:'Edição geral'});assert.equal(store.personal.list().items[0].study_periods[3].status,'completed');
  const backup=store.exportData();store.restoreData(backup);assert.deepEqual(store.personal.list(),backup.personal);
  saved=store.personal.update(item.id,{studied_at:'2026-03-01T12:00:00.000Z'});assert.ok(saved.study_periods.every(period=>period.status==='pending'));assert.equal(saved.study_periods[3].comment,'Anotação de seis meses');
});

test('anotações podem ser preparadas antes do estudo e a validação preserva o banco',t=>{
  const store=setup(t),item=store.personal.add({...fixture(store),studied_at:null});
  let saved=store.personal.reviewStudy(item.id,{action:'set',stage:5,status:'pending',comment:'Lembrar deste conteúdo em três anos'});
  assert.equal(saved.study_periods[5].comment,'Lembrar deste conteúdo em três anos');
  for(const change of [{stage:6,status:'pending'},{stage:1,status:'invalid'},{stage:0,status:'completed'},{stage:0,status:'skipped'},{stage:0,status:'pending',comment:42}])assert.throws(()=>store.personal.reviewStudy(item.id,{action:'set',...change}));
  assert.deepEqual(store.personal.list().items[0],saved);
  saved=store.personal.update(item.id,{studied_at:'2026-01-01T12:00:00.000Z'});assert.equal(saved.study_periods[5].comment,'Lembrar deste conteúdo em três anos');
  const backup=store.exportData(),bad=structuredClone(backup);bad.personal.items[0].study_periods[2].status='invalid';assert.throws(()=>store.restoreData(bad));assert.deepEqual(store.personal.list(),backup.personal);
});

test('migração do histórico v10 mantém as conclusões e permite revisão independente',t=>{
  const store=setup(t),item=store.personal.add(fixture(store));store.personal.reviewStudy(item.id,{action:'complete',stage:0});
  const backup=store.exportData();backup.version=10;delete backup.personal.items[0].study_periods;
  store.restoreData(backup);const migrated=store.personal.list().items[0];assert.equal(migrated.study_periods[0].status,'completed');assert.equal(migrated.study_periods[1].status,'pending');assert.equal(migrated.study_periods[0].completed_at,backup.personal.items[0].study_reviews[0]);
});
