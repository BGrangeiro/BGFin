import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,relative,isAbsolute } from 'node:path';
import { openDatabase,AppError } from '../lib/database.js';
import { localReply,isMealStatement,createChatService } from '../lib/chat.js';
import { createAiProvider,aiConfig } from '../lib/ai.js';
import { createApp,testPassword } from '../support/http-fixture.js';

const request=(extra={})=>({id:randomUUID(),message:'Hoje almocei arroz, feijão e 150 g de frango às 12:30',mode:'chat',local_date:'2026-09-29',...extra});
const local=()=>createAiProvider({config:{provider:'local',model:'test',key:''},AppError});
const service=provider=>createChatService({provider:provider||local(),AppError});
const fixture=t=>{const store=openDatabase(':memory:');t.after(()=>store.close());return store;};

test('modo local extrai datas e horário sem inventar calorias nem registrar dúvidas e negações',()=>{
  const meal=localReply(request(),AppError).meal;
  assert.equal(meal.title,'Almoço');assert.equal(meal.due_date,'2026-09-29');assert.equal(meal.meal_time,'12:30');assert.match(meal.notes,/150 g/);assert.ok(!('calories' in meal));
  for(const [message,date,time] of [['Ontem comi ovos às 7h30','2026-09-28','07:30'],['Anteontem comi banana','2026-09-27',''],['Comi arroz em 01/10/2026 às 19h','2026-10-01','19:00'],['Comi pera em 2026-09-01','2026-09-01','']]){
    const parsed=localReply(request({message}),AppError).meal;assert.equal(parsed.due_date,date);assert.equal(parsed.meal_time,time);
  }
  for(const message of ['Não comi banana','Vou comer arroz amanhã','O que devo comer?','Se eu comi arroz, quantas calorias tem?','Apague o almoço que comi hoje','Mostre o que comi ontem']){assert.equal(isMealStatement(message),false);assert.equal(localReply(request({message}),AppError).meal,null);}
  assert.equal(localReply(request({mode:'meal',message:'Olá'}),AppError).meal,null);
  assert.equal(localReply(request({message:'Comi banana às 8'}),AppError).meal.meal_time,'08:00');
  assert.equal(localReply(request({mode:'meal',message:'Banana e iogurte'}),AppError).meal.notes,'Banana e iogurte');
  assert.equal(localReply(request({message:'Na sexta comi arroz'}),AppError).meal,null);
  for(const message of ['Comi arroz em 31/02/2026','Comi arroz às 25:30'])assert.throws(()=>localReply(request({message}),AppError));
});

test('registro pelo chat é atômico e idempotente, mantém demais áreas e registra sem duplicar no reenvio',async t=>{
  const store=fixture(t),chat=service(),raw=request(),before=store.list('2026-09');
  const saved=await chat.send(store,'bruno',raw),again=await chat.send(store,'bruno',raw);
  assert.deepEqual(saved,again);assert.equal(store.chat.list().length,1);
  assert.equal(store.personal.list().items.filter(row=>row.record_type==='meal').length,1);
  assert.deepEqual(store.list('2026-09').transactions,before.transactions);
  await assert.rejects(chat.send(store,'bruno',{...raw,message:'Outro texto'}));
  const item=store.personal.list().items.find(row=>row.id===saved.meal_id);assert.equal(item.meal_time,'12:30');assert.equal(item.notes,raw.message);
  const originalAdd=store.personal.add;store.personal.add=()=>{throw new Error('storage unavailable');};
  await assert.rejects(chat.send(store,'bruno',request()));assert.equal(store.chat.list().length,1);store.personal.add=originalAdd;
  store.personal.remove(item.id);assert.equal(store.chat.list()[0].meal_id,null);
  assert.equal((await chat.send(store,'bruno',raw)).meal_id,null);assert.equal(store.personal.list().items.length,0);
});

test('histórico e refeição persistem em disco; backup v13 valida vínculos, restaura e preserva histórico ao receber v12',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'persona-chat-')),file=join(directory,'test.sqlite');let store;
  try{
    store=openDatabase(file);const saved=await service().send(store,'bruno',request());store.close();store=openDatabase(file);
    assert.deepEqual(store.chat.list()[0],saved);const backup=store.exportData();assert.equal(backup.version,14);
    store.restoreData(backup);assert.deepEqual(store.chat.list(),backup.chat);
    for(const change of [copy=>copy.chat[0].meal_id=999,copy=>copy.chat.push(copy.chat[0]),copy=>copy.chat[0].meal.meal_time='99:99',copy=>copy.chat[0].source='unknown']){
      const copy=structuredClone(backup);change(copy);assert.throws(()=>store.restoreData(copy));assert.deepEqual(store.chat.list(),backup.chat);
    }
    const legacy=structuredClone(backup);legacy.version=12;delete legacy.chat;store.restoreData(legacy);assert.equal(store.chat.list().length,1);assert.equal(store.chat.list()[0].meal_id,null);
    store.restoreData(backup);assert.deepEqual(store.chat.list(),backup.chat);
  }finally{store?.close();const child=relative(tmpdir(),directory);assert.ok(child.startsWith('persona-chat-')&&!child.includes('..')&&!isAbsolute(child));rmSync(directory,{recursive:true,force:true});}
});

test('provedor Groq usa schema e contexto limitado, sem retornar a chave, e trata falhas sem gravar',async t=>{
  const store=fixture(t);let calls=0,seen;
  const provider=createAiProvider({AppError,config:{provider:'groq',model:'openai/gpt-oss-20b',key:'test-secret'},fetchImpl:async(url,options)=>{
    calls++;seen={url,...options,body:JSON.parse(options.body)};
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'Olá! Em que posso ajudar?',meal:null,actions:[],reads:[]})}}]});
  }});
  const result=await service(provider).send(store,'bruno',request({message:'Olá'}));
  assert.equal(result.source,'groq');assert.equal(calls,1);assert.equal(seen.url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(seen.redirect,'error');
  assert.equal(seen.body.response_format.json_schema.strict,true);assert.equal(seen.headers.Authorization,'Bearer test-secret');
  assert.equal(JSON.stringify(provider.status()).includes('test-secret'),false);assert.equal(JSON.stringify(result).includes('test-secret'),false);
  assert.equal(seen.body.messages.length,2);assert.ok(!JSON.stringify(seen.body).includes('saldo.sqlite'));
  for(const fetchImpl of [async()=>new Response('secret upstream details',{status:429}),async()=>{throw new Error('secret upstream details');},async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}]})]){
    const broken=service(createAiProvider({AppError,config:{provider:'groq',model:'test',key:'test-secret'},fetchImpl}));
    await assert.rejects(broken.send(store,'bruno',request({message:'Olá'})),error=>!error.message.includes('secret'));
  }
  assert.equal(store.chat.list().length,1);assert.equal(store.personal.list().items.length,0);
  const timed=createAiProvider({AppError,config:{provider:'groq',model:'test',key:'x'},timeoutMs:5,fetchImpl:async(_url,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason));setTimeout(resolve,100);})});
  await assert.rejects(timed.reply(request(),[],true),/demorou/);
});

test('saída da IA não pode executar ações arbitrárias; proposta de refeição é validada e salva só com intenção do usuário',async t=>{
  const store=fixture(t),meal={title:'Lanche',notes:'Banana e iogurte',due_date:'2026-09-29',meal_time:''};
  let result={reply:'',meal};
  const provider={status:()=>({enabled:true}),reply:async()=>result},chat=service(provider);
  await assert.rejects(chat.send(store,'bruno',request({message:'Olá'})),/sem um pedido/);
  result={reply:'',meal:{...meal,due_date:'2026-02-30'}};await assert.rejects(chat.send(store,'bruno',request({mode:'meal'})));
  assert.equal(store.chat.list().length,0);assert.equal(store.personal.list().items.length,0);
  result={reply:'',meal,sql:'DELETE FROM personal_items',user_id:'ana'};
  const saved=await chat.send(store,'bruno',request({mode:'meal',message:'Comi banana e iogurte'}));assert.ok(saved.meal_id);assert.equal(store.personal.list().items.length,1);
});

test('mensagens simultâneas e excesso de solicitações são contidos por conta',async t=>{
  const store=fixture(t);let finish;
  const provider={status:()=>({enabled:true}),reply:()=>new Promise(resolve=>{finish=resolve;})},chat=service(provider);
  const first=chat.send(store,'bruno',request({message:'Olá'}));await assert.rejects(chat.send(store,'bruno',request({message:'Outra pergunta'})),error=>error.status===409);
  finish({reply:'Olá',meal:null});await first;
  const limited=service();for(let i=0;i<12;i++)await limited.send(store,'bruno',request({message:'Olá'}));
  await assert.rejects(limited.send(store,'bruno',request()),error=>error.status===429);
  const ana=fixture(t);assert.ok(await limited.send(ana,'ana',request({message:'Olá'})));
});

test('API exige login, isola chat e refeições por conta, bloqueia origem externa e não divulga chave',async t=>{
  const {server,fetch}=createApp({databasePath:':memory:',aiProvider:local()});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await globalThis.fetch(base+'/api/chat')).status,401);
  const raw=request(),send=()=>fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(raw)});
  const created=await send();assert.equal(created.status,201);const result=await created.json();assert.ok(result.meal_id);
  assert.equal((await(await send()).json()).meal_id,result.meal_id);
  const history=await(await fetch(base+'/api/chat')).json();assert.equal(history.messages.length,1);assert.equal(history.status.enabled,false);
  assert.equal((await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.com'},body:JSON.stringify(request())})).status,403);
  const login=await globalThis.fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'Ana',password:testPassword})});const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await(await globalThis.fetch(base+'/api/chat',{headers:{Cookie:cookie}})).json()).messages.length,0);
  assert.equal((await(await globalThis.fetch(base+'/api/personal',{headers:{Cookie:cookie}})).json()).items.length,0);
  for(const path of ['/chat.js','/chat.css'])assert.equal((await fetch(base+path)).status,200);
  assert.equal((await fetch(base+'/.env')).status,404);
  assert.equal(aiConfig({}).provider,'local');assert.throws(()=>aiConfig({AI_PROVIDER:'unknown'}));
});
