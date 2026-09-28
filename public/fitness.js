import { shiftDay,weekDays,dayAllowed } from './fitness-model.js';

export function createFitnessPanel({getData,getTab,api,icon,escape,show,toast,today,changed,onRender}) {
  let view='workouts',selectedDay=today(),drag=null,suppressClick=false;
  const pending=new Set();
  const records=()=>getData().items.filter(item=>item.tab_id===getTab()?.id);
  const dateLabel=date=>date.split('-').reverse().join('/');
  const button=(action,label,symbol='plus',id='',className='button secondary small',extra='')=>`<button type="button" class="${className}" data-fitness-action="${action}" data-id="${id}" aria-label="${escape(label)}" ${extra}>${icon(symbol)}${className.includes('icon-button')?'':escape(label)}</button>`;
  const dateField=(date=selectedDay)=>`<label class="field">Dia<input type="date" name="due_date" required min="2000-01-01" max="2099-12-31" value="${date}"></label>`;
  const exerciseRow=(exercise={})=>`<fieldset class="fitness-exercise-row" data-exercise-row><div class="fitness-exercise-head"><span>Exercício</span>${button('remove-exercise','Remover exercício','trash','','icon-button')}</div><label class="field">Nome do exercício<input name="exercise_name" required maxlength="160" value="${escape(exercise.name||'')}" placeholder="Ex.: agachamento"></label><div class="fitness-exercise-values"><label class="field">Séries<input name="exercise_sets" maxlength="80" placeholder="Ex.: 3" value="${escape(exercise.sets||'')}"></label><label class="field">Repetições / tempo<input name="exercise_reps" maxlength="80" placeholder="Ex.: 12 ou 30 s" value="${escape(exercise.reps||'')}"></label><label class="field">Carga<input name="exercise_load" maxlength="80" placeholder="Ex.: 10 kg" value="${escape(exercise.load||'')}"></label></div><label class="field">Vídeo de execução <span class="field-hint">Link opcional</span><input name="exercise_video_url" type="url" maxlength="4096" placeholder="https://…" value="${escape(exercise.video_url||'')}"></label><label class="field">Observações do exercício<input name="exercise_notes" maxlength="2000" value="${escape(exercise.notes||'')}" placeholder="Ex.: descanso de 60 s"></label></fieldset>`;
  function edit(item=null,date=selectedDay,kind='workout') {
    const workout=(item?.record_type||kind)==='workout',tabId=getTab().id;
    show(item?(workout?'Editar treino':'Editar refeição'):(workout?'Adicionar treino':'Registrar alimentação'),'',
      `<label class="field">${workout?'Nome do treino':'Refeição'}<input name="title" required maxlength="120" autofocus value="${escape(item?.title||'')}" placeholder="${workout?'Ex.: Treino A · pernas':'Ex.: café da manhã, almoço ou lanche'}"></label>
      <div class="field-row">${dateField(item?.due_date||date)}${workout?`<label class="fitness-attendance-field"><input name="completed" type="checkbox" ${item?.completed?'checked':''}>Fui ao treino</label>`:`<label class="field">Horário <span class="field-hint">Opcional</span><input name="meal_time" type="time" value="${item?.meal_time||''}"></label>`}</div>
      ${workout?`<section class="fitness-exercise-editor"><div class="fitness-editor-title"><h3>Exercícios</h3><span data-exercise-count></span></div><div id="fitness-exercise-fields">${(item?.exercises||[{}]).map(exerciseRow).join('')}</div>${button('add-exercise','Adicionar exercício')}</section>`:''}
      <label class="field">${workout?'Observações do treino':'O que você comeu'}<textarea name="notes" rows="4" maxlength="10000" ${workout?'':'required'} placeholder="${workout?'Detalhes do treino':'Ex.: arroz, feijão, frango e salada. Inclua as quantidades se quiser.'}">${escape(item?.notes||'')}</textarea></label>`,async(values,form)=>{
        const payload={...values,tab_id:tabId,record_type:workout?'workout':'meal',completed:workout&&form.elements.completed.checked};
        if(workout)payload.exercises=[...form.querySelectorAll('[data-exercise-row]')].map(row=>Object.fromEntries(['name','sets','reps','load','notes','video_url'].map(key=>[key,row.querySelector(`[name="exercise_${key}"]`).value])));
        await api(`/personal/items${item?'/'+item.id:''}`,{method:item?'PUT':'POST',body:JSON.stringify(payload)});
      });
    updateExerciseCount();
  }
  function updateExerciseCount(){const label=document.querySelector('[data-exercise-count]');if(label){const count=document.querySelectorAll('[data-exercise-row]').length;label.textContent=`${count} ${count===1?'exercício':'exercícios'}`;}}
  function workoutCard(item) {
    const busy=pending.has(item.id)?'disabled':'';
    return `<article class="fitness-workout ${item.completed?'fitness-completed':''}" data-workout-card="${item.id}"><div class="fitness-workout-head">${button('move',`Mover ${item.title} para outro dia`,'grip',item.id,'icon-button fitness-drag-handle',`data-workout-drag="${item.id}" title="Arraste para outro dia · Alt + setas" aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight" ${busy}`)}<div class="row-actions">${button('edit',`Editar ${item.title}`,'edit',item.id,'icon-button',busy)}${button('delete',`Excluir ${item.title}`,'trash',item.id,'icon-button',busy)}</div></div><h3>${escape(item.title)}</h3>
      <button type="button" class="fitness-attendance ${item.completed?'attended':''}" data-fitness-action="attend" data-id="${item.id}" aria-pressed="${item.completed}" ${busy}>${icon(item.completed?'check':'calendar')}${item.completed?'Fui':'Marcar que fui'}</button>
      <details class="fitness-exercises"><summary>${item.exercises.length} ${item.exercises.length===1?'exercício':'exercícios'}</summary><ol>${item.exercises.map(exercise=>`<li><strong>${escape(exercise.name)}</strong>${[exercise.sets?`${exercise.sets} séries`:'',exercise.reps?`${exercise.reps} rep./tempo`:'',exercise.load].filter(Boolean).length?`<small>${escape([exercise.sets?`${exercise.sets} séries`:'',exercise.reps?`${exercise.reps} rep./tempo`:'',exercise.load].filter(Boolean).join(' · '))}</small>`:''}${exercise.notes?`<p>${escape(exercise.notes)}</p>`:''}${exercise.video_url?`<a href="${escape(exercise.video_url)}" target="_blank" rel="noopener noreferrer">${icon('video')}Ver vídeo</a>`:''}</li>`).join('')}</ol></details>
      ${item.notes?`<p class="fitness-card-notes">${escape(item.notes)}</p>`:''}</article>`;
  }
  function render() {
    const days=weekDays(selectedDay),workouts=records().filter(item=>item.record_type==='workout'),thisWeek=workouts.filter(item=>days.includes(item.due_date));
    const meals=records().filter(item=>item.record_type==='meal'&&item.due_date===selectedDay).sort((a,b)=>(a.meal_time||'99:99').localeCompare(b.meal_time||'99:99')||a.id-b.id);
    return `<section class="fitness-panel"><div class="section-toolbar"><div><h2>${escape(getTab().name)}</h2></div><div class="personal-actions">${button(view==='workouts'?'new-workout':'new-meal',view==='workouts'?'Adicionar treino':'Registrar alimentação','plus','','button primary')}</div></div>
      <div class="fitness-toolbar"><div class="library-views" aria-label="Treino e alimentação"><button type="button" data-fitness-action="workouts" class="${view==='workouts'?'selected':''}" aria-pressed="${view==='workouts'}">${icon('dumbbell')}Treinos</button><button type="button" data-fitness-action="meals" class="${view==='meals'?'selected':''}" aria-pressed="${view==='meals'}">${icon('utensils')}Alimentação</button></div><div class="fitness-date-navigation">${button('previous',view==='workouts'?'Semana anterior':'Dia anterior','arrow','','icon-button fitness-back',!dayAllowed(shiftDay(selectedDay,view==='workouts'?-7:-1))?'disabled':'')}<label class="field">${view==='workouts'?'Semana de':'Dia'}<input id="fitness-date" type="date" min="2000-01-01" max="2099-12-31" value="${selectedDay}" required></label>${button('next',view==='workouts'?'Próxima semana':'Próximo dia','arrow','','icon-button',!dayAllowed(shiftDay(selectedDay,view==='workouts'?7:1))?'disabled':'')}${button('today','Hoje','calendar')}</div></div>
      ${view==='workouts'?`<div class="fitness-week-caption"><span>${dateLabel(days[0])} a ${dateLabel(days[6])}</span><span>${thisWeek.filter(item=>item.completed).length} de ${thisWeek.length} treinos realizados</span></div><p class="field-hint">Arraste pela alça para mudar o dia. Clique nela para escolher outra data.</p><div class="fitness-week-scroll"><div class="fitness-week">${days.map((day,index)=>`<section class="fitness-day ${day===today()?'fitness-today':''}" data-fitness-day="${day}" aria-label="${['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'][index]}, ${dateLabel(day)}"><div class="fitness-day-heading"><h3>${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'][index]}<span>${day.slice(8)}/${day.slice(5,7)}</span></h3>${button('new-workout',`Adicionar treino em ${dateLabel(day)}`,'plus','','icon-button',`data-date="${day}" ${dayAllowed(day)?'':'disabled'}`)}</div>${workouts.filter(item=>item.due_date===day).map(workoutCard).join('')||'<p class="fitness-day-empty">Sem treino</p>'}</section>`).join('')}</div></div>`:
      `<div class="fitness-meal-heading"><h3>${dateLabel(selectedDay)}</h3><span>${meals.length} ${meals.length===1?'refeição registrada':'refeições registradas'}</span></div>${meals.length?`<div class="fitness-meals">${meals.map(item=>`<article class="panel fitness-meal"><div class="personal-card-head"><span class="fitness-meal-time">${icon('utensils')}${item.meal_time||'Sem horário'}</span><div class="row-actions">${button('edit',`Editar ${item.title}`,'edit',item.id,'icon-button')}${button('delete',`Excluir ${item.title}`,'trash',item.id,'icon-button')}</div></div><h3>${escape(item.title)}</h3><p>${escape(item.notes)}</p></article>`).join('')}</div>`:'<section class="panel personal-empty"><h3>Nenhuma refeição registrada neste dia</h3></section>'}`}</section>`;
  }
  async function update(item,changes,message) {
    if(pending.has(item.id))return;pending.add(item.id);onRender();
    try{const saved=await api(`/personal/items/${item.id}`,{method:'PUT',body:JSON.stringify(changes)});changed(saved);toast(message);}
    catch(error){toast(error.message,true);}
    finally{pending.delete(item.id);onRender();}
  }
  function move(item,day){if(day===item.due_date||!dayAllowed(day))return;selectedDay=day;void update(item,{due_date:day},`Treino movido para ${dateLabel(day)}.`);}
  document.addEventListener('change',event=>{if(event.target.id==='fitness-date'&&event.target.value&&event.target.validity.valid){selectedDay=event.target.value;onRender();}});
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-fitness-action]');if(!target)return;
    if(suppressClick){event.preventDefault();event.stopImmediatePropagation();return;}
    const name=target.dataset.fitnessAction,item=records().find(item=>item.id===Number(target.dataset.id));
    if(name==='workouts'||name==='meals'){view=name;onRender();}
    else if(name==='new-workout')edit(null,target.dataset.date||selectedDay,'workout');
    else if(name==='new-meal')edit(null,selectedDay,'meal');
    else if(name==='edit'&&item)edit(item);
    else if(name==='delete'&&item)show(item.record_type==='workout'?'Excluir treino?':'Excluir refeição?',`“${item.title}” será removido.`, '',()=>api(`/personal/items/${item.id}`,{method:'DELETE'}),'Excluir');
    else if(name==='move'&&item)show('Mover treino',item.title,dateField(item.due_date),async values=>{await api(`/personal/items/${item.id}`,{method:'PUT',body:JSON.stringify({due_date:values.due_date})});selectedDay=values.due_date;});
    else if(name==='attend'&&item)void update(item,{completed:!item.completed},item.completed?'Presença desmarcada.':'Presença registrada.');
    else if(name==='previous'||name==='next'){const day=shiftDay(selectedDay,(name==='previous'?-1:1)*(view==='workouts'?7:1));if(dayAllowed(day)){selectedDay=day;onRender();}}
    else if(name==='today'){selectedDay=today();onRender();}
    else if(name==='add-exercise'){const fields=document.querySelector('#fitness-exercise-fields');fields.insertAdjacentHTML('beforeend',exerciseRow());fields.lastElementChild.querySelector('input').focus();updateExerciseCount();}
    else if(name==='remove-exercise'){target.closest('[data-exercise-row]').remove();updateExerciseCount();}
  },true);
  function finish(cancel=false){
    if(!drag)return;const current=drag;drag=null;
    if(current.handle.hasPointerCapture(current.pointerId))current.handle.releasePointerCapture(current.pointerId);
    current.ghost?.remove();current.card.classList.remove('fitness-dragging');document.querySelectorAll('.fitness-drop-target').forEach(el=>el.classList.remove('fitness-drop-target'));
    if(!current.active)return;
    suppressClick=true;setTimeout(()=>{suppressClick=false;},0);
    if(!cancel&&current.day)move(current.item,current.day);
  }
  document.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('[data-workout-drag]');if(!handle||drag||event.button!==0||!event.isPrimary)return;
    const item=records().find(item=>item.id===Number(handle.dataset.workoutDrag));if(!item||pending.has(item.id))return;
    drag={handle,item,card:handle.closest('[data-workout-card]'),pointerId:event.pointerId,x:event.clientX,y:event.clientY,active:false};handle.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    if(!drag.handle.isConnected){finish(true);return;}
    if(!drag.active){if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<7)return;drag.active=true;const ghost=document.createElement('div');ghost.className='fitness-drag-ghost';ghost.setAttribute('aria-hidden','true');ghost.textContent=drag.item.title;document.body.append(ghost);drag.ghost=ghost;drag.card.classList.add('fitness-dragging');}
    event.preventDefault();drag.ghost.style.left=`${event.clientX+12}px`;drag.ghost.style.top=`${event.clientY+12}px`;
    document.querySelectorAll('.fitness-drop-target').forEach(el=>el.classList.remove('fitness-drop-target'));
    const day=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-fitness-day]');drag.day=day?.dataset.fitnessDay;
    if(day&&dayAllowed(drag.day))day.classList.add('fitness-drop-target');else drag.day=null;
    const scroll=document.querySelector('.fitness-week-scroll');if(scroll){const rect=scroll.getBoundingClientRect();if(event.clientY>=rect.top&&event.clientY<=rect.bottom){if(event.clientX>rect.right-40)scroll.scrollLeft+=18;else if(event.clientX<rect.left+40)scroll.scrollLeft-=18;}}
  });
  document.addEventListener('pointerup',event=>{if(event.pointerId===drag?.pointerId)finish();});
  document.addEventListener('pointercancel',event=>{if(event.pointerId===drag?.pointerId)finish(true);});
  document.addEventListener('lostpointercapture',event=>{if(event.pointerId===drag?.pointerId)finish(true);});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&drag){event.preventDefault();finish(true);return;}
    const handle=event.target.closest('[data-workout-drag]');if(!handle||!event.altKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();const item=records().find(item=>item.id===Number(handle.dataset.workoutDrag));if(item)move(item,shiftDay(item.due_date,event.key==='ArrowLeft'?-1:1));
  });
  window.addEventListener('blur',()=>finish(true));
  return {render,edit,afterRender(){
    const scroll=document.querySelector('.fitness-week-scroll'),day=document.querySelector(`[data-fitness-day="${selectedDay}"]`);
    if(scroll&&day)scroll.scrollLeft+=day.getBoundingClientRect().left-scroll.getBoundingClientRect().left-10;
  }};
}
