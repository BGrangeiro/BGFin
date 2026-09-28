import { createSchedulePanel } from './schedule.js';
import { createFitnessPanel } from './fitness.js';
import { studyAgenda } from './study-model.js';
import { createPersonalLibrary } from './personal-library.js';
export function createPersonalPanel({api,icon,escape,cash,parseAmount,amountInput,today,onRender,toast}) {
  let data={tabs:[],items:[],folders:[]}, selected=null, error='', loaded=false, saving=false, mutation=null, request=0;
  const dialog=document.querySelector('#personal-modal');
  const cycles={monthly:'Mensal',yearly:'Anual',weekly:'Semanal',once:'Sem recorrência'};
  const action=(name,label,symbol='plus',id='',cls='button secondary small')=>`<button type="button" class="${cls}" data-personal-action="${name}" data-id="${id}" aria-label="${escape(label)}">${icon(symbol)}${cls==='icon-button'?'':escape(label)}</button>`;
  const tab=()=>data.tabs.find(t=>t.id===selected)||data.tabs[0];
  const dateLabel=value=>value?value.split('-').reverse().join('/'):'Sem data';
  let ordering=false,drag=null,suppressTabClick=false;
  const tabButtons=nav=>[...nav.querySelectorAll('[data-personal-action="select"]')];
  function restoreTabOrder(nav){const buttons=tabButtons(nav);for(const t of data.tabs){const button=buttons.find(b=>Number(b.dataset.id)===t.id);if(button)nav.append(button);}}
  async function saveTabOrder(nav){
    const ids=tabButtons(nav).map(button=>Number(button.dataset.id));
    if(ordering||ids.every((id,index)=>id===data.tabs[index]?.id))return;
    ordering=true;++request;nav.setAttribute('aria-busy','true');
    try{data.tabs=await api('/personal/tabs/order',{method:'PUT',body:JSON.stringify({ids})});toast('Ordem das abas salva.');}
    catch(e){restoreTabOrder(nav);toast(e.message,true);}
    finally{ordering=false;nav.removeAttribute('aria-busy');}
  }
  function finishTabDrag(cancel=false){
    if(!drag)return;
    const current=drag;drag=null;
    if(current.button.hasPointerCapture(current.pointerId))current.button.releasePointerCapture(current.pointerId);
    if(!current.active)return;
    current.ghost.remove();current.button.classList.remove('dragging');current.nav.classList.remove('reordering');
    suppressTabClick=true;setTimeout(()=>{suppressTabClick=false;},0);
    if(cancel)restoreTabOrder(current.nav);else void saveTabOrder(current.nav);
  }
  document.addEventListener('pointerdown',event=>{
    const button=event.target.closest('.personal-tabs [data-personal-action="select"]');
    if(!button||event.button!==0||!event.isPrimary||saving||ordering||drag)return;
    const rect=button.getBoundingClientRect();
    drag={button,nav:button.closest('.personal-tabs'),pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top,active:false};
    button.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    if(!drag.button.isConnected){finishTabDrag(true);return;}
    if(!drag.active){
      if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<6)return;
      drag.active=true;
      const rect=drag.button.getBoundingClientRect(),ghost=drag.button.cloneNode(true);
      ghost.removeAttribute('data-personal-action');ghost.removeAttribute('data-id');ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;
      ghost.classList.add('personal-tab-ghost');ghost.style.width=`${rect.width}px`;ghost.style.height=`${rect.height}px`;
      drag.ghost=ghost;drag.nav.append(ghost);drag.button.classList.add('dragging');drag.nav.classList.add('reordering');
    }
    event.preventDefault();
    drag.ghost.style.left=`${event.clientX-drag.offsetX}px`;drag.ghost.style.top=`${event.clientY-drag.offsetY}px`;
    const bounds=drag.nav.getBoundingClientRect();
    drag.inside=event.clientX>=bounds.left&&event.clientX<=bounds.right&&event.clientY>=bounds.top-12&&event.clientY<=bounds.bottom+12;
    if(!drag.inside)return;
    const hovered=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-personal-action="select"]');
    if(hovered===drag.button)return;
    const before=tabButtons(drag.nav).filter(b=>b!==drag.button).find(button=>{
      const rect=button.getBoundingClientRect();
      return event.clientY<rect.top||(event.clientY<=rect.bottom&&event.clientX<rect.left+rect.width/2);
    });
    drag.nav.insertBefore(drag.button,before||drag.ghost);
    drag.button.setPointerCapture(drag.pointerId);
  });
  document.addEventListener('pointerup',event=>{if(event.pointerId===drag?.pointerId)finishTabDrag(drag.active&&!drag.inside);});
  document.addEventListener('pointercancel',event=>{if(event.pointerId===drag?.pointerId)finishTabDrag(true);});
  document.addEventListener('lostpointercapture',event=>{if(event.pointerId===drag?.pointerId)finishTabDrag(true);});
  window.addEventListener('blur',()=>finishTabDrag(true));
  document.addEventListener('dragstart',event=>{if(event.target.closest('.personal-tabs'))event.preventDefault();});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&drag){event.preventDefault();finishTabDrag(true);return;}
    const button=event.target.closest('.personal-tabs [data-personal-action="select"]');
    if(!button||!event.altKey||!['ArrowLeft','ArrowRight'].includes(event.key)||saving||ordering)return;
    event.preventDefault();const nav=button.closest('.personal-tabs'),buttons=tabButtons(nav),index=buttons.indexOf(button),next=buttons[index+(event.key==='ArrowLeft'?-1:1)];
    if(next){nav.insertBefore(button,event.key==='ArrowLeft'?next:next.nextSibling);button.focus();void saveTabOrder(nav);}
  });
  const library=createPersonalLibrary({getData:()=>data,getTab:tab,api,icon,escape,action,show,toast,dateLabel,changed:saved=>{++request;data.items=data.items.map(i=>i.id===saved.id?saved:i);}});
  const fitness=createFitnessPanel({getData:()=>data,getTab:tab,api,icon,escape,show,toast,today,onRender,changed:saved=>{++request;data.items=data.items.map(item=>item.id===saved.id?saved:item);}});
  const schedule=createSchedulePanel({getData:()=>data,getTab:tab,api,icon,escape,show,toast,today,onRender,changed:next=>{++request;data=next;}});
  async function refresh(){const id=++request;try{const next=await api('/personal');if(id===request){data=next;loaded=true;error='';if(!data.tabs.some(t=>t.id===selected))selected=data.tabs[0]?.id;}}catch(e){if(id===request)error=e.message;}}
  function render(){
    if(error)return `<section class="panel personal-empty" role="alert"><h2>Não foi possível carregar Pessoal</h2><p>${escape(error)}</p>${action('retry','Tentar novamente','repeat')}</section>`;
    if(!loaded)return '<div class="loading">Carregando Pessoal…</div>';
    const current=tab(), special=['movies','studies'].includes(current?.layout), subscription=current?.kind==='subscriptions', records=data.items.filter(i=>i.tab_id===current?.id), active=records.filter(i=>i.status==='active');
    const monthly=active.filter(i=>i.cycle==='monthly').reduce((s,i)=>s+i.amount,0), yearly=active.filter(i=>i.cycle==='yearly').reduce((s,i)=>s+i.amount,0);
    const stat=(label,value,hint,featured=false)=>`<div class="metric ${featured?'featured':''}"><div class="metric-top">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${hint}</div></div>`;
    const header=`<section class="personal-intro">${action('new-tab','Criar nova aba','plus','','button primary')}</section>
      <nav class="personal-tabs" aria-label="Abas pessoais">${data.tabs.map(t=>`<button type="button" data-personal-action="select" data-id="${t.id}" class="${t.id===current?.id?'selected':''}" aria-pressed="${t.id===current?.id}" title="Arraste para mudar a ordem · Alt + ← / →" aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight">${icon(t.layout==='schedule'?'calendar':t.layout==='fitness'?'dumbbell':t.kind==='subscriptions'?'repeat':'notebook')}<span>${escape(t.name)}</span><small>${t.layout==='schedule'?data.items.filter(i=>i.tab_id===t.id&&i.schedule_kind==='template').reduce((total,item)=>total+item.blocks.length,0):data.items.filter(i=>i.tab_id===t.id).length}</small></button>`).join('')}</nav>
    `;
    if(current?.layout==='schedule')return header+schedule.render();
    if(current?.layout==='fitness')return header+fitness.render();
    if(special)return header+library.render();
    return header+`
      ${subscription?`<div class="metrics personal-metrics">${stat('Assinaturas ativas',String(active.length),'Serviços em uso',true)}${stat('Cobranças mensais',cash(monthly),'Soma das assinaturas com frequência mensal')}${stat('Cobranças anuais',cash(yearly),'Soma das assinaturas com frequência anual')}${stat('Vencimentos pendentes',String(active.filter(i=>i.due_date<=today()).length),'Hoje ou com a data já passada')}</div>`:''}
      <div class="section-toolbar"><div><h2>${escape(current?.name||'Meu espaço')}</h2><p>${subscription?'Valores por cobrança e datas que você acompanha.':`${records.length} registros nesta aba`}</p></div><div class="personal-actions">${current?.kind==='custom'?`${action('rename-tab','Renomear aba','edit',current.id)}${action('delete-tab','Excluir aba','trash',current.id)}`:''}${action('new-item',subscription?'Adicionar assinatura':'Adicionar registro','plus','','button primary')}</div></div>
      ${records.length?`<div class="personal-grid">${records.map(i=>`<article class="panel personal-card ${i.status==='archived'?'personal-archived':''}"><div class="personal-card-head"><span class="transaction-icon">${icon(subscription?'repeat':'notebook')}</span><div class="row-actions">${action('edit-item',`Editar ${i.title}`,'edit',i.id,'icon-button')}${action('delete-item',`Excluir ${i.title}`,'trash',i.id,'icon-button')}</div></div><h3>${escape(i.title)}</h3><span class="pill ${i.status==='archived'?'paid':i.due_date&&i.due_date<today()?'overdue':''}">${i.status==='archived'?(subscription?'Inativa':'Arquivado'):i.due_date&&i.due_date<today()?'Data pendente':i.due_date===today()?'Hoje':'Ativo'}</span>${i.amount!==null?`<div class="personal-amount">${cash(i.amount)}<small>${cycles[i.cycle]}</small></div>`:''}<dl><dt>${subscription?'Próximo vencimento':'Data'}</dt><dd>${dateLabel(i.due_date)}</dd></dl>${i.notes?`<p class="personal-notes">${escape(i.notes)}</p>`:''}<div class="personal-card-footer">${action('edit-item',subscription?'Atualizar assinatura':'Abrir registro','edit',i.id)}</div></article>`).join('')}</div>`:`<section class="panel personal-empty">${icon(subscription?'repeat':'notebook')}<h3>${subscription?'Nenhuma assinatura cadastrada':'Nenhum registro nesta aba'}</h3><p>${subscription?'Streaming, academia, aplicativos… registre o valor e o próximo vencimento.':'Use Adicionar registro para cadastrar um item.'}</p>${action('new-item',subscription?'Adicionar primeira assinatura':'Criar primeiro registro')}</section>`}
      ${subscription?'<p class="investment-footnote">Os valores são por cobrança, conforme a frequência escolhida. Atualize o próximo vencimento após cada renovação. Estes registros não geram lançamentos automáticos em Finanças.</p>':''}`;
  }
  function show(title,subtitle,body,fn,submit='Salvar'){
    mutation=fn;
    dialog.innerHTML=`<div class="modal-header"><div><h2 id="personal-modal-title">${escape(title)}</h2>${subtitle?`<p>${escape(subtitle)}</p>`:''}</div>${action('close','Fechar','close','','icon-button')}</div><div class="modal-body"><form id="personal-form">${body}<div id="personal-error" class="form-error" role="alert" hidden></div><div class="modal-actions">${action('close','Cancelar','close')}<button class="button primary" type="submit">${submit}</button></div></form></div>`;
    dialog.showModal();
  }
  function editItem(item=null){
    const current=tab(),subscription=current.kind==='subscriptions';
    if(current.layout==='schedule')return schedule.edit();
    if(current.layout==='fitness')return fitness.edit(item);
    if(['movies','studies'].includes(current.layout))return library.edit(item);
    show(item?(subscription?'Editar assinatura':'Editar registro'):subscription?'Adicionar assinatura':'Novo registro',current.name,
      `<label class="field">${subscription?'Nome da assinatura':'Título'}<input name="title" maxlength="120" required autofocus placeholder="${subscription?'Ex.: Netflix, Spotify, academia':'Título do registro'}" value="${escape(item?.title||'')}"></label>
      <div class="field-row"><label class="field">Valor por cobrança (R$)${subscription?'':' · opcional'}<input name="amount" inputmode="decimal" placeholder="0,00" ${subscription?'required':''} value="${item?.amount===0?'0,00':amountInput(item?.amount)}"></label><label class="field">Frequência<select name="cycle">${Object.entries(cycles).map(([key,label])=>`<option value="${key}" ${key===(item?.cycle||(subscription?'monthly':'once'))?'selected':''}>${label}</option>`).join('')}</select></label></div>
      <div class="field-row"><label class="field">${subscription?'Próximo vencimento':'Data (opcional)'}<input name="due_date" type="date" min="2000-01-01" max="2099-12-31" value="${item?.due_date||''}" ${subscription?'required':''}></label><label class="field">Situação<select name="status"><option value="active">${subscription?'Ativa':'Ativo'}</option><option value="archived" ${item?.status==='archived'?'selected':''}>${subscription?'Inativa / cancelada':'Arquivado'}</option></select></label></div>
      <label class="field">Observações<textarea name="notes" maxlength="10000" rows="4" placeholder="Plano contratado, forma de pagamento ou outros detalhes…">${escape(item?.notes||'')}</textarea></label>`,async values=>{
        const amount=!values.amount.trim()?null:/^0+(,0{1,2})?$/.test(values.amount.trim())?0:parseAmount(values.amount);
        await api(`/personal/items${item?'/'+item.id:''}`,{method:item?'PUT':'POST',body:JSON.stringify({...values,amount,tab_id:current.id})});
      });
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-personal-action]');if(!button||saving)return;
    if(button.dataset.personalAction==='select'&&suppressTabClick){event.preventDefault();return;}
    if(ordering)return;
    const name=button.dataset.personalAction,id=Number(button.dataset.id),item=data.items.find(i=>i.id===id),current=tab();
    if(name==='close')dialog.close();
    else if(name==='select'){selected=id;library.reset();onRender();}
    else if(name==='retry'){await refresh();onRender();}
    else if(['new-folder','rename-folder','delete-folder'].includes(name))library.folderModal(name,id);
    else if(name==='new-item')editItem();
    else if(name==='edit-item'&&item)editItem(item);
    else if(name==='new-tab'||name==='rename-tab')show(name==='new-tab'?'Criar nova aba':'Renomear aba','',`<label class="field">Nome da aba<input name="name" required maxlength="60" autofocus placeholder="Ex.: Saúde, viagens, projetos pessoais" value="${name==='rename-tab'?escape(current.name):''}"></label>`,async values=>{const saved=await api(`/personal/tabs${name==='rename-tab'?'/'+id:''}`,{method:name==='rename-tab'?'PUT':'POST',body:JSON.stringify(values)});selected=saved.id;});
    else if(name==='delete-item'&&item)show('Excluir registro?',`“${item.title}” será removido. Esta ação não pode ser desfeita.`,'',()=>api(`/personal/items/${id}`,{method:'DELETE'}),'Excluir registro');
    else if(name==='delete-tab')show('Excluir aba?',`“${current.name}” e seus ${data.items.filter(i=>i.tab_id===id).length} registros serão removidos. Esta ação não pode ser desfeita.`,'',()=>api(`/personal/tabs/${id}`,{method:'DELETE'}),'Excluir aba');
  });
  dialog.addEventListener('cancel',e=>{if(saving)e.preventDefault();});
  dialog.addEventListener('submit',async event=>{
    event.preventDefault();if(saving)return;saving=true;++request;
    const button=dialog.querySelector('[type=submit]');button.disabled=true;dialog.querySelector('#personal-error').hidden=true;
    try{await mutation(Object.fromEntries(new FormData(event.target)),event.target);dialog.close();await refresh();onRender();toast('Registro salvo.');}
    catch(e){dialog.querySelector('#personal-error').textContent=e.message;dialog.querySelector('#personal-error').hidden=false;}
    finally{saving=false;button.disabled=false;}
  });
  return {render,refresh,afterRender:()=>{if(tab()?.layout==='fitness')fitness.afterRender();if(tab()?.layout==='schedule')schedule.afterRender();},agenda:()=>error?[]:data.items.filter(i=>!['movies','schedule'].includes(data.tabs.find(t=>t.id===i.tab_id)?.layout)&&(data.tabs.find(t=>t.id===i.tab_id)?.layout!=='fitness'||(i.record_type==='workout'&&!i.completed))&&i.status==='active'&&i.due_date&&i.due_date<=today()).map(i=>({title:i.title,date:i.due_date,page:'personal',label:data.tabs.find(t=>t.id===i.tab_id)?.name||'Pessoal'})).concat(studyAgenda(data.items,data.tabs)),agendaError:()=>error?'<p class="form-error">Não foi possível carregar os lembretes de Pessoal. Recarregue a página.</p>':''};
}
