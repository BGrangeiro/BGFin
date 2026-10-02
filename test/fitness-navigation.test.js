import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,relative,isAbsolute } from 'node:path';
import { openDatabase } from '../lib/database.js';
import { createApp } from '../support/http-fixture.js';
import { weekDays,shiftDay,dayAllowed } from '../public/fitness-model.js';

const fixture=t=>{const store=openDatabase(':memory:');t.after(()=>store.close());return store;};
const fitnessId=store=>store.personal.list().tabs.find(tab=>tab.layout==='fitness').id;
const workout=(store,extra={})=>({tab_id:fitnessId(store),record_type:'workout',title:'Treino A',due_date:'2026-09-24',notes:'Pernas',
  exercises:[{name:'Agachamento',sets:'3',reps:'12',load:'20 kg',notes:'Descanso: 60 s',video_url:'https://www.youtube.com/watch?v=example'}],...extra});

test('treinos aceitam vários exercícios, registram presença e mudam de dia sem perder conteúdo',t=>{
  const store=fixture(t);
  const original=store.personal.add(workout(store,{exercises:Array.from({length:150},(_,index)=>({name:`Exercício ${index+1}`,reps:'10'}))}));
  assert.equal(original.exercises.length,150);
  let saved=store.personal.update(original.id,{completed:true});
  assert.equal(saved.completed,true);
  saved=store.personal.update(original.id,{due_date:'2026-10-02'});
  assert.equal(saved.due_date,'2026-10-02');assert.equal(saved.completed,true);assert.deepEqual(saved.exercises,original.exercises);
  saved=store.personal.update(original.id,{completed:false,exercises:workout(store).exercises});
  assert.equal(saved.completed,false);assert.equal(saved.exercises[0].video_url,workout(store).exercises[0].video_url);
  assert.equal(store.list('2026-09').transactions.length,0);
  store.personal.remove(original.id);assert.equal(store.personal.list().items.length,0);
});

test('alimentação registra refeições e horários por dia, permite editar e não calcula calorias',t=>{
  const store=fixture(t),meal=store.personal.add(workout(store,{record_type:'meal',title:'Almoço',meal_time:'12:30',notes:'Arroz, feijão, frango e salada',exercises:[]}));
  assert.equal(meal.amount,null);assert.equal(meal.meal_time,'12:30');assert.equal(meal.record_type,'meal');assert.ok(!Object.hasOwn(meal,'calories'));
  const updated=store.personal.update(meal.id,{notes:'Arroz e legumes',due_date:'2026-09-25'});
  assert.equal(updated.meal_time,'12:30');assert.equal(updated.notes,'Arroz e legumes');
  store.personal.remove(meal.id);assert.equal(store.personal.list().items.length,0);
});

test('validação protege datas, exercícios, vídeos e registros de alimentação sem alterar dados',t=>{
  const store=fixture(t),item=store.personal.add(workout(store));
  for(const change of [{due_date:null},{due_date:'2026-02-30'},{record_type:'other'},{completed:'sim'},
    {exercises:{}},{exercises:[{name:''}]},{exercises:[{name:'Teste',video_url:'javascript:alert(1)'}]},
    {exercises:[{name:'Teste',video_url:'https://user:pass@example.com'}]},{meal_time:'24:30'},
    {record_type:'meal',notes:''}])assert.throws(()=>store.personal.update(item.id,change));
  assert.deepEqual(store.personal.list().items[0],item);
});

test('ficha mantém plano e desempenho ao mover, marcar presença, editar e restaurar backup',t=>{
  const store=fixture(t),item=store.personal.add(workout(store,{
    plan_name:'Hipertrofia · 5x por semana',week_label:'Semana 0',week_goal:'Descobrir as cargas-base.',
    workout_guidance:'Progressão dupla\nPrimeiro repetições, depois carga.\n\nDescanso\nCompostos: 2-3 minutos.',
    exercises:[{name:'Agachamento livre',sets:'4',reps:'6-8',load:'80 kg',performed_reps:'8 / 7 / 7 / 6',rest:'2-3 min',rir:'2',notes:'Boa amplitude.'}]
  }));
  const moved=store.personal.update(item.id,{completed:true,due_date:'2026-10-01'});
  for(const key of ['plan_name','week_label','week_goal','workout_guidance','exercises'])assert.deepEqual(moved[key],item[key]);
  const edited=store.personal.update(item.id,{exercises:[{...item.exercises[0],performed_reps:'8 / 8 / 7 / 7'}]});
  assert.equal(edited.exercises[0].reps,'6-8');assert.equal(edited.exercises[0].load,'80 kg');
  assert.equal(edited.workout_guidance,item.workout_guidance);
  const backup=store.exportData();store.restoreData(backup);assert.deepEqual(store.personal.list().items[0],edited);
  for(const change of [{plan_name:[]},{week_goal:'x'.repeat(2001)},{workout_guidance:'x'.repeat(20001)},
    {exercises:[{name:'Agachamento',performed_reps:12}]},{exercises:[{name:'Agachamento',rest:{}}]}])assert.throws(()=>store.personal.update(item.id,change));
  assert.deepEqual(store.personal.list().items[0],edited);
  const legacy=structuredClone(backup),old=legacy.personal.items[0];
  for(const key of ['plan_name','week_label','week_goal','workout_guidance'])delete old[key];
  for(const key of ['performed_reps','rest','rir'])delete old.exercises[0][key];
  store.restoreData(legacy);const restored=store.personal.list().items[0];
  assert.equal(restored.title,item.title);assert.equal(restored.workout_guidance,'');assert.equal(restored.exercises[0].performed_reps,'');
});

test('ordem principal e treinos persistem na reabertura e migração v8 é aplicada uma vez',()=>{
  const directory=mkdtempSync(join(tmpdir(),'persona-fitness-')),file=join(directory,'test.sqlite');let store;
  try{
    store=openDatabase(file);
    const fitness=fitnessId(store);store.personal.removeTab(fitness);store.db.exec('PRAGMA user_version=8;');store.close();
    store=openDatabase(file);assert.equal(store.personal.list().tabs.filter(tab=>tab.layout==='fitness').length,1);
    const item=store.personal.add(workout(store,{plan_name:'Plano pessoal',week_label:'Semana 1',week_goal:'Repetições',workout_guidance:'Instruções do plano',exercises:[{name:'Agachamento',performed_reps:'8 / 7',rest:'2 min',rir:'2'}]}));
    const defaults=store.preferences.list(),prefs=store.preferences.update({navigation:[...defaults.navigation].reverse(),workspaces:[...defaults.workspaces].reverse()});
    store.close();store=openDatabase(file);
    assert.deepEqual(store.preferences.list(),prefs);assert.deepEqual(store.personal.list().items[0],item);
    assert.equal(store.personal.list().tabs.filter(tab=>tab.layout==='fitness').length,1);
    store.personal.removeTab(fitnessId(store));store.close();store=openDatabase(file);
    assert.equal(store.personal.list().tabs.filter(tab=>tab.layout==='fitness').length,0);
  }finally{store?.close();const child=relative(tmpdir(),directory);assert.ok(child.startsWith('persona-fitness-')&&!child.includes('..')&&!isAbsolute(child));rmSync(directory,{recursive:true,force:true});}
});

test('backup v9 restaura treinos, refeições, presença e ordem; corrupção é rejeitada atomicamente',t=>{
  const store=fixture(t);store.personal.add(workout(store,{completed:true}));store.personal.add(workout(store,{record_type:'meal',notes:'Banana e iogurte'}));
  const order=store.preferences.list().navigation.reverse();store.preferences.update({navigation:order});
  const backup=store.exportData();assert.equal(backup.version,14);
  store.restoreData(backup);assert.deepEqual(store.personal.list(),backup.personal);assert.deepEqual(store.preferences.list(),backup.preferences);
  for(const corrupt of [copy=>copy.preferences.navigation=['debts'],copy=>copy.personal.items[0].due_date='2026-02-30',copy=>copy.personal.items[1].exercises=[{name:'X',video_url:'data:text/html,bad'}]]){
    const copy=structuredClone(backup);corrupt(copy);assert.throws(()=>store.restoreData(copy));assert.deepEqual(store.personal.list(),backup.personal);assert.deepEqual(store.preferences.list(),backup.preferences);
  }
  const old=structuredClone(backup);old.version=8;delete old.preferences;old.personal.items=[];old.personal.tabs=old.personal.tabs.filter(tab=>tab.layout!=='fitness');
  store.restoreData(old);assert.equal(store.personal.list().tabs.filter(tab=>tab.layout==='fitness').length,1);assert.deepEqual(store.preferences.list(),backup.preferences);
});

test('ordem rejeita abas ausentes, repetidas ou desconhecidas e preserva o outro menu',t=>{
  const store=fixture(t),original=store.preferences.list();
  for(const navigation of [[],['x'],original.navigation.slice(1),original.navigation.map(()=>original.navigation[0]),[...original.navigation,'x']])assert.throws(()=>store.preferences.update({navigation}));
  assert.deepEqual(store.preferences.list(),original);
  const updated=store.preferences.update({navigation:[...original.navigation].reverse()});assert.deepEqual(updated.workspaces,original.workspaces);
});

test('semana começa na segunda-feira e suporta mudança de mês, ano e ano bissexto',()=>{
  assert.deepEqual(weekDays('2026-09-27'),['2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-27']);
  assert.equal(weekDays('2027-01-01')[0],'2026-12-28');assert.equal(shiftDay('2028-02-28',1),'2028-02-29');assert.equal(shiftDay('2028-02-29',1),'2028-03-01');assert.equal(dayAllowed('1999-12-31'),false);
});

test('API salva preferências, treino e refeição, serve recursos e mantém proteção de origem',async t=>{
  const {server,fetch}=createApp({databasePath:':memory:'});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`,send=(path,method='GET',body)=>fetch(base+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const personal=await(await send('/api/personal')).json(),tab_id=personal.tabs.find(tab=>tab.layout==='fitness').id;
  const created=await send('/api/personal/items','POST',{tab_id,title:'Corrida',record_type:'workout',due_date:'2026-09-24',plan_name:'Plano pessoal',week_label:'Semana 0',week_goal:'Carga-base',workout_guidance:'Texto <script>sem executar</script>',exercises:[{name:'Corrida',reps:'30 min',performed_reps:'25 min',rest:'1 min',rir:'2'}]});assert.equal(created.status,201);const item=await created.json();
  assert.equal((await send(`/api/personal/items/${item.id}`,'PUT',{completed:true,due_date:'2026-09-26'})).status,200);
  const saved=(await(await send('/api/personal')).json()).items.find(row=>row.id===item.id);assert.equal(saved.workout_guidance,item.workout_guidance);assert.equal(saved.exercises[0].performed_reps,'25 min');
  const prefs=await(await send('/api/preferences')).json();prefs.navigation.reverse();assert.equal((await send('/api/preferences','PUT',prefs)).status,200);
  const state=await(await send('/api/state?month=2026-09')).json();assert.deepEqual(state.preferences,prefs);
  assert.equal((await fetch(base+'/api/preferences',{method:'PUT',headers:{'Content-Type':'application/json',Origin:'https://example.com'},body:JSON.stringify(prefs)})).status,403);
  for(const path of ['/navigation.js','/fitness.js','/fitness-model.js','/fitness.css','/favicon.svg?v=person'])assert.equal((await send(path)).status,200);
});
