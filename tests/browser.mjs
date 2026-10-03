import {authorizedModule} from './launch-browser-fixture.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import {subjectPlans,premiumTests} from '../commerce.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
let fixtureMode=false,loadedFixtureMode=false;
await context.route(url=>url.pathname==='/launch-access.js'&&!url.search,async route=>{if(fixtureMode)await route.fulfill({contentType:'text/javascript',body:authorizedModule});else await route.continue();});
const errors=[],failures=[],checks=[],externalRequests=[];
page.on('request',r=>{if(new URL(r.url()).hostname!=='127.0.0.1')externalRequests.push(r.url());});
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('requestfailed',r=>failures.push(`${r.url()}: ${r.failure()?.errorText}`));
const check=(name,fn)=>async()=>{await fn();checks.push(name);console.log(`PASS ${name}`);};
const route=async(path)=>{await page.goto(`http://127.0.0.1:4173/#/${path}`);if(loadedFixtureMode!==fixtureMode){await page.reload();loadedFixtureMode=fixtureMode;}await page.locator('#main').waitFor();await page.waitForFunction(()=>document.querySelector('#app')?.dataset.authStatus!=='checking');};
await mkdir('test-artifacts',{recursive:true});
try{
  await check('all primary routes render without horizontal overflow at 375, 768, 1280 and 1440 pixels',async()=>{
    const routes=['home','exams','exam/police-si','exam/osssc-peo','exam/opsc','exam/police-constable','exam/ossc-cgl','exam/osssc-ri','subjects','topic/quant?name=Percentages','topic/odia?name='+encodeURIComponent('ବ୍ୟାକରଣ / Grammar'),'syllabus','tests','test/mixed','test/percentages','test/full','pyqs','login','register','dashboard','results','pricing','admin','admin/exams','admin/subjects','admin/topics','admin/questions','admin/tests','admin/uploads','admin/pricing','admin/payments','admin/students','admin/analytics','about','privacy','help','missing','subject/geography','purchase/geography','test/geography-topic-1','orders','account','support','admin/html-imports','admin/orders','admin/access','admin/discounts','admin/support','admin/reviews','admin/settings','admin/launch-settings'];
    for(const width of [375,768,1280,1440]){
      await page.setViewportSize({width,height:1000});
      for(const path of routes){await route(path);assert.ok(await page.locator('main h1').count(),`${path}: heading missing`);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}px ${path}: horizontal overflow`);assert.doesNotMatch(await page.locator("body").innerText(),/sahoo\s*academy|ask sahoo ai/i,`${path}: obsolete brand`);assert.match(await page.title(),/Sahoo ExamNexa/);assert.doesNotMatch(await page.locator('meta[name="description"]').getAttribute("content"),/sahoo\s*academy/i);}
    }
  })();
  await check('topic-first homepage leads through exam, subject, topic and free or premium tests',async()=>{
    await route('home');assert.match(await page.locator('main h1').innerText(),/Topic-wise\s+Mock Tests/);assert.equal(await page.locator('nav[aria-label="Preparation"] a').first().textContent(),'Topic-wise Mock Tests');assert.equal(await page.locator('nav[aria-label="Preparation"] a').first().getAttribute('href'),'#/exams');
    const sections=await page.locator('main .section-head h2').allTextContents();assert.equal(sections[0],'Start with your exam.');await page.locator('.hero-buttons a').first().click();await page.getByRole('heading',{name:'Choose your exam',exact:true}).waitFor();
    await page.locator('a[href="#/exam/police-si"]').click();await page.locator('a[href="#/subject/quant?exam=police-si"]').click();await page.getByRole('link',{name:'View topic tests'}).first().click();assert.ok((await page.url()).includes('Percentages'));assert.ok((await page.locator('main').innerText()).includes('FREE SAMPLE'));assert.ok((await page.locator('main').innerText()).includes('PREMIUM · LOCKED'));
    const free=page.getByRole('link',{name:'Try free topic sample'});assert.equal(await free.getAttribute('href'),'#/test/percentages?exam=police-si');await page.getByRole('link',{name:'View test details'}).click();assert.ok(await page.getByRole('link',{name:'View purchase steps'}).count());assert.equal(await page.locator('[data-start]').count(),0);
    await route('topic/quant?name=Percentages&exam=police-si');await page.getByRole('link',{name:'Try free topic sample'}).click();assert.ok(await page.getByRole('button',{name:'Start Free Mock'}).count());
    await route('topic/geography?name=Solar%20System&exam=police-si');assert.ok((await page.locator('main').innerText()).includes('No free sample for this topic yet.'));assert.equal(await page.getByRole('link',{name:'Try free topic sample'}).count(),0);
  })();
  await check('ExamNexa metadata is consistent and historical or private banks are not served',async()=>{
    for(const path of ['/','/exams','/subject/geography','/topic/quant?name=Percentages']){const response=await context.request.get('http://127.0.0.1:4173'+path);assert.equal(response.status(),200);const html=await response.text();assert.match(html,/<title>[^<]*Sahoo ExamNexa/);assert.doesNotMatch(html,/Sahoo Academy/i);}
    const manifest=await(await context.request.get('http://127.0.0.1:4173/manifest.webmanifest')).json();assert.equal(manifest.name,'Sahoo ExamNexa');assert.equal(manifest.short_name,'Sahoo ExamNexa');
    for(const path of ['1%20%20%20%20index.html','private-audits/solar-system-332/working/student-records.json','private-audits/solar-system-332/working/canonical-import.json','private-audits/solar-system-332/working/correction-audit.json','private-audits/solar-system-332/working/post-correction-report.md','scripts/source-array-import.mjs'])assert.equal((await context.request.get('http://127.0.0.1:4173/'+path)).status(),404,path);
    await route('admin/html-imports');assert.ok(await page.getByRole('heading',{name:'Admin sign-in required'}).count());assert.equal(await page.locator('input[type=file]').count(),0);
  })();
  await check('exam search and organization filters support matches and empty results',async()=>{
    await route('exams');await page.locator('#exam-search').fill('Police');assert.equal(await page.locator('#exam-results article').count(),2);await page.locator('#exam-group').selectOption('OSSSC');assert.equal(await page.locator('#exam-results article').count(),0);await page.locator('#exam-search').fill('');assert.equal(await page.locator('#exam-results article').count(),2);
  })();
  await check('all 29 topic routes resolve through subject subscriptions',async()=>{
    let count=0;for(const plan of subjectPlans){await route('subject/'+plan.id);for(const topic of plan.topics){await route('topic/'+plan.id+'?name='+encodeURIComponent(topic));assert.equal(await page.getByText('PAGE NOT FOUND',{exact:true}).count(),0);assert.ok(await page.getByRole('heading',{name:'Topic-wise mock tests',exact:true}).count());count++;}}assert.equal(count,29);
  })();
  await check('syllabus checklist updates progress and survives internal navigation',async()=>{
    await route('syllabus');await page.locator('summary').filter({hasText:'Quantitative Aptitude'}).click();await page.locator('[data-check="quant-0"]').check();assert.equal(await page.locator('#syllabus-progress').getAttribute('value'),'1');await page.locator('a[href="#/dashboard"]').first().click();await page.locator('a[href="#/syllabus"]').first().click();assert.ok(await page.locator('[data-check="quant-0"]').isChecked());
  })();
  await check('test filtering and empty search states work',async()=>{
    await route('tests?access=free');await page.getByRole('button',{name:'Topic-wise',exact:true}).click();assert.equal(await page.locator('#test-results article').count(),1);await page.locator('#test-search').fill('not-found');assert.equal(await page.locator('#test-results article').count(),0);await page.locator('#test-search').fill('');
  })();
  await check('sample test answers, navigation, clear, flag, cancel submission, scoring and review',async()=>{
    fixtureMode=true;
    await route('test/mixed');await page.getByRole('button',{name:'Start Free Mock'}).click();await page.locator('input[value="2"]').check();await page.getByRole('button',{name:'Clear Response',exact:true}).click();assert.equal(await page.locator('#answered-count').textContent(),'0');await page.locator('input[value="2"]').check();await page.getByRole('button',{name:'Mark for Review',exact:true}).click();assert.equal(await page.locator('[data-action="flag-answer"]').getAttribute('aria-pressed'),'true');await page.locator('.question-grid [data-question="1"]').click();await page.locator('input[value="0"]').check();await page.locator('.question-grid [data-question="0"]').click();assert.ok(await page.locator('input[value="2"]').isChecked());await page.getByRole('button',{name:'Finish & review'}).click();await page.getByRole('button',{name:'Keep practising'}).click();assert.equal(await page.locator('dialog').evaluate(e=>e.open),false);await page.getByRole('button',{name:'Finish & review'}).click();await page.getByRole('button',{name:'Submit sample'}).click();await page.waitForURL('**/#/results');assert.equal(await page.locator('.score-ring b').textContent(),'1/6');assert.ok(await page.getByText('50%',{exact:true}).count());assert.equal(await page.locator('.review-item').count(),6);await page.locator('a[href="#/dashboard"]').first().click();assert.equal(await page.locator('.data-table tbody tr').count(),1);await page.getByRole('button',{name:'Review',exact:true}).click();await page.waitForURL('**/#/results');
    fixtureMode=false;
  })();
  await check('timer expiry automatically submits unanswered test',async()=>{
    fixtureMode=true;
    await route('test/percentages');await page.clock.install();await page.getByRole('button',{name:'Start Free Mock'}).click();await page.clock.fastForward(181000);await page.waitForURL('**/#/results');assert.equal(await page.locator('.score-ring b').textContent(),'0/2');assert.ok(await page.getByText('Time ran out and your test was automatically submitted.').count());await page.clock.resume();
    fixtureMode=false;
  })();
  await check('leaving active test asks confirmation and discards only on approval',async()=>{
    fixtureMode=true;
    await route('test/full');await page.getByRole('button',{name:'Start Free Mock'}).click();await page.locator('a[href="#/exams"]').first().click();await page.getByRole('button',{name:'Keep practising'}).click();assert.ok(await page.locator('#timer').count());await page.evaluate(()=>location.hash='/home');await page.locator('#confirm-exit').click();await page.waitForURL('**/#/home');assert.equal(await page.locator('#timer').count(),0);
    fixtureMode=false;
  })();



  await check('PYQ filters give honest empty state, login and payment controls are disabled',async()=>{
    await route('pyqs');await page.locator('#pyq-exam').selectOption('opsc');await page.locator('#pyq-year').selectOption('2024');await page.getByRole('button',{name:'Find papers'}).click();assert.ok((await page.locator('#pyq-results').textContent()).includes('OPSC OCS · 2024'));await route('login');assert.ok(await page.locator('#email').isDisabled());assert.ok(await page.locator('#password').isDisabled());await route('pricing');assert.equal(await page.locator('.subject-product').count(),7);
  })();
  await check('mobile navigation supports keyboard opening, focus trap, Escape and inert closed state',async()=>{
    await page.setViewportSize({width:375,height:812});await route('home');assert.ok(await page.locator('.sidebar').evaluate(e=>e.inert));await page.locator('.menu-button').click();assert.equal(await page.locator('.menu-button').getAttribute('aria-expanded'),'true');await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'Help & support');await page.keyboard.press('Tab');assert.ok((await page.evaluate(()=>document.activeElement.className)).includes('brand'));await page.keyboard.press('Escape');assert.ok(await page.locator('.sidebar').evaluate(e=>e.inert));
  })();
  await check('phone test runner and results have no horizontal overflow',async()=>{
    fixtureMode=true;
    await route('test/mixed');await page.getByRole('button',{name:'Start Free Mock'}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'test-artifacts/test-mobile.png',fullPage:true});await page.getByRole('button',{name:'Finish & review'}).click();await page.getByRole('button',{name:'Submit sample'}).click();await page.waitForURL('**/#/results');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    fixtureMode=false;
  })();
  await check('paid catalog shows subject prices, lock status and no playable premium data',async()=>{
    await route('tests?access=paid');await page.getByRole('button',{name:'All tests',exact:true}).click();assert.equal(await page.locator('#test-results article').count(),29);assert.equal(await page.locator('#test-results [data-start]').count(),0);assert.ok((await page.locator('#test-results').textContent()).includes('₹299'));
    await route('test/geography-topic-1');assert.equal(await page.locator('[data-start]').count(),0);assert.equal(await page.locator('input[name="answer"]').count(),0);await page.getByRole('link',{name:'View purchase steps'}).click();await page.waitForURL('**/#/purchase/geography');assert.ok(await page.locator('#payment-utr').isDisabled());assert.ok(await page.getByRole('button',{name:'Submit for verification · Unavailable'}).isDisabled());assert.equal(await page.locator('.qr-placeholder img').count(),0);
  })();
  await check('orders and support do not invent accounts, payment state, expiry or conversations',async()=>{
    await route('orders');await page.getByRole('button',{name:'Orders & payment status',exact:true}).click();assert.ok(await page.getByRole('heading',{name:'No order history connected'}).count());await page.getByRole('button',{name:'Saved attempts',exact:true}).click();assert.ok(await page.getByRole('heading',{name:'Saved attempts need a student account'}).count());await route('support');assert.ok(await page.locator('#support-message').isDisabled());assert.ok(await page.getByRole('button',{name:'Create Support Ticket / Ask Admin'}).isDisabled());
  })();
  await check('exam context survives subject, topic, mock and subject purchase navigation',async()=>{
    await route('exam/police-si');await page.locator('a[href="#/subject/geography?exam=police-si"]').click();assert.ok((await page.locator('.context-trail').textContent()).includes('Odisha Police SI'));await page.getByRole('link',{name:'View topic tests'}).first().click();await page.getByRole('link',{name:'View test details'}).click();await page.getByRole('link',{name:'View purchase steps'}).click();await page.waitForURL('**/#/purchase/geography?exam=police-si');assert.ok((await page.locator('.context-trail').textContent()).includes('Odisha Police SI'));
  })();



  await check('Admin routes remain private without authenticated Admin credentials',async()=>{for(const path of ['admin/exams','admin/payments','admin/access','admin/settings','admin/html-imports']){await route(path);assert.ok(await page.getByRole('heading',{name:'Admin sign-in required'}).count());assert.equal(await page.locator('main form,main table,main input').count(),0);}})();
  await check('public clean routes have server metadata and preview indexing is blocked',async()=>{
    const res=await context.request.get('http://127.0.0.1:4173/subject/geography');assert.equal(res.status(),200);assert.ok((await res.text()).includes('Geography – 3 Months Access'));assert.ok(res.headers()['x-robots-tag'].includes('noindex'));await page.goto('http://127.0.0.1:4173/subject/geography');await page.locator('main h1').waitFor();assert.ok((await page.title()).includes('Geography'));assert.equal(await page.getByRole('heading',{name:'Geography – 3 Months Access',exact:true}).count(),1);const xml=await (await context.request.get('http://127.0.0.1:4173/sitemap.xml')).text();assert.ok(xml.includes('/subject/geography'));assert.equal(xml.includes('/admin'),false);const robots=await (await context.request.get('http://127.0.0.1:4173/robots.txt')).text();assert.ok(robots.includes('Disallow: /'));
  })();
  await check('skip link keeps the route intact and focuses main content',async()=>{
    await route('home');const before=page.url();await page.locator('.skip-link').focus();await page.keyboard.press('Enter');assert.equal(page.url(),before);assert.equal(await page.evaluate(()=>document.activeElement.id),'main');
  })();
  await check('no broken local assets, external requests, browser storage or sensitive server files',async()=>{
    for(const file of ['index.html','app.js','data.js','commerce.js','commerce-views.js','management-views.js','import-core.js','styles.css','icon.svg','manifest.webmanifest','launch-access.js','launch-views.js','robots.txt','sitemap.xml'])assert.equal((await context.request.get(`http://127.0.0.1:4173/${file}`)).status(),200);
    for(const file of ['.git/config','README.md','package.json','app.js/../../.git/config','scripts/html-import.mjs','subscription-policy.mjs','backend.js','tests/unit.test.mjs','tests/launch-browser-fixture.mjs','tests/launch-access.test.mjs'])assert.equal((await context.request.get(`http://127.0.0.1:4173/${file}`)).status(),404);
    assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);assert.deepEqual(externalRequests,[]);
  })();
  await route('test/percentages');await page.screenshot({path:'test-artifacts/launch-access-mobile.png',fullPage:true});await route('home');await page.screenshot({path:'test-artifacts/home-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:'test-artifacts/home-desktop.png',fullPage:true});await route('admin/html-imports');await page.screenshot({path:'test-artifacts/admin-desktop.png',fullPage:true});
  await writeFile('test-artifacts/browser-results.json',JSON.stringify({passed:checks.length,checks,errors,failures,testOnlyAuthorizedRunnerFixtures:true},null,2));
  console.log(`\n${checks.length} browser scenarios passed.`);
}finally{await browser.close();}
