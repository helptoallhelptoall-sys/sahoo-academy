// Local Pages artifact only. Test-only access fixture; no live Auth or private content.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {transform} from 'esbuild';
import {authorizedModule} from './launch-browser-fixture.mjs';
import {publicFiles} from '../scripts/public-files.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4174/sahoo-academy/';
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext(),page=await context.newPage(),checks=[],errors=[],failed=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('requestfailed',r=>failed.push(r.url()));
page.on('response',r=>{if(r.status()>=400)failed.push(r.url()+' '+r.status());});
await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
await context.route(base+'public-config.json',r=>r.fulfill({json:{}}));
await context.route(url=>url.href===base+'launch-access.js',r=>r.fulfill({contentType:'text/javascript',body:authorizedModule.replaceAll("'/launch-access.js?actual'",JSON.stringify(new URL('launch-access.js',base).pathname+'?actual'))}));
const go=async route=>{await page.goto(base+'#/'+route);await page.locator('.page-brand').waitFor();await page.waitForFunction(()=>document.querySelector('#app')?.dataset.authStatus!=='checking');};
async function branding(){
 await page.waitForFunction(()=>[...document.querySelectorAll('.brand img,.mobile-brand img,.page-brand img')].every(i=>i.complete&&i.naturalWidth===1448));
 assert.equal(await page.locator('img[src*="icon.svg"]').count(),0);
 assert.doesNotMatch(await page.locator('body').innerText(),/Sahoo Academy/i);
 for(const img of await page.locator('.brand img,.mobile-brand img,.page-brand img').all()){
  assert.equal(await img.getAttribute('src'),'sahoo-examnexa-logo.png');
  if(await img.isVisible())assert.ok(await img.evaluate(i=>Math.abs(i.getBoundingClientRect().width/i.getBoundingClientRect().height-4/3)<.01));
 }
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.match(await page.title(),/Sahoo ExamNexa/);assert.doesNotMatch(await page.title(),/Sahoo Academy/i);
}
try{
 fs.mkdirSync('test-artifacts',{recursive:true});
 assert.equal(createHash('sha256').update(fs.readFileSync('sahoo-examnexa-logo.png')).digest('hex'),'63145c1736e6de9aeabba0ce785e85a5da62afad4d9df00b7cf11495f616c5a6');
 assert.deepEqual(fs.readdirSync('dist').sort(),[...publicFiles,'404.html','public-config.json','.nojekyll'].sort());
 assert.equal(publicFiles.includes('icon.svg'),false);
 for(const size of [32,180,192,512]){
  const name='sahoo-examnexa-icon-'+size+'.png',bytes=fs.readFileSync(name);
  assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
  const response=await page.request.get(base+name);assert.equal(response.status(),200);assert.match(response.headers()['content-type'],/image\/png/);
 }
 const manifest=JSON.parse(fs.readFileSync('dist/manifest.webmanifest'));
 assert.deepEqual(manifest.icons.map(i=>i.sizes),['192x192','512x512']);
 for(const i of manifest.icons){assert.equal(i.purpose,'any');assert.ok(new URL(i.src,base).pathname.startsWith('/sahoo-academy/'));}
 const css=await transform(fs.readFileSync('styles.css','utf8'),{loader:'css'});assert.deepEqual(css.warnings,[]);
 checks.push('Original logo hash, all icon dimensions/MIME, manifest, restricted artifact and CSS parser pass');
 for(const width of [1280,320]){
  await page.setViewportSize({width,height:900});
  for(const route of ['home','login','register','dashboard','account','exams','subject/geography','topic/geography','test/percentages','test/geography-topic-1','results','admin']){await go(route);await branding();}
  checks.push('Official uncropped logo and public branding across 12 routes at '+width+'px');
  await go('home');await page.screenshot({path:'test-artifacts/official-home-'+(width===320?'mobile':'desktop')+'.png',fullPage:false});
  assert.equal(await page.locator('link[rel="icon"]').getAttribute('href'),'sahoo-examnexa-icon-32.png');
  assert.equal(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'),'sahoo-examnexa-icon-180.png');
  await page.locator('.skip-link').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'main');
  if(width===320){await page.locator('.menu-button').click();await page.keyboard.press('Escape');assert.equal(await page.locator('.sidebar').evaluate(e=>e.inert),true);}
  checks.push('Icon links, keyboard skip link and mobile menu accessibility at '+width+'px');
  await go('test/percentages');await page.getByRole('button',{name:'Start Free Mock',exact:true}).click();await page.locator('#timer').waitFor();await branding();
  const watermark=()=>page.locator('.live-question').evaluate(e=>{const s=getComputedStyle(e,'::before');return {opacity:Number(s.opacity),events:s.pointerEvents,z:s.zIndex,repeat:s.backgroundRepeat,image:s.backgroundImage};});
  const w=await watermark();assert.equal(w.opacity,.11);assert.equal(w.events,'none');assert.equal(w.z,'-1');assert.equal(w.repeat,'repeat');assert.match(w.image,/test-watermark.svg/);
  assert.equal(await page.locator('.live-test-brand img').count(),1);
  await page.locator('input[name=answer]').first().focus();await page.keyboard.press('Space');assert.ok(await page.locator('input[name=answer]').first().isChecked());
  await page.getByRole('button',{name:'Mark for Review',exact:true}).click();await page.getByRole('button',{name:'Save & Next'}).click();assert.deepEqual(await watermark(),w);
  await page.locator('input[name=answer]').nth(1).check();await page.locator('.question-grid [data-question="0"]').click();
  await page.locator('main').focus();await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:'test-artifacts/official-cbt-'+(width===320?'mobile':'desktop')+'.png',fullPage:true});
  await page.getByRole('button',{name:'Finish & review'}).click();await page.getByRole('button',{name:'Submit sample'}).click();await page.waitForURL('**/#/results');await page.locator('.review-item').first().waitFor();await branding();assert.equal(await page.locator('.review-item').count(),2);
  checks.push('CBT logo, 11% watermark, keyboard/click controls, navigation and results at '+width+'px');
 }
 await page.evaluate(async()=>{const fixture=await import(new URL('launch-access.js',document.baseURI));fixture.fixtureState.loggedIn=false;});
 await page.setViewportSize({width:1280,height:900});await go('login');await page.screenshot({path:'test-artifacts/official-login.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);checks.push('No JavaScript/console errors, missing assets or failed requests');
 fs.writeFileSync('test-artifacts/official-branding-results.json',JSON.stringify({passed:checks.length,checks,errors,failed,scope:'Local restricted Pages artifact with isolated access fixture; no cloud changes'},null,2));
 console.log(JSON.stringify({passed:checks.length,checks,errors,failed},null,2));
}catch(error){console.error(JSON.stringify({errors,failed,url:page.url()}));throw error;}finally{await browser.close();}
