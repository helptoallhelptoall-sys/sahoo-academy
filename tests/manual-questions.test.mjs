import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {makeHandler} from '../supabase/functions/_shared/handler.mjs';
import {inspectCanonicalHtml} from '../scripts/html-import.mjs';
const admin='10000000-0000-4000-8000-000000000003',student='10000000-0000-4000-8000-000000000001';
test('private manual Questions: authorization, validation, review and immutable published content',async t=>{
 const db=new PGlite();
 try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
  for(const f of fs.readdirSync('supabase/migrations').sort())await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)',[admin,student]);await db.query("update public.profiles set role='admin' where id=$1",[admin]);
  const rpc=async(actor,action,payload={})=>(await db.query('select public.academy_api($1,$2,$3) as r',[actor,action,JSON.stringify(payload)])).rows[0].r;
  const save=(entity,record)=>rpc(admin,'adminSave',{entity,record});
  await save('subjects',{id:'s',name:'Synthetic subject',exam_ids:[],price_paise:0,validity_months:3});await save('topics',{id:'topic',subject_id:'s',name:'Synthetic topic'});
  const draft={id:'manual',title:'Disposable fixture',subject_id:'s',topic_id:'topic',access:'free',duration_seconds:120,published:false};await save('tests',draft);
  const question={text:'ଓଡ଼ିଆ 🟢 <img onerror="attack()"> & English 😀',options:['First','Second','Third','Fourth'].map(text=>({text,isCorrect:true,answerKey:'ignored'})),correctIndex:1,explanation:'Private explanation ଓଡ଼ିଆ',tags:['Source unverified','Custom 😀']};
  const payload={testId:'manual',expectedRevision:0,question};
  await t.test('anonymous and Student are denied by Edge and SQL; browser RPC and self-promotion denied',async()=>{
   const handler=makeHandler({rpc,getUser:async token=>({id:token,email_confirmed_at:'2026-01-01'}),config:{origins:['https://fixture.invalid']}});
   for(const action of ['adminQuestions','adminSaveQuestion','adminReviewQuestions']){
    for(const who of [null,student]){await assert.rejects(rpc(who,action,payload));const response=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{'content-type':'application/json',...(who?{authorization:'Bearer '+who}:{})},body:JSON.stringify({action,payload})}));assert.equal(response.status,who?403:401);}
   }
   await db.exec('set role authenticated');await assert.rejects(rpc(admin,'adminQuestions'));await assert.rejects(db.exec("update public.profiles set role='admin'"));await assert.rejects(db.exec('select * from public.manual_test_reviews'));await db.exec('reset role');
  });
  await t.test('server rejects incomplete, ambiguous options and invalid catalog/revision',async()=>{
   for(const patch of [{text:''},{options:question.options.slice(1)},{options:question.options.map(()=>({text:'same'}))},{correctIndex:4},{correctIndex:null},{explanation:''},{tags:[{}]}])await assert.rejects(rpc(admin,'adminSaveQuestion',{...payload,question:{...question,...patch}}));
   await assert.rejects(rpc(admin,'adminSaveQuestion',{...payload,testId:'missing'}));await assert.rejects(rpc(admin,'adminSaveQuestion',{...payload,expectedRevision:999}));
  });
  await t.test('Admin creates and edits Unicode question; audit and option identity preserved',async()=>{
   await rpc(admin,'adminSaveQuestion',payload);let rows=await rpc(admin,'adminQuestions',{search:'ଓଡ଼ିଆ',subjectId:'s',topicId:'topic'});assert.equal(rows.length,1);const old=rows[0].content;
   assert.equal(old.text,question.text.replaceAll('🟢',''));assert.deepEqual(old.options.map(o=>Object.keys(o).sort()),Array(4).fill(['id','text']));assert.equal(old.correctOptionId,'o1');
   await rpc(admin,'adminSaveQuestion',{...payload,number:1,expectedRevision:1,question:{...question,text:'Updated ଓଡ଼ିଆ',correctIndex:2}});rows=await rpc(admin,'adminQuestions');assert.equal(rows[0].content.id,old.id);assert.equal(rows[0].content.correctOptionId,'o2');assert.equal(rows[0].content.explanation,question.explanation);
   const audit=(await db.query("select details from public.admin_audit where action='adminSaveQuestion' order by id desc limit 1")).rows[0].details;assert.deepEqual(audit.before,old);assert.equal(audit.after.text,'Updated ଓଡ଼ିଆ');
  });
  await t.test('manual review required; stale review rejected; edits invalidate review',async()=>{
   await assert.rejects(save('tests',{...draft,published:true}));await assert.rejects(rpc(admin,'adminReviewQuestions',{testId:'manual',expectedRevision:1,decision:'approve',reason:'All synthetic content reviewed carefully.'}));
   await rpc(admin,'adminReviewQuestions',{testId:'manual',expectedRevision:2,decision:'approve',reason:'All synthetic content reviewed carefully.'});
   await rpc(admin,'adminSaveQuestion',{...payload,number:1,expectedRevision:2});await assert.rejects(save('tests',{...draft,published:true}));
   await rpc(admin,'adminReviewQuestions',{testId:'manual',expectedRevision:3,decision:'approve',reason:'All synthetic content reviewed carefully.'});await save('tests',{...draft,published:true});
  });
  await t.test('published content cannot be edited, and safe starts/reviews use existing scoring',async()=>{
   const before=(await rpc(admin,'adminQuestions'))[0];await assert.rejects(rpc(admin,'adminSaveQuestion',{...payload,number:1,expectedRevision:3}));assert.deepEqual((await rpc(admin,'adminQuestions'))[0],before);
   await save('subjects',{id:'s',name:'Synthetic subject',exam_ids:[],price_paise:0,validity_months:3,published:true});await save('topics',{id:'topic',subject_id:'s',name:'Synthetic topic',published:true});await save('admin_settings',{telegram_required:false});
   const start=await rpc(student,'start',{testId:'manual',idempotencyKey:crypto.randomUUID()});assert.equal(start.status,'started');const safe=start.page.questions[0];for(const o of safe.options)assert.deepEqual(Object.keys(o).sort(),['id','text']);for(const key of ['correctOptionId','explanation','metadata'])assert.equal(key in safe,false);
   const result=await rpc(student,'submitAttempt',{attemptId:start.page.attemptId,answers:{[safe.id]:'o1'}});assert.equal(result.score,1);assert.equal(result.review[0].explanation,question.explanation);
  });
  await t.test('HTML drafts keep source, exact count and option metadata; edit resets content pass',async()=>{
   const imported={...question,id:'source-8',number:1,topic:'Original topic',options:question.options.map((o,i)=>({...o,id:'x'+i})),correctOptionId:'x1',metadata:{sourceNumber:8}};
   const html='<script type="application/json" id="sahoo-mock-data">'+JSON.stringify({questionCount:1,questions:[imported]})+'</script>';
   await save('tests',{...draft,id:'html'});await rpc(admin,'adminImport',{testId:'html',html,import:inspectCanonicalHtml(html)});const original=(await db.query("select * from public.imports where test_id='html'")).rows[0];
   await rpc(admin,'adminVerifyContent',{importId:original.id,decision:'approve',reason:'Reviewed all original synthetic content.'});
   await assert.rejects(rpc(admin,'adminSaveQuestion',{...payload,testId:'html',expectedRevision:1}));
   await rpc(admin,'adminSaveQuestion',{...payload,testId:'html',number:1,expectedRevision:1});const after=(await db.query("select * from public.imports where test_id='html'")).rows[0];
   assert.deepEqual(after.original,original.original);assert.equal(after.source_html,original.source_html);assert.equal(after.source_count,1);assert.equal(after.imported_count,1);assert.equal(after.pass2,false);assert.equal(after.working[0].metadata.sourceNumber,8);assert.equal(after.working[0].options[0].id,'x0');
   await assert.rejects(save('tests',{...draft,id:'html',published:true}));await assert.rejects(rpc(admin,'adminVerifyContent',{importId:original.id,decision:'approve',reason:'Stale review must not authorize these edits.'}));await rpc(admin,'adminVerifyContent',{importId:original.id,expectedRevision:2,decision:'approve',reason:'Fresh review of the complete edited revision.'});await assert.rejects(rpc(admin,'adminImport',{testId:'manual',html,import:inspectCanonicalHtml(html)}));
  });
 }finally{await db.close();} // Disposable in-memory DB; no live account/question writes.
});
