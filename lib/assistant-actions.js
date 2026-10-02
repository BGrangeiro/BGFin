import { randomUUID } from 'node:crypto';
import { scheduleDay,sortedBlocks } from '../public/schedule-model.js';
import { studyPeriods } from '../public/study-model.js';

const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export const ACTION_FIELDS={
  transaction:'description type amount category date notes',
  bill:'description amount category due_day start_month',
  debt:'description amount initial_paid creditor category due_date notes debt_type first_installment_date last_installment_date color',
  note:'title content kind status priority category scheduled_date due_date reminder_at pinned checklist',
  investment:'name type institution ticker liquidity start_date review_date maturity_date notes initial_amount',
  investment_entry:'record_id record_title kind amount date notes',
  bill_payment:'record_id record_title month date',
  debt_payment:'record_id record_title amount date notes',
  personal_tab:'name',personal_folder:'tab_id tab_name layout name',
  personal_item:'tab_id tab_name layout folder_id folder_name title notes amount due_date cycle start_date links watched review record_type completed exercises meal_time plan_name week_label week_goal workout_guidance studied_at questions',
  study_questions:'record_id record_title questions',study_comment:'record_id record_title stage comment',
  workout_exercises:'record_id record_title exercises',note_checklist:'record_id record_title checklist',
  schedule_blocks:'tab_id tab_name date mode blocks'
};
export const READ_AREAS=['transactions','bills','debts','investments','notes','personal','studies','movies','subscriptions','workouts','meals','schedule'];
export const ACTION_GUIDE=`Ações disponíveis (type; data é STRING contendo objeto JSON, somente estes campos):
transaction: description,type(income|expense),amount,category,date,notes.
bill: description,amount,category,due_day(1..31),start_month(YYYY-MM).
debt: description,amount,category,debt_type(fixed|installment),initial_paid(opcional),creditor,notes,color(#RRGGBB),due_date; parcelada exige first_installment_date e last_installment_date.
note: title,content,kind(note|task|reminder),status(todo|doing|done; padrão todo),priority(low|medium|high; padrão medium),category,scheduled_date,due_date,reminder_at(YYYY-MM-DDTHH:mm local),pinned,checklist([{text,done}]). Lembrete exige data e hora.
investment: name,type(fixed|treasury|stock|reit|fund|crypto|savings|other),institution,ticker,liquidity,start_date,review_date,maturity_date,notes,initial_amount. Apenas registra investimentos; não aplica dinheiro.
investment_entry: record_id OU record_title,kind(contribution|withdrawal|gain|loss|fee),amount,date,notes.
bill_payment: record_id OU record_title,month(competência do Persona),date. debt_payment: record_id OU record_title,amount,date,notes. Apenas registra pagamento já realizado, não paga dinheiro.
personal_tab: name. personal_folder: tab_id OU tab_name OU layout(movies|studies),name.
personal_item: tab_id OU tab_name OU layout(subscriptions|movies|studies|fitness|custom),folder_id OU folder_name,title,notes,amount,due_date,cycle(monthly|yearly|weekly|once),start_date,links(array URL),watched,review,record_type(workout|meal),completed,exercises,meal_time,plan_name,week_label,week_goal,workout_guidance,studied_at(UTC ISO),questions. Use apenas campos pertinentes à aba. Estudos exigem start_date. Assinaturas exigem amount,due_date e cycle. Treinos/refeições exigem due_date. Refeições: prefira meal do envelope. Exercícios: [{name,sets,reps,load,performed_reps,rest,rir,notes,video_url}], valores de texto. Perguntas: [{question,answer}].
study_questions: record_id OU record_title,questions (acrescenta sem substituir).
study_comment: record_id OU record_title,stage(0=24h,1=7d,2=30d,3=6meses,4=1ano,5=3anos),comment (acrescenta).
workout_exercises: record_id OU record_title,exercises (acrescenta).
note_checklist: record_id OU record_title,checklist([{text,done}]; acrescenta).
schedule_blocks: tab_id OU tab_name(opcional),date,mode(template=padrão semanal|exception=só esta data),blocks([{title,start(HH:mm),end(HH:mm),color(opcional),notes}]). Acrescenta horários, preserva existentes e ordena; não substitui o dia. Pergunte término se ausente.
Valores monetários são INTEIROS EM CENTAVOS: R$ 25,50 = 2550. Datas YYYY-MM-DD; hoje é padrão apenas quando apropriado. Não invente valores, datas obrigatórias, perguntas, exercícios ou links. Categoria omitida pode ser Outros. Ao faltar algo necessário, pergunte com actions=[] e meal=null. Máximo 12 ações por mensagem, executadas juntas. Não há ação para apagar, editar/substituir ou mudar configuração. Para referenciar registros existentes, consulte reads antes se não houver ID/título inequívoco no contexto. Para criar item e aba na mesma mensagem, crie a aba antes e use tab_name. Crie investimento antes de aporte e use record_title.`;

export function creationIntent(message){
  const n=normalize(message);
  if(/^(?:nao|nunca|cancele|cancelar|quanto|quantas|quantos|quais|qual|quando|onde|como|mostre|liste|consulte|explique)\b|\b(?:nao (?:adicione|registre|crie|anote|comi|bebi|almocei|jantei|lanchei)|como (?:adicionar|registrar|criar|anotar))\b/.test(n))return false;
  return /\b(adicion\w*|acrescent\w*|registr\w*|cadastr\w*|cri(?:ar|e|a)\b|anot\w*|colo(?:que|car)|inclu\w*|agend\w*|lembr\w*|gastei|recebi|paguei|comprei|investi|aportei|comi|bebi|almocei|jantei|lanchei)\b/.test(n);
}
export function mayCreate(input,history){
  if(input.mode==='meal'||creationIntent(input.message))return true;
  const n=normalize(input.message);
  if(/^(nao|cancele|cancelar|esquece|esqueca)\b|\?|\b(mostre|liste|consultar|quanto|quais|explique)\b/.test(n))return false;
  // Follow-up answers may finish a request, but a completed turn never authorizes another write.
  for(const turn of history.slice(-4).reverse()){
    if(turn.meal_id||turn.actions?.length)return false;
    if(/^(nao|cancele|cancelar|esquece|esqueca)\b/.test(normalize(turn.message)))return false;
    if(creationIntent(turn.message))return true;
  }
  return false;
}

export function assistantContext(store){
  const personal=store.personal.list();
  return {tabs:personal.tabs.slice(0,60),folders:personal.folders.slice(0,60),note:'Dados pertencem somente à conta conectada. Use reads para consultar registros; resultados podem ser limitados.'};
}
export function readAssistantData(store,request,AppError,maxCharacters=9000){
  if(!request||!READ_AREAS.includes(request.area)||typeof request.search!=='string'||request.search.length>160)throw new AppError('Consulta da IA inválida.');
  const {area,search,date_from,date_to}=request;
  for(const date of [date_from,date_to])if(date&&(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw new AppError('Período de consulta inválido.');
  if(date_from&&date_to&&date_from>date_to)throw new AppError('Período de consulta inválido.');
  let rows;
  if(area==='transactions')rows=store.db.prepare('SELECT * FROM transactions ORDER BY date DESC,id DESC').all();
  else if(area==='bills')rows=store.db.prepare('SELECT * FROM bills ORDER BY id DESC').all();
  else if(area==='debts')rows=store.listDebts();
  else if(area==='investments')rows=store.investments.list();
  else if(area==='notes')rows=store.notes.list();
  else{const personal=store.personal.list();rows=personal.items.filter(row=>area==='personal'||(area==='workouts'||area==='meals'?row.record_type===(area==='workouts'?'workout':'meal'):personal.tabs.find(t=>t.id===row.tab_id)?.layout===area));}
  const terms=normalize(search).split(/\s+/).filter(Boolean);
  rows=rows.filter(row=>{
    const searchable=normalize([row.title,row.description,row.name,row.category,row.institution,row.notes,row.content].filter(Boolean).join(' ')),day=row.date||row.due_date||row.scheduled_date||row.schedule_date||row.start_date;
    return terms.every(term=>searchable.includes(term))&&(!date_from||(day&&day>=date_from))&&(!date_to||(day&&day<=date_to));
  });
  const trim=value=>typeof value==='string'?value.slice(0,500):Array.isArray(value)?value.slice(0,15).map(trim):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,val])=>[key,trim(val)])):value;
  const records=[];let size=0;
  for(const row of rows){const result=trim(row),length=JSON.stringify(result).length;if(records.length>=20||size+length>maxCharacters)break;records.push(result);size+=length;}
  return {area,total:rows.length,shown:records.length,limited:records.length<rows.length,records,
    ...(area==='transactions'?{totals_cents:{income:rows.filter(r=>r.type==='income').reduce((a,r)=>a+r.amount,0),expense:rows.filter(r=>r.type==='expense').reduce((a,r)=>a+r.amount,0)}}:{})};
}

export function executeAssistantAction(store,action,AppError){
  if(!action||!Object.hasOwn(ACTION_FIELDS,action.type)||typeof action.data!=='string'||action.data.length>20000)throw new AppError('Ação da IA inválida. Nenhum registro foi salvo.');
  let data;try{data=JSON.parse(action.data);}catch{throw new AppError('Os dados propostos pela IA estão inválidos. Tente novamente.');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw new AppError('A IA enviou um cadastro inválido. Nenhum registro foi salvo.');
  const extra=Object.keys(data).filter(key=>!ACTION_FIELDS[action.type].split(' ').includes(key));
  if(extra.length){const error=new AppError('A IA enviou campos não permitidos. Nenhum registro foi salvo.');error.correction={action:action.type,remove_fields:extra,allowed_fields:ACTION_FIELDS[action.type]};throw error;}
  // Numeric exercise counts have the same meaning as the text fields used by the form.
  if(Array.isArray(data.exercises))data.exercises=data.exercises.map(exercise=>exercise&&typeof exercise==='object'?Object.fromEntries(Object.entries(exercise).map(([key,value])=>[key,['sets','reps','load','performed_reps','rest','rir'].includes(key)&&typeof value==='number'&&Number.isFinite(value)?String(value):value])):exercise);
  const personal=()=>store.personal.list();
  const choose=(rows,id,name,label)=>{
    const matches=id!==undefined?rows.filter(row=>Number.isSafeInteger(id)&&row.id===id):typeof name==='string'&&name.trim()?rows.filter(row=>normalize(row.title||row.name||row.description)===normalize(name)):[];
    if(matches.length!==1)throw new AppError(`Informe qual ${label} deve receber o registro; o nome precisa identificar apenas um item.`);
    if(name&&normalize(matches[0].title||matches[0].name||matches[0].description)!==normalize(name))throw new AppError(`O nome e o identificador de ${label} não correspondem.`);
    return matches[0];
  };
  const tab=()=>{
    if(data.tab_id!==undefined||data.tab_name)return choose(personal().tabs,data.tab_id,data.tab_name,'aba');
    if(data.layout==='fitness')store.personal.ensureFitnessTab();
    if(data.layout==='schedule'||action.type==='schedule_blocks')store.personal.ensureScheduleTab();
    const found=personal().tabs.filter(t=>t.layout===(data.layout||'schedule'));
    if(found.length!==1)throw new AppError('Informe a aba de destino.');return found[0];
  };
  const item=layout=>choose(personal().items.filter(row=>personal().tabs.find(t=>t.id===row.tab_id)?.layout===layout),data.record_id,data.record_title,'registro');
  const receipt=(row,page,label,extra={})=>({type:action.type,id:row.id,page,label,title:row.title||row.name||row.description||label,...extra});
  const nonempty=(rows,label)=>{if(!Array.isArray(rows)||!rows.length||rows.length>100)throw new AppError(`Informe entre 1 e 100 ${label}.`);return rows;};
  switch(action.type){
    case 'transaction':return receipt(store.addTransaction({category:'Outros',...data}),'transactions','Movimentação registrada');
    case 'bill':return receipt(store.addBill({category:'Outros',...data}),'bills','Conta fixa cadastrada');
    case 'debt':return receipt(store.addDebt({category:'Outros',...data}),'debts','Dívida cadastrada');
    case 'note':return receipt(store.notes.add({kind:'note',status:'todo',priority:'medium',...data}),'notes','Anotação / tarefa cadastrada');
    case 'investment':return receipt(store.investments.add(data),'investments','Investimento cadastrado');
    case 'investment_entry':{const old=choose(store.investments.list(),data.record_id,data.record_title,'investimento');return receipt(store.investments.addEntry(old.id,data),'investments','Movimentação de investimento registrada');}
    case 'bill_payment':{const old=choose(store.db.prepare('SELECT * FROM bills').all(),data.record_id,data.record_title,'conta fixa');store.payBill(old.id,data);return receipt(old,'bills','Pagamento registrado');}
    case 'debt_payment':{const old=choose(store.listDebts(),data.record_id,data.record_title,'dívida');store.payDebt(old.id,data);return receipt(old,'debts','Pagamento registrado');}
    case 'personal_tab':{const row=store.personal.addTab(data);return receipt(row,'personal','Aba criada',{tab_id:row.id});}
    case 'personal_folder':{const dest=tab(),row=store.personal.addFolder({tab_id:dest.id,name:data.name});return receipt(row,'personal','Pasta criada',{tab_id:dest.id});}
    case 'personal_item':{const dest=tab();if(dest.layout==='schedule')throw new AppError('Use a ação de acrescentar horários ao cronograma.');
      if(dest.layout==='fitness'&&!data.record_type&&data.exercises?.length)data.record_type='workout';
      const folder=data.folder_name?choose(personal().folders.filter(f=>f.tab_id===dest.id),data.folder_id,data.folder_name,'pasta'):null;
      const row=store.personal.add({...data,tab_id:dest.id,...(folder?{folder_id:folder.id}:{})});return receipt(row,'personal',`Registro em ${dest.name}`,{tab_id:dest.id,date:row.due_date||null});}
    case 'study_questions':{const old=item('studies');const row=store.personal.update(old.id,{questions:[...old.questions,...nonempty(data.questions,'perguntas')]});return receipt(row,'personal','Perguntas acrescentadas',{tab_id:old.tab_id});}
    case 'study_comment':{const old=item('studies'),periods=studyPeriods(old);if(!Number.isInteger(data.stage)||data.stage<0||data.stage>5||typeof data.comment!=='string'||!data.comment.trim())throw new AppError('Informe o período de revisão e o comentário.');
      periods[data.stage]={...periods[data.stage],comment:[periods[data.stage].comment,data.comment].filter(Boolean).join('\n')};const row=store.personal.update(old.id,{study_periods:periods});return receipt(row,'personal','Comentário acrescentado à revisão',{tab_id:old.tab_id});}
    case 'workout_exercises':{const old=item('fitness');if(old.record_type!=='workout')throw new AppError('Escolha um treino.');const row=store.personal.update(old.id,{exercises:[...old.exercises,...nonempty(data.exercises,'exercícios')]});return receipt(row,'personal','Exercícios acrescentados',{tab_id:old.tab_id,date:old.due_date});}
    case 'note_checklist':{const old=choose(store.notes.list(),data.record_id,data.record_title,'anotação');return receipt(store.notes.update(old.id,{...old,checklist:[...old.checklist,...nonempty(data.checklist,'itens')]}),'notes','Itens acrescentados ao checklist');}
    case 'schedule_blocks':{const dest=tab();if(dest.layout!=='schedule'||!['template','exception'].includes(data.mode))throw new AppError('Informe se o horário vale como padrão ou somente nesta data.');
      if(typeof data.date!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(data.date)||!Number.isFinite(Date.parse(data.date)))throw new AppError('Informe a data do cronograma.');
      if(Array.isArray(data.blocks)&&data.blocks.some(row=>!row||typeof row.start!=='string'||typeof row.end!=='string'))throw new AppError('Informe início e término para cada horário.');
      const current=scheduleDay(personal().items,dest.id,data.date),base=data.mode==='template'?current.template?.blocks||[]:current.blocks;
      const blocks=nonempty(data.blocks,'horários').map(row=>({...row,id:randomUUID(),color:row.color||'#486bcc',notes:row.notes||''}));
      const saved=store.personal.saveSchedule({tab_id:dest.id,date:data.date,mode:data.mode,blocks:sortedBlocks([...base,...blocks])});
      const day=scheduleDay(saved.items,dest.id,data.date),row=data.mode==='template'?day.template:day.exception;return receipt(row,'personal','Horários acrescentados',{tab_id:dest.id,date:data.date});}
  }
}
