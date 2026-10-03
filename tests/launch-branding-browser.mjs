// Targeted shared-shell checks; no real Auth, Telegram, payment or content upload.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage(),checks=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
const go=async route=>{await page.goto('http://127.0.0.1:4173/#/'+route);await page.locator('.page-brand').waitFor();};
try{
  const expectedTitle='Sahoo ExamNexa | Competitive Exam Preparation';
  const expectedDescription='Sahoo ExamNexa - Competitive Exam Preparation Platform for Odisha and All India Government Exams';
  assert.deepEqual(fs.readdirSync('.').filter(f=>/\.html$/i.test(f)),['index.html']);
  for(const url of ['http://127.0.0.1:4173/','http://127.0.0.1:4173/index.html','http://127.0.0.1:4173/#/home']){
    const response=await page.goto(url);const html=await response.text();
    assert.ok(html.includes('<title>'+expectedTitle+'</title>'));
    assert.ok(html.includes('content="'+expectedDescription+'"'));
    await page.locator('.page-brand').waitFor();assert.equal(await page.title(),expectedTitle);
    assert.equal(await page.locator('meta[name="description"]').getAttribute('content'),expectedDescription);
  }
  checks.push('Exactly one root homepage; requested title/description persist in HTML, server response and rendered home');
  for(const width of [375,768,1280]){
    await page.setViewportSize({width,height:900});
    for(const route of ['home','login','register','exams','subject/computer','topic/computer','results','purchase/computer','account','admin','test/percentages']){
      await go(route);
      assert.equal(await page.locator('a[href^="#/admin"]').count(),0);
      assert.equal(await page.locator('.page-brand img').evaluate(i=>i.complete&&i.naturalWidth>0),true);
      assert.doesNotMatch(await page.locator('body').innerText(),/Sahoo Academy/i);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+width+' '+route);
    }
    checks.push('Branding/logo/private navigation across 11 routes at '+width+'px');
  }
  await page.setViewportSize({width:375,height:900});await go('home');
  assert.match(await page.locator('main h1').innerText(),/Topic-wise\s+Mock Tests/);
  assert.equal(await page.locator('.nav-list').first().locator('a').first().innerText(),'Topic-wise Mock Tests');
  await page.locator('main .youtube-promotion').first().waitFor();
  await page.screenshot({path:'test-artifacts/launch-mobile-home.png',fullPage:true});
  await page.locator('.menu-button').click();await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'Help & support');
  await page.keyboard.press('Escape');assert.equal(await page.locator('.sidebar').evaluate(e=>e.inert),true);
  checks.push('Topic-first homepage, mobile YouTube promotion and updated menu keyboard focus');
  await page.setViewportSize({width:1440,height:1000});await go('home');await page.screenshot({path:'test-artifacts/launch-desktop-home.png',fullPage:true});
  for(const route of ['/.env','/private-audits/solar-system-332/working/student-data.json','/supabase/migrations/202610020001_launch.sql','/1%20%20%20%20index.html'])assert.equal((await page.request.get('http://127.0.0.1:4173'+route)).status(),404);
  checks.push('Private source/config/migration files remain outside public serving allowlist');
  assert.deepEqual(errors,[]);const report={passed:checks.length,checks,errors};fs.writeFileSync('test-artifacts/launch-branding-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
