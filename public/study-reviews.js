import { STUDY_INTERVALS,studySchedule,nextStudyReview,localStudyTime,studyPeriods } from './study-model.js';

export function createStudyReviews({getData,api,icon,escape,show,changed,redraw,toast}) {
  let session=null;
  const pending=new Set(),labels={pending:'A fazer',skipped:'Pulada',completed:'Concluída'};
  const time=value=>new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
  const button=(action,label,id,cls='button secondary small',extra='')=>`<button type="button" class="${cls}" data-study-action="${action}" data-id="${id}" ${extra}>${label}</button>`;
  const stagesFor=item=>STUDY_INTERVALS.map((interval,index)=>({index,label:interval.label,...studyPeriods(item)[index],...studySchedule(item)[index]}));
  function periods(item) {
    return `<div class="study-period-list">${stagesFor(item).map(stage=>button('period',`<span><strong>${stage.label}</strong><small>${stage.due_at?time(stage.due_at):'Após iniciar o estudo'}</small></span><span class="study-period-state ${stage.status}">${labels[stage.status]}${stage.comment?' · com anotação':''}</span>`,item.id,'study-period-button',`data-stage="${stage.index}"`)).join('')}</div>`;
  }
  function card(item) {
    const next=nextStudyReview(item),count=item.questions?.length||0,stages=studyPeriods(item),done=stages.filter(stage=>stage.status==='completed').length,skipped=stages.filter(stage=>stage.status==='skipped').length;
    return `<section class="study-review-summary"><div class="study-question-count"><strong>${count}</strong><span>${count===1?'pergunta cadastrada':'perguntas cadastradas'}</span></div><div class="study-review-heading"><strong>Revisões</strong>${button('menu',icon('plus'),item.id,'icon-button study-card-plus',`aria-label="Opções de ${escape(item.title)}" title="Perguntas, revisões e anotações"`)}</div><small>${done}/6 concluídas${skipped?` · ${skipped} ${skipped===1?'pulada':'puladas'}`:''}</small>${!item.studied_at?`<p>Revisões não iniciadas.</p>${button('start','Estudei agora',item.id)}`:`<p class="study-next ${next?.overdue?'study-due':''}">${next?`${next.overdue?'Revisão pendente':'Próxima revisão'} · ${next.label}<strong>${time(next.due_at)}</strong>`:'Nenhuma revisão a fazer'}</p>`}<details class="study-schedule"><summary>Períodos de revisão</summary>${periods(item)}</details></section>`;
  }
  const questionRow=(row={})=>`<fieldset class="study-question-input"><legend>Pergunta</legend><label class="field">Pergunta<textarea name="study_question" rows="2" required maxlength="5000">${escape(row.question||'')}</textarea></label><label class="field">Resposta · opcional<textarea name="study_answer" rows="2" maxlength="10000">${escape(row.answer||'')}</textarea></label>${button('remove-question',`${icon('trash')}Remover pergunta`,'')}</fieldset>`;
  function menu(item) {
    show('Opções do estudo',item.title,`<div class="study-menu-actions">${button('questions',`${icon('plus')}Adicionar pergunta`,item.id)}${button('review',`${icon('notebook')}Revisar conteúdo`,item.id)}</div><h3 class="study-period-title">Períodos de revisão</h3><p class="field-hint">Clique em um período para adicionar anotações, revisar ou mudar a situação.</p>${periods(item)}`,async()=>{},'Fechar');
    document.querySelector('#personal-form [type=submit]').hidden=true;
  }
  function questions(item) {
    show('Perguntas do estudo',item.title,`<div id="study-question-fields">${[...(item.questions||[]),{}].map(questionRow).join('')}</div>${button('add-question',`${icon('plus')}Adicionar outra pergunta`,'')}`,async(_values,form)=>{
      const questions=[...form.querySelectorAll('.study-question-input')].map(row=>({question:row.querySelector('[name=study_question]').value.trim(),answer:row.querySelector('[name=study_answer]').value.trim()}));
      await api(`/personal/items/${item.id}`,{method:'PUT',body:JSON.stringify({questions})});
    },'Salvar perguntas');
    document.querySelector('#study-question-fields').lastElementChild.querySelector('textarea').focus();
  }
  function editor(item) {
    const value=item?.studied_at?localStudyTime(item.studied_at):'';
    return `<section class="study-review-editor"><h3>Revisões</h3><label class="field">Estudado em<input type="datetime-local" name="studied_at" min="2000-01-01T00:00" max="2099-12-31T23:59" value="${value}"></label><p class="field-hint">Deixe em branco se ainda não começou. Depois, use o + no cartão para adicionar perguntas e anotações.${studyPeriods(item||{}).some(period=>period.status!=='pending')?' Alterar a data reinicia as situações das revisões e mantém as anotações.':''}</p><div class="study-intervals">${STUDY_INTERVALS.map(interval=>`<span>${interval.label}</span>`).join('')}</div><div id="study-schedule-preview" class="field-hint" aria-live="polite"></div></section>`;
  }
  function readEditor(item,form) {
    const value=form.querySelector('[name=studied_at]').value;
    return {studied_at:value?(item?.studied_at&&localStudyTime(item.studied_at)===value?item.studied_at:new Date(value).toISOString()):null};
  }
  function preview() {
    const input=document.querySelector('#personal-form [name=studied_at]'),target=document.querySelector('#study-schedule-preview');
    if(!input||!target)return;
    const date=input.value?new Date(input.value):null;
    target.textContent=date&&Number.isFinite(date.getTime())?`Primeira revisão: ${time(nextStudyReview({studied_at:date.toISOString()}).due_at)}`:'As revisões começam quando você registrar a data do estudo.';
  }
  function drawQuestion() {
    const target=document.querySelector('#study-flashcard');if(!target||!session)return;
    const {questions,index,revealed}=session,row=questions[index],visible=revealed.has(index);
    target.innerHTML=`<div class="study-flashcard-count" aria-live="polite">Pergunta ${index+1} de ${questions.length}</div><p class="study-question-text">${escape(row.question)}</p>${visible?`<div class="study-answer" role="status"><strong>Resposta</strong><p>${escape(row.answer||'Resposta não cadastrada.')}</p></div>`:''}${button('reveal',visible?'Ocultar resposta':'Mostrar resposta','','button secondary')}<div class="study-flashcard-navigation"><button type="button" class="button secondary small" data-study-action="previous" ${index===0?'disabled':''}>Anterior</button><button type="button" class="button secondary small" data-study-action="next" ${index===questions.length-1?'disabled':''}>Próxima</button></div>`;
  }
  function review(item,index=nextStudyReview(item)?.index??0) {
    const stage=stagesFor(item)[index];if(!stage)return;
    const questions=item.questions||[];session={questions,index:0,revealed:new Set()};
    show(`Revisão · ${stage.label}`,item.title,`${stage.due_at?`<p class="field-hint">Prazo: ${time(stage.due_at)}</p>`:'<p class="field-hint">Você pode preparar as anotações agora. Use Estudei agora no cartão para iniciar os prazos.</p>'}${item.notes?`<section class="study-review-notes"><h3>Anotações do estudo</h3><p>${escape(item.notes)}</p></section>`:''}<label class="field">Anotações deste período<textarea name="comment" rows="4" maxlength="10000" placeholder="Registre o que quer lembrar nesta revisão…">${escape(stage.comment)}</textarea></label>${item.links?.length?`<div class="study-links">${item.links.map((url,i)=>`<a target="_blank" rel="noopener noreferrer" href="${escape(url)}">Material ${i+1}</a>`).join('')}</div>`:''}${questions.length?'<div id="study-flashcard"></div>':'<p class="field-hint">Nenhuma pergunta cadastrada. Adicione pelo + do cartão.</p>'}<label class="field">Situação da revisão<select name="review_status" aria-label="Situação da revisão">${Object.entries(labels).map(([value,label])=>`<option value="${value}" ${stage.status===value?'selected':''} ${!item.studied_at&&value!=='pending'?'disabled':''}>${label}</option>`).join('')}</select></label>`,async(values)=>{
      await api(`/personal/items/${item.id}/review`,{method:'POST',body:JSON.stringify({action:'set',stage:index,status:values.review_status,comment:values.comment})});
    },'Salvar revisão');
    if(questions.length)drawQuestion();
  }
  async function start(item) {
    if(pending.has(item.id))return;pending.add(item.id);
    try{const saved=await api(`/personal/items/${item.id}`,{method:'PUT',body:JSON.stringify({studied_at:new Date().toISOString()})});changed(saved);redraw();toast('Revisões programadas.');}
    catch(error){toast(error.message,true);}finally{pending.delete(item.id);}
  }
  document.addEventListener('change',event=>{if(event.target.matches('#personal-form [name=studied_at]'))preview();});
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-study-action]');if(!target)return;
    const action=target.dataset.studyAction,item=getData().items.find(item=>item.id===Number(target.dataset.id));
    if(action==='add-question'){const fields=document.querySelector('#study-question-fields');fields.insertAdjacentHTML('beforeend',questionRow());fields.lastElementChild.querySelector('textarea').focus();}
    else if(action==='remove-question')target.closest('.study-question-input').remove();
    else if(action==='start'&&item)void start(item);
    else if(action==='menu'&&item)menu(item);
    else if(action==='questions'&&item)questions(item);
    else if(action==='review'&&item)review(item);
    else if(action==='period'&&item)review(item,Number(target.dataset.stage));
    else if(session&&document.querySelector('#study-flashcard')){
      if(action==='reveal'){if(session.revealed.has(session.index))session.revealed.delete(session.index);else session.revealed.add(session.index);}
      else if(action==='previous')session.index=Math.max(0,session.index-1);
      else if(action==='next')session.index=Math.min(session.questions.length-1,session.index+1);
      else return;
      drawQuestion();document.querySelector('#study-flashcard [data-study-action="reveal"]')?.focus();
    }
  });
  return {card,editor,readEditor,preview};
}
