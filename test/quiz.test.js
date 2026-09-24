import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuiz} from '../lib/quiz.js';
import {createApp} from '../server.js';
const result={response_code:0,results:[{question:'What%20is%202%2B2%3F',category:'Math',correct_answer:'4',incorrect_answers:['1','2','3']}]};
test('quiz decodes answers, caches and shares concurrent requests',async()=>{
  let calls=0,time=0;
  const quiz=createQuiz({now:()=>time,fetchImpl:async()=>{calls++;return {ok:true,json:async()=>result};}});
  const [a,b]=await Promise.all([quiz(),quiz()]);assert.deepEqual(a,b);assert.equal(calls,1);
  const q=a.questions[0];assert.equal(q.question,'What is 2+2?');assert.equal(q.answers[q.correct],'4');assert.equal(new Set(q.answers).size,4);
  await quiz();assert.equal(calls,1);time=600001;await quiz();assert.equal(calls,2);
});
test('quiz handles rate limits and invalid content, retrying after cooldown',async()=>{
  for(const data of [{response_code:5}, {...result,results:[{...result.results[0],question:'%ZZ'}]}]){
    let calls=0,time=0;const quiz=createQuiz({now:()=>time,fetchImpl:async()=>{calls++;return {ok:true,json:async()=>calls===1?data:result};}});
    assert.equal((await quiz()).unavailable,true);await quiz();assert.equal(calls,1);
    time=30001;assert.equal((await quiz()).questions.length,1);
  }
  const quiz=createQuiz({fetchImpl:async()=>{throw new Error('offline');}});assert.equal((await quiz()).unavailable,true);
});
test('quiz endpoint serves questions through local backend',async t=>{
  const {server}=createApp({databasePath:':memory:',quiz:async()=>({questions:['sample']})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/quiz`);assert.equal(response.status,200);assert.deepEqual(await response.json(),{questions:['sample']});
});
