import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {inspectCanonicalHtml} from '../scripts/html-import.mjs';
import {makeHandler} from '../supabase/functions/_shared/handler.mjs';
import {moveItem} from '../order-controls.js';
const admin='10000000-0000-4000-8000-000000000003',student='10000000-0000-4000-8000-000000000001';
export const fixtureQuestion=(n)=>({id:'q'+n,number:n,text:'Synthetic ଓଡ଼ିଆ question '+n,options:['A','B','C','D'].map((text,i)=>({id:'o'+i,text,isCorrect:i===1})),correctOptionId:'o1',explanation:'Private explanation '+n,tags:['Source unverified'],topic:'Fixture',metadata:{sourceNumber:n}});
test('Admin order/deletion: scoped persistence, private import audit and historical protection',async t=>{
 const db=new PGlite();try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
  for(const f of fs.readdirSync('supabase/migrations').sort())await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)',[admin,student]);await db.query("update public.profiles set role='admin' where id=$1",[admin]);
  const rpc=async(who,action,payload={})=>(await db.query('select public.academy_api($1,$2,$3) r',[who,action,JSON.stringify(payload)])).rows[0].r;
  const save=(entity,record)=>rpc(admin,'adminSave',{entity,record});
  for(const id of ['si','peo'])await save('exams',{id,name:id,published:true});
  for(const id of ['s','other'])await save('subjects',{id,name:'Computer',exam_ids:[id==='s'?'si':'peo'],published:true,price_paise:0});
  for(let n=1;n<=4;n++)await save('topics',{id:'p'+n,subject_id:'s',name:'Topic '+n,published:n!==2});
  await save('topics',{id:'other-topic',subject_id:'other',name:'Topic 1',published:true});
  const draft=id=>({id,subject_id:'s',topic_id:'p1',title:id,access:'free',duration_seconds:2460,published:false});
  for(const id of ['a','b','c','duplicate'])await save('tests',draft(id));
  const qs=Array.from({length:20},(_,i)=>fixtureQuestion(i+1));
  const html=questions=>'<script type="application/json" id="sahoo-mock-data">'+JSON.stringify({questionCount:questions.length,questions})+'</script>';
  await rpc(admin,'adminImport',{testId:'a',html:html(qs),import:inspectCanonicalHtml(html(qs))});
  const imp=(await db.query("select * from public.imports where test_id='a'")).rows[0];
  await rpc(admin,'adminVerifyContent',{importId:imp.id,decision:'approve',reason:'Reviewed all isolated synthetic records.'});await save('tests',{...draft('a'),published:true});await save('admin_settings',{telegram_required:false});
  const start=await rpc(student,'start',{testId:'a',idempotencyKey:crypto.randomUUID()});
  const oldResult=await rpc(student,'submitAttempt',{attemptId:start.page.attemptId,answers:{q1:'o1'}});
  const inProgress=await rpc(student,'start',{testId:'a',idempotencyKey:crypto.randomUUID()});
  const attemptBefore=(await db.query('select * from public.attempts order by id')).rows;
  const order=(entity,parentId)=>rpc(admin,'adminOrderList',{entity,parentId});
  const reorder=async(entity,parentId,id,pos)=>{const r=await order(entity,parentId);return rpc(admin,'adminReorder',{entity,parentId,expectedVersion:r.version,ids:moveItem(r.records.map(r=>r.id),id,pos)});};
  const remove=async(entity,id,parentId='')=>{const p=await rpc(admin,'adminDeletePreview',{entity,id,parentId});await rpc(admin,'adminDelete',{entity,id,parentId,expectedVersion:p.version,confirmation:'Delete permanently',reason:'Isolated fixture removal approved'});return p;};
  await t.test('anonymous/Student cannot list, reorder, preview or delete; direct RPC forbidden',async()=>{
   const handler=makeHandler({rpc,getUser:async token=>({id:token,email_confirmed_at:'2026-01-01'}),config:{origins:['https://fixture.invalid']}});
   for(const action of ['adminOrderList','adminReorder','adminDeletePreview','adminDelete'])for(const who of [null,student]){
    await assert.rejects(rpc(who,action,{entity:'exams'}));const r=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{'content-type':'application/json',...(who?{authorization:'Bearer '+who}:{})},body:JSON.stringify({action,payload:{entity:'exams'}})}));assert.equal(r.status,who?403:401);
   }
   for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(rpc(admin,'adminOrderList',{entity:'exams'}));await assert.rejects(db.exec("select public.academy_install_working('a','[]',null,'fake','{}')"));await db.exec('reset role');}
  });
  await t.test('topic 4 → 1 persists; published/hidden rows and public order follow it',async()=>{
   await reorder('topics','s','p4',1);assert.deepEqual((await order('topics','s')).records.map(r=>r.id),['p4','p1','p2','p3']);assert.deepEqual((await rpc(null,'catalog')).topics.filter(p=>p.subject_id==='s').map(p=>p.id),['p4','p1','p3']);
  });
  await t.test('test up/down, numeric field, stale order and cross-exam IDs',async()=>{
   await reorder('tests','p1','c',1);assert.equal((await order('tests','p1')).records[0].id,'c');await reorder('tests','p1','c',3);assert.equal((await order('tests','p1')).records[2].id,'c');
   await save('topics',{id:'p3',subject_id:'s',name:'Topic 3',published:true,display_order:1});assert.equal((await order('topics','s')).records[0].id,'p3');
   const old=await order('topics','s');await reorder('topics','s','p4',1);await assert.rejects(rpc(admin,'adminReorder',{entity:'topics',parentId:'s',expectedVersion:old.version,ids:old.records.map(x=>x.id)}));
   const r=await order('subjects','si');await assert.rejects(rpc(admin,'adminReorder',{entity:'subjects',parentId:'si',expectedVersion:r.version,ids:['other']}));assert.equal((await order('subjects','peo')).records[0].id,'other');
  });
  await t.test('question 20 → 5 preserves full content/IDs and history; invalidates review',async()=>{
   await reorder('questions','a','q20',5);assert.equal((await order('questions','a')).records[4].id,'q20');
   const after=(await db.query("select * from public.imports where test_id='a'")).rows[0];assert.deepEqual(after.original,imp.original);assert.equal(after.source_html,imp.source_html);assert.deepEqual(after.working[4],qs[19]);assert.equal(after.pass2,false);assert.equal((await db.query("select published from public.tests where id='a'")).rows[0].published,false);
   assert.deepEqual((await db.query('select * from public.attempts order by id')).rows,attemptBefore);assert.deepEqual(await rpc(student,'result',{attemptId:start.page.attemptId}),oldResult);
   const rev=(await db.query("select revision from public.tests where id='a'")).rows[0].revision;
   await assert.rejects(save('tests',{...draft('a'),published:true}));await rpc(admin,'adminVerifyContent',{importId:imp.id,expectedRevision:rev,decision:'approve',reason:'Reviewed reordered fixture bank completely.'});await save('tests',{...draft('a'),published:true});
   const fresh=await rpc(student,'start',{testId:'a',idempotencyKey:crypto.randomUUID()});assert.equal(fresh.page.questions.length,20);for(const q of fresh.page.questions){assert.equal('correctOptionId' in q,false);assert.equal('explanation' in q,false);for(const o of q.options)assert.deepEqual(Object.keys(o).sort(),['id','text']);}
   assert.notDeepEqual(fresh.page.questions.map(q=>q.id),(await order('questions','a')).records.map(q=>q.id));assert.equal((await rpc(student,'submitAttempt',{attemptId:fresh.page.attemptId,answers:{q20:'o1'}})).score,1);
  });
  await t.test('pending 165 source duplicate Q96 removal installs exactly 164; original unchanged',async()=>{
   const source=Array.from({length:165},(_,i)=>fixtureQuestion(i+1));source[95]={...structuredClone(source[57]),id:'q96',number:96,metadata:{sourceNumber:96}};
   await rpc(admin,'adminImport',{testId:'duplicate',html:html(source),import:inspectCanonicalHtml(html(source))});const original=(await db.query("select * from public.imports where test_id='duplicate'")).rows[0];assert.equal(original.pass1,false);assert.equal((await order('questions','duplicate')).records.length,165);
   await remove('questions','q96','duplicate');const after=(await db.query("select * from public.imports where test_id='duplicate'")).rows[0];
   assert.equal(after.source_count,165);assert.equal(after.imported_count,165);assert.equal(after.removed,1);assert.equal(after.working.length,164);assert.equal(after.pass1,true);assert.equal(after.pass2,false);assert.deepEqual(after.issues,[]);assert.deepEqual(after.original,original.original);assert.equal(after.source_html,original.source_html);assert.equal(after.source_sha256,original.source_sha256);assert.ok(after.working.some(q=>q.id==='q58'));assert.deepEqual(after.working,source.filter(q=>q.id!=='q96'));assert.equal(after.audit.workingOperations[0].detail.removedId,'q96');
   const test=(await db.query("select * from public.tests where id='duplicate'")).rows[0];assert.equal(test.question_count,164);assert.equal(test.published,false);await assert.rejects(save('tests',{...draft('duplicate'),published:true}));
  });
  await t.test('delete preview is mandatory/current; published question deletion retains old attempts',async()=>{
   const p=await rpc(admin,'adminDeletePreview',{entity:'questions',parentId:'a',id:'q1'});assert.equal(p.published,true);assert.equal(p.questions,1);assert.ok(p.attempts>=3);assert.ok(p.results>=2);
   await assert.rejects(rpc(admin,'adminDelete',{entity:'questions',parentId:'a',id:'q1',expectedVersion:p.version,confirmation:'yes',reason:'fixture'}));await remove('questions','q1','a');assert.equal((await order('questions','a')).records.length,19);
   assert.deepEqual(await rpc(student,'result',{attemptId:start.page.attemptId}),oldResult);assert.equal((await rpc(student,'submitAttempt',{attemptId:inProgress.page.attemptId,answers:{q1:'o1'}})).score,1);
   await assert.rejects(rpc(admin,'adminDelete',{entity:'questions',parentId:'a',id:'q1',expectedVersion:p.version,confirmation:'Delete permanently',reason:'fixture'}));
  });
  await t.test('parent deletion retains snapshots, imports, payment/access and audit; no resurrection',async()=>{
   await db.query("insert into public.payment_submissions(student_id,subject_id,price_paise,validity_months,idempotency_key) values($1,'s',100,3,gen_random_uuid())",[student]);await db.query("insert into public.entitlements values($1,'s',now(),now()+interval '3 months',null)",[student]);
   const saved=(await db.query('select * from public.attempts order by id')).rows,originals=(await db.query('select id,source_html,original from public.imports order by id')).rows;
   const p=await remove('exams','si');assert.equal(p.questions,183);assert.equal(p.imports,2);assert.equal(p.payments,1);assert.equal(p.entitlements,1);
   assert.deepEqual((await db.query('select * from public.attempts order by id')).rows,saved);assert.deepEqual((await db.query('select id,source_html,original from public.imports order by id')).rows,originals);assert.equal((await db.query('select count(*)::int n from public.payment_submissions')).rows[0].n,1);
   assert.equal((await rpc(null,'catalog')).exams.some(e=>e.id==='si'),false);assert.equal((await rpc(admin,'adminList',{entity:'tests'})).length,0);await assert.rejects(save('exams',{id:'si',name:'revived',published:true}));await assert.rejects(save('tests',{...draft('a'),published:true}));assert.equal((await rpc(student,'start',{testId:'a',idempotencyKey:crypto.randomUUID()})).status,'denied');assert.deepEqual(await rpc(student,'result',{attemptId:start.page.attemptId}),oldResult);
   await db.exec('set role anon');assert.equal((await db.query("select * from public.exams where id='si'")).rows.length,0);await db.exec('reset role');assert.ok((await db.query("select count(*)::int n from public.admin_audit where action='adminDelete'")).rows[0].n>=3);
  });
 }finally{await db.close();}
});
