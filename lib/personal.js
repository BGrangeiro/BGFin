import { scheduleInput,scheduleKey } from './schedule.js';
import { scheduleDay,samePlan,weekdayOf,WEEKDAY_NAMES } from '../public/schedule-model.js';
import { studyPeriods } from '../public/study-model.js';
import { fitnessInput } from './fitness.js';
import { studyInput } from './studies.js';

export function createPersonalStore(db, AppError) {
  db.exec(`CREATE TABLE IF NOT EXISTS personal_tabs(id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('subscriptions','custom')));
    CREATE TABLE IF NOT EXISTS personal_items(id INTEGER PRIMARY KEY, tab_id INTEGER NOT NULL REFERENCES personal_tabs(id) ON DELETE CASCADE,
    title TEXT NOT NULL, notes TEXT NOT NULL, amount INTEGER, due_date TEXT, cycle TEXT NOT NULL, status TEXT NOT NULL);`);
  if (!db.prepare("SELECT id FROM personal_tabs WHERE kind='subscriptions'").get()) db.prepare("INSERT INTO personal_tabs(name,kind) VALUES ('Assinaturas','subscriptions')").run();
  const infer = name => {
    const text=String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    return /^(filmes?|filmes? (pra|para) ver)$/.test(text)?'movies':text==='estudos'?'studies':text==='treino e alimentacao'?'fitness':text==='cronograma'?'schedule':'custom';
  };
  if (!db.prepare('PRAGMA table_info(personal_tabs)').all().some(c=>c.name==='layout')) {
    db.exec("BEGIN; ALTER TABLE personal_tabs ADD COLUMN layout TEXT NOT NULL DEFAULT 'custom';");
    try {
      for(const t of db.prepare('SELECT * FROM personal_tabs').all()) db.prepare('UPDATE personal_tabs SET layout=? WHERE id=?').run(t.kind==='subscriptions'?'subscriptions':infer(t.name),t.id);
      for(const [name,layout] of [['Filmes pra ver','movies'],['Estudos','studies']]) if(!db.prepare('SELECT id FROM personal_tabs WHERE layout=?').get(layout)) db.prepare("INSERT INTO personal_tabs(name,kind,layout) VALUES (?,'custom',?)").run(name,layout);
      db.exec('COMMIT');
    } catch(e){db.exec('ROLLBACK');throw e;}
  }
  if (!db.prepare('PRAGMA table_info(personal_tabs)').all().some(c=>c.name==='sort_order')) {
    db.exec('BEGIN; ALTER TABLE personal_tabs ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;');
    try {
      db.prepare('SELECT id FROM personal_tabs ORDER BY kind DESC,id').all().forEach((t,index)=>db.prepare('UPDATE personal_tabs SET sort_order=? WHERE id=?').run(index,t.id));
      db.exec('COMMIT');
    } catch(e){db.exec('ROLLBACK');throw e;}
  }
  db.exec(`CREATE TABLE IF NOT EXISTS personal_folders(id INTEGER PRIMARY KEY, tab_id INTEGER NOT NULL REFERENCES personal_tabs(id) ON DELETE CASCADE, name TEXT NOT NULL);`);
  const cols=db.prepare('PRAGMA table_info(personal_items)').all();
  if(!cols.some(c=>c.name==='details')) db.exec("ALTER TABLE personal_items ADD COLUMN details TEXT NOT NULL DEFAULT '{}';");
  if(!cols.some(c=>c.name==='folder_id')) db.exec('ALTER TABLE personal_items ADD COLUMN folder_id INTEGER REFERENCES personal_folders(id) ON DELETE SET NULL;');
  const defaults={watched:false,review:'',start_date:null,links:[],studied_at:null,study_reviews:[],questions:[]};
  const decode=row=>{const {details,...base}=row;const parsed=JSON.parse(details);return {...base,...defaults,...parsed,...(db.prepare('SELECT layout FROM personal_tabs WHERE id=?').get(row.tab_id)?.layout==='studies'?{study_periods:studyPeriods(parsed)}:{})};};
  const str=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new AppError(`Preencha o texto com até ${max} caracteres.`);return value.trim();};
  const date=value=>{if(value==null||value==='')return null;if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new AppError('Data inválida.');return value;};
  const get=(table,id)=>{if(!Number.isSafeInteger(id)||id<1)throw new AppError('Identificador inválido.');const row=db.prepare(`SELECT ${table==='personal_tabs'?'id,name,kind,layout':'*'} FROM ${table} WHERE id=?`).get(id);if(!row)throw new AppError('Registro não encontrado.',404);return table==='personal_items'?decode(row):row;};
  const tabs=()=>db.prepare('SELECT id,name,kind,layout FROM personal_tabs ORDER BY sort_order,id').all();
  const folders=()=>db.prepare('SELECT * FROM personal_folders ORDER BY name,id').all();
  function item(raw,tabRows,folderRows,legacy=false){
    if(!raw||!Number.isSafeInteger(raw.tab_id))throw new AppError('Aba inválida.');
    const tab=tabRows.find(t=>t.id===raw.tab_id);if(!tab)throw new AppError('Aba não encontrada.');
    const amount=raw.amount??null,due_date=date(raw.due_date),start_date=date(raw.start_date),folder_id=raw.folder_id??null;
    if(amount!==null&&(!Number.isSafeInteger(amount)||amount<0||amount>10000000000))throw new AppError('Valor inválido.');
    if(tab.kind==='subscriptions'&&(amount===null||due_date===null))throw new AppError('Informe o valor e o vencimento da assinatura.');
    if(tab.layout==='studies'&&!legacy&&!start_date)throw new AppError('Informe o prazo para começar.');
    if(start_date&&due_date&&start_date>due_date)throw new AppError('O prazo para terminar deve ser igual ou posterior ao início.');
    if(folder_id!==null&&(!Number.isSafeInteger(folder_id)||!folderRows.some(f=>f.id===folder_id&&f.tab_id===raw.tab_id)))throw new AppError('Escolha uma pasta desta aba.');
    const cycle=raw.cycle??'once',status=raw.status??'active';
    if(!['monthly','yearly','weekly','once'].includes(cycle)||!['active','archived'].includes(status))throw new AppError('Frequência ou situação inválida.');
    const watched=raw.watched??false;if(typeof watched!=='boolean')throw new AppError('Situação do filme inválida.');
    const links=raw.links??[];if(!Array.isArray(links))throw new AppError('Lista de links inválida.');
    const checkedLinks=links.map(link=>{const text=str(link,4096,true);try{const url=new URL(text);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw 0;}catch{throw new AppError('Use links completos começando com https:// ou http://.');}return text;});
    const fitness=tab.layout==='fitness'?fitnessInput(raw,{str,date,AppError}):{};
    const schedule=tab.layout==='schedule'?scheduleInput(raw,{str,date,AppError}):{};
    const study=tab.layout==='studies'?studyInput(raw,{str,AppError}):{};
    return {tab_id:raw.tab_id,title:str(raw.title,120,true),notes:str(raw.notes??'',10000),amount:['fitness','schedule'].includes(tab.layout)?null:amount,due_date,cycle:['fitness','schedule'].includes(tab.layout)?'once':cycle,status,folder_id,watched,review:str(raw.review??'',20000),start_date,links:checkedLinks,...fitness,...study,...schedule};
  }
  function checkScheduleUnique(n,id){if(n.schedule_kind&&db.prepare('SELECT * FROM personal_items WHERE tab_id=?').all(n.tab_id).map(decode).some(other=>other.id!==id&&other.schedule_kind&&scheduleKey(other)===scheduleKey(n)))throw new AppError('Já existe um cronograma para este dia.');}
  const columns=['tab_id','title','notes','amount','due_date','cycle','status','folder_id','details'];
  const values=n=>columns.map(k=>k==='details'?JSON.stringify({watched:n.watched,review:n.review,start_date:n.start_date,links:n.links,...(n.record_type?{record_type:n.record_type,completed:n.completed,exercises:n.exercises,meal_time:n.meal_time,nutrition:n.nutrition,plan_name:n.plan_name,week_label:n.week_label,week_goal:n.week_goal,workout_guidance:n.workout_guidance}:{}),...(n.questions?{questions:n.questions,studied_at:n.studied_at,study_reviews:n.study_reviews,study_periods:n.study_periods}:{}),...(n.schedule_kind?{schedule_kind:n.schedule_kind,weekday:n.weekday,schedule_date:n.schedule_date,blocks:n.blocks,schedule_revision:n.schedule_revision}:{})}):n[k]);
  const uniqueName=(rows,name,id)=>{if(rows.some(t=>t.id!==id&&t.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))throw new AppError('Já existe um registro com esse nome.');};
  function folderInput(raw,id){const tab=get('personal_tabs',raw?.tab_id);if(!['movies','studies'].includes(tab.layout))throw new AppError('Esta aba não usa pastas.');const name=str(raw.name,60,true);uniqueName(folders().filter(f=>f.tab_id===tab.id),name,id);return {tab_id:tab.id,name};}
  const api={
    ensureFitnessTab(){
      if(tabs().some(t=>t.layout==='fitness'))return;
      let name='Treino e alimentação',suffix=2;
      while(tabs().some(t=>t.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))name=`Treino e alimentação ${suffix++}`;
      db.prepare("INSERT INTO personal_tabs(name,kind,layout,sort_order) VALUES (?,'custom','fitness',(SELECT COALESCE(MAX(sort_order),-1)+1 FROM personal_tabs))").run(name);
    },
    ensureScheduleTab(){
      if(tabs().some(tab=>tab.layout==='schedule'))return;
      let name='Cronograma',suffix=2;while(tabs().some(tab=>tab.name.toLowerCase()===name.toLowerCase()))name='Cronograma '+suffix++;
      db.prepare("INSERT INTO personal_tabs(name,kind,layout,sort_order) VALUES (?,'custom','schedule',(SELECT COALESCE(MAX(sort_order),-1)+1 FROM personal_tabs))").run(name);
    },
    saveSchedule(raw){
      const tab=get('personal_tabs',raw?.tab_id),day=date(raw?.date);
      if(tab.layout!=='schedule'||!day||!['template','exception','reset'].includes(raw?.mode))throw new AppError('Cronograma inválido.');
      const current=scheduleDay(api.list().items,tab.id,day),record=raw.mode==='template'?current.template:current.exception;
      if(raw.expected_revision!==undefined&&raw.expected_revision!==(record?.schedule_revision||0))throw new AppError('Este cronograma mudou. Recarregue a página antes de salvar.',409);
      if(raw.expected_template_revision!==undefined&&raw.expected_template_revision!==(current.template?.schedule_revision||0))throw new AppError('O padrão semanal mudou. Recarregue a página antes de salvar.',409);
      if(raw.mode==='reset'){if(record)api.remove(record.id);return api.list();}
      const details=scheduleInput({schedule_kind:raw.mode,weekday:weekdayOf(day),schedule_date:raw.mode==='exception'?day:null,blocks:raw.blocks,schedule_revision:(record?.schedule_revision||0)+1},{str,date,AppError});
      if(raw.mode==='exception'&&samePlan(details.blocks,current.template?.blocks||[])){if(record)api.remove(record.id);return api.list();}
      const payload={...details,tab_id:tab.id,title:raw.mode==='template'?'Padrão · '+WEEKDAY_NAMES[weekdayOf(day)]:'Cronograma · '+day,amount:null,due_date:null,notes:'',cycle:'once',status:'active'};
      if(record)api.update(record.id,payload);else api.add(payload);
      return api.list();
    },
    list:()=>({tabs:tabs(),folders:folders(),items:db.prepare('SELECT * FROM personal_items ORDER BY id DESC').all().map(decode)}),
    addTab(raw){const name=str(raw?.name,60,true);uniqueName(tabs(),name);const r=db.prepare("INSERT INTO personal_tabs(name,kind,layout,sort_order) VALUES (?,'custom',?,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM personal_tabs))").run(name,infer(name));return get('personal_tabs',Number(r.lastInsertRowid));},
    reorderTabs(raw){
      const ids=raw?.ids,current=tabs();
      if(!Array.isArray(ids)||ids.length!==current.length||new Set(ids).size!==ids.length||ids.some(id=>!Number.isSafeInteger(id)||!current.some(t=>t.id===id)))throw new AppError('Informe todas as abas uma única vez para alterar a ordem.');
      db.exec('BEGIN');
      try{const update=db.prepare('UPDATE personal_tabs SET sort_order=? WHERE id=?');ids.forEach((id,index)=>update.run(index,id));db.exec('COMMIT');}
      catch(e){db.exec('ROLLBACK');throw e;}
      return tabs();
    },
    renameTab(id,raw){const tab=get('personal_tabs',id);if(tab.kind==='subscriptions')throw new AppError('A aba Assinaturas é fixa.');const name=str(raw?.name,60,true);uniqueName(tabs(),name,id);db.prepare('UPDATE personal_tabs SET name=? WHERE id=?').run(name,id);return get('personal_tabs',id);},
    removeTab(id){if(get('personal_tabs',id).kind==='subscriptions')throw new AppError('A aba Assinaturas é fixa.');db.prepare('DELETE FROM personal_tabs WHERE id=?').run(id);},
    addFolder(raw){const n=folderInput(raw);const r=db.prepare('INSERT INTO personal_folders(tab_id,name) VALUES (?,?)').run(n.tab_id,n.name);return get('personal_folders',Number(r.lastInsertRowid));},
    updateFolder(id,raw){const old=get('personal_folders',id),n=folderInput({...raw,tab_id:old.tab_id},id);db.prepare('UPDATE personal_folders SET name=? WHERE id=?').run(n.name,id);return get('personal_folders',id);},
    removeFolder(id){get('personal_folders',id);db.prepare('DELETE FROM personal_folders WHERE id=?').run(id);},
    add(raw){const n=item(raw,tabs(),folders());checkScheduleUnique(n);const r=db.prepare(`INSERT INTO personal_items(${columns}) VALUES (${columns.map(()=>'?')})`).run(...values(n));return get('personal_items',Number(r.lastInsertRowid));},
    update(id,raw){if(!raw||typeof raw!=='object')throw new AppError('Registro inválido.');const old=get('personal_items',id),merged={...old,...raw};if(old.record_type==='meal'&&Object.hasOwn(raw,'notes')&&raw.notes!==old.notes&&!Object.hasOwn(raw,'nutrition'))merged.nutrition=null;if((merged.studied_at||null)!==(old.studied_at||null)){merged.study_reviews=[];merged.study_periods=studyPeriods(old).map(period=>({...period,status:'pending',completed_at:null}));}else if(Object.hasOwn(raw,'study_reviews')&&!Object.hasOwn(raw,'study_periods')){studyInput({...merged,study_periods:undefined},{str,AppError});merged.study_periods=studyPeriods({...old,study_periods:undefined,study_reviews:raw.study_reviews}).map((period,index)=>({...period,comment:studyPeriods(old)[index].comment}));}const n=item(merged,tabs(),folders(),!Object.hasOwn(raw,'start_date')&&!Object.hasOwn(raw,'due_date'));checkScheduleUnique(n,id);db.prepare(`UPDATE personal_items SET ${columns.map(k=>`${k}=?`)} WHERE id=?`).run(...values(n),id);return get('personal_items',id);},
    reviewStudy(id,raw){
      const old=get('personal_items',id),tab=get('personal_tabs',old.tab_id),history=old.study_reviews||[],now=new Date().toISOString();
      if(raw?.action==='set'){
        if(tab.layout!=='studies'||!Number.isInteger(raw.stage)||raw.stage<0||raw.stage>5||!['pending','skipped','completed'].includes(raw.status))throw new AppError('Período ou situação inválida.');
        if(raw.status!=='pending'&&(!old.studied_at||old.studied_at>now))throw new AppError('Registre a data do estudo antes de finalizar uma revisão.');
        const periods=studyPeriods(old),previous=periods[raw.stage];
        periods[raw.stage]={status:raw.status,comment:raw.comment??previous.comment,completed_at:raw.status==='completed'?(previous.completed_at||now):null};
        return api.update(id,{study_periods:periods});
      }
      if(tab.layout!=='studies'||!old.studied_at)throw new AppError('Informe quando o conteúdo foi estudado para iniciar as revisões.');
      if(!raw||!['complete','undo'].includes(raw.action)||!Number.isInteger(raw.stage))throw new AppError('Revisão inválida.');
      if(raw.action==='complete'){
        if(history.length>=6||raw.stage!==history.length)throw new AppError('Esta revisão já mudou. Reabra o estudo para atualizar.',409);
        if(old.studied_at>now)throw new AppError('A data do estudo ainda não chegou.');
        return api.update(id,{study_reviews:[...history,now]});
      }
      if(!history.length||raw.stage!==history.length-1)throw new AppError('Só é possível desfazer a última revisão concluída.',409);
      return api.update(id,{study_reviews:history.slice(0,-1)});
    },
    remove(id){get('personal_items',id);db.prepare('DELETE FROM personal_items WHERE id=?').run(id);},
    validateBackup(raw){
      if(!raw||!Array.isArray(raw.tabs)||!Array.isArray(raw.items)||raw.tabs.length>1000||raw.items.length>10000||!Array.isArray(raw.folders??[]))throw new AppError('Dados pessoais inválidos no backup.');
      const ids=new Set(),names=new Set();
      const checkId=n=>{if(!n||!Number.isSafeInteger(n.id)||n.id<1||ids.has(n.id))throw new AppError('Identificador inválido no backup.');ids.add(n.id);};
      const checkedTabs=raw.tabs.map(t=>{checkId(t);if(!['subscriptions','custom'].includes(t.kind))throw new AppError('Aba inválida no backup.');const name=str(t.name,60,true),key=name.toLocaleLowerCase('pt-BR');if(names.has(key))throw new AppError('Abas duplicadas no backup.');names.add(key);const layout=t.layout??(t.kind==='subscriptions'?'subscriptions':infer(name));if(!['subscriptions','custom','movies','studies','fitness','schedule'].includes(layout)||(t.kind==='subscriptions')!==(layout==='subscriptions'))throw new AppError('Tipo de aba inválido.');return {id:t.id,name,kind:t.kind,layout};});
      if(checkedTabs.filter(t=>t.kind==='subscriptions'&&t.name==='Assinaturas').length!==1||checkedTabs.filter(t=>t.kind==='subscriptions').length!==1)throw new AppError('Aba Assinaturas inválida no backup.');
      ids.clear();names.clear();const checkedFolders=(raw.folders??[]).map(f=>{checkId(f);if(!checkedTabs.some(t=>t.id===f.tab_id&&['movies','studies'].includes(t.layout)))throw new AppError('Pasta inválida no backup.');const name=str(f.name,60,true),key=`${f.tab_id}:${name.toLocaleLowerCase('pt-BR')}`;if(names.has(key))throw new AppError('Pastas duplicadas no backup.');names.add(key);return {id:f.id,tab_id:f.tab_id,name};});
      ids.clear();const items=raw.items.map(n=>{checkId(n);return {id:n.id,...item(n,checkedTabs,checkedFolders,true)};});
      const scheduleKeys=new Set();for(const n of items){if(!n.schedule_kind)continue;const key=scheduleKey(n);if(scheduleKeys.has(key))throw new AppError('Cronogramas duplicados no backup.');scheduleKeys.add(key);}
      return {tabs:checkedTabs,folders:checkedFolders,items};
    },
    // The tab array carries its display order in both current and legacy backups.
    replace(raw){db.exec('DELETE FROM personal_items; DELETE FROM personal_folders; DELETE FROM personal_tabs;');raw.tabs.forEach((t,index)=>db.prepare('INSERT INTO personal_tabs(id,name,kind,layout,sort_order) VALUES (?,?,?,?,?)').run(t.id,t.name,t.kind,t.layout,index));for(const f of raw.folders)db.prepare('INSERT INTO personal_folders(id,tab_id,name) VALUES (?,?,?)').run(f.id,f.tab_id,f.name);for(const n of raw.items)db.prepare(`INSERT INTO personal_items(id,${columns}) VALUES (?,${columns.map(()=>'?')})`).run(n.id,...values(n));}
  };
  return api;
}
