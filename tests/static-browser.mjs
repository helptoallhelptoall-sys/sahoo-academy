import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {publicFiles} from '../scripts/public-files.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4174/sahoo-academy/';
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage();
const errors=[],failed=[],consoleErrors=[];let expected404=false;
page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(r.url()));
page.on('console',m=>{if(m.type()==='error'&&!(expected404&&m.text().includes('404')))consoleErrors.push(m.text());});
try{
 const files=fs.readdirSync('dist').sort();assert.deepEqual(files,[...publicFiles,'404.html','public-config.json','.nojekyll'].sort());
 for(const f of files){const r=await page.request.get(base+f);assert.equal(r.status(),200,f);}
 const cfg=await(await page.request.get(base+'public-config.json')).json();assert.deepEqual(Object.keys(cfg).sort(),['publishableKey','url']);
 // Isolate cloud traffic: fixture tests below exercise the real handler/database separately.
 await page.route(cfg.url+'/**',r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':new URL(base).origin},body:JSON.stringify(r.request().url().includes('/auth/')?{}:{version:1,loginRequired:true,recheckFreeAccessEveryAttempt:true,telegramRequired:false,defaultValidityCalendarMonths:3,exams:[],subjects:[{id:'geography',name:'Fixture geography',price_paise:9900,validity_months:3,exam_ids:['example']}],topics:[],tests:[]})}));
 for(const width of [375,1280]){await page.setViewportSize({width,height:900});for(const path of ['','index.html','#/home','#/exams','#/tests','#/account']){await page.goto(base+path);await page.locator('main h1').waitFor();assert.match(await page.title(),/Sahoo ExamNexa/);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await page.locator('.page-brand img').evaluate(i=>i.complete&&i.naturalWidth>0),true);}}
 const redirect=await page.evaluate(async()=>{const {createSupabaseGateway}=await import(new URL('supabase-gateway.js',document.baseURI));let redirect;const g=createSupabaseGateway({auth:{signUp:async args=>{redirect=args.options.emailRedirectTo;return {data:{session:null}}}}},{});await g.register({displayName:'Synthetic',email:'fixture@example.invalid',password:'fixture-only'});return redirect;});assert.equal(redirect,base);
 expected404=true; // Pages serves its app fallback with HTTP 404 for non-file deep links.
 await page.goto(base+'subject/geography?exam=example');await page.getByRole('heading',{name:'Fixture geography',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.baseURI),base);assert.match(await page.title(),/Sahoo ExamNexa/);
 await page.goto(base+'does-not-exist');await page.getByRole('heading',{name:'Let’s get you back on track.'}).waitFor();
 for(const f of ['.env','supabase/migrations/202610020001_launch.sql','tests/unit.test.mjs','private-audits/solar-system-332/working/student-records.json','package.json'])assert.equal((await page.request.get(base+f)).status(),404);
 const manifest=await(await page.request.get(base+'manifest.webmanifest')).json();assert.equal(new URL(manifest.start_url,base).href,base);assert.equal(new URL(manifest.icons[0].src,base).href,base+'icon.svg');
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(consoleErrors,[]);
 console.log('PASS artifact allowlist/assets, public config, Pages base, hash/deep links/404, mobile, Auth redirect, manifest and private-file denial; no page errors or failed requests.');
}finally{await browser.close();}
