export function createPersonalStore(db, AppError) {
  db.exec(`CREATE TABLE IF NOT EXISTS personal_tabs(id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('subscriptions','custom')));
    CREATE TABLE IF NOT EXISTS personal_items(id INTEGER PRIMARY KEY, tab_id INTEGER NOT NULL REFERENCES personal_tabs(id) ON DELETE CASCADE,
    title TEXT NOT NULL, notes TEXT NOT NULL, amount INTEGER, due_date TEXT, cycle TEXT NOT NULL, status TEXT NOT NULL);`);
  if (!db.prepare("SELECT id FROM personal_tabs WHERE kind='subscriptions'").get()) db.prepare("INSERT INTO personal_tabs(name,kind) VALUES ('Assinaturas','subscriptions')").run();
  const infer = name => {
    const text=String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    return /^(filmes?|filmes? (pra|para) ver)$/.test(text)?'movies':text==='estudos'?'studies':'custom';
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
  const defaults={watched:false,review:'',start_date:null,links:[]};
  const decode=row=>{const {details,...base}=row;return {...base,...defaults,...JSON.parse(details)};};
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
    return {tab_id:raw.tab_id,title:str(raw.title,120,true),notes:str(raw.notes??'',10000),amount,due_date,cycle,status,folder_id,watched,review:str(raw.review??'',20000),start_date,links:checkedLinks};
  }
  const columns=['tab_id','title','notes','amount','due_date','cycle','status','folder_id','details'];
  const values=n=>columns.map(k=>k==='details'?JSON.stringify({watched:n.watched,review:n.review,start_date:n.start_date,links:n.links}):n[k]);
  const uniqueName=(rows,name,id)=>{if(rows.some(t=>t.id!==id&&t.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))throw new AppError('Já existe um registro com esse nome.');};
  function folderInput(raw,id){const tab=get('personal_tabs',raw?.tab_id);if(!['movies','studies'].includes(tab.layout))throw new AppError('Esta aba não usa pastas.');const name=str(raw.name,60,true);uniqueName(folders().filter(f=>f.tab_id===tab.id),name,id);return {tab_id:tab.id,name};}
  const api={
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
    add(raw){const n=item(raw,tabs(),folders());const r=db.prepare(`INSERT INTO personal_items(${columns}) VALUES (${columns.map(()=>'?')})`).run(...values(n));return get('personal_items',Number(r.lastInsertRowid));},
    update(id,raw){if(!raw||typeof raw!=='object')throw new AppError('Registro inválido.');const old=get('personal_items',id);const n=item({...old,...raw},tabs(),folders(),!Object.hasOwn(raw,'start_date')&&!Object.hasOwn(raw,'due_date'));db.prepare(`UPDATE personal_items SET ${columns.map(k=>`${k}=?`)} WHERE id=?`).run(...values(n),id);return get('personal_items',id);},
    remove(id){get('personal_items',id);db.prepare('DELETE FROM personal_items WHERE id=?').run(id);},
    validateBackup(raw){
      if(!raw||!Array.isArray(raw.tabs)||!Array.isArray(raw.items)||raw.tabs.length>1000||raw.items.length>10000||!Array.isArray(raw.folders??[]))throw new AppError('Dados pessoais inválidos no backup.');
      const ids=new Set(),names=new Set();
      const checkId=n=>{if(!n||!Number.isSafeInteger(n.id)||n.id<1||ids.has(n.id))throw new AppError('Identificador inválido no backup.');ids.add(n.id);};
      const checkedTabs=raw.tabs.map(t=>{checkId(t);if(!['subscriptions','custom'].includes(t.kind))throw new AppError('Aba inválida no backup.');const name=str(t.name,60,true),key=name.toLocaleLowerCase('pt-BR');if(names.has(key))throw new AppError('Abas duplicadas no backup.');names.add(key);const layout=t.layout??(t.kind==='subscriptions'?'subscriptions':infer(name));if(!['subscriptions','custom','movies','studies'].includes(layout)||(t.kind==='subscriptions')!==(layout==='subscriptions'))throw new AppError('Tipo de aba inválido.');return {id:t.id,name,kind:t.kind,layout};});
      if(checkedTabs.filter(t=>t.kind==='subscriptions'&&t.name==='Assinaturas').length!==1||checkedTabs.filter(t=>t.kind==='subscriptions').length!==1)throw new AppError('Aba Assinaturas inválida no backup.');
      ids.clear();names.clear();const checkedFolders=(raw.folders??[]).map(f=>{checkId(f);if(!checkedTabs.some(t=>t.id===f.tab_id&&['movies','studies'].includes(t.layout)))throw new AppError('Pasta inválida no backup.');const name=str(f.name,60,true),key=`${f.tab_id}:${name.toLocaleLowerCase('pt-BR')}`;if(names.has(key))throw new AppError('Pastas duplicadas no backup.');names.add(key);return {id:f.id,tab_id:f.tab_id,name};});
      ids.clear();const items=raw.items.map(n=>{checkId(n);return {id:n.id,...item(n,checkedTabs,checkedFolders,true)};});
      return {tabs:checkedTabs,folders:checkedFolders,items};
    },
    // The tab array carries its display order in both current and legacy backups.
    replace(raw){db.exec('DELETE FROM personal_items; DELETE FROM personal_folders; DELETE FROM personal_tabs;');raw.tabs.forEach((t,index)=>db.prepare('INSERT INTO personal_tabs(id,name,kind,layout,sort_order) VALUES (?,?,?,?,?)').run(t.id,t.name,t.kind,t.layout,index));for(const f of raw.folders)db.prepare('INSERT INTO personal_folders(id,tab_id,name) VALUES (?,?,?)').run(f.id,f.tab_id,f.name);for(const n of raw.items)db.prepare(`INSERT INTO personal_items(id,${columns}) VALUES (?,${columns.map(()=>'?')})`).run(n.id,...values(n));}
  };
  return api;
}
