import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {inspectCanonicalHtml} from '../scripts/html-import.mjs';
const student='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',admin='10000000-0000-4000-8000-000000000003';
const q={id:'q1',number:1,text:'Fixture 🟢 <b>literal</b>',topic:'Fixture topic',options:['one','two','three','four'].map((text,i)=>({id:'o'+i,text,isCorrect:i===1,correct:i===1,answerKey:'o1',explanation:'private-option-explanation',metadata:{answer:'private-option-answer'},unexpectedHint:'private-option-hint'})),correctOptionId:'o1',explanation:'Fixture explanation',tags:['SAMPLE'],metadata:{preserved:true}};
test('PostgreSQL migration, RLS, authorized payments/imports/attempts',async t=>{
  const db=new PGlite();
  try{
    await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
    for(const f of fs.readdirSync('supabase/migrations').sort())await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
    const rpc=async(actor,action,payload={})=>(await db.query('select public.academy_api($1,$2,$3) as result',[actor,action,JSON.stringify(payload)])).rows[0].result;
    await db.query("insert into auth.users(id,raw_user_meta_data) values($1,'{\"role\":\"admin\"}'),($2,'{}'),($3,'{}')",[student,other,admin]);
    await db.query("update public.profiles set role='admin' where id=$1",[admin]);
    await t.test('signup metadata cannot assign an Admin role',async()=>assert.equal((await rpc(student,'account')).role,'student'));
    await t.test('all created tables have RLS and no public question/attempt grants',async()=>{const rows=(await db.query("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'")).rows;assert.ok(rows.length>=14);assert.ok(rows.every(r=>r.relrowsecurity));for(const table of ['questions','imports','attempts','telegram_verifications','admin_settings','admin_audit'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed',['authenticated','public.'+table,'SELECT'])).rows[0].allowed,false);});
    await t.test('students can read only their own account; cannot promote role or call service RPC',async()=>{
      await db.exec(`set role authenticated;set request.jwt.claim.sub='${student}'`);
      assert.equal((await db.query('select * from public.profiles')).rows.length,1);
      await assert.rejects(db.query("update public.profiles set role='admin'"));await assert.rejects(rpc(student,'adminList',{entity:'profiles'}));await assert.rejects(db.query('select * from public.questions'));
      await db.exec('reset role');
    });
    const save=async(entity,record)=>rpc(admin,'adminSave',{entity,record});
    await save('exams',{id:'exam',name:'Fixture exam',published:true});
    await save('subjects',{id:'subject',name:'Fixture subject',exam_ids:['exam'],price_paise:10000,validity_months:3,published:true});
    await save('topics',{id:'topic',subject_id:'subject',name:'Fixture topic',published:true});
    for(const id of ['free','paid','broken'])await save('tests',{id,subject_id:'subject',topic_id:'topic',title:id,access:id==='paid'?'paid':'free',duration_seconds:600,published:false});
    await t.test('student cannot perform Admin operations or forge entitlements',async()=>{await assert.rejects(saveAsStudent());async function saveAsStudent(){return rpc(student,'adminSave',{entity:'subjects',record:{id:'evil'}});}await db.exec(`set role authenticated;set request.jwt.claim.sub='${student}'`);await assert.rejects(db.query("insert into public.entitlements values($1,'subject',now(),now()+interval '3 months',null)",[student]));await db.exec('reset role');});
    const html='<script type="application/json" id="sahoo-mock-data">'+JSON.stringify({questionCount:1,questions:[q]})+'</script>',imp=inspectCanonicalHtml(html);
    await t.test('unverified tests cannot publish; import preserves source and exact counts',async()=>{await assert.rejects(save('tests',{id:'free',subject_id:'subject',topic_id:'topic',title:'free',access:'free',duration_seconds:600,published:true}));const r=await rpc(admin,'adminImport',{testId:'free',html,import:imp});assert.equal(r.audit.importedQuestions,1);assert.equal(r.audit.added,0);assert.equal(r.audit.removed,0);const saved=(await db.query("select * from public.imports where test_id='free'")).rows[0];assert.equal(saved.source_html,html);assert.deepEqual(saved.original,[q]);assert.equal(saved.working[0].text,q.text.replace('🟢',''));assert.deepEqual(saved.working[0].tags,q.tags);await assert.rejects(rpc(admin,'adminImport',{testId:'free',html,import:imp}));});
    await t.test('count mismatch rejects whole import; malformed records never partially install',async()=>{await assert.rejects(rpc(admin,'adminImport',{testId:'broken',html,import:{...imp,audit:{...imp.audit,sourceQuestions:2}}}));assert.equal((await db.query("select count(*)::int as n from public.questions where test_id='broken'")).rows[0].n,0);});
    for(const id of ['free','paid']){if(id==='paid')await rpc(admin,'adminImport',{testId:id,html,import:imp});const row=(await db.query('select id from public.imports where test_id=$1',[id])).rows[0];await rpc(admin,'adminVerifyContent',{importId:row.id,decision:'approve',reason:'Reviewed every fixture question, answer, explanation and tag.'});await save('tests',{id,subject_id:'subject',topic_id:'topic',title:id,access:id==='paid'?'paid':'free',duration_seconds:600,published:true});}
    await t.test('public catalog exposes only published metadata',async()=>{const c=await rpc(null,'catalog');assert.equal(c.tests.length,2);assert.equal(JSON.stringify(c).includes('correctOptionId'),false);await db.exec('set role anon');assert.equal((await db.query('select * from public.tests')).rows.length,2);await assert.rejects(db.query('select * from public.payment_submissions'));await db.exec('reset role');});
    await t.test('free starts require fresh server Telegram verification and matching policy',async()=>{for(const p of [{},{telegramVerified:true,policyVersion:0}])assert.equal((await rpc(student,'start',{testId:'free',idempotencyKey:crypto.randomUUID(),...p})).status,'denied');assert.equal((await rpc(student,'start',{testId:'paid',idempotencyKey:crypto.randomUUID()})).reason,'subject_locked');});
    await save('admin_settings',{telegram_required:true,telegram_chat_id:'-100100',telegram_url:'https://t.me/fixture',youtube_url:'https://www.youtube.com/@fixture',upi_id:'fixture@upi',payee_name:'Fixture only',qr_url:'https://fixture.supabase.co/storage/v1/object/public/payment-assets/qr.png'});
    const checkout=await rpc(student,'createOrder',{subjectId:'subject',price_paise:1,validity_months:99,idempotencyKey:crypto.randomUUID()});
    await t.test('server snapshots price/3-month term and pending UTR grants no access',async()=>{assert.equal(checkout.order.price_paise,10000);assert.equal(checkout.order.validity_months,3);await rpc(student,'submitPayment',{orderId:checkout.order.id,utr:'TESTUTR12345'});assert.equal((await rpc(student,'access',{subjectId:'subject'})).state,'payment_pending');await assert.rejects(rpc(other,'submitPayment',{orderId:checkout.order.id,utr:'OTHERUTR123'}));await assert.rejects(rpc(student,'adminReviewPayment',{orderId:checkout.order.id,decision:'approve',reason:'Fake approval'}));});
    await t.test('manual approval is atomic, grants calendar term and cannot be replayed',async()=>{await rpc(admin,'adminReviewPayment',{orderId:checkout.order.id,decision:'approve',reason:'Fixture received credit reconciled manually'});const e=(await db.query('select *, expires_at=activated_at+interval \'3 months\' as term from public.entitlements where student_id=$1',[student])).rows[0];assert.equal(e.term,true);await assert.rejects(rpc(admin,'adminReviewPayment',{orderId:checkout.order.id,decision:'approve',reason:'Duplicate approval attempt'}));assert.equal((await rpc(student,'access',{subjectId:'subject'})).state,'active');});
    await t.test('own payment RLS hides another student records and duplicate UTR is rejected',async()=>{await db.exec(`set role authenticated;set request.jwt.claim.sub='${other}'`);assert.equal((await db.query('select * from public.payment_submissions')).rows.length,0);await db.exec('reset role');const p=await rpc(other,'createOrder',{subjectId:'subject',idempotencyKey:crypto.randomUUID()});await assert.rejects(rpc(other,'submitPayment',{orderId:p.order.id,utr:'TESTUTR12345'}));});
    const started=await rpc(student,'start',{testId:'paid',idempotencyKey:crypto.randomUUID()});
    await t.test('free and premium starts/retries expose only id/text; private records keep complete options',async()=>{
      const policy=await rpc(null,'policy');
      for(const testId of ['free','paid']){
        const payload={testId,idempotencyKey:crypto.randomUUID(),telegramVerified:true,telegramChatId:'-100100',policyVersion:policy.version};
        for(let retry=0;retry<2;retry++){
          const response=await rpc(student,'start',payload);
          assert.equal(response.status,'started');
          assert.deepEqual(response.page.questions[0].options,q.options.map(({id,text})=>({id,text})));
          assert.doesNotMatch(JSON.stringify(response),/isCorrect|answerKey|private-option-/);
          const snapshot=(await db.query('select snapshot from public.attempts where id=$1',[response.page.attemptId])).rows[0].snapshot;
          assert.deepEqual(snapshot[0].options,q.options);
          await assert.rejects(rpc(student,'result',{attemptId:response.page.attemptId}));
          assert.deepEqual(Object.keys(await rpc(student,'saveAttempt',{attemptId:response.page.attemptId,answers:{q1:'o1'}})).sort(),['deadline','saved']);
        }
        const original=(await db.query('select original,working from public.imports where test_id=$1',[testId])).rows[0];
        assert.deepEqual(original.original[0].options,q.options);assert.deepEqual(original.working[0].options,q.options);
        assert.deepEqual((await db.query('select content from public.questions where test_id=$1',[testId])).rows[0].content.options,q.options);
      }
      assert.doesNotMatch(JSON.stringify(await rpc(student,'results')),/isCorrect|answerKey|private-option-|snapshot/);
      for(const role of ['anon','authenticated'])for(const name of ['academy_api','academy_base_api','academy_internal']){
        assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed',[role,'public.'+name+'(uuid,text,jsonb)','EXECUTE'])).rows[0].allowed,false);
      }
    });
    await t.test('authorized question payload omits keys/explanations/metadata; result is owner-only after submission',async()=>{assert.equal(started.status,'started');assert.equal(started.page.questions.length,1);for(const key of ['correctOptionId','explanation','metadata'])assert.equal(key in started.page.questions[0],false);await assert.rejects(rpc(other,'submitAttempt',{attemptId:started.page.attemptId}));await assert.rejects(rpc(student,'result',{attemptId:started.page.attemptId}));await assert.rejects(rpc(student,'saveAttempt',{attemptId:started.page.attemptId,answers:{q1:'forged'}}));const r=await rpc(student,'submitAttempt',{attemptId:started.page.attemptId,answers:{q1:'o1'}});assert.equal(r.score,1);assert.equal(r.review[0].correctOptionId,'o1');assert.equal(r.review[0].explanation,q.explanation);assert.equal((await rpc(student,'submitAttempt',{attemptId:started.page.attemptId,answers:{q1:'o0'}})).score,1);});
    await t.test('expiry and revocation block question starts and answer-key review',async()=>{await db.query("update public.entitlements set activated_at=now()-interval '4 months',expires_at=now()-interval '1 second' where student_id=$1",[student]);assert.equal((await rpc(student,'access',{subjectId:'subject'})).state,'expired');assert.equal((await rpc(student,'start',{testId:'paid',idempotencyKey:crypto.randomUUID()})).status,'denied');await assert.rejects(rpc(student,'result',{attemptId:started.page.attemptId}));await rpc(admin,'adminAccess',{studentId:student,subjectId:'subject',operation:'grant',reason:'Fixture manual grant'});await rpc(admin,'adminAccess',{studentId:student,subjectId:'subject',operation:'revoke',reason:'Fixture manual revoke'});assert.equal((await rpc(student,'access',{subjectId:'subject'})).state,'locked');});
    await t.test('server deadline ignores answers arriving after expiry',async()=>{const p=await rpc(null,'policy');const a=await rpc(student,'start',{testId:'free',telegramVerified:true,telegramChatId:'-100100',policyVersion:p.version,idempotencyKey:crypto.randomUUID()});await db.query("update public.attempts set deadline=now()-interval '1 second' where id=$1",[a.page.attemptId]);assert.equal((await rpc(student,'submitAttempt',{attemptId:a.page.attemptId,answers:{q1:'o1'}})).score,0);});
    await t.test('Telegram nonce is one-time, expires, and cannot be consumed from browser role',async()=>{await rpc(student,'telegramBegin',{nonceHash:'abc'});assert.equal((await rpc(null,'telegramConsume',{nonceHash:'abc',telegramId:'12345'})).linked,true);assert.equal((await rpc(null,'telegramConsume',{nonceHash:'abc',telegramId:'12345'})).linked,false);await db.exec('set role authenticated');await assert.rejects(rpc(null,'telegramConsume',{nonceHash:'abc',telegramId:'12345'}));await db.exec('reset role');});

    await t.test('Admin promotion fields persist; channel ID remains private',async()=>{
      const cfg=(await rpc(admin,'adminList',{entity:'admin_settings'}))[0];
      await save('admin_settings',{...cfg,youtube_name:'ExamNexa Learning',youtube_cta:'Subscribe on YouTube',youtube_videos_url:'https://www.youtube.com/playlist?list=fixture'});
      const p=await rpc(null,'policy');assert.equal(p.youtubeChannelName,'ExamNexa Learning');assert.equal(p.youtubeVideosUrl,'https://www.youtube.com/playlist?list=fixture');assert.equal('telegram_chat_id' in p,false);assert.equal('telegramChatId' in p,false);
      await assert.rejects(save('admin_settings',{...cfg,youtube_videos_url:'https://evil.example/video'}));
    });
    await t.test('selected-free scope and master OFF are enforced by SQL, not browser flags',async()=>{
      let cfg=(await rpc(admin,'adminList',{entity:'admin_settings'}))[0];
      await save('admin_settings',{...cfg,telegram_scope:'selected'});
      assert.equal((await rpc(student,'gateContext',{testId:'free'})).required,false);
      assert.equal((await rpc(student,'start',{testId:'free',idempotencyKey:crypto.randomUUID()})).status,'started');
      const row=(await db.query("select * from public.tests where id='free'")).rows[0];await save('tests',{...row,telegram_required:true});
      assert.equal((await rpc(student,'gateContext',{testId:'free'})).required,true);
      assert.equal((await rpc(student,'start',{testId:'free',telegramRequired:false,idempotencyKey:crypto.randomUUID()})).status,'denied');
      cfg=(await rpc(admin,'adminList',{entity:'admin_settings'}))[0];await save('admin_settings',{...cfg,telegram_required:false});
      assert.equal((await rpc(student,'start',{testId:'free',idempotencyKey:crypto.randomUUID()})).status,'started');
      await save('admin_settings',{...cfg,telegram_required:true});
    });
    await t.test('channel or scope changes invalidate in-flight membership evidence',async()=>{
      const gate=await rpc(student,'gateContext',{testId:'free'}),cfg=(await rpc(admin,'adminList',{entity:'admin_settings'}))[0];
      await save('admin_settings',{...cfg,telegram_chat_id:'-100200'});
      assert.equal((await rpc(student,'start',{testId:'free',idempotencyKey:crypto.randomUUID(),telegramVerified:true,telegramChatId:gate.channelId,policyVersion:gate.policyVersion})).status,'denied');
      const fresh=await rpc(student,'gateContext',{testId:'free'});
      assert.equal((await rpc(student,'start',{testId:'free',idempotencyKey:crypto.randomUUID(),telegramVerified:true,telegramChatId:fresh.channelId,policyVersion:fresh.policyVersion})).status,'started');
    });
    await t.test('paid access ignores Telegram switch, channel and selected flag',async()=>{
      await rpc(admin,'adminAccess',{studentId:student,subjectId:'subject',operation:'grant',reason:'Fixture paid isolation test'});
      const row=(await db.query("select * from public.tests where id='paid'")).rows[0];await save('tests',{...row,telegram_required:true});
      assert.equal((await rpc(student,'gateContext',{testId:'paid'})).required,false);
      assert.equal((await rpc(student,'start',{testId:'paid',idempotencyKey:crypto.randomUUID()})).status,'started');
    });
  }finally{await db.close();}
});

test('security migration protects existing snapshots without changing imports, answers or results',async()=>{
  const db=new PGlite();
  const migration='202610040001_safe_attempt_options.sql';
  try{
    await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
    for(const file of fs.readdirSync('supabase/migrations').sort().filter(f=>f<migration))await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
    await db.query('insert into auth.users(id) values($1),($2)',[admin,student]);
    await db.query("update public.profiles set role='admin' where id=$1",[admin]);
    const rpc=async(actor,action,payload={})=>(await db.query('select public.academy_api($1,$2,$3) as result',[actor,action,JSON.stringify(payload)])).rows[0].result;
    const save=(entity,record)=>rpc(admin,'adminSave',{entity,record});
    await save('subjects',{id:'upgrade',name:'Upgrade fixture',price_paise:100,validity_months:3,published:true});
    await save('topics',{id:'upgrade',subject_id:'upgrade',name:'Upgrade fixture',published:true});
    const record={id:'upgrade',subject_id:'upgrade',topic_id:'upgrade',title:'Upgrade fixture',access:'paid',duration_seconds:600,published:false};
    await save('tests',record);
    const source={...q,options:[q.options[3],q.options[1],q.options[0],q.options[2]]};
    const html='<script type="application/json" id="sahoo-mock-data">'+JSON.stringify({questionCount:1,questions:[source]})+'</script>';
    await rpc(admin,'adminImport',{testId:'upgrade',html,import:inspectCanonicalHtml(html)});
    const imp=(await db.query("select id from public.imports where test_id='upgrade'")).rows[0];
    await rpc(admin,'adminVerifyContent',{importId:imp.id,decision:'approve',reason:'Synthetic upgrade fixture reviewed in full.'});
    await save('tests',{...record,published:true});
    await rpc(admin,'adminAccess',{studentId:student,subjectId:'upgrade',operation:'grant',reason:'Synthetic upgrade fixture access'});
    const payload={testId:'upgrade',idempotencyKey:crypto.randomUUID()};
    const legacy=await rpc(student,'start',payload);
    assert.equal(Object.hasOwn(legacy.page.questions[0].options[0],'isCorrect'),true);
    await rpc(student,'saveAttempt',{attemptId:legacy.page.attemptId,answers:{q1:'o1'},flags:['q1']});
    const privateRecords=async()=>Promise.all(['imports','questions','attempts'].map(table=>db.query('select * from public.'+table).then(r=>r.rows)));
    const before=await privateRecords();
    await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
    assert.deepEqual(await privateRecords(),before);
    for(const name of ['academy_api','academy_base_api','academy_internal']){
      const response=(await db.query('select public.'+name+'($1,$2,$3) as result',[student,'start',JSON.stringify(payload)])).rows[0].result;
      assert.equal(response.page.attemptId,legacy.page.attemptId);
      assert.deepEqual(response.page.questions[0].options,source.options.map(({id,text})=>({id,text})));
    }
    const result=await rpc(student,'submitAttempt',{attemptId:legacy.page.attemptId});
    assert.equal(result.score,1);assert.equal(result.review[0].correctOptionId,'o1');
    assert.deepEqual(result.review[0].options,source.options);
    assert.equal(result.review[0].explanation,source.explanation);
    assert.deepEqual(await rpc(student,'result',{attemptId:legacy.page.attemptId}),result);
  }finally{await db.close();}
});
