import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {makeHandler as newHandler,makeWebhook} from '../supabase/functions/_shared/handler.mjs';
import {inspectCanonicalHtml} from '../scripts/html-import.mjs';
import {inspectUploadedHtml} from '../scripts/upload-import.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),db=new PGlite();
const base=(process.env.TEST_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,''),project='https://fixture.supabase.co',student='10000000-0000-4000-8000-000000000001',admin='10000000-0000-4000-8000-000000000003';
const mode=process.env.ROLLOUT_STATE||'new-new-off';
const oldApp=mode.startsWith('old-'),oldSchema=mode.includes('-old'),active=mode.endsWith('-on');
const baseline='d0f1bb15d851492f495b0d9ea1209eb03113554d';
const oldFile=f=>execFileSync('git',['show',baseline+':'+f],{encoding:'utf8',windowsHide:true});
const makeHandler=oldApp?(await import('data:text/javascript;base64,'+Buffer.from(oldFile('supabase/functions/_shared/handler.mjs')).toString('base64'))).makeHandler:newHandler;
const oldScripts=new Map(oldApp?['app.js','backend-ui.js','launch-access.js','supabase-gateway.js'].map(f=>[f,oldFile(f)]):[]);
const checks=[],errors=[];let member=true,outage=false,activeResponse;
const context=await browser.newContext({viewport:{width:1280,height:1000}}),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
const go=async path=>{await page.goto(base+'/#/'+path);await page.locator('#main').waitFor();};
const rpc=async(actor,action,payload={})=>(await db.query('select public.academy_api($1,$2,$3) as result',[actor,action,JSON.stringify(payload)])).rows[0].result;
const hostileTitle='ଓଡ଼ିଆ 😀 & "quotes" <img src="/icon.svg" onload="x=1"><span data-hostile-result>Test</span>';
const hostileTopic='Topic ଓଡ଼ିଆ 😀 & "\'><img src="/icon.svg" onload="x=1"><span data-hostile-result>Subject</span>';
const q={id:'q1',number:1,text:'Synthetic fixture question <img src=x onerror=alert(1)> 🟢',topic:hostileTopic,options:['one','two','three','four'].map((text,i)=>({id:'o'+i,text,isCorrect:i===1,answerKey:'o1',explanation:'private-option-explanation',metadata:{answer:'private-option-answer'}})),correctOptionId:'o1',explanation:'Fixture explanation',tags:['SAMPLE ONLY']};
const assertSafeOptions=()=>{
  assert.equal(activeResponse.status,'started');
  for(const question of activeResponse.page.questions){
    assert.deepEqual([...question.options].sort((a,b)=>a.id.localeCompare(b.id)),q.options.map(({id,text})=>({id,text})));
    for(const option of question.options)assert.deepEqual(Object.keys(option).sort(),['id','text']);
  }
  assert.doesNotMatch(JSON.stringify(activeResponse),/isCorrect|answerKey|private-option-/);
};
const assertSafeResult=async()=>{
  assert.equal(await page.locator('main .page-title h1').textContent(),hostileTitle);
  assert.equal(await page.locator('.performance-row span').textContent(),hostileTopic);
  assert.equal(await page.locator('.performance-row progress').getAttribute('aria-label'),hostileTopic+' correct answers');
  assert.equal(await page.locator('main .page-title img, .performance-row img, [data-hostile-result], main [onload], main [onerror]').count(),0);
  assert.equal(await page.evaluate(()=>window.x),undefined);
};
const html='<script type="application/json" id="sahoo-mock-data">'+JSON.stringify({questionCount:2,questions:[q,{...q,id:'q2',number:2,text:'Synthetic second question',correctOptionId:'o0'}]})+'</script>';
const user=id=>({id,aud:'authenticated',role:'authenticated',email:(id===admin?'admin':'student')+'@fixture.invalid',email_confirmed_at:'2026-10-01T00:00:00Z',created_at:'2026-10-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}});
const tokens=new Map();function session(id){const u=user(id),exp=Math.floor(Date.now()/1000)+3600;const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const token=b({alg:'HS256',typ:'JWT'})+'.'+b({sub:id,aud:'authenticated',role:'authenticated',exp,iss:project+'/auth/v1'})+'.fixture-signature';tokens.set(token,u);return {access_token:token,token_type:'bearer',expires_in:3600,expires_at:exp,refresh_token:'fixture-'+id,user:u};}
try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;");
  for(const f of fs.readdirSync('supabase/migrations').sort().filter(f=>!oldSchema||f<'202610170001'))await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
  if(active)await db.exec('update public.admin_settings set attempt_policy_v2_enabled=true');
  await db.query("insert into auth.users(id) values($1),($2)",[student,admin]);await db.query("update public.profiles set role='admin' where id=$1",[admin]);
  const save=(entity,record)=>rpc(admin,'adminSave',{entity,record,...(active?{clientPolicyVersion:2}:{})});
  await save('exams',{id:'exam',name:'Fixture exam',published:true});await save('subjects',{id:'subject',name:'Fixture subject',exam_ids:['exam'],price_paise:9900,validity_months:3,published:true});await save('topics',{id:'topic',subject_id:'subject',name:'Fixture topic',published:true});
  await save('admin_settings',{telegram_required:true,telegram_chat_id:'-100100',telegram_url:'https://t.me/fixture',youtube_url:'https://www.youtube.com/@fixture',upi_id:'fixture@upi',payee_name:'Fixture payee',qr_url:project+'/storage/v1/object/public/payment-assets/qr.svg'});
  for(const id of ['free','paid']){const rec={id,subject_id:'subject',topic_id:'topic',title:id==='free'?hostileTitle:'Fixture paid test',access:id,timer_mode:'manual',manual_duration_seconds:600,duration_seconds:600,published:false};await save('tests',rec);await rpc(admin,'adminImport',{testId:id,html,import:inspectCanonicalHtml(html)});const imp=(await db.query('select id from public.imports where test_id=$1',[id])).rows[0];await rpc(admin,'adminVerifyContent',{importId:imp.id,decision:'approve',reason:'Synthetic fixture fully reviewed for this isolated test.'});await save('tests',{...rec,published:true});}
  const cfg={origins:[new URL(base).origin],botToken:'123:fixture',chatId:'-100100',botUsername:'fixture_bot',webhookSecret:'fixture-secret'};
  const handler=makeHandler({rpc,getUser:async token=>tokens.get(token),config:cfg,inspectHtml:inspectUploadedHtml,fetcher:async(url,init)=>{if(outage)throw new Error('Fixture outage');return Response.json({ok:true,result:{status:JSON.parse(init.body).user_id===123?'administrator':member?'member':'left'}});}});
  const webhook=makeWebhook({rpc,secret:cfg.webhookSecret});
  await context.route(base+'/**',async r=>{const u=new URL(r.request().url());if(u.pathname===new URL(base+'/public-config.json').pathname)return r.fulfill({json:{url:project,publishableKey:'sb_publishable_fixture'}});const name=u.pathname.split('/').at(-1);if(oldScripts.has(name))return r.fulfill({contentType:'text/javascript',body:oldScripts.get(name)});const response=await r.fetch();const headers={...response.headers()};if(headers['content-security-policy'])headers['content-security-policy']=headers['content-security-policy'].replace("connect-src 'self'","connect-src 'self' "+project).replace("img-src 'self'","img-src 'self' "+project);let body=await response.body();if(headers['content-type']?.includes('text/html'))body=Buffer.from(body.toString().replace(/https:\/\/[a-z0-9-]+\.supabase\.co/g,project));await r.fulfill({response,headers,body});});
  await context.route(project+'/**',async r=>{const req=r.request(),u=new URL(req.url()),cors={'access-control-allow-origin':new URL(base).origin,'access-control-allow-headers':'authorization,apikey,content-type,x-client-info,x-supabase-api-version','access-control-allow-methods':'GET,POST,OPTIONS'};
    if(req.method()==='OPTIONS')return r.fulfill({status:204,headers:cors});
    if(u.pathname.includes('/storage/'))return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><rect width="220" height="220" fill="#ddd"/><text y="100" x="20">TEST QR ONLY</text></svg>',headers:cors});
    if(u.pathname==='/auth/v1/token'){const data=req.postDataJSON();return r.fulfill({json:session(data.email?.startsWith('admin')?admin:student),headers:cors});}
    if(u.pathname==='/auth/v1/user')return r.fulfill({json:tokens.get(req.headers().authorization?.replace('Bearer ','')),headers:cors});
    if(u.pathname==='/auth/v1/logout')return r.fulfill({status:204,headers:cors});
    if(u.pathname==='/auth/v1/signup')return r.fulfill({json:{user:user(student),session:null},headers:cors});
    if(u.pathname==='/functions/v1/academy-api'){const response=await handler(new Request(req.url(),{method:req.method(),headers:req.headers(),body:req.postData()}));const body=await response.text();if(req.postDataJSON().action==='start')activeResponse=JSON.parse(body);return r.fulfill({status:response.status,headers:{...cors,...Object.fromEntries(response.headers)},body});}
    throw new Error('Unexpected fixture endpoint '+u.pathname);
  });
  const login=async name=>{await go('login');await page.locator('#email').fill(name+'@fixture.invalid');await page.locator('#password').fill('fixture-password-only');await page.locator('#auth-form button').click();await page.getByRole('heading',{name:'Signed-in student'}).waitFor();};
  const logout=async()=>{await page.locator('.top-actions [data-logout]').click();await page.waitForURL('**/#/account');await page.getByRole('heading',{name:'Not signed in'}).waitFor();};

  await login('admin');
  await go('admin/tests');
  await page.locator('#live-id').fill('rolling-draft');await page.locator('#live-title').fill('Rolling upgrade fixture');
  await page.locator('#live-subject_id').selectOption('subject');await page.locator('#live-topic_id').selectOption('topic');
  const duration=active?'#live-manual_duration_seconds':'#live-duration_seconds';
  if(active)await page.locator('#live-timer_mode').selectOption('manual');
  else assert.equal(await page.locator('#live-timer_mode').count(),0);
  await page.locator(duration).fill('820');await page.getByRole('button',{name:'Save to database',exact:true}).click();await page.getByText('Saved successfully.',{exact:true}).waitFor();
  await page.reload();await page.locator('.data-table tr').filter({hasText:'Rolling upgrade fixture'}).getByRole('button',{name:'Edit',exact:true}).click();
  assert.equal(await page.locator(duration).inputValue(),'820');
  await page.locator(duration).fill('1200');await page.getByRole('button',{name:'Save to database',exact:true}).click();await page.getByText('Saved successfully.',{exact:true}).waitFor();
  assert.equal((await db.query("select duration_seconds from public.tests where id='rolling-draft'")).rows[0].duration_seconds,1200);
  checks.push(mode+': real Admin form create/edit/reload, legacy duration_seconds or active Manual mode; no 23502');
  if(active){await page.locator('.data-table tr').filter({hasText:'Rolling upgrade fixture'}).getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#live-timer_mode').selectOption('automatic');await page.getByRole('button',{name:'Save to database',exact:true}).click();await page.getByText('Saved successfully.',{exact:true}).waitFor();const row=(await db.query("select * from public.tests where id='rolling-draft'")).rows[0];assert.equal(row.timer_mode,'automatic');assert.equal(row.manual_duration_seconds,1200);}
  await db.exec('update public.admin_settings set telegram_required=false');
  await go('test/free');await page.locator('button[data-start]').waitFor();
  const heading=await page.locator('main .page-title').innerText();
  if(active)assert.match(heading,/−0.25 incorrect/);else assert.doesNotMatch(heading,/−0.25/);
  checks.push(mode+': displayed instructions match actual server activation, not frontend release');
  await page.locator('button[data-start]').click();await page.locator('#timer').waitFor();assertSafeOptions();
  const attempt=activeResponse,items=attempt.page.questions;
  assert.equal(attempt.page.scoringVersion??1,active?2:1);
  const answerId=q=>q.id==='q1'?'o1':'o0';
  await page.locator('input[name=answer]').nth(items[0].options.findIndex(o=>o.id===answerId(items[0]))).check();
  await page.getByRole('button',{name:'Save & Next'}).click();
  await page.locator('input[name=answer]').nth(items[1].options.findIndex(o=>o.id!==answerId(items[1]))).check();
  await page.reload();await page.locator('#timer').waitFor();assert.deepEqual(activeResponse.page.questions,items);assert.equal(activeResponse.page.deadline,attempt.page.deadline);
  await page.getByRole('button',{name:'Finish & review'}).click();await page.getByRole('button',{name:'Submit sample'}).click();await page.locator('.score-ring b').waitFor();
  assert.equal(await page.locator('.score-ring b').innerText(),active?'0.75/2':'1/2');
  const result=await rpc(admin,'result',{attemptId:attempt.page.attemptId,...(active?{clientPolicyVersion:2}:{})});assert.equal(result.score,active?.75:1);
  assertSafeOptions();await assertSafeResult();
  checks.push(mode+': server score equals UI for one correct/one wrong; privacy, shuffle reload, deadline and escaped review intact');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
}finally{await page.goto('about:blank');await context.unrouteAll({behavior:'wait'});await context.close();await browser.close();await db.close();}
