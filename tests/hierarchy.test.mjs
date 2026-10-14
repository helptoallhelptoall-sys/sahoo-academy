import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {visibleCatalog,subjectPath,subjectExam} from '../catalog-hierarchy.js';
import {inspectCanonicalHtml} from '../scripts/html-import.mjs';
const admin='10000000-0000-4000-8000-000000000003',student='10000000-0000-4000-8000-000000000001';
const migration='202610130001_exam_hierarchy.sql';

test('hierarchy migration preserves records and enforces published ancestry in RPC/RLS',async t=>{
 const db=new PGlite();try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
  for(const f of fs.readdirSync('supabase/migrations').sort().filter(f=>f<migration))await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)',[admin,student]);await db.query("update public.profiles set role='admin' where id=$1",[admin]);
  const rpc=async(actor,action,payload={})=>(await db.query('select public.academy_api($1,$2,$3) as r',[actor,action,JSON.stringify(payload)])).rows[0].r;
  const save=(entity,record)=>rpc(admin,'adminSave',{entity,record});
  for(const [id,name] of [['si','Odisha Police SI'],['peo','OSSSC PEO'],['forest','Forest Guard'],['hidden','Hidden exam']]){
   await save('exams',{id,name,published:id!=='hidden'});
   await save('subjects',{id:id+'-computer',name:'Computer',exam_ids:[id],published:true,price_paise:100,validity_months:3});
   await save('topics',{id:id+'-intro',name:'Introduction to Computer',subject_id:id+'-computer',published:true});
   const record={id:id+'-test',title:name+' test',subject_id:id+'-computer',topic_id:id+'-intro',access:id==='peo'?'paid':'free',duration_seconds:600,published:false};await save('tests',record);
   const html='<script type="application/json" id="sahoo-mock-data">'+JSON.stringify({questionCount:1,questions:[{id:'q',number:1,text:'Synthetic '+id,topic:'Synthetic topic',options:['A','B','C','D'].map((text,i)=>({id:'o'+i,text,isCorrect:i===1})),correctOptionId:'o1',explanation:'Private answer explanation',tags:[]}]})+'</script>';
   await rpc(admin,'adminImport',{testId:record.id,html,import:inspectCanonicalHtml(html)});const imp=(await db.query('select id from public.imports where test_id=$1',[record.id])).rows[0];await rpc(admin,'adminVerifyContent',{importId:imp.id,decision:'approve',reason:'Synthetic isolated full review evidence only.'});await save('tests',{...record,published:true});
  }
  await save('admin_settings',{telegram_required:false});
  await rpc(admin,'adminAccess',{studentId:student,subjectId:'peo-computer',operation:'grant',reason:'Isolated entitlement preservation fixture'});
  const attempt=await rpc(student,'start',{testId:'si-test',idempotencyKey:crypto.randomUUID()});await rpc(student,'submitAttempt',{attemptId:attempt.page.attemptId,answers:{q:'o1'}});
  const snapshot=async()=>Promise.all(['exams','subjects','topics','tests','questions','imports','attempts','profiles','entitlements','payment_submissions','admin_settings','admin_audit'].map(async name=>(await db.query('select to_jsonb(t) as r from public.'+name+' t order by to_jsonb(t)::text')).rows));
  const before=await snapshot();await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
  await t.test('forward migration changes no mappings, content, imports, attempts/results or access data',async()=>assert.deepEqual(await snapshot(),before));
  await t.test('same-name subjects remain separate by exact IDs; no cross-exam join',async()=>{
   const c=await rpc(null,'catalog');assert.equal(c.exams.length,3);assert.equal(c.tests.length,3);assert.equal(c.subjects.filter(s=>s.name==='Computer').length,3);
   assert.deepEqual(c.subjects.filter(s=>s.exam_ids.includes('si')).map(s=>s.id),['si-computer']);assert.deepEqual(c.subjects.filter(s=>s.exam_ids.includes('peo')).map(s=>s.id),['peo-computer']);
   assert.equal(subjectPath(c.subjects.find(s=>s.id==='si-computer'),c.exams),'Odisha Police SI → Computer');
   assert.equal(subjectExam(c,c.subjects[0],'not-an-exam'),null);
   assert.deepEqual(visibleCatalog({...c,tests:[...c.tests,{...c.tests[0],id:'mismatch',subject_id:'si-computer',topic_id:'peo-intro'}]}).tests,c.tests);
  });
  await t.test('hidden exam ancestry is excluded from direct RLS reads and start/verify',async()=>{
   for(const role of ['anon','authenticated']){await db.exec('set role '+role);for(const table of ['exams','subjects','topics','tests'])assert.equal((await db.query('select * from public.'+table)).rows.length,3);await assert.rejects(db.query('select * from public.questions'));await db.exec('reset role');}
   for(const action of ['start','verify'])assert.equal((await rpc(student,action,{testId:'hidden-test',idempotencyKey:crypto.randomUUID()})).reason,'test_unavailable');
   await assert.rejects(rpc(student,'createOrder',{subjectId:'hidden-computer'}));
  });
  await t.test('draft/hidden exam, subject, topic and test each suppress descendants; prior results remain readable',async()=>{
   for(const table of ['exams','subjects','topics','tests']){const id={exams:'si',subjects:'si-computer',topics:'si-intro',tests:'si-test'}[table];await db.query('update public.'+table+' set published=false where id=$1',[id]);assert.ok(!(await rpc(null,'catalog')).tests.some(x=>x.id==='si-test'));assert.equal((await rpc(student,'start',{testId:'si-test',idempotencyKey:crypto.randomUUID()})).status,'denied');await db.exec('set role anon');assert.equal((await db.query("select * from public.tests where id='si-test'")).rows.length,0);await db.exec('reset role');await db.query('update public.'+table+' set published=true where id=$1',[id]);}
   assert.equal((await rpc(student,'result',{attemptId:attempt.page.attemptId})).score,1);
  });
  await t.test('Admin validation rejects invalid exam references and cross-subject topic placement without changes',async()=>{
   const before=await snapshot();for(const exam_ids of [[],['missing'],['si','si'],[{}]])await assert.rejects(save('subjects',{id:'bad',name:'Computer',exam_ids,published:true}));
   await assert.rejects(save('tests',{id:'bad',subject_id:'si-computer',topic_id:'peo-intro',title:'bad'}));
   await assert.rejects(rpc(student,'adminSave',{entity:'subjects',record:{id:'bad',exam_ids:['si']}}));assert.deepEqual(await snapshot(),before);
  });
  await t.test('existing composite foreign key rejects cross-subject topic reassignment without data changes',async()=>{
   const before=await snapshot();
   await assert.rejects(db.query("update public.tests set topic_id='peo-intro' where id='si-test'"),/foreign key constraint/);
   assert.deepEqual(await snapshot(),before);
  });
  await t.test('free/premium security and safe pre-submission option fields stay intact',async()=>{
   await rpc(admin,'adminAccess',{studentId:student,subjectId:'peo-computer',operation:'revoke',reason:'Isolated revoke check'});assert.equal((await rpc(student,'start',{testId:'peo-test',idempotencyKey:crypto.randomUUID()})).reason,'subject_locked');
   const start=await rpc(student,'start',{testId:'si-test',idempotencyKey:crypto.randomUUID()});assert.equal(start.status,'started');for(const q of start.page.questions){assert.ok(!('explanation' in q));for(const o of q.options)assert.deepEqual(Object.keys(o).sort(),['id','text']);}
   for(const name of ['academy_api','academy_hierarchy_base_api'])for(const role of ['anon','authenticated'])assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') as ok',[role,'public.'+name+'(uuid,text,jsonb)'])).rows[0].ok,false);
  });
 }finally{await db.close();}
});
