import test from 'node:test';
import assert from 'node:assert/strict';
import { createDailyVerse } from '../lib/verse.js';

test('versículo diário: consulta Almeida uma vez ao dia, inclusive chamadas simultâneas',async()=>{
  let date=new Date(2026,8,20,12),calls=0;
  const daily=createDailyVerse({now:()=>date,fetchImpl:async url=>{
    calls++;const parts=new URL(url).pathname.split('/');
    return {ok:true,json:async()=>({translation:{identifier:'almeida'},verses:Array.from({length:176},(_,i)=>({book_id:parts[3],chapter:Number(parts[4]),verse:i+1,text:' Texto de teste. '}))})};
  }});
  const [a,b]=await Promise.all([daily(),daily()]);assert.deepEqual(a,b);assert.equal(calls,1);
  assert.equal(a.source,'api');assert.equal(a.text,'Texto de teste.');assert.equal(a.date,'2026-09-20');
  date=new Date(2026,8,21,0,1);const next=await daily();assert.equal(calls,2);assert.notEqual(next.reference,a.reference);
});
test('versículo diário: fallback local estável após falha, tradução errada ou resposta inválida',async()=>{
  for(const fetchImpl of [async()=>{throw new Error('offline');},async()=>({ok:false}),async()=>({ok:true,json:async()=>({translation:{identifier:'web'},verses:[]})}),async()=>({ok:true,json:async()=>({})})]){
    const daily=createDailyVerse({now:()=>new Date(2026,8,20,12),fetchImpl});
    const verse=await daily();assert.equal(verse.source,'local');assert.ok(verse.text.length>10);assert.ok(verse.reference);assert.deepEqual(await daily(),verse);
  }
});
