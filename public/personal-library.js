const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
export function matchesLibrarySearch(item,query){const text=normalize(`${item.title} ${item.notes} ${item.review||''}`);return normalize(query).trim().split(/\s+/).every(word=>text.includes(word));}
export function createPersonalLibrary({getData,getTab,api,icon,escape,action,show,changed,toast,dateLabel}){
  let view='general',folder=null,query='',status='all';
  const pending=new Set(),drafts=new Map(),openReviews=new Set();
  const currentFolders=()=>getData().folders.filter(f=>f.tab_id===getTab().id);
  const isMovie=()=>getTab().layout==='movies';
  const countLabel=(count,movie)=>count===1?(movie?'filme':'estudo'):(movie?'filmes':'estudos');
  const items=()=>getData().items.filter(i=>i.tab_id===getTab().id).sort((a,b)=>b.id-a.id);
  const filtered=()=>items().filter(i=>matchesLibrarySearch({...i,review:drafts.get(i.id)??i.review},query)&&(status==='all'||(status==='watched'?i.watched:!i.watched)));
  function card(i){
    const movie=isMovie(),draft=drafts.get(i.id)??i.review??'';
    return `<article class="panel library-card ${movie&&i.watched?'library-watched':''}" data-library-card="${i.id}"><div class="personal-card-head"><span class="transaction-icon">${icon(movie?'grid':'notebook')}</span><div class="row-actions">${action('edit-item',`Editar ${i.title}`,'edit',i.id,'icon-button')}${action('delete-item',`Excluir ${i.title}`,'trash',i.id,'icon-button')}</div></div>
      <h3>${escape(i.title)}</h3>${movie?`<button type="button" class="watch-toggle ${i.watched?'watched':'unwatched'}" data-library-action="watch" data-id="${i.id}" aria-pressed="${i.watched}" ${pending.has(i.id)?'disabled':''}>${icon(i.watched?'check':'eye')}${i.watched?'Assistido':'Não assistido'}</button>`:`<dl class="study-dates"><div><dt>Começar até</dt><dd>${dateLabel(i.start_date)}</dd></div><div><dt>Terminar até</dt><dd>${i.due_date?dateLabel(i.due_date):'Indefinido'}</dd></div></dl>`}
      ${i.notes?`<p class="library-notes">${escape(i.notes)}</p>`:''}
      ${!movie&&i.links?.length?`<div class="study-links" aria-label="Links de estudo">${i.links.map((link,index)=>`<a href="${escape(link)}" target="_blank" rel="noopener noreferrer">${icon('arrow')}<span><strong>Material ${index+1}</strong><small>${escape(link)}</small></span></a>`).join('')}</div>`:''}
      ${movie&&i.watched?`<details class="movie-review-disclosure" data-review-disclosure="${i.id}" ${openReviews.has(i.id)?'open':''}><summary aria-label="${openReviews.has(i.id)?'Ocultar':'Mostrar'} minha resenha" title="${openReviews.has(i.id)?'Ocultar':'Mostrar'} minha resenha"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></summary><div class="movie-review"><label for="movie-review-${i.id}">Minha resenha</label><textarea id="movie-review-${i.id}" data-review-id="${i.id}" rows="3" maxlength="20000" placeholder="O que você achou do filme?">${escape(draft)}</textarea><div><small data-review-status="${i.id}" role="status">${draft!==(i.review||'')?'Alterações não salvas':''}</small><button type="button" class="button secondary small" data-library-action="save-review" data-id="${i.id}" ${pending.has(i.id)?'disabled':''}>Salvar resenha</button></div></div></details>`:''}
      <label class="library-move">Pasta<select data-move-id="${i.id}" aria-label="Mover ${escape(i.title)} para pasta" ${pending.has(i.id)?'disabled':''}><option value="">Sem pasta</option>${currentFolders().map(f=>`<option value="${f.id}" ${i.folder_id===f.id?'selected':''}>${escape(f.name)}</option>`).join('')}</select></label></article>`.replace(/^\+/gm,'');
  }
  function results(){
    const movie=isMovie(),all=filtered();
    if(view==='folders'&&folder===null){
      const groups=[{id:0,name:'Sem pasta'},...currentFolders()];
      return `<div class="library-folder-grid">${groups.map(f=>{const count=all.filter(i=>(i.folder_id??0)===f.id).length;return `<section class="panel library-folder"><button type="button" data-library-action="open-folder" data-id="${f.id}">${icon('notebook')}<strong>${escape(f.name)}</strong><span>${count} ${countLabel(count,movie)}${query?' encontrados':''}</span></button>${f.id?`<div>${action('rename-folder',`Renomear ${f.name}`,'edit',f.id,'icon-button')}${action('delete-folder',`Excluir pasta ${f.name}`,'trash',f.id,'icon-button')}</div>`:''}</section>`;}).join('')}</div>`;
    }
    const records=view==='folders'?all.filter(i=>(i.folder_id??0)===folder):all;
    return `${view==='folders'?`<div class="library-breadcrumb"><button type="button" class="button secondary small" data-library-action="folders">${icon('arrow')}Todas as pastas</button><strong>${escape(currentFolders().find(f=>f.id===folder)?.name||'Sem pasta')}</strong></div>`:''}<p class="library-count">${records.length} ${countLabel(records.length,movie)}${view==='general'?' · adicionados mais recentemente primeiro':''}</p>${records.length?`<div class="library-grid">${records.map(card).join('')}</div>`:`<section class="panel personal-empty">${icon(movie?'grid':'notebook')}<h3>${query?'Nenhum resultado para essa busca':movie?'Sua lista de filmes começa aqui':'Organize seu próximo estudo'}</h3><p>${query?'Busque pelo nome, pelas observações ou pelas resenhas.':'Adicione um registro ou mova seus cartões para esta pasta.'}</p>${action('new-item',movie?'Adicionar filme':'Adicionar estudo')}</section>`}`;
  }
  function redraw(){const container=document.querySelector('#library-results');if(container)container.innerHTML=results();}
  function render(){
    if(folder&& !currentFolders().some(f=>f.id===folder))folder=null;
    const movie=isMovie();
    return `<div class="section-toolbar"><div><div class="library-section-title"><h2>${escape(getTab().name)}</h2>${action('rename-tab','Renomear aba','edit',getTab().id,'icon-button')}${action('delete-tab','Excluir aba','trash',getTab().id,'icon-button')}</div><p>${movie?'Sua lista, suas impressões e o que vem a seguir.':'Assuntos, prazos e materiais para aprender.'}</p></div><div class="personal-actions">${action('new-folder','Criar pasta','plus')}${action('new-item',movie?'Adicionar filme':'Adicionar estudo','plus','','button primary')}</div></div>
      <div class="library-toolbar"><div class="library-views" aria-label="Visualização"><button type="button" data-library-action="general" class="${view==='general'?'selected':''}" aria-pressed="${view==='general'}">${icon('grid')}Painel geral</button><button type="button" data-library-action="folders" class="${view==='folders'?'selected':''}" aria-pressed="${view==='folders'}">${icon('notebook')}Pastas</button></div><div class="search-box">${icon('search')}<input id="library-search" type="search" class="filter-input" aria-label="Buscar ${movie?'filmes':'estudos'}" placeholder="${movie?'Buscar nome, observações ou resenha…':'Buscar assunto ou observações…'}" value="${escape(query)}"></div>${movie?`<select class="filter-input" id="library-status" aria-label="Filtrar filmes"><option value="all">Todos os filmes</option><option value="unwatched" ${status==='unwatched'?'selected':''}>Não assistidos</option><option value="watched" ${status==='watched'?'selected':''}>Assistidos</option></select>`:''}</div><div id="library-results">${results()}</div>`.replace(/^\+/gm,'');
  }
  const linkRow=(link='')=>`<div class="study-link-input"><label class="field">Link<input type="url" name="study_link" aria-label="Link de estudo" placeholder="https://…" value="${escape(link)}" maxlength="4096"></label><button type="button" class="icon-button" data-library-action="remove-link" aria-label="Remover link">${icon('close')}</button></div>`;
  function edit(item=null){
    const movie=isMovie(),current=getTab(),folderId=item?.folder_id??(view==='folders'&&folder?folder:null);
    const dateField=(name,label,value)=>`<label class="field">${label}<input type="date" name="${name}" min="2000-01-01" max="2099-12-31" required value="${value||''}"></label>`;
    show(item?(movie?'Editar filme':'Editar estudo'):(movie?'Adicionar filme':'Adicionar estudo'),current.name,
      `<label class="field">${movie?'Nome do filme':'Assunto'}<input name="title" required maxlength="120" autofocus value="${escape(item?.title||'')}" placeholder="${movie?'Qual filme você quer assistir?':'O que você quer estudar?'}"></label>${movie?'':`<div class="field-row study-deadlines"><fieldset class="study-date-field">${dateField('start_date','Prazo para começar',item?.start_date)}</fieldset><fieldset id="study-end-date" class="study-date-field">${dateField('due_date','Prazo para terminar',item?.due_date)}</fieldset></div><label class="study-indefinite"><input type="checkbox" name="indefinite" id="study-indefinite" ${item&&!item.due_date?'checked':''}>Prazo indefinido para terminar</label><div class="study-link-editor"><span>Materiais de estudo</span><div id="study-link-fields">${(item?.links?.length?item.links:['']).map(linkRow).join('')}</div><button type="button" class="button secondary small" data-library-action="add-link">${icon('plus')}Adicionar outro link</button></div>`}
      <label class="field">Observações<textarea name="notes" rows="4" maxlength="10000" placeholder="${movie?'Gênero, indicação, sinopse ou palavras-chave…':'Objetivos, orientações ou detalhes do assunto…'}">${escape(item?.notes||'')}</textarea></label>
      <label class="field">Pasta<select name="folder_id"><option value="">Sem pasta</option>${currentFolders().map(f=>`<option value="${f.id}" ${f.id===folderId?'selected':''}>${escape(f.name)}</option>`).join('')}</select></label>`.replace(/^\+/gm,''),async(values,form)=>{
        const payload={...item,...values,tab_id:current.id,folder_id:values.folder_id?Number(values.folder_id):null};
        if(!movie&&form.querySelector('#study-indefinite').checked)payload.due_date=null;
        if(!movie)payload.links=[...form.querySelectorAll('[name=study_link]')].map(el=>el.value.trim()).filter(Boolean);
        if(!item){payload.amount=null;payload.cycle='once';payload.status='active';}
        await api(`/personal/items${item?'/'+item.id:''}`,{method:item?'PUT':'POST',body:JSON.stringify(payload)});
      });
    if(!movie)syncDeadline();
  }
  function syncDeadline(){
    const toggle=document.querySelector('#study-indefinite'),field=document.querySelector('#study-end-date');
    if(!toggle||!field)return;
    field.hidden=toggle.checked;field.disabled=toggle.checked;
    const input=field.querySelector('[name=due_date]');input.disabled=toggle.checked;input.required=!toggle.checked;
  }
  function folderModal(name,id){
    const f=currentFolders().find(f=>f.id===id);
    if(name==='delete-folder'&&f)show('Excluir pasta?',`A pasta “${f.name}” será removida. Os registros serão mantidos em Sem pasta.`,'',()=>api(`/personal/folders/${id}`,{method:'DELETE'}),'Excluir pasta');
    else show(f?'Renomear pasta':'Criar pasta',getTab().name,`<label class="field">Nome da pasta<input name="name" required maxlength="60" autofocus value="${escape(f?.name||'')}" placeholder="${isMovie()?'Ex.: Terror, ação, romance':'Ex.: Programação, idiomas'}"></label>`,values=>api(`/personal/folders${f?'/'+id:''}`,{method:f?'PUT':'POST',body:JSON.stringify({...values,tab_id:getTab().id})}));
  }
  async function update(id,changes){
    if(pending.has(id))return;pending.add(id);const card=document.querySelector(`[data-library-card="${id}"]`);card?.querySelectorAll('button,select').forEach(e=>e.disabled=true);
    try{const saved=await api(`/personal/items/${id}`,{method:'PUT',body:JSON.stringify(changes)});if(changes.review!==undefined&&drafts.get(id)===changes.review)drafts.delete(id);changed(saved);toast(changes.review!==undefined?'Resenha salva.':'Atualizado.');}
    catch(e){toast(e.message,true);}finally{pending.delete(id);redraw();}
  }
  document.addEventListener('toggle',e=>{
    const disclosure=e.target;if(!disclosure.matches?.('[data-review-disclosure]')||!disclosure.isConnected)return;
    const id=Number(disclosure.dataset.reviewDisclosure);
    if(disclosure.open)openReviews.add(id);else openReviews.delete(id);
    const summary=disclosure.querySelector('summary'),label=`${disclosure.open?'Ocultar':'Mostrar'} minha resenha`;
    summary.setAttribute('aria-label',label);summary.title=label;
  },true);
  document.addEventListener('input',e=>{
    if(e.target.id==='library-search'){query=e.target.value;redraw();}
    if(e.target.dataset.reviewId){const id=Number(e.target.dataset.reviewId);drafts.set(id,e.target.value);const label=document.querySelector(`[data-review-status="${id}"]`);if(label)label.textContent='Alterações não salvas';}
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='study-indefinite')syncDeadline();
    if(e.target.id==='library-status'){status=e.target.value;redraw();}
    if(e.target.dataset.moveId)void update(Number(e.target.dataset.moveId),{folder_id:e.target.value?Number(e.target.value):null});
  });
  document.addEventListener('click',e=>{
    const button=e.target.closest('[data-library-action]');if(!button)return;const name=button.dataset.libraryAction,id=Number(button.dataset.id);
    if(name==='add-link'){document.querySelector('#study-link-fields').insertAdjacentHTML('beforeend',linkRow());document.querySelector('#study-link-fields').lastElementChild.querySelector('input').focus();}
    else if(name==='remove-link')button.closest('.study-link-input').remove();
    else if(name==='watch'){const item=getData().items.find(i=>i.id===id);if(item)void update(id,{watched:!item.watched});}
    else if(name==='save-review')void update(id,{review:drafts.get(id)??getData().items.find(i=>i.id===id)?.review??''});
    else if(name==='general'||name==='folders'){view=name;folder=null;document.querySelector('.library-toolbar')?.querySelectorAll('.library-views button').forEach(el=>{const active=el.dataset.libraryAction===name;el.classList.toggle('selected',active);el.setAttribute('aria-pressed',active);});redraw();}
    else if(name==='open-folder'){folder=id;redraw();}
  });
  window.addEventListener('beforeunload',event=>{if([...drafts].some(([id,text])=>getData().items.some(i=>i.id===id&&text!==(i.review||'')))){event.preventDefault();event.returnValue='';}});
  return {render,edit,folderModal,reset(){view='general';folder=null;query='';status='all';openReviews.clear();}};
}
