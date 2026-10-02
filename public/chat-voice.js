export function attachChatVoice({button,input,hint,onError,Recognition=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition}){
  let recognizer=null,listening=false,acceptResults=false;
  const stop=()=>{acceptResults=false;recognizer?.abort();};
  if(!Recognition){button.disabled=true;button.title='Ditado indisponível neste navegador';hint.textContent='Ditado indisponível neste navegador. Você pode usar o ditado do teclado.';return {stop};}
  hint.textContent='Ditar usa o reconhecimento do navegador, que pode enviar áudio ao seu serviço. Revise o texto e envie.';
  button.addEventListener('click',()=>{
    if(input.disabled)return;
    if(listening){recognizer.stop();return;}
    const before=input.value.trim(),parts=new Map();
    recognizer=new Recognition();acceptResults=true;recognizer.lang='pt-BR';recognizer.continuous=false;recognizer.interimResults=false;
    recognizer.onstart=()=>{listening=true;button.textContent='Parar ditado';button.setAttribute('aria-pressed','true');};
    recognizer.onresult=event=>{
      if(!acceptResults||input.disabled)return;
      for(let index=event.resultIndex;index<event.results.length;index++)if(event.results[index].isFinal)parts.set(index,event.results[index][0].transcript.trim());
      input.value=[before,...parts.values()].filter(Boolean).join(' ').slice(0,input.maxLength>0?input.maxLength:2000);input.focus();
    };
    recognizer.onerror=event=>{if(event.error!=='aborted')onError(event.error==='not-allowed'?'O microfone não foi autorizado. Permita o acesso no navegador ou digite a mensagem.':event.error==='no-speech'?'Não ouvi a mensagem. Tente ditar novamente.':'O ditado não está disponível agora. Digite a mensagem ou tente em outro navegador.');};
    recognizer.onend=()=>{listening=false;button.textContent='Ditar';button.setAttribute('aria-pressed','false');};
    try{recognizer.start();}catch{listening=false;onError('Não foi possível iniciar o ditado neste navegador.');}
  });
  return {stop};
}
