import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration='202610140001_attempt_shuffle.sql',student='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
test('new-attempt shuffle, immutable resume, legacy compatibility and privacy',async t=>{
 const db=new PGlite();try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;");
  for(const f of fs.readdirSync('supabase/migrations').sort().filter(f=>f<migration))await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)',[student,other]);
  await db.exec("update public.admin_settings set telegram_required=false;insert into public.exams values('exam','Exam',true);insert into public.subjects values('subject','Subject',array['exam'],100,3,true);insert into public.topics values('topic','subject','Topic',true);insert into public.tests(id,subject_id,topic_id,title,access,published,duration_seconds,question_count) values('test','subject','topic','Test','free',true,600,12);");
  const bank=Array.from({length:12},(_,i)=>({id:'q'+i,number:100+i,text:'ଓଡ଼ିଆ 😀 '+i,topic:'Topic',options:Array.from({length:4},(_,n)=>({id:'o'+n,text:'Option '+n,isCorrect:n===i%4,answerKey:'secret',metadata:{private:true}})),correctOptionId:'o'+i%4,explanation:'Private '+i,tags:['Source']}));
  for(const q of bank)await db.query("insert into public.questions values('test',$1,$2)",[q.number,JSON.stringify(q)]);
  const rpc=async(actor,action,payload={})=>(await db.query('select public.academy_api($1,$2,$3) as r',[actor,action,JSON.stringify(payload)])).rows[0].r;
  const start=key=>rpc(student,'start',{testId:'test',idempotencyKey:key});
  const oldKey=crypto.randomUUID(),old=await start(oldKey),completed=await start(crypto.randomUUID());
  await rpc(student,'submitAttempt',{attemptId:completed.page.attemptId,answers:{q0:'o0'}});
  const before=(await db.query('select * from public.attempts order by id')).rows;
  await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
  await t.test('migration does not rewrite existing attempts, results or canonical questions',async()=>{
   assert.deepEqual((await db.query('select * from public.attempts order by id')).rows,before);
   assert.deepEqual((await db.query('select content from public.questions order by number')).rows.map(r=>r.content),bank);
   const resumed=await start(oldKey);assert.deepEqual(resumed.page.questions.map(q=>q.id),old.page.questions.map(q=>q.id));assert.deepEqual(resumed.page.questions.map(q=>q.options),old.page.questions.map(q=>q.options));
   assert.deepEqual(await rpc(student,'result',{attemptId:completed.page.attemptId}),before.find(r=>r.id===completed.page.attemptId).result);
  });
  let first,key;const orders=[],optionOrders=bank.map(()=>[]);
  await t.test('independent new permutations; canonical IDs and complete private metadata retained',async()=>{
   for(let i=0;i<12;i++){
    const k=crypto.randomUUID(),r=await start(k);if(!first){first=r;key=k;}
    const snap=(await db.query('select snapshot from public.attempts where id=$1',[r.page.attemptId])).rows[0].snapshot;
    orders.push(snap.map(q=>q.id).join(','));bank.forEach((q,n)=>optionOrders[n].push(snap.find(x=>x.id===q.id).options.map(o=>o.id).join(',')));
    assert.deepEqual(snap.map(q=>({...q,options:[...q.options].sort((a,b)=>a.id.localeCompare(b.id))})).sort((a,b)=>a.number-b.number),bank);
    assert.deepEqual(r.page.questions.map(q=>q.id),snap.map(q=>q.id));assert.deepEqual(r.page.questions.map(q=>q.number),Array.from({length:12},(_,n)=>n+1));
    r.page.questions.forEach((q,j)=>{assert.deepEqual(q.options,snap[j].options.map(({id,text})=>({id,text})));assert.deepEqual(Object.keys(q).sort(),['id','number','options','sourceTags','subjectLabel','text']);});
    assert.doesNotMatch(JSON.stringify(r),/isCorrect|correctOptionId|answerKey|explanation|metadata|secret/);
   }
   // Independent random draws may coincide; twelve draws make this test non-flaky.
   assert.ok(new Set(orders).size>1);for(const draws of optionOrders)assert.ok(new Set(draws).size>1);
  });
  await t.test('retry/resume keeps order, deadline, saved stable IDs and flags',async()=>{
   await rpc(student,'saveAttempt',{attemptId:first.page.attemptId,answers:{q0:'o0',q1:'o0'},flags:['q1']});
   const again=await start(key);assert.deepEqual(again.page.questions,first.page.questions);assert.equal(again.page.deadline,first.page.deadline);assert.equal(again.page.attemptId,first.page.attemptId);assert.deepEqual(again.page.answers,{q0:'o0',q1:'o0'});assert.deepEqual(again.page.flags,['q1']);
   assert.equal((await rpc(student,'results')).find(r=>r.id===first.page.attemptId).resumeKey,key);
   assert.ok(!(await rpc(other,'results')).some(r=>r.id===first.page.attemptId));await assert.rejects(rpc(other,'saveAttempt',{attemptId:first.page.attemptId,answers:{}}));
  });
  await t.test('stable-ID scoring and submitted review retain exact attempted question/option order',async()=>{
   const result=await rpc(student,'submitAttempt',{attemptId:first.page.attemptId});assert.equal(result.score,1);assert.equal(result.incorrect,1);assert.equal(result.unattempted,10);
   assert.deepEqual(result.review.map(q=>q.id),first.page.questions.map(q=>q.id));assert.deepEqual(result.review.map(q=>q.options.map(({id,text})=>({id,text}))),first.page.questions.map(q=>q.options));
   assert.deepEqual(await rpc(student,'result',{attemptId:first.page.attemptId}),result);await assert.rejects(start(key));
  });
  await t.test('resume rechecks hidden hierarchy, paid entitlement and deadline; RPC remains private',async()=>{
   const k=crypto.randomUUID(),r=await start(k);await db.exec("update public.exams set published=false");assert.equal((await start(k)).reason,'test_unavailable');await db.exec("update public.exams set published=true;update public.tests set access='paid'");assert.equal((await start(k)).reason,'subject_locked');await db.exec("update public.tests set access='free'");await db.query("update public.attempts set deadline=now()-interval '1 second' where id=$1",[r.page.attemptId]);await assert.rejects(start(k));
   for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'public.academy_internal(uuid,text,jsonb)','EXECUTE') as allowed",[role])).rows[0].allowed,false);
   assert.equal((await db.query("select has_function_privilege('service_role','public.academy_internal(uuid,text,jsonb)','EXECUTE') as allowed")).rows[0].allowed,true);
  });
 }finally{await db.close();}
});
