import { createNavigationOrder } from './navigation.js';
import { createPersonalPanel } from './personal.js';
import { initDatePickers } from './date-picker.js';
import { FIRST_MONTH, FIRST_DATE, periodMonth, periodRange, periodDueDate, shiftMonth } from './period.js';
import { debtColor, dateInMonth, installmentProgress, paidBeforeToday } from './debts-model.js';
import { createNotesPanel } from './notes.js';
import { createInvestmentsPanel } from './investments.js';
const icons={grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',arrows:'<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h3"/>',leaf:'<path d="M20 3C8 2 2 9 5 16s16 3 15-13ZM5 20 15 9"/>',database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',eye:'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',plus:'<path d="M12 5v14M5 12h14"/>',wallet:'<path d="M20 8V5a2 2 0 0 0-2-2L4 6v14h16V8H4"/><path d="M20 12h-6v5h6"/>',up:'<path d="M7 17 17 7M7 7h10v10"/>',down:'<path d="m7 7 10 10M7 17h10V7"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',arrow:'<path d="M4 12h16m-5-5 5 5-5 5"/>',spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',check:'<path d="m5 12 4 4L19 6"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',edit:'<path d="m14 5 5 5M4 20l5-1L21 7l-5-5L4 14v6Z"/>',trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',bag:'<rect x="4" y="7" width="16" height="14" rx="2"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/>',home:'<path d="m3 10 9-7 9 7v11H3V10Z"/><path d="M9 21v-8h6v8"/>',coffee:'<path d="M4 8h12v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8Zm12 1h2a4 4 0 0 1 0 8h-2M7 3v2m5-2v2"/>',briefcase:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12c5 3 13 3 18 0m-9 0v4"/>',heart:'<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 3 11 8 15 5-4 13-10 8-15Z"/>',car:'<path d="m5 6-2 7v6h18v-6l-2-7H5Zm-2 7h18M6 19v2m12-2v2M7 16h1m8 0h1"/>',repeat:'<path d="M3 10V5h14l4 4m0 5v5H7l-4-4M3 5l4 4m14 10-4-4"/>'};
Object.assign(icons, { minus:'<path d="M5 12h14"/>', person:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>', dumbbell:'<path d="m5 5 14 14M3 8l5-5m8 18 5-5M1 6l5-5m12 22 5-5"/>', utensils:'<path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-4 2-5 8 0 10"/>', video:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 9 5 3-5 3Z"/>', grip:'<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/>', notebook:'<path d="M6 3h13v18H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 0v18m4-12h4m-4 4h4M2 8h4m-4 8h4"/>', list:'<path d="M9 6h11M9 12h11M9 18h11M3 6h1m-1 6h1m-1 6h1"/>', bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6"/>', flag:'<path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>', pin:'<path d="m9 3 12 12m-9-9-5 3-4 1 11 11 1-4 3-5M9 15l-6 6"/>' });
const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.bag}</svg>`;
const $=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
let month=periodMonth(today())<FIRST_MONTH?FIRST_MONTH:periodMonth(today()), state=null, page='overview', requestId=0, isSaving=false;
let debtTab='total';
let filters={search:'',type:'all',category:'all'};
const titles={personal:['Pessoal',''],overview:['Visão geral',''],transactions:['Movimentações',''],debts:['Dívidas',''],bills:['Contas fixas',''],notes:['Anotações',''],investments:['Investimentos',''],settings:['Dados e backup','']};
const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
const cash=value=>`<span class="money">${money(value)}</span>`;
const dateLabel=value=>new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.','');
const fullMonth=value=>new Date(`${value}-15T12:00:00`).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
const catIcon=category=>({'Alimentação':'coffee','Moradia':'home','Transporte':'car','Saúde':'heart','Trabalho':'briefcase','Salário':'briefcase','Assinaturas':'repeat','Investimentos':'up'}[category]||'bag');
function hydrateIcons(){document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
let sessionUser=null;
async function api(path,options={}){const res=await fetch(`/api${path}`,{...options,headers:{'Content-Type':'application/json',...(sessionUser?{'X-Persona-User':sessionUser.id}:{}),...options.headers}});if(res.status===401){location.replace('/login'+location.hash);throw new Error('Sua sessão terminou. Entre novamente.');}const data=await res.json();if(!res.ok)throw new Error(data.error||'Não foi possível concluir.');return data;}
sessionUser=(await api('/auth/session')).user;
$('#session-user').textContent=sessionUser.name.slice(0,2).toUpperCase();
$('#session-user').title=sessionUser.name;
$('#session-user').setAttribute('aria-label',`Conectado como ${sessionUser.name}`);
$('#logout').addEventListener('click',async()=>{
  $('#logout').disabled=true;
  try{await api('/auth/logout',{method:'POST'});location.replace('/login');}
  catch(error){toast(error.message,true);$('#logout').disabled=false;}
});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
window.addEventListener('focus',()=>{void api('/auth/session').then(({user})=>{if(user.id!==sessionUser.id)location.reload();}).catch(()=>{});});
let toastTimer;
function toast(message,error=false){$('#toast').textContent=message;$('#toast').className=`toast${error?' error':''}`;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);}
const navigationOrder=createNavigationOrder({api,toast});
const notesPanel=createNotesPanel({api,icon,escape,toast,onRender:()=>render()});
const investmentsPanel=createInvestmentsPanel({api,icon,escape,cash,parseAmount,amountInput,toast,onRender:()=>render()});
const personalPanel=createPersonalPanel({api,icon,escape,cash,parseAmount,amountInput,today,onRender:()=>render(),toast});
async function load(){
  const id=++requestId;
  $('#load-error').hidden=true;
  $('#content').inert=true;
  $('#content').setAttribute('aria-busy','true');
  $('#new-transaction').disabled=true;
  try{
    const [next]=await Promise.all([api(`/state?month=${month}`),notesPanel.refresh(),investmentsPanel.refresh(),personalPanel.refresh()]);
    if(id!==requestId)return;
    state=next;
    navigationOrder.sync(next.preferences);
    render();
    $('#content').inert=false;
    $('#new-transaction').disabled=false;
  }catch(error){
    if(id!==requestId)return;
    $('#load-error').textContent=`${error.message} Verifique se o servidor local está aberto e recarregue a página.`;
    $('#load-error').hidden=false;
    $('#content').innerHTML='';
    state=null;
  }finally{
    if(id===requestId)$('#content').removeAttribute('aria-busy');
  }
}
function metric(label,value,name,note,cls=''){return `<div class="metric ${cls==='featured'?'featured':''}"><div class="metric-top"><span>${label}</span><span class="metric-icon ${cls}">${icon(name)}</span></div><div class="metric-value">${cash(value)}</div><div class="metric-note">${note}</div></div>`;}
function metrics(){const t=state.totals;return `<div class="metrics">${metric('Saldo do mês',t.balance,'wallet',`Entradas menos saídas do mês`,'featured')}${metric('Entradas',t.income,'down',`${state.transactions.filter(t=>t.type==='income').length} entradas registradas`)}${metric('Saídas',t.expense,'up',`${state.transactions.filter(t=>t.type==='expense').length} saídas registradas`,'red')}${metric('Contas fixas mensais',state.bills.reduce((sum,b)=>sum+b.amount,0),'repeat',`${state.bills.length} contas recorrentes · inclui pagas e pendentes`,'gold')}</div>`;}
function chart(){
  const {income,expense}=state.totals,max=Math.max(income,expense);
  const rows=[['Entradas',income],['Saídas',expense]];
  return `<div class="balance-chart"><dl class="balance-chart-rows">${rows.map(([label,value])=>`<div class="balance-chart-row"><dt>${label}</dt><dd class="balance-chart-value">${cash(value)}</dd><dd class="balance-chart-track" aria-hidden="true"><div class="balance-chart-fill" style="width:${max?value/max*100:0}%"></div></dd></div>`).join('')}</dl><p class="balance-chart-note">${max?'Comparação dos valores movimentados no período.':'Nenhum lançamento neste mês.'}</p></div>`;
}
function categoryPanel(){const grouped={};for(const t of state.transactions.filter(t=>t.type==='expense'))grouped[t.category]=(grouped[t.category]||0)+t.amount;const entries=Object.entries(grouped).sort((a,b)=>b[1]-a[1]);let shown=entries.slice(0,4);if(entries.length>4)shown=[...entries.slice(0,3),['Demais categorias',entries.slice(3).reduce((s,e)=>s+e[1],0)]];const colors=['#7650bd','#a387d3','#c6b3e5','#e5daf4'];let start=0;const gradient=shown.map((e,i)=>{const end=start+e[1]/state.totals.expense*100;const str=`${colors[i]} ${start}% ${end}%`;start=end;return str;}).join(',');return `<section class="panel"><div class="panel-head"><div><h2>Saídas por categoria</h2><p class="panel-subtitle">Distribuição dos gastos do mês</p></div>${icon('bag')}</div><div class="category-body"><div class="donut category-pie" ${gradient?`style="background:conic-gradient(${gradient})"`:''}><div class="donut-center"><strong>${entries.length?Math.round(entries[0][1]/state.totals.expense*100)+'%':'—'}</strong><span>${entries.length?'maior categoria':'sem saídas'}</span></div></div><div class="category-legend">${shown.length?shown.map((e,i)=>`<div class="category-item"><i class="dot" style="background:${colors[i]}"></i><span>${escape(e[0])}</span><strong>${Math.round(e[1]/state.totals.expense*100)}%</strong></div>`).join(''):'<span class="empty-categories">Nenhuma saída registrada.</span>'}</div></div><div class="category-footer">${icon('spark')}${entries.length?`${escape(entries[0][0])} representa a maior parte das saídas.`:'Suas categorias aparecem automaticamente.'}</div></section>`;}
function empty(title,description,button='',action='new-transaction',name='wallet'){return `<div class="empty-state">${icon(name)}<h3>${title}</h3><p>${description}</p>${button?`<button class="button secondary" data-action="${action}">${icon('plus')}${button}</button>`:''}</div>`;}
function transactionTable(items,editable=false){return `<div class="table-wrap"><table><thead><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th class="text-right">Valor</th>${editable?'<th class="text-right">Ações</th>':''}</tr></thead><tbody>${items.map(t=>`<tr><td><div class="description-cell"><span class="transaction-icon">${icon(catIcon(t.category))}</span><div><strong>${escape(t.description)}</strong><small>${t.debt_id?'Pagamento de dívida':t.bill_id?'Conta fixa':t.type==='income'?'Entrada':'Saída'}</small></div></div></td><td><span class="category-tag">${escape(t.category)}</span></td><td class="date-cell">${dateLabel(t.date)}</td><td class="amount ${t.type==='income'?'income-text':'expense-text'}">${t.type==='income'?'+':'−'} ${cash(t.amount)}</td>${editable?`<td><div class="row-actions"><button class="icon-button" data-action="edit-transaction" data-id="${t.id}" aria-label="Editar ${escape(t.description)}" title="Editar">${icon('edit')}</button><button class="icon-button" data-action="delete-transaction" data-id="${t.id}" aria-label="Excluir ${escape(t.description)}" title="Excluir">${icon('trash')}</button></div></td>`:''}</tr>`).join('')}</tbody></table></div>`;}
function billStatus(b){return b.payment_id?['paid','Paga']:b.due_date<today()?['overdue','Em atraso']:b.due_date===today()?['','Vence hoje']:['','Pendente'];}
function upcoming(){const bills=state.bills.filter(b=>!b.payment_id).slice(0,3);return `<section class="panel"><div class="panel-head"><div><h2>Próximos vencimentos</h2><p class="panel-subtitle">Seus compromissos do mês</p></div><a class="link-button" href="#bills">Ver todos ${icon('arrow')}</a></div>${bills.length?`<div class="bills-list">${bills.map(b=>{const [cls,label]=billStatus(b);return `<div class="bill-row"><div class="bill-day"><strong>${b.due_date.slice(-2)}</strong><span>${dateLabel(b.due_date).split(' ').at(-1)}</span></div><div class="bill-info"><strong>${escape(b.description)}</strong><small>${escape(b.category)}</small></div><div class="bill-end">${cash(b.amount)}<br><span class="pill ${cls}">${label}</span></div></div>`;}).join('')}</div>`:empty(state.bills.length?'Contas pagas':'Nenhuma conta cadastrada',state.bills.length?'Todas as contas deste mês foram pagas.':'Cadastre suas contas fixas e acompanhe cada vencimento.',state.bills.length?'':'Adicionar conta','new-bill','calendar')}<div class="bills-footer"><span>Total pendente</span><strong>${cash(state.totals.pending)}</strong></div></section>`;}
function insight(){const t=state.totals;const overdue=state.bills.filter(b=>!b.payment_id&&b.due_date<today());let title='Sem registros no mês',description='Adicione entradas e saídas para acompanhar o saldo do mês.';if(overdue.length){title=`${overdue.length} ${overdue.length===1?'conta vencida':'contas vencidas'}`;description=`Há ${cash(overdue.reduce((sum,b)=>sum+b.amount,0))} em contas vencidas neste mês. Confira os pagamentos em Contas fixas.`;}else if(state.transactions.length||state.bills.length){title='Saldo do mês';description=`Seu saldo com as movimentações registradas é ${cash(t.balance)}. Contas fixas só são descontadas quando você marca como pagas.`;}return `<div class="insight-strip">${icon('spark')}<div><strong>${title}</strong><p>${description}</p></div><span class="insight-label">RESUMO DO MÊS</span></div>`;}
function overview(){
  const items = [...(state.agenda || []), ...notesPanel.agenda(), ...investmentsPanel.agenda(), ...personalPanel.agenda()];
  const section = (title, rows, message) => `<section class="panel agenda-panel"><div class="panel-head"><h2>${title}</h2><span class="badge">${rows.length}</span></div>${rows.length ? `<div class="agenda-list">${rows.sort((a,b)=>a.date.localeCompare(b.date)).map(item=>`<a class="agenda-row" href="#${item.page}"><span class="transaction-icon">${icon(item.page==='notes'?'bell':item.page==='investments'?'up':'calendar')}</span><span><strong>${escape(item.title)}</strong><small>${escape(item.label)} · ${dateLabel(item.date.slice(0,10))}${item.date.includes('T')?' às '+item.date.slice(11,16):''}</small></span>${icon('arrow')}</a>`).join('')}</div>`:empty(message,'Os itens agendados aparecem aqui automaticamente.','','','check')}</section>`;
  return `<div class="agenda-heading"><span class="badge">${new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}</span><button class="button primary" data-note-action="new-task">${icon('plus')}Nova tarefa</button></div><div class="agenda-grid">${section('Para hoje',items.filter(i=>i.date.slice(0,10)===today()),'Nenhum compromisso para hoje')}${section('Pendências e atrasos',items.filter(i=>i.date.slice(0,10)<today()),'Nenhuma pendência atrasada')}</div>${notesPanel.agendaError()}${investmentsPanel.agendaError()}${personalPanel.agendaError()}<div id="verse-slot"></div>`;
}
function render(){
  if(!state)return;
  document.querySelector('.sidebar').insertBefore($('#daily-verse'),$('.sidebar-bottom'));
  const isPersonal=page==='personal';
  document.body.classList.toggle('personal-page',isPersonal);
  const isNotes=page==='notes';
  const isInvestments=page==='investments';
  document.body.classList.toggle('notes-page',isNotes);
  document.body.classList.toggle('investments-page',isInvestments);
  $('#month').value=month;$('#month-label').textContent=fullMonth(month).replace(' de ',' ');
  $('#breadcrumb').textContent=titles[page][0];$('#page-title').innerHTML=`${titles[page][0]}<span>.</span>`;$('#page-description').textContent='';$('#page-description').hidden=true;
  document.querySelectorAll('[data-page]').forEach(el=>{el.classList.toggle('active',el.dataset.page===page);if(el.dataset.page===page)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  document.querySelectorAll('[data-workspace]').forEach(el=>{const current=el.dataset.workspace===(isPersonal?'personal':isNotes?'notes':isInvestments?'investments':'finance');el.classList.toggle('active',current);if(current)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  $('#bill-count').textContent=state.bills.filter(b=>!b.payment_id).length||'';
  $('.heading-actions').hidden=page==='overview'||page==='settings'||isNotes||isInvestments||isPersonal;$('#notes-heading-actions').hidden=!isNotes;$('#privacy').hidden=isNotes||page==='overview';
  $('#investments-heading-actions').hidden=!isInvestments;
  $('#new-transaction').hidden=page==='debts';$('#prev-month').disabled=month<=FIRST_MONTH;$('#next-month').disabled=month>='2099-12';
  $('#period-label').hidden=isPersonal||page==='overview'||isNotes||isInvestments||page==='settings';$('#period-label').textContent=`Período: ${debtDate(state.period.start)} a ${debtDate(state.period.end)} · Virada no dia 11`;
  $('#debt-count').textContent=state.debts.filter(d=>d.remaining>0).length||'';
  const investmentView=investmentsPanel.render();
  $('#content').innerHTML=isPersonal?personalPanel.render():isInvestments?investmentView:isNotes?notesPanel.render():page==='overview'?overview():page==='transactions'?transactionsView():page==='bills'?billsView():page==='debts'?debtsView():settingsView();
  hydrateIcons();placeVerse();if(isPersonal)personalPanel.afterRender();document.dispatchEvent(new Event('date-sync'));
}
function transactionsView(){return `${metrics()}<section class="panel"><div class="panel-head"><h2>Todos os lançamentos</h2><span class="badge">${escape(fullMonth(month))}</span></div><div class="filters"><div class="search-box">${icon('search')}<input id="search" class="filter-input" placeholder="Buscar uma movimentação…" aria-label="Buscar movimentação" value="${escape(filters.search)}"></div><select id="filter-type" class="filter-input" aria-label="Filtrar por tipo"><option value="all">Entradas e saídas</option><option value="income" ${filters.type==='income'?'selected':''}>Entradas</option><option value="expense" ${filters.type==='expense'?'selected':''}>Saídas</option></select><select id="filter-category" class="filter-input" aria-label="Filtrar por categoria"><option value="all">Todas as categorias</option>${state.categories.map(c=>`<option ${filters.category===c?'selected':''}>${escape(c)}</option>`).join('')}</select></div><div id="transaction-results">${transactionResults()}</div></section>`;}
function transactionResults(){const items=state.transactions.filter(t=>(filters.type==='all'||t.type===filters.type)&&(filters.category==='all'||t.category===filters.category)&&`${t.description} ${t.notes}`.toLocaleLowerCase('pt-BR').includes(filters.search.toLocaleLowerCase('pt-BR')));return `${items.length?transactionTable(items,true):empty('Nenhum lançamento encontrado',state.transactions.length?'Tente outra busca ou altere os filtros.':'Adicione uma entrada ou saída para começar.',state.transactions.length?'':'Novo lançamento')}<div class="table-footer">${items.length} de ${state.transactions.length} lançamentos · Resultado da seleção: ${cash(items.reduce((s,t)=>s+(t.type==='income'?t.amount:-t.amount),0))}</div>`;}
function billsView(){return `${metrics()}<div class="section-toolbar"><div><h2>Contas recorrentes</h2><p>O valor se repete todos os meses. Só é descontado do saldo ao marcar como paga.</p></div><button class="button primary" data-action="new-bill">${icon('plus')}Nova conta fixa</button></div>${state.bills.length?`<div class="bills-grid">${state.bills.map(b=>{const [cls,label]=billStatus(b);return `<article class="panel bill-card"><div class="bill-card-top"><span class="transaction-icon">${icon(catIcon(b.category))}</span><div class="row-actions"><button class="icon-button" data-action="edit-bill" data-id="${b.id}" title="Editar" aria-label="Editar ${escape(b.description)}">${icon('edit')}</button><button class="icon-button" data-action="delete-bill" data-id="${b.id}" title="Excluir" aria-label="Excluir ${escape(b.description)}">${icon('trash')}</button></div></div><h2>${escape(b.description)}</h2><span class="category-tag">${escape(b.category)}</span><div class="bill-value">${cash(b.payment_id?b.paid_amount:b.amount)}</div><div class="bill-details"><span>Vencimento em ${dateLabel(b.due_date)}</span><span>Mensal</span></div><div class="bill-card-bottom"><span class="pill ${cls}">${label}</span>${b.payment_id?`<button class="link-button" data-action="undo-payment" data-id="${b.payment_id}">Desfazer pagamento</button>`:`<button class="button secondary small" data-action="pay-bill" data-id="${b.id}">${icon('check')}Marcar como paga</button>`}</div></article>`;}).join('')}</div>`:`<section class="panel">${empty('Nenhuma conta fixa cadastrada','Aluguel, internet, academia… cadastre uma vez e acompanhe os próximos meses.','Adicionar conta fixa','new-bill','calendar')}</section>`}${insight()}`;}
function settingsView(){return `<div class="settings-grid"><section class="panel settings-card">${icon('download')}<h2>Exportar dados</h2><p>Baixe um backup com todas as suas movimentações, contas fixas, dívidas, investimentos com histórico, tarefas, lembretes, anotações e abas pessoais com suas assinaturas.</p><a class="button primary" href="/api/backup" download>${icon('download')}Baixar backup</a><p class="small-note">Arquivo JSON que pode ser restaurado aqui no Persona.</p></section><section class="panel settings-card">${icon('upload')}<h2>Restaurar dados</h2><p>Recupere os dados de um backup do Persona. A restauração substitui os registros deste computador.</p><button class="button secondary" data-action="restore">${icon('upload')}Restaurar backup</button><input id="backup-file" type="file" accept=".json,application/json" hidden><p class="small-note">Antes de restaurar, baixe uma cópia dos dados atuais.</p></section><section class="panel settings-card settings-info">${icon('database')}<h2>Armazenamento local</h2><p>Seus dados são salvos automaticamente no banco local, mesmo quando você fecha o navegador. Para acessar o sistema novamente, mantenha o servidor do Persona em execução. Nesta versão, o acesso é apenas neste computador.</p><p class="small-note">O backup contém suas finanças, investimentos, anotações e registros de Pessoal. Guarde-o em um lugar de confiança.</p></section></div>`;}
function openModal(title,subtitle,body){$('#modal-content').innerHTML=`<div class="modal-header"><div><h2 id="modal-title">${title}</h2><p>${subtitle}</p></div><button class="icon-button" data-action="close" aria-label="Fechar">${icon('close')}</button></div><div class="modal-body">${body}</div>`;$('#modal').showModal();}
function closeModal(){if(!isSaving)$('#modal').close();}
function options(selected){return state.categories.map(c=>`<option ${c===selected?'selected':''}>${escape(c)}</option>`).join('');}
function amountInput(value){return value?new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false}).format(value/100):'';}
function parseAmount(raw){const cleaned=raw.trim().replace(/\s/g,'');if(!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(cleaned))throw new Error('Use um valor como 150,00 ou 1.250,50.');const [whole,fraction='']=cleaned.replaceAll('.','').split(',');const value=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(!Number.isSafeInteger(value)||value<=0)throw new Error('Informe um valor maior que zero.');return value;}
const defaultDate=()=>month===periodMonth(today())?today():periodRange(month).start;
const formActions=label=>`<div class="form-error" id="form-error" role="alert" hidden></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close">Cancelar</button><button type="submit" class="button primary">${label}</button></div>`;
function transactionModal(t=null){openModal(t?'Editar lançamento':'Novo lançamento','Informe o valor, a data e a categoria.',`<form id="transaction-form" data-id="${t?.id||''}"><div class="type-toggle"><label><input type="radio" name="type" value="income" ${!t||t.type==='income'?'checked':''} ${t?.bill_id||t?.debt_id?'disabled':''}>Entrada</label><label><input type="radio" name="type" value="expense" ${t?.type==='expense'?'checked':''}>Saída</label></div><label class="field">Descrição<input name="description" required maxlength="100" placeholder="Ex.: compras do mercado" value="${escape(t?.description||'')}" autofocus></label><div class="field-row"><label class="field">Valor (R$)<input name="amount" inputmode="decimal" placeholder="0,00" value="${amountInput(t?.amount)}" required></label><label class="field">Data<input name="date" type="date" value="${t?.date||defaultDate()}" min="${t?.bill_id?periodRange(t.bill_month).start:FIRST_DATE}" max="${t?.bill_id?periodRange(t.bill_month).end:'2099-12-31'}" required></label></div><div class="field"><label for="transaction-category">Categoria</label><div class="category-input"><input id="transaction-category" name="category" maxlength="60" required placeholder="Digite sua categoria" value="${escape(t?.category||'')}" autocomplete="off"><button type="button" class="icon-button" data-action="toggle-categories" aria-label="Escolher categoria" aria-expanded="false" aria-controls="category-choices">${icon('plus')}</button></div><div id="category-choices" class="category-choices" hidden>${state.categories.map(c=>`<button type="button" data-action="choose-category" data-category="${escape(c)}">${escape(c)}</button>`).join('')}</div><span class="field-hint">Digite livremente ou use + para escolher uma categoria.</span></div><label class="field">Observação <span class="field-hint">Opcional</span><textarea name="notes" maxlength="500" placeholder="Algum detalhe que você quer lembrar?">${escape(t?.notes||'')}</textarea></label>${formActions(t?'Salvar alterações':'Salvar lançamento')}</form>`);}
function billModal(b=null){openModal(b?'Editar conta fixa':'Nova conta fixa','Informe o valor mensal e o dia do vencimento.',`<form id="bill-form" data-id="${b?.id||''}"><label class="field">Nome da conta<input name="description" required maxlength="100" placeholder="Ex.: internet de casa" value="${escape(b?.description||'')}" autofocus></label><div class="field-row"><label class="field">Valor mensal (R$)<input name="amount" required inputmode="decimal" placeholder="0,00" value="${amountInput(b?.amount)}"></label><label class="field">Dia do vencimento<input name="due_day" type="number" min="1" max="31" required value="${b?.due_day||10}"></label></div><div class="field-row"><label class="field">Categoria<select name="category">${options(b?.category||'Moradia')}</select></label><label class="field">A partir de<input name="start_month" type="month" min="2026-09" max="2099-12" value="${b?.start_month||month}" required></label></div><p class="field-hint">Esta conta se repete todos os meses a partir do início informado. Cadastrar não desconta do saldo; o desconto acontece apenas ao marcar como paga.</p><p class="field-hint">Em meses mais curtos, dias 29, 30 ou 31 passam para o último dia do mês. ${b?'Alterações valem para as contas em aberto, inclusive de meses anteriores; pagamentos já feitos são preservados.':''}</p>${formActions(b?'Salvar alterações':'Adicionar conta')}</form>`);}
function lastDay(m){return `${m}-${new Date(Number(m.slice(0,4)),Number(m.slice(5)),0).getDate()}`;}
function payModal(b){openModal('Marcar como paga',`${escape(b.description)} · ${money(b.amount)}`,`<form id="pay-form" data-id="${b.id}"><p class="field-hint">Será registrada uma saída de ${cash(b.amount)} em ${escape(fullMonth(month))}. Você pode desfazer o pagamento a qualquer momento.</p><label class="field">Data do pagamento<input name="date" type="date" min="${state.period.start}" max="${state.period.end}" value="${month===periodMonth(today())?today():b.due_date}" required></label>${formActions('Confirmar pagamento')}</form>`);}
let confirmAction=null;
function confirmModal(title,description,action,label='Excluir'){confirmAction=action;openModal(title,description,`<form id="confirm-form">${formActions(label)}</form>`);}
document.addEventListener('submit',async event=>{
  if(event.target.closest('#notes-modal, #investments-modal, #personal-modal'))return;
  event.preventDefault();
  if(isSaving)return;
  const form=event.target;
  const values=Object.fromEntries(new FormData(form));
  const submit=form.querySelector('[type=submit]');
  submit.disabled=true;
  isSaving=true;
  $('#form-error').hidden=true;
  try{
    if(form.id==='transaction-form'){
      const id=form.dataset.id;
      await api(`/transactions${id?'/'+id:''}`,{method:id?'PUT':'POST',body:JSON.stringify({...values,amount:parseAmount(values.amount)})});
      month=periodMonth(values.date);
    }else if(form.id==='bill-form'){
      const id=form.dataset.id;
      await api(`/bills${id?'/'+id:''}`,{method:id?'PUT':'POST',body:JSON.stringify({...values,amount:parseAmount(values.amount),due_day:Number(values.due_day)})});
      if(values.start_month>month)month=values.start_month;
    }else if(form.id==='pay-form'){
      await api(`/bills/${form.dataset.id}/pay`,{method:'POST',body:JSON.stringify({month,date:values.date})});
    }else if(form.id==='debt-form'){
      const id=form.dataset.id;
      const initial=values.initial_paid.trim();
      await api(`/debts${id?'/'+id:''}`,{method:id?'PUT':'POST',body:JSON.stringify({...values,amount:parseAmount(values.amount),initial_paid:!initial||/^0+(,0{1,2})?$/.test(initial)?0:parseAmount(initial)})});
      debtTab='total';
    }else if(form.id==='debt-pay-form'){
      await api(`/debts/${form.dataset.id}/pay`,{method:'POST',body:JSON.stringify({...values,amount:parseAmount(values.amount)})});
      month=periodMonth(values.date);
    }else if(form.id==='confirm-form'){
      await confirmAction();
    }
    isSaving=false;
    closeModal();
    toast('Dados salvos.');
    await load();
  }catch(error){
    $('#form-error').textContent=error.message;
    $('#form-error').hidden=false;
  }finally{
    isSaving=false;
    submit.disabled=false;
  }
});
document.addEventListener('click',event=>{const target=event.target.closest('[data-action]');if(!target)return;const action=target.dataset.action,id=Number(target.dataset.id);if(action==='close')closeModal();else if(action==='new-transaction')transactionModal();else if(action==='new-bill')billModal();else if(action==='edit-transaction')transactionModal(state.transactions.find(t=>t.id===id));else if(action==='edit-bill')billModal(state.bills.find(b=>b.id===id));else if(action==='pay-bill')payModal(state.bills.find(b=>b.id===id));else if(action==='delete-transaction'||action==='undo-payment'){const t=state.transactions.find(t=>t.id===id);confirmModal(action==='undo-payment'?'Desfazer pagamento?':'Excluir lançamento?',t?.debt_id?'A saída será removida e o saldo restante da dívida será recalculado.':t?.bill_id?'A saída será removida e a conta ficará pendente novamente.':'Esse lançamento será removido do seu histórico.',()=>api(`/transactions/${id}`,{method:'DELETE'}),action==='undo-payment'?'Desfazer pagamento':'Excluir lançamento');}else if(action==='delete-bill'){confirmModal('Excluir conta fixa?','A conta deixará de aparecer em todos os meses. As saídas de pagamentos já feitos continuam no histórico.',()=>api(`/bills/${id}`,{method:'DELETE'}),'Excluir conta');}else if(action==='restore')$('#backup-file').click();});
document.addEventListener('input',event=>{if(event.target.id==='search'){filters.search=event.target.value;$('#transaction-results').innerHTML=transactionResults();}});
document.addEventListener('change',async event=>{if(event.target.id==='filter-type'||event.target.id==='filter-category'){filters[event.target.id==='filter-type'?'type':'category']=event.target.value;$('#transaction-results').innerHTML=transactionResults();}else if(event.target.id==='backup-file'){const file=event.target.files[0];if(!file)return;try{if(file.size>15*1024*1024)throw new Error('Escolha um arquivo de até 15 MB.');const backup=JSON.parse(await file.text());if(![1,2,3,4,5,6,7,8,9].includes(backup.version)||!Array.isArray(backup.transactions)||!Array.isArray(backup.bills))throw new Error('Este arquivo não é um backup válido do Saldo.');confirmModal('Restaurar este backup?',`Isso substituirá os dados financeiros por ${backup.transactions.length} lançamentos, ${backup.bills.length} contas fixas e ${backup.debts?.length||0} dívidas. ${backup.version>=4?`Também substituirá todas as anotações por ${backup.notes?.length||0} registros.`:`Este backup antigo preservará suas anotações atuais.`} ${backup.version>=5?`Também substituirá a carteira por ${backup.investments?.length||0} investimentos e seus históricos.`:`Este backup antigo preservará seus investimentos atuais.`} ${backup.version>=6?`Também substituirá as abas e os registros de Pessoal, incluindo treinos e alimentação.`:``} ${backup.version>=9?`A ordem das abas principais também será restaurada.`:``} Baixe uma cópia dos dados atuais antes de continuar.`,()=>api('/restore',{method:'POST',body:JSON.stringify(backup)}),'Substituir e restaurar');}catch(error){toast(error.message,true);}event.target.value='';}});
$('#new-transaction').addEventListener('click',()=>{if(state)transactionModal();});
$('#month').addEventListener('change',event=>{const value=event.target.value;if(/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)&&value>=FIRST_MONTH){month=value;load();}else{event.target.value=month;toast('O sistema começa em setembro de 2026.',true);}});
function changeMonth(delta){const next=shiftMonth(month,delta);if(next<FIRST_MONTH||next>'2099-12')return;month=next;load();}
$('#prev-month').addEventListener('click',()=>changeMonth(-1));$('#next-month').addEventListener('click',()=>changeMonth(1));
$('#privacy').addEventListener('click',()=>{const hidden=document.body.classList.toggle('private');$('#privacy').setAttribute('aria-label',hidden?'Mostrar valores':'Ocultar valores');$('#privacy').title=hidden?'Mostrar valores':'Ocultar valores';$('#privacy').setAttribute('aria-pressed',String(hidden));});
$('#modal').addEventListener('click',event=>{if(event.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();}});
$('#modal').addEventListener('cancel',event=>{if(isSaving)event.preventDefault();});
function route(){page=location.hash.slice(1);if(!titles[page])page='overview';render();if(page==='personal'&&state)personalPanel.refresh().then(()=>{if(page==='personal')render();});if(page==='overview'&&state)load();if(page==='notes'&&state)notesPanel.refresh().then(()=>{if(page==='notes')render();});if(page==='investments'&&state)investmentsPanel.refresh().then(()=>{if(page==='investments')render();});}
window.addEventListener('hashchange',route);hydrateIcons();route();load();

function debtStatus(d){
  if(d.remaining===0)return ['paid','Quitada'];
  if(d.schedule){
    const next=d.schedule.find(item=>item.remaining>0);
    if(next?.date<today())return ['overdue','Em atraso'];
    if(next?.date===today())return ['','Vence hoje'];
    return ['','Em aberto'];
  }
  if(!d.due_date)return ['','Sem prazo'];
  if(d.due_date<today())return ['overdue','Em atraso'];
  if(d.due_date===today())return ['','Vence hoje'];
  const days=Math.round((Date.parse(d.due_date)-Date.parse(today()))/86400000);
  return ['',days<=7?`Vence em ${days} ${days===1?'dia':'dias'}`:'Em aberto'];
}
function debtDate(date){return date?date.split('-').reverse().join('/'):'Sem prazo definido';}
function debtInstallmentLabel(d){return d.installment_min!==undefined&&d.installment_min!==d.installment_max?`${cash(d.installment_min)} a ${cash(d.installment_max)}`:cash(d.installment_amount);}
function debtInstallmentDetails(d){return d.installment_count?`<div class="debt-installments"><strong>${d.installments_remaining} de ${d.installment_count} parcelas restantes</strong><span>${debtInstallmentLabel(d)} por parcela</span><small>${debtDate(d.first_installment_date)} a ${debtDate(d.last_installment_date)}</small></div>`:'';}
function debtsView(){return `<div class="debt-tabs" aria-label="Visões de dívidas"><button class="button ${debtTab==='monthly'?'primary':'secondary'}" data-action="debt-tab" data-tab="monthly" aria-pressed="${debtTab==='monthly'}">Dívidas do mês</button><button class="button ${debtTab==='total'?'primary':'secondary'}" data-action="debt-tab" data-tab="total" aria-pressed="${debtTab==='total'}">Dívidas totais</button></div>${debtTab==='monthly'?monthlyDebtsView():totalDebtsView()}`;}
function monthlyDebtsView(){
  const debts=state.monthlyDebts,total=debts.reduce((sum,d)=>sum+d.scheduled,0),paid=debts.reduce((sum,d)=>sum+d.month_paid,0),pending=debts.reduce((sum,d)=>sum+d.month_remaining,0);
  return `<div class="metrics monthly-metrics">${metric('Parcelas a pagar',pending,'wallet','Restante das parcelas deste mês','featured')}${metric('Parcelas do mês',total,'calendar',fullMonth(month))}${metric('Pagamentos do mês',paid,'check','Já incluídos nas saídas do mês')}</div><div class="section-toolbar"><div><h2>Dívidas do mês</h2><p>Ao pagar uma parcela, o saldo total da dívida também diminui.</p></div><button class="button primary" data-action="new-debt">${icon('plus')}Nova dívida</button></div>${debts.length?`<div class="bills-grid">${debts.map(d=>`<article class="panel bill-card debt-accent" style="--debt-color:${debtColor(d.color)}"><h2>${escape(d.description)}</h2><p class="debt-creditor">${escape(d.creditor||'Credor não informado')}</p><div class="bill-value">${cash(d.month_remaining)}</div><p class="debt-caption">Restante da parcela · Previsto: ${cash(d.scheduled)}</p><div class="bill-details"><span>Vencimento: ${debtDate(d.due_date)}</span><span class="pill ${!d.month_remaining?'paid':d.due_date<today()?'overdue':''}">${!d.month_remaining?'Paga':d.due_date<today()?'Em atraso':'Pendente'}</span></div>${debtInstallmentDetails(d)}<p class="debt-total">Pago no mês: ${cash(d.month_paid)} · Saldo total atual: ${cash(d.remaining)}</p><div class="bill-card-bottom"><button class="link-button" data-action="edit-debt" data-id="${d.id}">Editar dívida</button>${d.month_remaining&&d.remaining?`<button class="button secondary small" data-action="pay-installment" data-id="${d.id}">Pagar parcela</button>`:'<span class="debt-settled">Sem pagamento pendente</span>'}</div></article>`).join('')}</div>`:`<section class="panel">${empty('Nenhuma parcela neste mês','Cadastre uma dívida parcelada com as datas da primeira e da última parcela.','Nova dívida','new-debt')}</section>`}`;
}
function totalDebtsView(){
  const debts=state.debts;
  const total=debts.reduce((s,d)=>s+d.amount,0),paid=debts.reduce((s,d)=>s+d.paid,0);
  const overdue=debts.filter(d=>debtStatus(d)[0]==='overdue');
  return `<div class="metrics">${metric('Saldo a pagar',total-paid,'wallet',`${debts.filter(d=>d.remaining>0).length} em aberto`,'featured')}${metric('Total das dívidas',total,'database',`${debts.length} ${debts.length===1?'dívida cadastrada':'dívidas cadastradas'}`)}${metric('Total pago',paid,'check','Inclui valores pagos antes do cadastro')}${metric('Saldo em atraso',overdue.reduce((sum,d)=>sum+(d.schedule?d.schedule.filter(item=>item.date<today()).reduce((s,item)=>s+item.remaining,0):d.remaining),0),'clock',`${overdue.length} ${overdue.length===1?'dívida em atraso':'dívidas em atraso'}`,'red')}</div>
    <div class="section-toolbar"><div><h2>Dívidas cadastradas</h2><p>Os novos pagamentos são registrados como saídas na data informada.</p></div><button class="button primary" data-action="new-debt">${icon('plus')}Nova dívida</button></div>
    ${debts.length?`<div class="bills-grid debts-grid">${debts.map(d=>{
      const [cls,label]=debtStatus(d),percent=Math.round(d.paid/d.amount*100);
      return `<article class="panel bill-card debt-card debt-accent" style="--debt-color:${debtColor(d.color)}"><div class="bill-card-top"><span class="debt-kind">${d.debt_type==='installment'?'Parcelada':'Fixa'}</span><div class="row-actions"><button class="icon-button" data-action="edit-debt" data-id="${d.id}" aria-label="Editar ${escape(d.description)}" title="Editar">${icon('edit')}</button><button class="icon-button" data-action="delete-debt" data-id="${d.id}" aria-label="Excluir ${escape(d.description)}" title="Excluir">${icon('trash')}</button></div></div>
        <h2>${escape(d.description)}</h2><p class="debt-creditor">${d.creditor?escape(d.creditor):'Credor não informado'}</p><span class="category-tag">${escape(d.category)}</span>
        <div class="bill-value">${cash(d.remaining)}</div><div class="debt-caption">Saldo restante</div>
        <div class="debt-progress-label"><span>Pago: ${cash(d.paid)}</span><span class="money">${percent}%</span></div><progress class="debt-progress" max="${d.amount}" value="${d.paid}" aria-label="Progresso de quitação de ${escape(d.description)}"></progress>
        <div class="debt-total">Total: ${cash(d.amount)}${!d.installment_count&&d.installment_amount?` · Parcela mensal: ${cash(d.installment_amount)}`:''}</div>${debtInstallmentDetails(d)}<div class="bill-details"><span>${d.due_date?'Prazo: ':''}${debtDate(d.due_date)}</span><span class="pill ${cls}">${label}</span></div>
        ${d.notes?`<p class="debt-notes">${escape(d.notes)}</p>`:''}<div class="bill-card-bottom"><button class="link-button" data-action="debt-history" data-id="${d.id}">Histórico (${d.payments.length})</button>${d.remaining?`<button class="button secondary small" data-action="pay-debt" data-id="${d.id}">${icon('plus')}Pagar</button>`:`<span class="debt-settled">${icon('check')}Quitada</span>`}</div></article>`;
    }).join('')}</div>`:`<section class="panel">${empty('Nenhuma dívida cadastrada','Informe o total da dívida, o que já foi pago e o prazo, se houver.','Nova dívida','new-debt','wallet')}</section>`}`;
}
function debtModal(d=null){
  const type=d?.debt_type||'installment',legacy=d?.installment_amount&&!d.first_installment_date;
  const first=d?.first_installment_date||(legacy?periodDueDate(d.start_month,d.installment_day):defaultDate());
  const last=d?.last_installment_date||(legacy?dateInMonth(shiftMonth(first.slice(0,7),Math.ceil(d.amount/d.installment_amount)-1),Number(first.slice(8))):'');
  openModal(d?'Editar dívida':'Nova dívida','Escolha o tipo. As parcelas e os valores são calculados para você.',`<form id="debt-form" data-id="${d?.id||''}" data-recorded-paid="${d?d.paid-d.initial_paid:0}" data-auto-paid="${!d}">
    <div class="debt-type-toggle" role="group" aria-label="Tipo de dívida"><label><input type="radio" name="debt_type" value="fixed" ${type==='fixed'?'checked':''}><span><strong>Dívida fixa</strong><small>Um valor, sem parcelas</small></span></label><label><input type="radio" name="debt_type" value="installment" ${type==='installment'?'checked':''}><span><strong>Dívida parcelada</strong><small>Parcelas mensais com início e fim</small></span></label></div>
    <label class="field">Nome da dívida<input name="description" required maxlength="100" placeholder="Ex.: empréstimo pessoal" value="${escape(d?.description||'')}" autofocus></label>
    <label class="field">Valor total da dívida (R$)<input name="amount" required inputmode="decimal" placeholder="0,00" value="${amountInput(d?.amount)}"></label>
    <fieldset class="debt-date-fields" data-debt-installment ${type==='fixed'?'hidden disabled':''}><div class="field-row"><label class="field">Primeira parcela<input name="first_installment_date" type="date" min="2000-01-01" max="2099-12-31" required value="${first}"></label><label class="field">Última parcela<input name="last_installment_date" type="date" min="2000-01-01" max="2099-12-31" required value="${last}"></label></div><p class="field-hint">Uma parcela por mês, incluindo o primeiro e o último mês.${legacy?' Confira as datas sugeridas para sua dívida existente.':''}</p></fieldset>
    <div id="debt-preview" class="debt-preview" aria-live="polite"></div>
    <label class="field">Pago antes do cadastro (R$)<input name="initial_paid" inputmode="decimal" placeholder="0,00" value="${amountInput(d?.initial_paid)}"><span class="field-hint" data-debt-paid-hint></span></label>
    ${!d?'<button type="button" class="link-button debt-recalculate" data-action="recalculate-debt">Recalcular valor pago pelas datas</button>':''}
    ${d?`<p class="field-hint">Pagamentos registrados aqui: ${cash(d.paid-d.initial_paid)}. Eles também entram no saldo acima.</p>`:''}
    <div class="debt-color-field"><label for="debt-color">Cor da dívida</label><div class="debt-color-options"><input id="debt-color" name="color" type="color" value="${debtColor(d?.color)}" aria-label="Escolher cor personalizada">${[['#537ddb','Azul'],['#8b6ec1','Roxo'],['#3d9b84','Verde'],['#cc9547','Dourado'],['#cb748c','Rosa'],['#748294','Cinza']].map(([color,label])=>`<button type="button" class="debt-color-swatch" style="--swatch:${color}" data-debt-color="${color}" aria-label="Cor ${label}" title="${label}" aria-pressed="${debtColor(d?.color)===color}"></button>`).join('')}</div><span class="field-hint">Uma faixa discreta no cartão identifica esta dívida.</span></div>
    <details class="debt-extra"><summary>Mais detalhes <span>Credor, categoria e observações</span></summary><label class="field">Credor<input name="creditor" maxlength="100" value="${escape(d?.creditor||'')}" placeholder="Ex.: banco ou familiar"></label><fieldset class="debt-date-fields" data-debt-fixed ${type==='installment'?'hidden disabled':''}><label class="field">Vencimento <span class="field-hint">Opcional</span><input name="due_date" type="date" min="${FIRST_DATE}" max="2099-12-31" value="${d?.debt_type==='fixed'?d.due_date||'':''}"></label></fieldset><label class="field">Categoria<select name="category">${options(d?.category||'Outros')}</select></label><label class="field">Observações<textarea name="notes" maxlength="500">${escape(d?.notes||'')}</textarea></label></details>
    ${formActions(d?'Salvar alterações':'Cadastrar dívida')}</form>`);
  updateDebtPreview($('#debt-form'));
}
function updateDebtPreview(form){
  const parcelled=form.elements.debt_type.value==='installment';
  for(const [selector,enabled] of [['[data-debt-installment]',parcelled],['[data-debt-fixed]',!parcelled]]){
    const fields=form.querySelector(selector);fields.hidden=!enabled;fields.disabled=!enabled;
  }
  form.querySelector('[data-debt-paid-hint]').textContent=parcelled?'No cadastro, estimamos as parcelas anteriores a hoje como pagas. Corrija este valor se houver atrasos. Depois, registre os pagamentos em “Pagar”.':'Informe o que já foi pago, se houver.';
  const reset=form.querySelector('[data-action="recalculate-debt"]');if(reset)reset.hidden=!parcelled;
  const preview=form.querySelector('#debt-preview');
  form.style.setProperty('--debt-color',debtColor(form.elements.color.value));
  for(const button of form.querySelectorAll('[data-debt-color]'))button.setAttribute('aria-pressed',button.dataset.debtColor===form.elements.color.value);
  try{
    const amount=parseAmount(form.elements.amount.value),recorded=Number(form.dataset.recordedPaid);
    const draft={amount,first_installment_date:form.elements.first_installment_date.value,last_installment_date:form.elements.last_installment_date.value};
    if(form.dataset.autoPaid==='true'&&parcelled)form.elements.initial_paid.value=amountInput(Math.max(0,paidBeforeToday(draft)-recorded));
    const value=form.elements.initial_paid.value.trim(),initial=!value||/^0+(,0{1,2})?$/.test(value)?0:parseAmount(value);
    if(initial+recorded>amount)throw new Error('O valor já pago não pode ultrapassar o total da dívida.');
    const progress=parcelled?installmentProgress(draft,initial+recorded):{remaining:amount-initial-recorded};
    preview.innerHTML=`<dl>${parcelled?`<div><dt>Total de parcelas</dt><dd>${progress.installment_count}</dd></div><div><dt>Parcelas restantes</dt><dd>${progress.installments_remaining}</dd></div><div><dt>Valor por parcela</dt><dd>${debtInstallmentLabel(progress)}</dd></div>`:''}<div><dt>Valor que falta</dt><dd>${cash(progress.remaining)}</dd></div></dl>${parcelled&&progress.installment_min!==progress.installment_max?'<p class="field-hint">Diferença de R$ 0,01 entre parcelas para fechar o total exato.</p>':''}`;
  }catch(error){preview.innerHTML=`<p class="field-hint">${escape(!form.elements.amount.value.trim()?'Preencha o valor total e as datas para ver o cálculo.':error.message)}</p>`;}
}
document.addEventListener('input',event=>{
  const form=event.target.closest('#debt-form');if(!form)return;
  if(event.target.name==='initial_paid')form.dataset.autoPaid='false';
  updateDebtPreview(form);
});
document.addEventListener('change',event=>{
  const form=event.target.closest('#debt-form');if(!form)return;
  if(event.target.name==='debt_type'&&form.dataset.autoPaid==='true'&&event.target.value==='fixed')form.elements.initial_paid.value='';
  updateDebtPreview(form);
});
document.addEventListener('click',event=>{
  const form=event.target.closest('#debt-form');if(!form)return;
  const swatch=event.target.closest('[data-debt-color]');
  if(swatch){form.elements.color.value=swatch.dataset.debtColor;updateDebtPreview(form);}
  if(event.target.closest('[data-action="recalculate-debt"]')){form.dataset.autoPaid='true';updateDebtPreview(form);}
});
function debtPayModal(d,installment=null){
  openModal('Registrar pagamento',escape(d.description),`<form id="debt-pay-form" data-id="${d.id}"><p class="field-hint">Saldo restante: ${cash(d.remaining)}. O pagamento gera uma saída e reduz a dívida.</p><label class="field">Valor do pagamento (R$)<input name="amount" required inputmode="decimal" value="${amountInput(installment?Math.min(installment.month_remaining,d.remaining):d.remaining)}" autofocus></label><label class="field">Data do pagamento<input name="date" type="date" min="${installment?state.period.start:FIRST_DATE}" max="${installment?state.period.end:'2099-12-31'}" value="${defaultDate()}" required></label><label class="field">Observação<textarea name="notes" maxlength="500" placeholder="Ex.: parcela 2 de 6"></textarea></label>${formActions('Registrar pagamento')}</form>`);
}
function debtHistoryModal(d){
  openModal('Histórico de pagamentos',escape(d.description),`<div class="debt-history"><p>Pago antes do cadastro: ${cash(d.initial_paid)}</p>${d.payments.length?d.payments.map(p=>`<div class="debt-history-row"><div><strong>${cash(p.amount)}</strong><span>${debtDate(p.date)}</span>${p.notes?`<small>${escape(p.notes)}</small>`:''}</div><button class="link-button" data-action="undo-debt-payment" data-id="${p.id}">Desfazer</button></div>`).join(''):'<p class="field-hint">Nenhum pagamento registrado aqui.</p>'}<p>Total pago: ${cash(d.paid)} · Restante: ${cash(d.remaining)}</p></div>`);
}
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]');if(!target||!state)return;
  const {action}=target.dataset,id=Number(target.dataset.id),d=state.debts.find(d=>d.id===id);
  if(action==='debt-tab'){debtTab=target.dataset.tab;render();}
  else if(action==='toggle-categories'){const choices=$('#category-choices');choices.hidden=!choices.hidden;target.setAttribute('aria-expanded',String(!choices.hidden));}
  else if(action==='choose-category'){$('#transaction-category').value=target.dataset.category;$('#category-choices').hidden=true;$('[data-action=toggle-categories]').setAttribute('aria-expanded','false');$('#transaction-category').focus();}
  else if(action==='pay-installment'&&d)debtPayModal(d,state.monthlyDebts.find(x=>x.id===id));
  else if(action==='new-debt')debtModal();
  else if(action==='edit-debt'&&d)debtModal(d);
  else if(action==='pay-debt'&&d)debtPayModal(d);
  else if(action==='debt-history'&&d)debtHistoryModal(d);
  else if(action==='delete-debt'&&d)confirmModal('Excluir dívida?','A dívida será removida. As saídas dos pagamentos já feitos serão mantidas nas movimentações.',()=>api(`/debts/${id}`,{method:'DELETE'}),'Excluir dívida');
  else if(action==='undo-debt-payment'){
    closeModal();
    confirmModal('Desfazer pagamento?','A saída será removida e o valor voltará ao saldo restante da dívida.',()=>api(`/transactions/${id}`,{method:'DELETE'}),'Desfazer pagamento');
  }
});
let quizQuestions=[],quizIndex=0,quizAnswered=false,quizLoading=false;
function showQuiz(){
  const question=quizQuestions[quizIndex];quizAnswered=false;
  $('#quiz-content').innerHTML=`<small>${escape(question.category)}</small><p lang="en">${escape(question.question)}</p><div class="quiz-options">${question.answers.map((a,i)=>`<button type="button" data-quiz-answer="${i}" lang="en">${escape(a)}</button>`).join('')}</div><p id="quiz-feedback" class="quiz-feedback" role="status"></p>`;
}
async function loadQuiz(){
  if(quizLoading)return;quizLoading=true;$('#quiz-next').disabled=true;
  try{
    const data=await api('/quiz');
    if(!data.questions?.length)throw new Error('Quiz indisponível');
    quizQuestions=data.questions;quizIndex=0;showQuiz();$('#quiz-next').textContent='Outra pergunta';
  }catch{
    $('#quiz-content').innerHTML='<p>As perguntas estão indisponíveis no momento. Tente novamente em instantes.</p>';
    $('#quiz-next').textContent='Tentar novamente';
  }finally{quizLoading=false;$('#quiz-next').disabled=false;}
}
$('#quiz-next').addEventListener('click',()=>{
  if(!quizQuestions.length||quizIndex===quizQuestions.length-1){quizQuestions=[];void loadQuiz();}
  else{quizIndex++;showQuiz();}
});
$('#quiz-content').addEventListener('click',event=>{
  const button=event.target.closest('[data-quiz-answer]');if(!button||quizAnswered)return;
  quizAnswered=true;const question=quizQuestions[quizIndex],answer=Number(button.dataset.quizAnswer);
  document.querySelectorAll('[data-quiz-answer]').forEach(el=>{el.disabled=true;const i=Number(el.dataset.quizAnswer);el.classList.toggle('quiz-correct',i===question.correct);el.classList.toggle('quiz-incorrect',i===answer&&i!==question.correct);});
  $('#quiz-feedback').textContent=answer===question.correct?'Você acertou!':'Resposta correta: '+question.answers[question.correct];
});
void loadQuiz();

// Progressive enhancement: the interface works normally without WebMCP.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const tools = [
    {
      name: 'read_financial_month',
      title: 'Consultar resumo do mês',
      description: 'Consulta entradas, saídas e contas pendentes de um mês, sem alterar os dados.',
      inputSchema: { type: 'object', properties: { month: { type: 'string', pattern: '^20[0-9]{2}-(0[1-9]|1[0-2])$' } }, required: ['month'], additionalProperties: false },
      annotations: { readOnlyHint: true },
      async execute(input) {
        if (!input || typeof input.month !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.month)) throw new Error('Mês inválido. Use AAAA-MM.');
        const data = await api(`/state?month=${input.month}`);
        return { month: data.month, currency: 'BRL', unit: 'centavos', totals: data.totals };
      }
    },
    {
      name: 'start_transaction_creation',
      title: 'Abrir novo lançamento',
      description: 'Abre o formulário de lançamento para preenchimento. Não salva nem movimenta dinheiro.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false },
      execute() {
        if (!state) throw new Error('Aguarde o carregamento dos dados.');
        if ($('#modal').open) throw new Error('Já existe um formulário aberto.');
        transactionModal();
        return { status: 'form_open', saved: false };
      }
    }
  ];
  for (const tool of tools) {
    try { Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); }
    catch { /* Browsers without a compatible registry keep the normal UI. */ }
  }
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}

let observedPeriod=periodMonth(today());
setInterval(()=>{const next=periodMonth(today());if(next!==observedPeriod){if(month===observedPeriod){month=next;load();}observedPeriod=next;}},30000);

function placeVerse(){const verse=$("#daily-verse");const compact=matchMedia("(max-width:1000px)").matches;verse.classList.toggle("mobile-verse",compact);if(compact)($("#verse-slot")||$("main")).append(verse);else $(".sidebar").insertBefore(verse,$(".sidebar-bottom"));}
window.addEventListener("resize",placeVerse);
placeVerse();

initDatePickers();
setInterval(()=>{if(page==='overview'&&!document.hidden&&!document.querySelector('dialog[open]'))load();},60000);
