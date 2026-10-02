import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase,AppError } from '../lib/database.js';
import { nutritionInput,foodDescription } from '../lib/nutrition.js';
import { createChatService } from '../lib/chat.js';
import { createAiProvider } from '../lib/ai.js';
import { attachChatVoice } from '../public/chat-voice.js';
import { createFitnessPanel } from '../public/fitness.js';

const nutrition={protein_g:20.46,carbs_g:27,portion_note:'Porção presumida: dois ovos médios e uma banana média.'};
const meal={title:'Lanche',notes:'Dois ovos e uma banana',due_date:'2026-09-30',meal_time:'',nutrition};
const input=message=>({id:randomUUID(),message,mode:'chat',local_date:'2026-09-30'});
const fixture=t=>{const store=openDatabase(':memory:');t.after(()=>store.close());return store;};

test('nutrientes validam gramas, porções e zero sem inventar valores ausentes',()=>{
  assert.equal(nutritionInput(undefined,AppError),null);
  assert.deepEqual(nutritionInput(nutrition,AppError),{...nutrition,protein_g:20.5,estimated:true});
  assert.equal(nutritionInput({protein_g:0,carbs_g:0,portion_note:'500 ml de água'},AppError).protein_g,0);
  for(const bad of [{},[],{...nutrition,protein_g:-1},{...nutrition,carbs_g:'20'},{...nutrition,protein_g:NaN},{...nutrition,carbs_g:Infinity},{...nutrition,carbs_g:10001},{...nutrition,portion_note:''}])assert.throws(()=>nutritionInput(bad,AppError));
  for(const message of ['Arroz, feijão e frango','250 ml de leite integral','Café com leite','Dois ovos e uma banana','Mandioca cozida'])assert.equal(foodDescription(message),true,message);
  for(const message of ['Não comi banana','Vou comer frango amanhã','Quantas proteínas tem um ovo?','Comprei arroz no mercado','Explique a diferença entre leite integral e desnatado','Adicione comprar pão à lista','Mostre o almoço','Lembrete de comprar leite'])assert.equal(foodDescription(message),false,message);
});

test('chat registra descrição sem comando, nutrientes persistem na refeição e backup, reenvio não duplica',async t=>{
  const store=fixture(t);let seen;
  const provider={status:()=>({enabled:true}),reply:async(raw,history,allowed)=>{seen=allowed;return {reply:'',meal,actions:[],reads:[]};}};
  const service=createChatService({provider,AppError}),raw=input('Dois ovos e uma banana');
  const saved=await service.send(store,'bruno',raw);assert.equal(seen,true);
  assert.equal(saved.meal.nutrition.protein_g,20.5);assert.equal(saved.meal.nutrition.estimated,true);
  assert.deepEqual(await service.send(store,'bruno',raw),saved);
  assert.equal(store.personal.list().items.length,1);
  assert.deepEqual(store.personal.list().items[0].nutrition,saved.meal.nutrition);
  const backup=store.exportData();store.restoreData(backup);
  assert.deepEqual(store.chat.list()[0],saved);assert.deepEqual(store.personal.list().items[0].nutrition,saved.meal.nutrition);
  const bad=structuredClone(backup);bad.personal.items[0].nutrition.carbs_g=-1;
  assert.throws(()=>store.restoreData(bad));assert.deepEqual(store.chat.list()[0],saved);
  const legacy=structuredClone(backup);legacy.version=13;delete legacy.personal.items[0].nutrition;delete legacy.chat[0].meal.nutrition;store.restoreData(legacy);
  assert.equal(store.personal.list().items[0].nutrition,null);assert.equal(store.chat.list()[0].meal.nutrition,null);
});

test('perguntas, planos e negações não autorizam registro mesmo com proposta indevida da IA',async t=>{
  for(const message of ['Hoje não comi pão','Quantas proteínas tem o ovo que comi?','Explique os carboidratos do arroz','Vou comer frango amanhã','Obrigado']){
    const store=fixture(t),service=createChatService({provider:{status:()=>({enabled:true}),reply:async()=>({reply:'',meal})},AppError});
    await assert.rejects(service.send(store,'bruno',input(message)),/sem um pedido/,message);
    assert.equal(store.personal.list().items.length,0);
  }
});

test('editar data mantém nutrientes; mudar alimentos limpa estimativa antiga, mas permite corrigir juntos',t=>{
  const store=fixture(t),tab_id=store.personal.list().tabs.find(tab=>tab.layout==='fitness').id;
  const saved=store.personal.add({...meal,tab_id,record_type:'meal'});
  assert.deepEqual(store.personal.update(saved.id,{due_date:'2026-10-01'}).nutrition,saved.nutrition);
  assert.equal(store.personal.update(saved.id,{notes:'Um copo de água'}).nutrition,null);
  const updated=store.personal.update(saved.id,{notes:'500 ml de água',nutrition:{protein_g:0,carbs_g:0,portion_note:'500 ml de água'}});
  assert.equal(updated.nutrition.protein_g,0);
  assert.equal(store.personal.update(saved.id,{record_type:'workout',notes:'Treino'}).nutrition,null);
});

test('instruções e exemplos nutricionais estão no pedido da IA com campos estruturados',async()=>{
  let body;
  const provider=createAiProvider({config:{provider:'groq',model:'test',key:'test-only'},AppError,fetchImpl:async(url,options)=>{body=JSON.parse(options.body);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'',meal,actions:[],reads:[]})}}]});}});
  await provider.reply(input('Dois ovos e uma banana'),[],true,{can_create:false});
  assert.match(body.messages[0].content,/Porção presumida/);assert.match(body.messages[0].content,/500 ml de água/);assert.match(body.messages[0].content,/não análise de laboratório/);
  assert.ok(body.response_format.json_schema.schema.properties.meal.anyOf[1].required.includes('nutrition'));
});

test('cartão mostra nutrientes e editor preserva ou limpa a estimativa conforme alimentos alterados',async()=>{
  const previous=globalThis.document,previousWindow=globalThis.window;let callback,sent;
  globalThis.document={addEventListener(){},querySelector:()=>null};
  globalThis.window={addEventListener(){}};
  try{
    const item={...meal,id:1,tab_id:2,record_type:'meal'},tab={id:2,name:'Treino e alimentação'};
    const panel=createFitnessPanel({getData:()=>({items:[item]}),getTab:()=>tab,api:async(url,options)=>{sent=JSON.parse(options.body);},icon:()=>'',escape:value=>String(value).replaceAll('<','&lt;'),show:(title,subtitle,html,save)=>{callback=save;},today:()=>meal.due_date});
    panel.openMeals(meal.due_date);assert.match(panel.render(),/Proteínas/);assert.match(panel.render(),/Carboidratos/);assert.match(panel.render(),/Porção presumida/);
    panel.edit(item);const values={title:item.title,due_date:item.due_date,notes:item.notes,meal_time:'',protein_g:String(nutrition.protein_g),carbs_g:'27',portion_note:nutrition.portion_note};
    await callback(values,{});assert.equal(sent.nutrition.carbs_g,27);
    await callback({...values,notes:'Outra refeição'},{});assert.equal(sent.nutrition,null);
    await callback({...values,notes:'Outra refeição',protein_g:'30',portion_note:'Porção atualizada'},{});assert.equal(sent.nutrition.protein_g,30);
  }finally{globalThis.document=previous;globalThis.window=previousWindow;}
});

test('ditado em português preenche texto, ignora resultados tardios e não envia automaticamente',()=>{
  let click,recognizer;const errors=[];
  const button={addEventListener:(name,fn)=>{click=fn;},setAttribute(){}},input={value:'Hoje',maxLength:2000,focus(){},disabled:false},hint={};
  class Recognition{constructor(){recognizer=this;}start(){this.onstart();}stop(){this.onend();}abort(){this.onerror({error:'aborted'});this.onend();}}
  const voice=attachChatVoice({button,input,hint,onError:message=>errors.push(message),Recognition});
  click();assert.equal(recognizer.lang,'pt-BR');assert.match(button.textContent,/Parar/);
  const result=Object.assign([{transcript:'comi dois ovos'}],{isFinal:true});recognizer.onresult({resultIndex:0,results:[result]});assert.equal(input.value,'Hoje comi dois ovos');
  recognizer.onresult({resultIndex:0,results:[result]});assert.equal(input.value,'Hoje comi dois ovos');
  voice.stop();recognizer.onresult({resultIndex:0,results:[Object.assign([{transcript:'tarde'}],{isFinal:true})]});assert.equal(input.value,'Hoje comi dois ovos');assert.deepEqual(errors,[]);
  recognizer.onerror({error:'not-allowed'});assert.match(errors[0],/não foi autorizado/);
  const last=recognizer;input.disabled=true;click();assert.equal(recognizer,last);
  const unavailable={};attachChatVoice({button:unavailable,input,hint,Recognition:null});assert.equal(unavailable.disabled,true);assert.match(hint.textContent,/indisponível/);
});
