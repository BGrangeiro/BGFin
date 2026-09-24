export function createQuiz({fetchImpl=fetch,now=Date.now}={}) {
  let cache,expires=0,pending;
  return async function quiz(){
    if(cache&&now()<expires)return cache;
    if(pending)return pending;
    pending=(async()=>{
      try{
        const response=await fetchImpl('https://opentdb.com/api.php?amount=20&type=multiple&encode=url3986',{signal:AbortSignal.timeout(8000)});
        if(!response.ok)throw new Error('Serviço indisponível');
        const data=await response.json();
        if(data.response_code!==0||!Array.isArray(data.results)||!data.results.length)throw new Error('Sem perguntas');
        const decode=value=>{if(typeof value!=='string'||!value||value.length>6000)throw new Error('Pergunta inválida');return decodeURIComponent(value);};
        const questions=data.results.map(q=>{
          if(!Array.isArray(q.incorrect_answers)||q.incorrect_answers.length!==3)throw new Error('Alternativas inválidas');
          const correct=decode(q.correct_answer),answers=[correct,...q.incorrect_answers.map(decode)];
          for(let i=answers.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[answers[i],answers[j]]=[answers[j],answers[i]];}
          return {question:decode(q.question),category:decode(q.category),answers,correct:answers.indexOf(correct)};
        });
        cache={questions};expires=now()+10*60*1000;
      }catch{
        cache={questions:[],unavailable:true};expires=now()+30000;
      }
      return cache;
    })();
    try{return await pending;}finally{pending=null;}
  };
}
