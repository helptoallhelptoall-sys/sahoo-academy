import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {automaticDurationSeconds,secondsPerQuestion,extendedTimerSubjects,formatDuration,formatScore} from '../attempt-policy.js';

test('timer classification, exact seconds and decimal display',()=>{
 for(const [n,seconds] of [[100,2000],[60,1200],[50,1000],[41,820]])assert.equal(automaticDurationSeconds(n,'Computer'),seconds);
 for(const subject of extendedTimerSubjects){assert.equal(automaticDurationSeconds(100,subject),3000);assert.equal(automaticDurationSeconds(60,subject),1800);}
 assert.equal(secondsPerQuestion('  QUANTITATIVE   Aptitude '),30);
 for(const subject of ['Computer','Mathematics History','Math question','unknown',null])assert.equal(secondsPerQuestion(subject),20);
 assert.equal(formatDuration(2000),'33 min 20 sec');assert.equal(formatDuration(820),'13 min 40 sec');assert.equal(formatDuration(0),'Pending questions');
 assert.equal(formatScore(77.5,2),'77.50');assert.equal(formatScore(-.25,2),'-0.25');assert.equal(formatScore(41,1),'41');
});

test('versioned scoring and Automatic/Manual timers in the protected SQL path',async t=>{
 const db=new PGlite(),admin='10000000-0000-4000-8000-000000000003',student='10000000-0000-4000-8000-000000000001';
 try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
  for(const f of fs.readdirSync('supabase/migrations').sort().filter(f=>f<'202610170001'))await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)',[admin,student]);await db.query("update public.profiles set role='admin' where id=$1",[admin]);
  const rawRpc=async(who,action,payload={})=>(await db.query('select public.academy_api($1,$2,$3) r',[who,action,JSON.stringify(payload)])).rows[0].r;
  const rpc=(who,action,payload={})=>rawRpc(who,action,{...payload,clientPolicyVersion:2});
  const save=(entity,record)=>rpc(admin,'adminSave',{entity,record});
  await save('exams',{id:'e',name:'Fixture',published:true});
  await save('subjects',{id:'s',name:'Computer',exam_ids:['e'],published:true,price_paise:0});
  await save('topics',{id:'p',name:'Fixture topic',subject_id:'s',published:true});
  const record={id:'t',title:'Fixture',subject_id:'s',topic_id:'p',access:'free',published:false};
  await save('tests',{...record,duration_seconds:2460});
  const bank=Array.from({length:100},(_,i)=>({id:'q'+i,number:i+1,text:'Synthetic '+i,options:['A','B','C','D'].map((text,j)=>({id:'o'+j,text,isCorrect:j===1,secretAnswer:'o1'})),correctOptionId:'o1',explanation:'Private '+i,tags:[],topic:'Math in question metadata must not classify Computer'}));
  for(const q of bank)await db.query("insert into public.questions(test_id,number,content) values('t',$1,$2)",[q.number,JSON.stringify(q)]);
  await db.exec("update public.tests set question_count=100,published=true where id='t';update public.admin_settings set telegram_required=false;");
  const start=key=>rpc(student,'start',{testId:'t',idempotencyKey:key||crypto.randomUUID()});
  const historical=await start(),historicalResult=await rpc(student,'submitAttempt',{attemptId:historical.page.attemptId,answers:{q0:'o1',q1:'o0'}});
  const legacyKey=crypto.randomUUID(),legacy=await start(legacyKey);
  const before=(await db.query('select * from public.attempts order by id')).rows;
  const content=(await db.query('select * from public.questions order by number')).rows;
  await db.exec(fs.readFileSync('supabase/migrations/202610170001_scoring_auto_timer.sql','utf8'));
  const row=async()=>(await db.query("select * from public.tests where id='t'")).rows[0];
  await t.test('migration preserves all existing durations, snapshots, deadlines and historical results',async()=>{
   assert.equal((await row()).duration_seconds,2460);assert.equal((await row()).timer_mode,'manual');assert.equal((await row()).manual_duration_seconds,2460);
   assert.deepEqual((await db.query('select * from public.attempts order by id')).rows.map(({scoring_version,...r})=>r),before);
   assert.deepEqual(await rpc(student,'result',{attemptId:historical.page.attemptId}),historicalResult);
   assert.deepEqual((await db.query('select * from public.questions order by number')).rows,content);
  });
  await t.test('SQL and frontend classifications agree; unknowns fail closed to normal timing',async()=>{
   for(const name of [...extendedTimerSubjects,'GENERAL   REASONING','Computer','Reasoning history','',null])assert.equal((await db.query('select public.academy_seconds_per_question($1) n',[name])).rows[0].n,secondsPerQuestion(name));
  });
  await t.test('old and new clients on migrated schema OFF keep legacy saves and scoring',async()=>{
   assert.equal((await rpc(null,'policy')).attemptPolicyActive,false);
   for(const caller of [rawRpc,rpc]){
    await caller(admin,'adminSave',{entity:'tests',record:{...record,id:'legacy-save',duration_seconds:820}});
    await caller(admin,'adminSave',{entity:'tests',record:{...record,id:'legacy-save',duration_seconds:1200}});
    const saved=(await db.query("select * from public.tests where id='legacy-save'")).rows[0];
    assert.equal(saved.duration_seconds,1200);assert.equal(saved.manual_duration_seconds,1200);assert.equal(saved.timer_mode,'manual');
    const a=await caller(student,'start',{testId:'t',idempotencyKey:crypto.randomUUID()});assert.equal(a.page.scoringVersion,1);
    const r=await caller(student,'submitAttempt',{attemptId:a.page.attemptId,answers:{q0:'o1',q1:'o0'}});assert.equal(r.score,1);assert.equal(r.negativeMarks,0);
   }
   await assert.rejects(save('tests',{...record,timer_mode:'automatic'}),/not activated/);
   await assert.rejects(rpc(student,'start',{testId:'t',idempotencyKey:crypto.randomUUID(),expectedScoringVersion:2}),e=>e.code==='P0002');
   await save('admin_settings',{telegram_required:false,attempt_policy_v2_enabled:true});assert.equal((await rpc(null,'policy')).attemptPolicyActive,false);
   for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.exec('update public.admin_settings set attempt_policy_v2_enabled=true'));await db.exec('reset role');}
   // Old direct service write remains compatible, with unchanged question count.
   await db.exec("update public.tests set duration_seconds=900 where id='legacy-save'");
   assert.equal((await db.query("select manual_duration_seconds n from public.tests where id='legacy-save'")).rows[0].n,900);
   for(const who of [null,student,admin])await assert.rejects(rpc(who,'activateAttemptPolicy',{}));
  });
  // Only the trusted operator enables this in the isolated fixture. No browser action can.
  await db.exec('update public.admin_settings set attempt_policy_v2_enabled=true');
  await t.test('explicit Automatic mode, count changes and subject-name changes recalculate',async()=>{
   await save('tests',{...record,timer_mode:'automatic'});assert.equal((await row()).duration_seconds,2000);
   for(const [count,duration] of [[60,1200],[41,820],[100,2000]]){await db.query("update public.tests set question_count=$1 where id='t'",[count]);assert.equal((await row()).duration_seconds,duration);}
   await db.exec("update public.subjects set name='Mathematics' where id='s'");assert.equal((await row()).duration_seconds,3000);
   await db.exec("update public.tests set question_count=60 where id='t'");assert.equal((await row()).duration_seconds,1800);
   await db.exec("update public.tests set question_count=100 where id='t'");
  });
  await t.test('Manual duration survives count/subject changes and both mode switches',async()=>{
   await save('tests',{...record,timer_mode:'manual',manual_duration_seconds:3000});assert.equal((await row()).duration_seconds,3000);
   await db.exec("update public.tests set question_count=41 where id='t';update public.subjects set name='Computer' where id='s'");assert.equal((await row()).duration_seconds,3000);
   await save('tests',{...record,timer_mode:'automatic'});assert.equal((await row()).duration_seconds,820);assert.equal((await row()).manual_duration_seconds,3000);
   await save('tests',{...record,timer_mode:'manual'});assert.equal((await row()).duration_seconds,3000);
   for(const n of [0,14,21601,-1])await assert.rejects(save('tests',{...record,timer_mode:'manual',manual_duration_seconds:n}));
   await assert.rejects(save('tests',{...record,timer_mode:'unknown'}));
   await db.exec("update public.tests set question_count=100 where id='t'");
  });
  await t.test('actual subject placement drives Automatic only; Manual does not change',async()=>{
   await save('subjects',{id:'math',name:'Arithmetic',exam_ids:['e'],published:true,price_paise:0});
   await save('topics',{id:'math-topic',subject_id:'math',name:'Arithmetic topic',published:true});
   await db.exec("update public.tests set subject_id='math',topic_id='math-topic' where id='t'");assert.equal((await row()).duration_seconds,3000);
   await db.exec("update public.tests set manual_duration_seconds=2400 where id='t';update public.tests set subject_id='s',topic_id='p' where id='t'");assert.equal((await row()).duration_seconds,2400);
   await save('tests',{...record,timer_mode:'automatic'});assert.equal((await row()).duration_seconds,2000);
   await db.exec("update public.tests set subject_id='math',topic_id='math-topic' where id='t'");assert.equal((await row()).duration_seconds,3000);
   await db.exec("update public.tests set subject_id='s',topic_id='p' where id='t'");
   await save('tests',{...record,timer_mode:'manual',manual_duration_seconds:3000});
  });
  await t.test('existing attempt resumes original timer and original +1/0 scoring',async()=>{
   await db.exec("update public.tests set published=true where id='t'");
   const resumed=await rawRpc(student,'start',{testId:'t',idempotencyKey:legacyKey});assert.equal(resumed.page.deadline,legacy.page.deadline);assert.deepEqual(resumed.page.questions,legacy.page.questions);assert.equal(resumed.page.scoringVersion,1);
   const r=await rawRpc(student,'submitAttempt',{attemptId:legacy.page.attemptId,answers:{q0:'o1',q1:'o0'},scoringVersion:2});assert.equal(r.score,1);assert.equal(r.negativeMarks,0);
  });
  await t.test('stale clients cannot create or consume policy 2, even after disabling activation',async()=>{
   await assert.rejects(rawRpc(student,'start',{testId:'t',idempotencyKey:crypto.randomUUID()}),e=>e.code==='P0002');
   await assert.rejects(rawRpc(admin,'adminSave',{entity:'tests',record:{...record,duration_seconds:600}}),e=>e.code==='P0002');
   await assert.rejects(rpc(student,'start',{testId:'t',idempotencyKey:crypto.randomUUID(),expectedScoringVersion:1}),e=>e.code==='P0002');
   const key=crypto.randomUUID(),a=await start(key);
   const blocked=async()=>{
    await assert.rejects(rawRpc(student,'start',{testId:'t',idempotencyKey:key}),e=>e.code==='P0002');
    for(const action of ['saveAttempt','submitAttempt','result'])await assert.rejects(rawRpc(student,action,{attemptId:a.page.attemptId,answers:{q0:'o0'}}),e=>e.code==='P0002');
   };
   await blocked();await db.exec('update public.admin_settings set attempt_policy_v2_enabled=false');await blocked();
   const r=await rpc(student,'submitAttempt',{attemptId:a.page.attemptId,answers:{q0:'o1',q1:'o0'}});assert.equal(r.score,.75);
   await blocked();await db.exec('update public.admin_settings set attempt_policy_v2_enabled=true');
   assert.deepEqual(await rawRpc(student,'result',{attemptId:historical.page.attemptId}),historicalResult);
  });
  await t.test('new attempt saves effective timer/policy; later edits cannot change it',async()=>{
   const key=crypto.randomUUID(),a=await start(key);assert.equal(a.page.durationSeconds,3000);assert.equal(a.page.scoringVersion,2);
   await save('tests',{...record,timer_mode:'automatic'});await db.exec("update public.tests set published=true where id='t'");
   const resumed=await start(key);assert.equal(resumed.page.deadline,a.page.deadline);assert.equal(resumed.page.durationSeconds,3000);assert.deepEqual(resumed.page.questions,a.page.questions);
   const b=await start();assert.equal(b.page.durationSeconds,2000);assert.notDeepEqual(b.page.questions,a.page.questions);
   await assert.rejects(db.query('update public.attempts set scoring_version=1 where id=$1',[a.page.attemptId]));
  });
  await t.test('server scoring +1/−.25/0, decimals, negative totals and immutable reviews',async()=>{
   for(const [correct,wrong,score] of [[80,10,77.5],[40,1,39.75],[41,0,41],[0,1,-.25],[0,0,0]]){
    const a=await start(),answers=Object.fromEntries(bank.slice(0,correct+wrong).map((q,i)=>[q.id,i<correct?'o1':'o0']));
    const r=await rpc(student,'submitAttempt',{attemptId:a.page.attemptId,answers,score:999,scoringVersion:1});
    assert.equal(r.score,score);assert.equal(r.correct,correct);assert.equal(r.incorrect,wrong);assert.equal(r.unattempted,100-correct-wrong);assert.equal(r.negativeMarks,wrong*.25);assert.equal(r.positiveMarks,correct);
    assert.deepEqual(r.review.map(q=>[q.id,q.options.map(o=>o.id)]),a.page.questions.map(q=>[q.id,q.options.map(o=>o.id)]));
    assert.deepEqual(await rpc(student,'submitAttempt',{attemptId:a.page.attemptId,answers:{}}),r);
   }
  });
  await t.test('pre-submit privacy, RLS/Admin restrictions and unchanged content',async()=>{
   const a=await start();assert.doesNotMatch(JSON.stringify(a),/isCorrect|correctOptionId|secretAnswer|explanation/);
   for(const q of a.page.questions)for(const o of q.options)assert.deepEqual(Object.keys(o).sort(),['id','text']);
   for(const who of [null,student])await assert.rejects(rpc(who,'adminSave',{entity:'tests',record:{...record,timer_mode:'manual',manual_duration_seconds:3000}}));
   for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select public.academy_internal($1,$2,$3)',[admin,'adminList','{}']));await db.exec('reset role');}
   assert.deepEqual((await db.query('select * from public.questions order by number')).rows,content);
  });
 }finally{await db.close();}
});
