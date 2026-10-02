import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase,AppError } from '../lib/database.js';
import { createChatService } from '../lib/chat.js';
import { executeAssistantAction,readAssistantData,assistantContext,mayCreate } from '../lib/assistant-actions.js';

const action=(type,data)=>({type,data:JSON.stringify(data)});
const request=(message='Cadastre os registros solicitados')=>({id:randomUUID(),message,mode:'chat',local_date:'2026-09-30'});
const fixture=t=>{const store=openDatabase(':memory:');t.after(()=>store.close());return store;};
const save=(store,actions,raw=request())=>store.chat.save(raw,{reply:'',meal:null,actions},'groq',a=>executeAssistantAction(store,a,AppError));
const read=(store,area,search='',date_from='',date_to='')=>readAssistantData(store,{area,search,date_from,date_to},AppError);

test('assistente cadastra nas áreas financeiras e pessoais, com centavos e comprovantes persistidos sem duplicar',t=>{
  const store=fixture(t),raw=request();
  const actions=[
    action('transaction',{description:'Mercado',type:'expense',amount:3550,date:'2026-09-30'}),
    action('bill',{description:'Internet',amount:9990,due_day:10,start_month:'2026-09'}),
    action('debt',{description:'Notebook',amount:120000,category:'Compras',debt_type:'installment',first_installment_date:'2026-10-10',last_installment_date:'2027-09-10'}),
    action('note',{title:'Comprar pão',kind:'task',scheduled_date:'2026-10-01'}),
    action('investment',{name:'Reserva',type:'savings',start_date:'2026-09-01',initial_amount:10000}),
    action('investment_entry',{record_title:'Reserva',kind:'contribution',amount:2500,date:'2026-09-30'}),
    action('personal_tab',{name:'Projetos'}),
    action('personal_item',{tab_name:'Projetos',title:'Aprender desenho'}),
    action('personal_item',{layout:'studies',title:'Biologia',start_date:'2026-10-01'}),
    action('study_questions',{record_title:'Biologia',questions:[{question:'O que é uma célula?',answer:'Unidade básica da vida.'}]}),
    action('personal_item',{layout:'fitness',record_type:'workout',title:'Treino A',due_date:'2026-10-01',exercises:[{name:'Supino',sets:'3',reps:'10'}]}),
    action('workout_exercises',{record_title:'Treino A',exercises:[{name:'Remada',sets:'3',reps:'12'}]})
  ];
  const result=save(store,actions,raw);assert.equal(result.actions.length,12);assert.match(result.reply,/Movimentação registrada/);
  assert.deepEqual(save(store,actions,raw),result);assert.equal(store.list('2026-09').transactions.length,1);assert.equal(store.list('2026-09').transactions[0].amount,3550);
  assert.equal(store.investments.list()[0].totals.balance,12500);assert.equal(store.personal.list().items.find(i=>i.title==='Biologia').questions.length,1);
  assert.equal(store.personal.list().items.find(i=>i.title==='Treino A').exercises.length,2);
  const backup=store.exportData();assert.equal(backup.version,14);store.restoreData(backup);assert.deepEqual(store.chat.list()[0],result);
  const legacy=structuredClone(backup);legacy.version=13;for(const turn of legacy.chat)delete turn.actions;store.restoreData(legacy);assert.deepEqual(store.chat.list()[0].actions,[]);
});

test('horários, perguntas, comentários e checklist são acrescentados sem apagar dados',t=>{
  const store=fixture(t);
  save(store,[action('personal_item',{layout:'studies',title:'Inglês',start_date:'2026-10-01',questions:[{question:'Hello?',answer:'Olá'}]}),action('note',{title:'Compras',checklist:[{text:'Arroz',done:false}]}),action('personal_folder',{layout:'movies',name:'Favoritos'}),action('personal_item',{layout:'movies',folder_name:'Favoritos',title:'Interestelar'}),action('personal_item',{layout:'subscriptions',title:'Academia',amount:12000,due_date:'2026-10-10',cycle:'monthly'})]);
  save(store,[action('study_questions',{record_title:'Inglês',questions:[{question:'Bye?',answer:'Tchau'}]}),action('study_comment',{record_title:'Inglês',stage:1,comment:'Ver verbos'}),action('study_comment',{record_title:'Inglês',stage:1,comment:'Rever exemplos'}),action('note_checklist',{record_title:'Compras',checklist:[{text:'Feijão',done:false}]})]);
  const block=(title,start,end)=>({title,start,end});
  save(store,[action('schedule_blocks',{date:'2026-10-05',mode:'template',blocks:[block('Trabalho','11:00','12:00')]}),action('schedule_blocks',{date:'2026-10-05',mode:'template',blocks:[block('Estudo','09:00','10:00')]}),action('schedule_blocks',{date:'2026-10-05',mode:'exception',blocks:[block('Médico','15:00','16:00')]})]);
  const items=store.personal.list().items,study=items.find(i=>i.title==='Inglês');assert.equal(study.questions.length,2);assert.equal(study.study_periods[1].comment,'Ver verbos\nRever exemplos');
  assert.equal(store.notes.list()[0].checklist.length,2);assert.deepEqual(items.find(i=>i.schedule_kind==='template').blocks.map(b=>b.start),['09:00','11:00']);assert.equal(items.find(i=>i.schedule_kind==='exception').blocks.length,3);
});

test('lotes são atômicos inclusive investimentos e registros de pagamento; falha não deixa cadastros parciais',t=>{
  const store=fixture(t);
  assert.throws(()=>save(store,[action('investment',{name:'Teste',type:'savings',start_date:'2026-09-01',initial_amount:100}),action('transaction',{description:'Inválido',amount:-1,type:'expense',date:'2026-09-30'})]));
  assert.equal(store.investments.list().length,0);assert.equal(store.chat.list().length,0);
  assert.throws(()=>save(store,[action('personal_tab',{name:'Nova'}),action('personal_item',{tab_name:'Nova',title:''})]));assert.ok(!store.personal.list().tabs.some(tab=>tab.name==='Nova'));
  save(store,[action('bill',{description:'Luz',amount:5000,due_day:10,start_month:'2026-09'}),action('debt',{description:'Empréstimo',amount:20000,category:'Outros',debt_type:'fixed'})]);
  assert.throws(()=>save(store,[action('bill_payment',{record_title:'Luz',month:'2026-09',date:'2026-09-30'}),action('debt_payment',{record_title:'Empréstimo',amount:999999,date:'2026-09-30'})]));assert.equal(store.list('2026-09').transactions.length,0);
  save(store,[action('bill_payment',{record_title:'Luz',month:'2026-09',date:'2026-09-30'}),action('debt_payment',{record_title:'Empréstimo',amount:1000,date:'2026-09-30'})]);assert.equal(store.list('2026-09').transactions.length,2);
});

test('consultas usam apenas a conta recebida, têm filtros e totais e não autorizam escrita',async t=>{
  const bruno=fixture(t),ana=fixture(t);
  save(bruno,[action('transaction',{description:'Mercado',type:'expense',amount:3500,date:'2026-09-30'}),action('transaction',{description:'Salário',type:'income',amount:50000,date:'2026-09-29'})]);
  assert.equal(read(ana,'transactions').total,0);assert.equal(read(bruno,'transactions','Mercado').totals_cents.expense,3500);assert.equal(read(bruno,'transactions','','2026-09-30','2026-09-30').total,1);
  assert.ok(!JSON.stringify(assistantContext(bruno)).includes('Salário'));
  let calls=0;
  const provider={status:()=>({enabled:true}),reply:async(_input,_history,_meal,context)=>{calls++;if(!context.reads)return {reply:'',meal:null,actions:[],reads:[{area:'transactions',search:'',date_from:'',date_to:''}]};assert.equal(context.reads[0].total,2);return {reply:'Você registrou R$ 35,00 de saídas.',meal:null,actions:[],reads:[]};}};
  const service=createChatService({provider,AppError}),response=await service.send(bruno,'bruno',request('Quanto gastei?'));assert.equal(calls,2);assert.match(response.reply,/35,00/);assert.equal(bruno.list('2026-09').transactions.length,2);
  provider.reply=async()=>({reply:'',meal:null,actions:[action('note',{title:'Indesejado'})]});await assert.rejects(service.send(ana,'ana',request('Olá')));assert.equal(ana.notes.list().length,0);
});

test('ações não permitidas, campos injetados e referências ambíguas são rejeitados; esclarecimentos completam só pedidos pendentes',t=>{
  const store=fixture(t);
  for(const a of [action('delete_all',{}),action('note',{title:'Teste',user_id:'ana'}),{type:'note',data:'not-json'}])assert.throws(()=>save(store,[a]));
  save(store,[action('personal_item',{layout:'studies',title:'Repetido',start_date:'2026-10-01'}),action('personal_item',{layout:'studies',title:'Repetido',start_date:'2026-10-01'})]);
  assert.throws(()=>save(store,[action('study_questions',{record_title:'Repetido',questions:[{question:'Teste'}]})]),/apenas um/);
  const pending={message:'Adicione uma despesa de mercado',reply:'Qual o valor?',meal_id:null,actions:[]};
  assert.equal(mayCreate(request('35 reais'),[pending]),true);assert.equal(mayCreate(request('Não, cancele'),[pending]),false);
  assert.equal(mayCreate(request('35 reais'),[{...pending,actions:[{id:1}]}]),false);assert.equal(mayCreate(request('Como adicionar uma despesa?'),[]),false);
  assert.equal(mayCreate(request('Quanto gastei?'),[]),false);
  assert.equal(mayCreate(request('35 reais'),[pending,{message:'Cancele',actions:[]}]),false);
});

test('erro de validação volta à IA uma vez e só a proposta corrigida é gravada',async t=>{
  const store=fixture(t);let calls=0;
  const provider={status:()=>({enabled:true}),reply:async(_input,_history,_meal,context)=>{
    calls++;
    if(!context.validation_error)return {reply:'',meal:null,actions:[action('transaction',{description:'Mercado',amount:3500,type:'expense',date:'2026-09-30'}),action('personal_item',{layout:'studies',title:'Inglês',category:'Idioma',start_date:'2026-10-01'})]};
    assert.equal(store.list('2026-09').transactions.length,0);assert.equal(context.nothing_saved,true);assert.deepEqual(context.correction.remove_fields,['category']);
    return {reply:'',meal:null,actions:[action('transaction',{description:'Mercado',amount:3500,type:'expense',date:'2026-09-30'}),action('personal_item',{layout:'studies',title:'Inglês',start_date:'2026-10-01'})]};
  }};
  const result=await createChatService({provider,AppError}).send(store,'bruno',request());assert.equal(calls,2);assert.equal(result.actions.length,2);assert.equal(store.list('2026-09').transactions.length,1);
});
