import { attachChatVoice } from './chat-voice.js';
export function createChat({api,icon,escape,today,onSaved,onOpenMeal,onOpenRecord}){
  const launch=document.querySelector('#chat-launcher'),dialog=document.querySelector('#chat-dialog');
  let messages=[],status=null,mode='chat',sending=false,pending=null,loading=false,configuring=false;
  launch.innerHTML=`${icon('chat')}<span>Assistente</span>`;
  dialog.innerHTML=`<header class="chat-header"><div><h2 id="chat-title">Assistente</h2><p id="chat-status">Carregando…</p></div><button type="button" class="icon-button" data-chat="close" aria-label="Fechar chat">${icon('close')}</button></header>
    <div class="chat-info"><p id="chat-info"></p><button type="button" class="link-button" data-chat="configure">Configurar IA</button></div>
    <form id="chat-config-form" class="chat-config" hidden>
      <h3>Conectar à Groq</h3><p>A chave será salva no servidor para sua conta. O teste envia apenas uma mensagem de conexão à Groq. Com a IA ativa, suas mensagens e os dados da sua conta necessários para responder ou cadastrar serão enviados à Groq.</p>
      <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">Criar uma chave na Groq ↗</a>
      <label for="chat-api-key">Chave da API Groq</label><input id="chat-api-key" type="password" maxlength="512" autocomplete="off" spellcheck="false" placeholder="Cole sua chave aqui" required>
      <div class="chat-config-actions"><button type="button" class="button secondary small" data-chat="cancel-config">Voltar</button><button type="submit" class="button primary small" id="chat-config-save">Testar e ativar IA</button></div>
      <button type="button" class="link-button" data-chat="local">Usar somente o registro sem IA</button>
      <p id="chat-config-result" role="status"></p>
    </form>
    <div class="chat-history" id="chat-history" role="log" aria-label="Conversa" aria-live="polite"></div>
    <p id="chat-error" class="chat-error" role="alert" hidden></p>
    <form id="chat-form" class="chat-composer"><div class="chat-modes" aria-label="Tipo de mensagem"><button type="button" data-chat-mode="chat" aria-pressed="true">Conversar</button><button type="button" data-chat-mode="meal" aria-pressed="false">${icon('utensils')}Anotar refeição</button></div>
    <label for="chat-message">Sua mensagem</label><textarea id="chat-message" rows="3" maxlength="2000" required placeholder="Ex.: registre R$ 35 de mercado hoje ou crie uma tarefa para amanhã"></textarea>
    <div class="chat-compose-footer"><small id="chat-hint">Enter envia · Shift + Enter quebra a linha</small><button type="button" class="button secondary small" id="chat-voice" aria-label="Ditar mensagem" aria-pressed="false">Ditar</button><button type="submit" class="button primary" id="chat-send">Enviar ${icon('arrow')}</button></div><small id="chat-voice-hint" class="chat-voice-hint"></small></form>`;
  const history=dialog.querySelector('#chat-history'),form=dialog.querySelector('#chat-form'),input=dialog.querySelector('#chat-message'),error=dialog.querySelector('#chat-error');
  const configForm=dialog.querySelector('#chat-config-form'),keyInput=dialog.querySelector('#chat-api-key'),configResult=dialog.querySelector('#chat-config-result');
  const voice=attachChatVoice({button:dialog.querySelector('#chat-voice'),input,hint:dialog.querySelector('#chat-voice-hint'),onError:showError});
  const dateLabel=date=>date.split('-').reverse().join('/');
  function render(){
    dialog.querySelector('#chat-status').textContent=status?.label||'Carregando…';
    dialog.querySelector('#chat-info').textContent=status?.enabled?'Posso consultar e cadastrar em todas as áreas da sua conta. Suas mensagens e os dados consultados são enviados à Groq.':status?'A IA ainda não está ativada. Use “Ativar IA com minha chave” para conectar sua chave da Groq. Sem a chave, apenas o registro simples de refeições funciona.':'';
    dialog.querySelector('[data-chat="configure"]').textContent=status?.enabled?'Configurar IA':'Ativar IA com minha chave';
    history.innerHTML=messages.length?messages.map(turn=>`<article class="chat-turn"><div class="chat-bubble chat-user"><small>Você</small><p>${escape(turn.message)}</p></div><div class="chat-bubble chat-assistant"><small>${turn.source==='groq'?'Persona · IA':'Persona · modo local'}</small><p>${escape(turn.reply)}</p>${turn.meal?`<section class="chat-meal"><strong>${icon('utensils')}${escape(turn.meal.title)}</strong><small>${dateLabel(turn.meal.due_date)}${turn.meal.meal_time?' · '+escape(turn.meal.meal_time):''}</small><p>${escape(turn.meal.notes)}</p>${turn.meal_id?`<button type="button" class="button secondary small" data-chat-meal="${turn.meal.due_date}">Ver em Alimentação ${icon('arrow')}</button>`:'<small>O registro foi excluído ou substituído por uma restauração.</small>'}</section>`:''}</div></article>`).join(''):`<div class="chat-empty">${icon('chat')}<h3>O que você comeu?</h3><p>Escreva uma refeição por mensagem. Ela fica salva na alimentação da sua conta.</p><button type="button" class="button secondary small" data-chat="example">Anotar minha refeição</button></div>`;
    if(sending)history.insertAdjacentHTML('beforeend','<p class="chat-wait" role="status">Processando sua mensagem…</p>');
    for(const [index,turn] of messages.entries()){
      const bubble=history.querySelectorAll('.chat-assistant')[index];
      if(bubble&&turn.meal?.nutrition){const n=turn.meal.nutrition;bubble.querySelector('.chat-meal p').insertAdjacentHTML('afterend',`<div class="chat-nutrition"><strong>Estimativa da refeição</strong><span>Proteínas: ≈ ${Number(n.protein_g).toLocaleString('pt-BR')} g · Carboidratos: ≈ ${Number(n.carbs_g).toLocaleString('pt-BR')} g</span><small>${escape(n.portion_note)}</small></div>`);}
      if(bubble&&turn.actions?.length)bubble.insertAdjacentHTML('beforeend',turn.actions.map((action,actionIndex)=>`<section class="chat-meal"><strong>${icon('check')}${escape(action.label)}</strong><p>${escape(action.title)}</p><button type="button" class="button secondary small" data-chat-record="${index}:${actionIndex}">Abrir registro ${icon('arrow')}</button></section>`).join(''));
    }
    if(!messages.length&&status?.enabled)history.querySelector('.chat-empty').innerHTML=`${icon('chat')}<h3>O que vamos organizar?</h3><p>Peça para cadastrar uma despesa, criar uma tarefa, adicionar um estudo, montar um treino ou incluir horários no cronograma. Também posso consultar seus registros.</p>`;
    history.scrollTop=history.scrollHeight;
    dialog.querySelector('#chat-send').disabled=sending||loading||configuring;
    input.disabled=sending||loading||configuring;
    for(const button of dialog.querySelectorAll('[data-chat-mode]')){button.disabled=sending;button.setAttribute('aria-pressed',String(button.dataset.chatMode===mode));}
    dialog.querySelector('#chat-hint').textContent=mode==='meal'?'Será salvo em Alimentação · uma refeição por mensagem':'Enter envia · Shift + Enter quebra a linha';
  }
  function showError(message){error.textContent=message;error.hidden=false;}
  async function refresh(){
    loading=true;render();
    try{const data=await api('/chat');messages=data.messages;status=data.status;error.hidden=true;}
    catch(failure){showError(failure.message);}
    finally{loading=false;render();}
  }
  launch.addEventListener('click',async()=>{dialog.showModal();await refresh();if(!sending)input.focus();});
  function showConfiguration(open){voice.stop();configForm.hidden=!open;history.hidden=open;form.hidden=open;if(open){configResult.textContent='';keyInput.focus();}else{keyInput.value='';input.focus();}}
  async function configure(provider){
    if(sending||configuring)return;
    configuring=true;configResult.textContent=provider==='groq'?'Testando a conexão com a Groq…':'Atualizando…';
    for(const button of configForm.querySelectorAll('button'))button.disabled=true;
    keyInput.disabled=true;render();
    try{
      const data=await api('/chat/config',{method:'POST',body:JSON.stringify({provider,key:keyInput.value.trim()}),signal:AbortSignal.timeout(35000)});
      status=data.status;keyInput.value='';error.hidden=true;showConfiguration(false);
    }catch(failure){configResult.textContent=failure.name==='TimeoutError'?'O teste demorou. Tente novamente.':failure.message;}
    finally{configuring=false;keyInput.disabled=false;for(const button of configForm.querySelectorAll('button'))button.disabled=false;render();}
  }
  configForm.addEventListener('submit',event=>{event.preventDefault();configure('groq');});
  dialog.addEventListener('close',()=>{keyInput.value='';voice.stop();});
  dialog.addEventListener('click',async event=>{
    const target=event.target.closest('button');if(!target)return;
    if(target.dataset.chat==='close')dialog.close();
    else if(target.dataset.chat==='configure'&&!sending&&!configuring)showConfiguration(true);
    else if(target.dataset.chat==='cancel-config')showConfiguration(false);
    else if(target.dataset.chat==='local')await configure('local');
    else if(target.dataset.chat==='example'){mode='meal';render();input.focus();}
    else if(target.dataset.chatMode){mode=target.dataset.chatMode;render();input.focus();}
    else if(target.dataset.chatMeal){try{await onOpenMeal(target.dataset.chatMeal);dialog.close();}catch(failure){showError(failure.message);}}
    else if(target.dataset.chatRecord){try{const [turn,index]=target.dataset.chatRecord.split(':').map(Number);await onOpenRecord(messages[turn].actions[index]);dialog.close();}catch(failure){showError(failure.message);}}
  });
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit();}});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(sending||loading||!input.value.trim())return;
    const message=input.value.trim();
    voice.stop();
    if(!pending||pending.message!==message||pending.mode!==mode)pending={id:crypto.randomUUID(),message,mode,local_date:today()};
    sending=true;error.hidden=true;render();
    try{
      const turn=await api('/chat',{method:'POST',body:JSON.stringify(pending),signal:AbortSignal.timeout(110000)});
      messages=[...messages.filter(row=>row.id!==turn.id),turn].slice(-50);input.value='';pending=null;
      if(turn.meal_id||turn.actions?.length)await onSaved();
    }catch(failure){showError(failure.name==='TimeoutError'?'A resposta demorou. Envie novamente para conferir o resultado sem duplicar o registro.':failure.message);}
    finally{sending=false;render();if(dialog.open)input.focus();}
  });
}
