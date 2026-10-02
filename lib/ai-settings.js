import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAiProvider } from './ai.js';

const defaultModel='openai/gpt-oss-120b';
export function createAiSettings({directory=null,fallback,AppError,providerFactory=config=>createAiProvider({config,AppError}),now=()=>Date.now()}){
  const providers=new Map(),active=new Set(),attempts=new Map();
  function account(id){if(!['bruno','ana'].includes(id))throw new AppError('Conta não autorizada.',403);return id;}
  function validate(raw){
    if(!raw||!['local','groq'].includes(raw.provider))throw new AppError('Selecione uma configuração válida.');
    if(raw.provider==='local')return {provider:'local',model:defaultModel,key:''};
    if(typeof raw.key!=='string'||raw.key.trim().length<20||raw.key.trim().length>512||/\s/.test(raw.key.trim()))throw new AppError('Cole uma chave válida da Groq.');
    return {provider:'groq',model:defaultModel,key:raw.key.trim()};
  }
  function provider(id){
    account(id);
    if(!providers.has(id)){
      let saved=null;
      if(directory){try{saved=validate(JSON.parse(readFileSync(join(directory,`${id}.json`),'utf8')));}catch(error){if(error.code!=='ENOENT')throw new AppError('Não foi possível ler a configuração da IA desta conta. Confira o arquivo no servidor.',503);}}
      providers.set(id,saved?providerFactory(saved):fallback);
    }
    return providers.get(id);
  }
  function persist(id,config){
    if(!directory)return;
    mkdirSync(directory,{recursive:true,mode:0o700});
    const temporary=join(directory,`.${id}-${randomUUID()}.tmp`);
    try{writeFileSync(temporary,JSON.stringify(config),{mode:0o600,flag:'wx',flush:true});renameSync(temporary,join(directory,`${id}.json`));}
    finally{try{unlinkSync(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}}
  }
  return {
    provider,
    async configure(id,raw){
      account(id);
      if(active.has(id))throw new AppError('Aguarde o teste da conexão em andamento.',409);
      const recent=(attempts.get(id)||[]).filter(at=>now()-at<60000);
      if(recent.length>=5)throw new AppError('Aguarde um minuto antes de testar outra chave.',429);
      attempts.set(id,[...recent,now()]);
      const config=validate(raw),candidate=providerFactory(config);
      active.add(id);
      try{
        if(config.provider==='groq'){
          const result=await candidate.reply({message:'Responda apenas: Conexão funcionando.',mode:'chat',local_date:new Date().toISOString().slice(0,10)},[],false);
          if(!result.reply?.trim()||result.meal!==null||result.actions?.length||result.reads?.length)throw new AppError('A IA não respondeu corretamente ao teste. A configuração anterior foi mantida.',502);
        }
        persist(id,config);providers.set(id,candidate);
        return candidate.status();
      }finally{active.delete(id);}
    }
  };
}
