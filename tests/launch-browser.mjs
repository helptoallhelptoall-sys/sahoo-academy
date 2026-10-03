import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {authorizedModule} from './launch-browser-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const context=await browser.newContext({viewport:{width:375,height:812}}),page=await context.newPage();
const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
const base='http://127.0.0.1:4173/';
const route=async path=>{await page.goto(base+'#/'+path);await page.locator('#main').waitFor();await page.waitForFunction(()=>document.querySelector('#app').dataset.authStatus!=='checking');};
try{
  for(const id of ['mixed','percentages','full']){
    await route('test/'+id);assert.ok(await page.getByRole('button',{name:'Start Free Mock',exact:true}).isDisabled());assert.ok(await page.getByRole('button',{name:'Verify Membership',exact:true}).isDisabled());
    assert.ok((await page.locator('main').innerText()).includes('turn on the bell for new mock-test updates'));
    await page.locator('[data-start]').evaluate(b=>{b.disabled=false;b.click();});await page.getByRole('button',{name:'Start Free Mock',exact:true}).waitFor();assert.equal(await page.locator('#timer').count(),0);assert.equal(await page.locator('input[name="answer"]').count(),0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  checks.push('All three free mocks deny guest starts, including DOM tampering; mobile gates fit');
  assert.equal(await page.locator('[data-social-link="youtube"]').count(),0);assert.doesNotMatch(await page.locator('.access-gate').innerText(),/YouTube/i);assert.ok((await page.locator('main .youtube-promotion').innerText()).includes('Voluntary:'));assert.ok(await page.locator('main .youtube-promotion').getByRole('button',{name:'Subscribe on YouTube',exact:true}).isDisabled());
  await route('test/percentages?exam=police-si');await page.locator('.account-before-mock').getByRole('link',{name:'Register',exact:true}).click();
  assert.equal(await page.locator('#auth-form').getAttribute('data-next'),'test/percentages?exam=police-si');assert.ok(await page.locator('#email').isDisabled());assert.ok(await page.locator('#password').isDisabled());
  await page.locator('main').getByRole('link',{name:'Log in',exact:true}).click();assert.equal(await page.locator('#auth-form').getAttribute('data-next'),'test/percentages?exam=police-si');
  await route('login?next=https%3A%2F%2Fevil.invalid');assert.equal(await page.locator('#auth-form').getAttribute('data-next'),'account');checks.push('Login/register preserve the intended test and reject external return destinations');
  await route('admin/launch-settings');assert.ok(await page.getByRole('heading',{name:'Admin sign-in required'}).count());assert.equal(await page.locator('main input,main select,main form').count(),0);
  await route('test/geography-topic-1');assert.equal(await page.locator('[data-start]').count(),0);await page.getByText('Subject access states · Interface guide',{exact:true}).click();for(const label of ['Locked','Payment pending','Active until [expiry date]','Expired','Renew access'])assert.ok(await page.getByRole('heading',{name:label,exact:true}).count());checks.push('Launch settings require Admin backend; all premium states are labeled without fake account data');
  await context.route(url=>url.pathname==='/launch-access.js'&&!url.search,r=>r.fulfill({contentType:'text/javascript',body:authorizedModule}));
  await route('test/percentages');await page.reload();await page.waitForFunction(()=>document.querySelector('#app')?.dataset.authStatus==='authenticated');
  assert.equal(await page.locator('[data-social-link="youtube"]').count(),0);assert.doesNotMatch(await page.locator('.access-gate').innerText(),/YouTube/i);assert.equal(await page.locator('main .youtube-promotion').getByRole('link',{name:'Subscribe on YouTube',exact:true}).getAttribute('href'),'https://www.youtube.com/@fixture');assert.equal(await page.evaluate(async()=>Object.hasOwn((await import('/launch-access.js')).fixtureState,'youtube')),false);checks.push('YouTube promotion is optional, uses the Admin URL, and needs no subscription identity or status');
  await page.evaluate(async()=>{(await import('/launch-access.js')).fixtureState.telegram=false;});await page.getByRole('button',{name:'Start Free Mock',exact:true}).click();await page.getByText('Not verified — Join Sahoo ExamNexa Telegram',{exact:true}).waitFor();assert.equal(await page.locator('#timer').count(),0);assert.equal(await page.evaluate(async()=>(await import('/launch-access.js')).fixtureState.attemptCalls),1);
  await page.evaluate(async()=>{(await import('/launch-access.js')).fixtureState.telegram=true;});await page.getByRole('button',{name:'Verify Again',exact:true}).click();await page.locator('#timer').waitFor();assert.equal(await page.evaluate(async()=>(await import('/launch-access.js')).fixtureState.attemptCalls),2);
  await page.locator('.top-actions [data-logout]').click();await page.waitForURL('**/#/account');assert.equal(await page.locator('#timer').count(),0);assert.ok(await page.getByRole('heading',{name:'Not signed in'}).count());assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
  checks.push('Isolated backend fixture: verify, lost membership on start, recheck on retry and logout');
  await page.locator('main').getByRole('link',{name:'Log in',exact:true}).click();await page.locator('#email').fill('fixture@example.invalid');await page.locator('#password').fill('test-only-not-a-real-password');await page.locator('#auth-form button').click();await page.waitForURL('**/#/account');assert.ok(await page.getByRole('heading',{name:'Signed-in student'}).count());assert.equal(await page.locator('input[type="password"]').count(),0);checks.push('Isolated backend fixture: login confirms server session and returns to account');
  assert.deepEqual(errors,[]);
  await context.unrouteAll();await page.goto(base+'#/test/percentages');await page.reload();await page.waitForFunction(()=>document.querySelector('#app')?.dataset.authStatus==='unavailable');
  await page.screenshot({path:'test-artifacts/launch-access-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'test-artifacts/launch-access-desktop.png',fullPage:true});
  await writeFile('test-artifacts/launch-browser-results.json',JSON.stringify({passed:checks.length,checks,errors,realAuthenticationTested:false,realSocialApisTested:false},null,2));console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
}finally{await browser.close();}
