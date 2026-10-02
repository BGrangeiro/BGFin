import { scheduleDay,weekdayOf,WEEKDAY_NAMES,sortedBlocks,sameBlock,swapScheduleTimes } from './schedule-model.js';
import { shiftDay,weekDays,dayAllowed } from './fitness-model.js';

export function createSchedulePanel({getData,getTab,api,icon,escape,show,toast,today,onRender,changed}){
  let selectedDate=today(),mode='exception',busy=false,drag=null,suppressClick=false,scrollKey='',scrollTop=0;
  const label=date=>date.split('-').reverse().join('/');
  const day=()=>scheduleDay(getData().items,getTab().id,selectedDate);
  const blocks=()=>sortedBlocks(mode==='template'?(day().template?.blocks||[]):day().blocks);
  const button=(action,text,symbol='plus',extra='',cls='button secondary small')=>`<button type="button" class="${cls}" data-schedule-action="${action}" ${extra} ${busy?'disabled':''} aria-label="${escape(text)}">${icon(symbol)}${cls.includes('icon-button')?'':escape(text)}</button>`;
  const payload=(context,date,scope,items)=>({tab_id:getTab().id,date,mode:scope,blocks:items,expected_revision:(scope==='template'?context.template:context.exception)?.schedule_revision||0,expected_template_revision:context.template?.schedule_revision||0});
  const scopeField=(scope,date)=>`<label class="field">Aplicar em<select name="scope"><option value="exception" ${scope==='exception'?'selected':''}>Só em ${label(date)}</option><option value="template" ${scope==='template'?'selected':''}>${[0,6].includes(weekdayOf(date))?'Todo':'Toda'} ${WEEKDAY_NAMES[weekdayOf(date)].toLowerCase()} · padrão</option></select></label><p class="field-hint">O padrão se repete toda semana. Dias com alterações próprias continuam separados.</p>`;
  function edit(id=null,start='08:00'){
    const context=day(),date=selectedDate,item=blocks().find(block=>block.id===id),scope=mode;
    const hour=Number(start.slice(0,2)),end=`${String(Math.min(hour+1,23)).padStart(2,'0')}:${hour===23?'59':'00'}`;
    show(item?'Editar horário':'Adicionar horário',WEEKDAY_NAMES[weekdayOf(date)],`<label class="field">Atividade<input name="title" required maxlength="120" autofocus value="${escape(item?.title||'')}" placeholder="Ex.: estudar, trabalhar, treinar"></label><div class="field-row"><label class="field">Início<input name="start" type="time" required value="${item?.start||start}"></label><label class="field">Término<input name="end" type="time" required value="${item?.end||end}"></label></div><label class="field schedule-color-field">Cor do cartão<input name="color" type="color" value="${item?.color||'#5274cb'}"></label>${scopeField(scope,date)}<label class="field">Observações<textarea name="notes" rows="3" maxlength="10000">${escape(item?.notes||'')}</textarea></label>`,async values=>{
      const target=values.scope==='template'?(context.template?.blocks||[]):context.blocks;
      const record={id:item?.id||crypto.randomUUID(),title:values.title,start:values.start,end:values.end,color:values.color,notes:values.notes};
      const next=target.some(block=>block.id===record.id)?target.map(block=>block.id===record.id?record:block):[...target,record];
      await api('/personal/schedule',{method:'PUT',body:JSON.stringify(payload(context,date,values.scope,next))});mode=values.scope;
    });
  }
  function remove(id){
    const context=day(),date=selectedDate,item=blocks().find(block=>block.id===id);if(!item)return;
    show('Excluir horário?',item.title,scopeField(mode,date),async values=>{
      const source=values.scope==='template'?(context.template?.blocks||[]):context.blocks;
      if(!source.some(block=>block.id===id))throw new Error('Esse horário existe apenas nesta data. Selecione só este dia.');
      await api('/personal/schedule',{method:'PUT',body:JSON.stringify(payload(context,date,values.scope,source.filter(block=>block.id!==id)))});mode=values.scope;
    },'Excluir horário');
  }
  function options(id){
    const item=blocks().find(block=>block.id===id);if(!item)return;
    show('Opções do horário',item.title,`<div class="schedule-menu-actions">${button('edit','Editar','edit',`data-id="${id}"`)}${button('remove','Excluir','trash',`data-id="${id}"`)}</div>`,async()=>{});
    document.querySelector('#personal-form [type=submit]').hidden=true;
  }
  function card(block,context){
    const different=mode==='exception'&&!!context.exception&&!sameBlock(block,context.template?.blocks.find(item=>item.id===block.id));
    return `<article class="schedule-card" data-schedule-card="${block.id}" style="--schedule-color:${block.color}"><div class="schedule-card-heading"><span class="schedule-time">${block.start}–${block.end}</span><div class="row-actions">${different?`<span class="schedule-exception" title="Alterado em relação ao padrão semanal" aria-label="Alterado em relação ao padrão semanal">${icon('edit')}</span>`:''}${button('move',`Mover ${block.title}`,'grip',`data-id="${block.id}" data-schedule-drag="${block.id}" title="Arraste para trocar horários · Alt + ↑ / ↓" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"`,'icon-button')}</div></div><h3>${escape(block.title)}</h3>${block.notes?`<p>${escape(block.notes)}</p>`:''}<div class="schedule-card-footer">${button('options',`Opções de ${block.title}`,'minus',`data-id="${block.id}" aria-haspopup="dialog" title="Editar ou excluir horário"`,'icon-button')}</div></article>`;
  }
  function render(){
    const current=getTab(),context=day(),items=blocks(),days=weekDays(selectedDate);
    return `<section class="schedule-panel"><div class="section-toolbar"><div class="library-section-title"><h2>${escape(current.name)}</h2><button type="button" class="icon-button" data-personal-action="rename-tab" data-id="${current.id}" aria-label="Renomear aba">${icon('edit')}</button><button type="button" class="icon-button" data-personal-action="delete-tab" data-id="${current.id}" aria-label="Excluir aba">${icon('trash')}</button></div>${button('new','Adicionar horário','plus','','button primary')}</div><div class="schedule-toolbar"><div class="library-views" aria-label="Tipo de cronograma">${['exception','template'].map(value=>`<button type="button" data-schedule-action="mode" data-mode="${value}" aria-pressed="${mode===value}" class="${mode===value?'selected':''}" ${busy?'disabled':''}>${value==='exception'?'Meu dia':'Padrão semanal'}</button>`).join('')}</div><div class="schedule-date-controls">${button('previous','Semana anterior','arrow',!dayAllowed(shiftDay(selectedDate,-7))?'disabled':'','icon-button')}<label class="field">Data<input id="schedule-date" type="date" required min="2000-01-01" max="2099-12-31" value="${selectedDate}" ${busy?'disabled':''}></label>${button('next','Próxima semana','arrow',!dayAllowed(shiftDay(selectedDate,7))?'disabled':'','icon-button')}${button('today','Hoje','calendar')}</div></div><nav class="schedule-week" aria-label="Dias do cronograma">${days.map(date=>{const altered=scheduleDay(getData().items,current.id,date).modified;return `<button type="button" data-schedule-action="day" data-date="${date}" class="${date===selectedDate?'selected':''}" aria-pressed="${date===selectedDate}" ${busy||!dayAllowed(date)?'disabled':''}><strong>${WEEKDAY_NAMES[weekdayOf(date)].slice(0,3)}</strong><span>${label(date).slice(0,5)}</span>${mode==='exception'&&altered?`<span class="schedule-day-mark" aria-label="Dia alterado" title="Alterações para esta data">${icon('edit')}</span>`:''}</button>`;}).join('')}</nav><div class="schedule-heading"><div><h3>${WEEKDAY_NAMES[weekdayOf(selectedDate)]}${mode==='exception'?` · ${label(selectedDate)}`:''}</h3><p>${mode==='template'?'Padrão repetido toda semana':context.modified?'Alterações só para esta data':'Usando o padrão semanal'} · ${items.length} ${items.length===1?'atividade':'atividades'}</p></div>${mode==='exception'&&context.exception?button('reset','Restaurar padrão','repeat'):''}</div><p class="field-hint">${mode==='template'?'Alterações nesta visão mudam o padrão semanal.':'Alterações nesta visão valem só para a data selecionada.'} Os cartões ficam em ordem de horário. Arraste pela alça até outro cartão para trocar horários.</p><div class="schedule-timeline" aria-label="Horários do dia" ${busy?'aria-busy="true"':''}>${items.map(block=>card(block,context)).join('')||'<p class="schedule-empty">Nenhum horário cadastrado para este dia.</p>'}</div></section>`;
  }
  async function save(items){
    if(busy)return;const context=day(),request=payload(context,selectedDate,mode,items);busy=true;
    try{const next=await api('/personal/schedule',{method:'PUT',body:JSON.stringify(request)});changed(next);toast(mode==='template'?'Padrão semanal salvo.':'Alteração salva só para esta data.');}
    catch(error){toast(error.message,true);}finally{busy=false;onRender();}
  }
  function move(id,targetId){
    try{const source=blocks(),next=swapScheduleTimes(source,id,targetId);if(JSON.stringify(next)!==JSON.stringify(source))void save(next);}
    catch(error){toast(error.message,true);}
  }
  document.addEventListener('change',event=>{if(event.target.id==='schedule-date'&&!busy&&event.target.value&&event.target.validity.valid){selectedDate=event.target.value;onRender();}});
  document.addEventListener('scroll',event=>{if(event.target.matches?.('.schedule-timeline'))scrollTop=event.target.scrollTop;},true);
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-schedule-action]');if(!target)return;
    if(suppressClick||busy){event.preventDefault();return;}
    const action=target.dataset.scheduleAction,id=target.dataset.id;
    if(action==='new')edit(null,target.dataset.start||'08:00');
    else if(action==='edit'||action==='move')edit(id);
    else if(action==='remove')remove(id);
    else if(action==='options')options(id);
    else if(action==='mode'){mode=target.dataset.mode;onRender();}
    else if(action==='day'){selectedDate=target.dataset.date;onRender();}
    else if(action==='today'){selectedDate=today();onRender();}
    else if(action==='previous'||action==='next'){const next=shiftDay(selectedDate,action==='previous'?-7:7);if(dayAllowed(next)){selectedDate=next;onRender();}}
    else if(action==='reset'){const context=day(),date=selectedDate;show('Restaurar padrão deste dia?',label(date),'<p class="field-hint">As alterações desta data serão substituídas pelo padrão semanal atual.</p>',()=>api('/personal/schedule',{method:'PUT',body:JSON.stringify(payload(context,date,'reset',[]))}),'Restaurar padrão');}
  });
  function finish(cancel=false){
    if(!drag)return;const current=drag;drag=null;
    if(current.handle.hasPointerCapture(current.pointerId))current.handle.releasePointerCapture(current.pointerId);
    current.ghost?.remove();current.card.classList.remove('schedule-dragging');document.querySelectorAll('.schedule-drop-target').forEach(element=>element.classList.remove('schedule-drop-target'));
    if(!current.active)return;suppressClick=true;setTimeout(()=>suppressClick=false,0);
    if(!cancel&&current.targetId)move(current.id,current.targetId);
  }
  document.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('[data-schedule-drag]');if(!handle||busy||drag||event.button!==0||!event.isPrimary)return;
    drag={handle,id:handle.dataset.scheduleDrag,card:handle.closest('[data-schedule-card]'),pointerId:event.pointerId,x:event.clientX,y:event.clientY,active:false};handle.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;if(!drag.handle.isConnected){finish(true);return;}
    if(!drag.active){if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<7)return;drag.active=true;const ghost=document.createElement('div');ghost.className='schedule-drag-ghost';ghost.setAttribute('aria-hidden','true');ghost.textContent=blocks().find(block=>block.id===drag.id)?.title||'';document.body.append(ghost);drag.ghost=ghost;drag.card.classList.add('schedule-dragging');}
    event.preventDefault();drag.ghost.style.left=`${event.clientX+12}px`;drag.ghost.style.top=`${event.clientY+12}px`;
    document.querySelectorAll('.schedule-drop-target').forEach(element=>element.classList.remove('schedule-drop-target'));
    const hovered=document.elementFromPoint(event.clientX,event.clientY),card=hovered?.closest('[data-schedule-card]');
    drag.targetId=card?.dataset.scheduleCard;
    if(drag.targetId===drag.id)drag.targetId=null;else card?.classList.add('schedule-drop-target');
    const timeline=document.querySelector('.schedule-timeline');if(timeline){const rect=timeline.getBoundingClientRect();if(event.clientX>=rect.left&&event.clientX<=rect.right){if(event.clientY>rect.bottom-45)timeline.scrollTop+=16;else if(event.clientY<rect.top+45)timeline.scrollTop-=16;}}
  });
  document.addEventListener('pointerup',event=>{if(event.pointerId===drag?.pointerId)finish();});
  document.addEventListener('pointercancel',event=>{if(event.pointerId===drag?.pointerId)finish(true);});
  document.addEventListener('lostpointercapture',event=>{if(event.pointerId===drag?.pointerId)finish(true);});
  window.addEventListener('blur',()=>finish(true));
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&drag){event.preventDefault();finish(true);return;}
    const handle=event.target.closest('[data-schedule-drag]');if(!handle||busy||!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();const items=blocks(),index=items.findIndex(block=>block.id===handle.dataset.scheduleDrag),next=items[index+(event.key==='ArrowUp'?-1:1)];if(next)move(items[index].id,next.id);
  });
  return {render,edit,openDate(date,scope){selectedDate=date;mode=scope||"exception";},afterRender(){const timeline=document.querySelector('.schedule-timeline');if(!timeline)return;const key=`${getTab().id}:${mode}:${selectedDate}`;if(scrollKey===key)timeline.scrollTop=scrollTop;else{scrollKey=key;scrollTop=0;timeline.scrollTop=0;}}};
}
