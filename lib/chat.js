import { shiftDay } from '../public/fitness-model.js';
import { assistantContext,readAssistantData,executeAssistantAction,mayCreate,ACTION_FIELDS } from './assistant-actions.js';
import { nutritionInput,foodDescription } from './nutrition.js';

const keyPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const normalize=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const otherIntent=/\b(edite|editar|corrija|corrigir|apague|apagar|exclua|excluir|remova|remover|altere|alterar|mostre|mostrar|liste|listar)\b/;
export function chatDate(value,AppError){
  if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new AppError('Informe uma data válida entre 2000 e 2099.');
  return value;
}
const text=(value,max,AppError)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new AppError(`Use um texto de até ${max} caracteres.`);return value.trim();};
export function mealInput(raw,AppError){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new AppError('A refeição recebida está incompleta. Tente descrevê-la novamente.');
  const meal_time=raw.meal_time??'';
  if(typeof meal_time!=='string'||(meal_time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(meal_time)))throw new AppError('Informe um horário válido para a refeição.');
  return {title:text(raw.title,120,AppError),notes:text(raw.notes,2000,AppError),due_date:chatDate(raw.due_date,AppError),meal_time,nutrition:nutritionInput(raw.nutrition,AppError)};
}
export function isMealStatement(value){
  const n=normalize(value);
  return !otherIntent.test(n)&&!/\b(nao|nunca|vou|quero|pretendo|devo|posso|se eu|sera|amanha)\b|\?/.test(n)&&/\b(comi|bebi|almocei|jantei|lanchei|tomei (?:cafe|leite|suco|agua))\b/.test(n);
}
export function localReply({message,mode,local_date},AppError){
  const n=normalize(message);
  if(mode!=='meal'&&!isMealStatement(message))return {reply:'Estou no modo local, sem IA. Posso anotar refeições: selecione “Anotar refeição” e descreva o que comeu, ou escreva “comi arroz e frango hoje às 12:30”. Para conversar com IA, clique em “Ativar IA com minha chave”, crie sua chave na Groq e use “Testar e ativar IA”.',meal:null};
  if(otherIntent.test(n)||/\b(nao|nunca|vou|pretendo|amanha|devo|posso)\b|\?/.test(n)||/^(oi|ola|bom dia|boa tarde|boa noite|obrigad[oa])[.! ]*$/.test(n))return {reply:'Não registrei uma refeição. Descreva o que você já comeu; para uma pergunta, use “Conversar”. Para editar ou excluir um registro, abra Alimentação.',meal:null};
  let due_date=local_date;
  const iso=n.match(/\b(20\d{2}-\d{2}-\d{2})\b/),br=n.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
  if(iso)due_date=iso[1];else if(br)due_date=`${br[3]||local_date.slice(0,4)}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}`;
  else if(/\banteontem\b/.test(n))due_date=shiftDay(local_date,-2);
  else if(/\bontem\b/.test(n))due_date=shiftDay(local_date,-1);
  else if(/\b(segunda|terca|quarta|quinta|sexta|sabado|domingo|semana|passad[oa]|dia \d)\b/.test(n))return {reply:'Para registrar no dia certo, escreva a data em dd/mm/aaaa, “hoje”, “ontem” ou “anteontem”.',meal:null};
  const time=n.match(/\b(?:as\s+)?(\d{1,2})(?::(\d{2})|h(?:(\d{2}))?)(?!\d)/)||n.match(/\bas\s+(\d{1,2})\b/);
  const meal_time=time?`${time[1].padStart(2,'0')}:${time[2]||time[3]||'00'}`:'';
  const title=/\b(cafe da manha|cafei)\b/.test(n)?'Café da manhã':/\b(almoco|almocei)\b/.test(n)?'Almoço':/\b(jantar|janta|jantei)\b/.test(n)?'Jantar':/\b(lanche|lanchei)\b/.test(n)?'Lanche':/\bceia\b/.test(n)?'Ceia':'Refeição';
  return {reply:'',meal:mealInput({title,notes:message,due_date,meal_time},AppError)};
}

export function createChatStore(db,personal,AppError){
  db.exec(`CREATE TABLE IF NOT EXISTS chat_turns(
    id TEXT PRIMARY KEY, message TEXT NOT NULL, mode TEXT NOT NULL, local_date TEXT NOT NULL,
    reply TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL,
    meal TEXT, meal_id INTEGER REFERENCES personal_items(id) ON DELETE SET NULL);`);
  if(!db.prepare('PRAGMA table_info(chat_turns)').all().some(column=>column.name==='actions'))db.exec("ALTER TABLE chat_turns ADD COLUMN actions TEXT NOT NULL DEFAULT '[]';");
  const decode=row=>row?{...row,meal:row.meal?JSON.parse(row.meal):null,actions:JSON.parse(row.actions||'[]')}:null;
  const get=id=>decode(db.prepare('SELECT * FROM chat_turns WHERE id=?').get(id));
  const all=()=>db.prepare('SELECT * FROM chat_turns ORDER BY created_at,rowid').all().map(decode);
  const insert=row=>db.prepare('INSERT INTO chat_turns(id,message,mode,local_date,reply,source,created_at,meal,meal_id,actions) VALUES (?,?,?,?,?,?,?,?,?,?)').run(row.id,row.message,row.mode,row.local_date,row.reply,row.source,row.created_at,row.meal?JSON.stringify(row.meal):null,row.meal_id,JSON.stringify(row.actions||[]));
  function input(raw){
    if(!raw||typeof raw.id!=='string'||!keyPattern.test(raw.id)||!['chat','meal'].includes(raw.mode))throw new AppError('Mensagem inválida. Reabra o chat e tente novamente.');
    return {id:raw.id,message:text(raw.message,2000,AppError),mode:raw.mode,local_date:chatDate(raw.local_date,AppError)};
  }
  function existing(raw){const row=get(raw.id);if(row&&['message','mode','local_date'].some(key=>row[key]!==raw[key]))throw new AppError('Esta mensagem já foi enviada com outro conteúdo.',409);return row;}
  return {
    input,existing,all,list:()=>db.prepare('SELECT * FROM chat_turns ORDER BY created_at DESC,rowid DESC LIMIT 50').all().reverse().map(decode),
    save(raw,result,source,execute=()=>{throw new AppError('Ação não disponível.');}){
      const meal=result.meal?mealInput(result.meal,AppError):null;
      const proposed=result.actions??[];
      if(!Array.isArray(proposed)||proposed.length>12)throw new AppError('Use até 12 cadastros por mensagem.');
      let reply=meal?'Refeição registrada em Alimentação. Você pode abrir o registro para editar ou excluir.':proposed.length?'':text(result.reply,8000,AppError);
      db.exec('BEGIN IMMEDIATE');
      try{
        const previous=existing(raw);if(previous){db.exec('COMMIT');return previous;}
        let meal_id=null;
        if(meal){personal.ensureFitnessTab();const tab_id=personal.list().tabs.find(tab=>tab.layout==='fitness').id;meal_id=personal.add({...meal,tab_id,record_type:'meal'}).id;}
        const actions=proposed.map(execute);
        if(actions.length)reply=[meal?'Refeição registrada em Alimentação.':'',...actions.map(action=>`${action.label}: ${action.title}.`)].filter(Boolean).join('\n');
        const row={...raw,reply,source,meal,meal_id,actions,created_at:new Date().toISOString()};insert(row);db.exec('COMMIT');return get(row.id);
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    validateBackup(rows,personalData){
      if(!Array.isArray(rows)||rows.length>10000)throw new AppError('Histórico do chat inválido.');
      const ids=new Set();
      return rows.map(raw=>{
        const checked=input(raw);
        if(ids.has(checked.id)||!['local','groq'].includes(raw.source)||typeof raw.created_at!=='string'||!Number.isFinite(Date.parse(raw.created_at)))throw new AppError('Mensagem inválida no backup.');
        ids.add(checked.id);
        const meal=raw.meal===null?null:mealInput(raw.meal,AppError),meal_id=raw.meal_id??null;
        if(meal_id!==null&&(!meal||!Number.isSafeInteger(meal_id)||!personalData.items.some(item=>item.id===meal_id&&item.record_type==='meal'&&personalData.tabs.some(tab=>tab.id===item.tab_id&&tab.layout==='fitness'))))throw new AppError('Refeição do chat inválida no backup.');
        const actions=raw.actions??[];
        if(!Array.isArray(actions)||actions.length>12||actions.some(row=>!row||!Object.hasOwn(ACTION_FIELDS,row.type)||!['transactions','bills','debts','investments','notes','personal'].includes(row.page)||!Number.isSafeInteger(row.id)||row.id<1||typeof row.title!=='string'||row.title.length>160||typeof row.label!=='string'||row.label.length>160||row.tab_id!==undefined&&(!Number.isSafeInteger(row.tab_id)||row.tab_id<1)||row.date!=null&&(typeof row.date!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(row.date))))throw new AppError('Comprovante do assistente inválido no backup.');
        return {...checked,reply:text(raw.reply,8000,AppError),source:raw.source,created_at:raw.created_at,meal,meal_id,actions:actions.map(({type,id,page,title,label,tab_id,date})=>({type,id,page,title,label,...(tab_id!==undefined?{tab_id}:{}),...(date!==undefined?{date}:{})}))};
      });
    },
    replace(rows){db.exec('DELETE FROM chat_turns;');for(const row of rows)insert(row);}
  };
}

export function createChatService({provider,getProvider=()=>provider,AppError,now=()=>Date.now()}){
  const active=new Set(),limits=new Map();
  return {
    status:userId=>getProvider(userId).status(),
    async send(store,userId,raw){
      const input=store.chat.input(raw),existing=store.chat.existing(input);if(existing)return existing;
      if(active.has(userId))throw new AppError('Aguarde a resposta anterior antes de enviar outra mensagem.',409);
      const recent=(limits.get(userId)||[]).filter(at=>now()-at<60000);
      if(recent.length>=12)throw new AppError('Você enviou muitas mensagens. Aguarde um minuto.',429);
      limits.set(userId,[...recent,now()]);active.add(userId);
      try{
        const currentProvider=getProvider(userId),status=currentProvider.status();
        const history=store.chat.list(),allowed=mayCreate(input,history),maySaveMeal=input.mode==='meal'||isMealStatement(input.message)||foodDescription(input.message)||allowed;
        const context=status.enabled?assistantContext(store):null;
        let result=status.enabled?await currentProvider.reply(input,history,maySaveMeal,{...context,can_create:allowed,can_record_food:maySaveMeal}):localReply(input,AppError);
        for(let round=0;status.enabled&&result.reads?.length&&round<2;round++){
          if(!Array.isArray(result.reads)||result.reads.length>3)throw new AppError('Peça a consulta de até três áreas por mensagem.');
          const reads=result.reads.map(read=>readAssistantData(store,read,AppError,Math.floor(9000/result.reads.length)));
          result=await currentProvider.reply(input,history,maySaveMeal,{...context,can_create:allowed,can_record_food:maySaveMeal,reads});
        }
        if(result.reads?.length)throw new AppError('A consulta ficou muito ampla. Especifique a área ou o nome do registro.');
        for(let attempt=0;attempt<2;attempt++){
          if(result.meal&&!maySaveMeal)throw new AppError('A resposta tentou registrar uma refeição sem um pedido. Use “Anotar refeição” para fazer isso.',502);
          if(result.actions?.length&&(!allowed||input.mode==='meal'))throw new AppError('Peça explicitamente o cadastro no modo Conversar para alterar outras áreas.',502);
          try{return store.chat.save(input,result,status.enabled?'groq':'local',action=>executeAssistantAction(store,action,AppError));}
          catch(error){
            if(attempt||!status.enabled||!(error instanceof AppError)||error.status!==400)throw error;
            result=await currentProvider.reply(input,history,maySaveMeal,{...context,can_create:allowed,can_record_food:maySaveMeal,validation_error:error.message,correction:error.correction||null,invalid_proposal:result,nothing_saved:true});
            if(result.reads?.length)throw new AppError('Não consegui identificar todos os dados. Informe o nome e os detalhes do registro.');
          }
        }
      }finally{active.delete(userId);}
    }
  };
}
