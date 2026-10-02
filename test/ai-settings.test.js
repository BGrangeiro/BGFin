import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,existsSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,relative,isAbsolute } from 'node:path';
import { createAiSettings } from '../lib/ai-settings.js';
import { createAiProvider } from '../lib/ai.js';
import { AppError } from '../lib/database.js';
import { createApp,testPassword } from '../support/http-fixture.js';

const key='test-key-not-a-real-credential-123456';
const fallback=()=>createAiProvider({config:{provider:'local',model:'test',key:''},AppError});
const fake=config=>({status:()=>({enabled:config.provider==='groq',provider:config.provider,model:config.model,label:config.provider==='groq'?'IA · Groq':'Modo local · sem IA'}),reply:async()=>({reply:'Conexão funcionando.',meal:null})});

test('configuração testa antes de ativar, persiste por conta e não devolve a chave',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'persona-ai-'));let reject=false,seen;
  const providerFactory=config=>({...fake(config),reply:async(...args)=>{seen=args;if(reject)throw new AppError('Chave recusada.',502);return {reply:'Conexão funcionando.',meal:null};}});
  try{
    const settings=createAiSettings({directory,fallback:fallback(),providerFactory,AppError});
    reject=true;await assert.rejects(settings.configure('bruno',{provider:'groq',key}));assert.equal(existsSync(join(directory,'bruno.json')),false);assert.equal(settings.provider('bruno').status().enabled,false);
    reject=false;const status=await settings.configure('bruno',{provider:'groq',key});assert.equal(status.enabled,true);assert.equal(JSON.stringify(status).includes(key),false);assert.deepEqual(seen[1],[]);assert.equal(seen[2],false);assert.equal(seen[0].message,'Responda apenas: Conexão funcionando.');
    assert.equal(JSON.parse(readFileSync(join(directory,'bruno.json'))).key,key);
    const reopened=createAiSettings({directory,fallback:fallback(),providerFactory,AppError});assert.equal(reopened.provider('bruno').status().enabled,true);assert.equal(reopened.provider('ana').status().enabled,false);
    reject=true;await assert.rejects(reopened.configure('bruno',{provider:'groq',key:key+'bad'}));assert.equal(reopened.provider('bruno').status().enabled,true);assert.equal(JSON.parse(readFileSync(join(directory,'bruno.json'))).key,key);
    await reopened.configure('bruno',{provider:'local'});assert.equal(reopened.provider('bruno').status().enabled,false);assert.equal(JSON.parse(readFileSync(join(directory,'bruno.json'))).key,'');
  }finally{const child=relative(tmpdir(),directory);assert.ok(child.startsWith('persona-ai-')&&!child.includes('..')&&!isAbsolute(child));rmSync(directory,{recursive:true,force:true});}
});

test('configuração bloqueia conta inválida, excesso de testes e respostas inválidas',async()=>{
  const settings=createAiSettings({fallback:fallback(),providerFactory:fake,AppError});
  await assert.rejects(settings.configure('../bruno',{provider:'groq',key}),error=>error.status===403);
  for(let i=0;i<5;i++)await assert.rejects(settings.configure('bruno',{provider:'groq',key:'invalid'}));
  await assert.rejects(settings.configure('bruno',{provider:'groq',key}),error=>error.status===429);
  const bad=createAiSettings({fallback:fallback(),providerFactory:config=>({...fake(config),reply:async()=>({reply:'',meal:null})}),AppError});
  await assert.rejects(bad.configure('bruno',{provider:'groq',key}));assert.equal(bad.provider('bruno').status().enabled,false);
});

test('API de ativação exige sessão e mesma origem; chat usa a configuração apenas da conta atual',async t=>{
  let calls=0;
  const {server,fetch}=createApp({databasePath:':memory:',aiProvider:fallback(),aiProviderFactory:config=>({...fake(config),reply:async()=>{calls++;return {reply:'Resposta da IA de teste.',meal:null};}})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`,options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'groq',key})};
  assert.equal((await globalThis.fetch(base+'/api/chat/config',options)).status,401);
  assert.equal((await fetch(base+'/api/chat/config',{...options,headers:{...options.headers,Origin:'https://example.com'}})).status,403);
  const response=await fetch(base+'/api/chat/config',options);assert.equal(response.status,200);const status=await response.json();assert.equal(status.status.enabled,true);assert.equal(JSON.stringify(status).includes(key),false);assert.equal(calls,1);
  const message=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'cbb11a6d-32ee-4cd2-b4ac-9b15a44c0a32',message:'Olá!',mode:'chat',local_date:'2026-09-30'})});
  assert.equal((await message.json()).source,'groq');assert.equal(calls,2);
  assert.equal(JSON.stringify(await(await fetch(base+'/api/backup')).json()).includes(key),false);
  const login=await globalThis.fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'Ana',password:testPassword})});const cookie=login.headers.get('set-cookie').split(';')[0];
  const ana=await(await globalThis.fetch(base+'/api/chat',{headers:{Cookie:cookie}})).json();assert.equal(ana.status.enabled,false);assert.equal(ana.messages.length,0);
  assert.equal((await fetch(base+'/data/ai-config/bruno.json')).status,404);
});
