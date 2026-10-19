// Generated artifact only, with isolated transport. No real Auth or cloud writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {homeTitle,homeDescription} from '../public-seo.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4184/';
const html=readFileSync('dist/index.html','utf8'),canonical=html.match(/rel="canonical" href="([^"]+)"/)[1];
const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext();
const page=await context.newPage(),errors=[],failures=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('requestfailed',r=>failures.push(r.url()));
await context.route(base+'public-config.json',r=>r.fulfill({json:{}}));
try{
 const staticContext=await browser.newContext({javaScriptEnabled:false});const staticPage=await staticContext.newPage();
 await staticPage.goto(base);
 assert.equal(await staticPage.locator('#main h1').textContent(),'Sahoo ExamNexa');
 assert.match(await staticPage.locator('#main').innerText(),/Odisha Police SI, PEO and Civil Constable/);
 assert.equal(await staticPage.locator('#main a').getAttribute('href'),'#/exams');
 assert.equal(await staticPage.locator('link[rel=canonical]').getAttribute('href'),canonical);
 assert.equal(await staticPage.title(),homeTitle);await staticContext.close();
 for(const width of [320,1280]){
  await page.setViewportSize({width,height:900});await page.goto(base);await page.locator('.page-brand').waitFor();
  assert.equal(await page.title(),homeTitle);assert.equal(await page.locator('meta[name=description]').getAttribute('content'),homeDescription);
  assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'index, follow');
  assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'),canonical);
  assert.equal(await page.locator('meta[property="og:title"]').getAttribute('content'),homeTitle);
  assert.equal(await page.locator('link[rel=canonical]').count(),1);
  const data=JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
  assert.equal(data['@graph'][0].url,canonical);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  for(const route of ['login','register','account','dashboard','admin/questions','results','forgot-password']){
   await page.goto(base+'#/'+route);await page.locator('.page-brand').waitFor();
   assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'noindex, nofollow',route);
  }
  await page.goto(base+'#/home');await page.locator('.page-brand').waitFor();assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'index, follow');
 }
 await page.goto(base+'reset-password.html');assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'noindex, nofollow');
 const xml=await(await page.request.get(base+'sitemap.xml')).text();
 const parsed=await page.evaluate(xml=>{const doc=new DOMParser().parseFromString(xml,'application/xml');return {errors:doc.querySelectorAll('parsererror').length,urls:[...doc.querySelectorAll('loc')].map(e=>e.textContent)};},xml);
 assert.equal(parsed.errors,0);assert.deepEqual(parsed.urls,[canonical]);
 const robots=await(await page.request.get(base+'robots.txt')).text();assert.ok(robots.includes('Sitemap: '+canonical+'sitemap.xml'));assert.doesNotMatch(robots,/Disallow: \/\s*$/m);
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
 console.log('PASS SEO artifact: no-JS public content, metadata/JSON-LD/CSP, sitemap XML, robots, 320px/desktop, private route noindex, recovery privacy and no browser errors.');
}finally{await browser.close();}
