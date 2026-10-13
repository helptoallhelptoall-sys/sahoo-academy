import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {makeHandler} from '../supabase/functions/_shared/handler.mjs';
import {inspectUploadedHtml} from '../scripts/upload-import.mjs';
const admin='10000000-0000-4000-8000-000000000003',student='10000000-0000-4000-8000-000000000001';
const records=Array.from({length:2},(_,i)=>({id:i+10,chapter:'ଓଡ଼ିଆ',question_statement:'Synthetic '+i+' 🟢',options:['A','B','C','D'],correct:i,explanation:'Private explanation '+i,tags:i===0?['MCQ PDF','🟢','History']:['OPRB 2022','Notes PDF','Custom'],...(i===0?{pyp:{examId:'odisha-police-si',year:2023,label:'Odisha Police SI 2023'}}:{}),metadata:{answer:'private'}}));
const html='<script>const questions='+JSON.stringify(records)+';function ui(){return questions;}</script>';
test('browser upload transport + isolated database: authentication, exact counts, review and answer privacy',async t=>{
 const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
 for(const f of fs.readdirSync('supabase/migrations').sort())await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 await db.query('insert into auth.users(id) values($1),($2)',[admin,student]);await db.query("update public.profiles set role='admin' where id=$1",[admin]);
 const rpc=async(actor,action,payload={})=>(await db.query('select public.academy_api($1,$2,$3) as r',[actor,action,JSON.stringify(payload)])).rows[0].r;
 const save=(entity,record)=>rpc(admin,'adminSave',{entity,record});
 await save('subjects',{id:'s',name:'Synthetic',exam_ids:[],price_paise:0,validity_months:3,published:true});await save('topics',{id:'topic',subject_id:'s',name:'Topic',published:true});
 const draft={id:'draft',subject_id:'s',topic_id:'topic',title:'Synthetic upload',access:'free',duration_seconds:120,published:false};await save('tests',draft);
 const handler=makeHandler({rpc,getUser:async token=>({id:token,email_confirmed_at:'2026-01-01'}),config:{origins:['https://fixture.invalid']},inspectHtml:inspectUploadedHtml});
 const upload=(patch={},who=admin)=>handler(new Request('https://fixture.invalid',{method:'POST',headers:{'content-type':'application/json',origin:'https://fixture.invalid',...(who?{authorization:'Bearer '+who}:{})},body:JSON.stringify({action:'adminImportHtml',payload:{testId:'draft',html,expectedCount:2,...patch}})}));
 const fingerprint=async()=>JSON.stringify((await db.query("select (select jsonb_agg(t) from public.tests t) tests,(select jsonb_agg(q) from public.questions q) questions,(select jsonb_agg(i) from public.imports i) imports,(select jsonb_agg(a) from public.admin_audit a) audit")).rows);
 await t.test('rejected uploads and unauthorized users cause zero content/audit mutation',async()=>{
  const before=await fingerprint();
  for(const who of [null,student])assert.equal((await upload({},who)).status,who?403:401);
  for(const patch of [{testId:'missing'},{expectedCount:1},{expectedCount:null},{expectedCount:0},{expectedCount:undefined},{html:html.replace('correct":0','correct":9')},{html:html.replace('id":11','id":10')}])assert.equal((await upload(patch)).status,400);
  assert.equal(await fingerprint(),before);
 });
 await t.test('valid source upload preserves all fields and remains draft with Pass 2 pending',async()=>{
  assert.equal((await upload()).status,200);const imp=(await db.query('select * from public.imports')).rows[0];assert.equal(imp.source_html,html);assert.equal(imp.pass1,true);assert.equal(imp.pass2,false);
  for(let i=0;i<2;i++){assert.deepEqual(imp.original[i].metadata.sourceRecord,records[i]);assert.deepEqual(imp.working[i].options.map(o=>o.text),records[i].options);assert.equal(imp.working[i].correctOptionId,'option-'+i);assert.equal(imp.working[i].explanation,records[i].explanation);assert.deepEqual(imp.working[i].tags,i===0?[records[i].pyp.label]:['OPRB 2022']);}
  await assert.rejects(save('tests',{...draft,published:true}));const before=await fingerprint();assert.equal((await upload()).status,400);assert.equal(await fingerprint(),before);
 });
 await t.test('both passes required; published destination and original are protected; answers withheld until submission',async()=>{
  const imp=(await db.query('select * from public.imports')).rows[0];await rpc(admin,'adminVerifyContent',{importId:imp.id,decision:'approve',reason:'All synthetic records reviewed in isolated test only.'});await save('tests',{...draft,published:true});
  const before=await fingerprint();assert.equal((await upload()).status,400);assert.equal(await fingerprint(),before);
  await save('admin_settings',{telegram_required:false});
  const started=await rpc(student,'start',{testId:'draft',idempotencyKey:crypto.randomUUID()});assert.equal(started.status,'started');
  for(const q of started.page.questions){assert.deepEqual(q.options.map(o=>Object.keys(o).sort()),Array(4).fill(['id','text']));for(const key of ['correct','correctOptionId','explanation','metadata','sourceRecord'])assert.equal(Object.hasOwn(q,key),false);}
  const answers=Object.fromEntries(started.page.questions.map((q,i)=>[q.id,'option-'+i]));
  const submitted=await rpc(student,'submitAttempt',{attemptId:started.page.attemptId,answers});assert.equal(submitted.score,2);assert.deepEqual(submitted.review.map(q=>q.explanation),records.map(q=>q.explanation));
 });
 }finally{await db.close();}
});
