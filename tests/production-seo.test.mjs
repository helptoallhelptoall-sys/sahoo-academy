import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {productionSeo,oldSite,newSite} from '../scripts/production-seo.mjs';
import {indexableHome} from '../public-seo.js';
import {siteBase} from '../site-path.js';
import {createSupabaseGateway} from '../supabase-gateway.js';
import {makeHandler} from '../supabase/functions/_shared/handler.mjs';

test('root and legacy site metadata, exact canonical, sitemap and CSP-pinned structured data',()=>{
 for(const url of [oldSite,newSite]){
  const seo=productionSeo(new URL(url));
  assert.ok(seo.head.includes(`rel="canonical" href="${url}"`));
  const raw=seo.head.match(/application\/ld\+json">(.*?)<\/script>/s)[1],data=JSON.parse(raw);
  assert.equal(createHash('sha256').update(raw).digest('base64'),seo.hash);
  assert.deepEqual(data['@graph'].map(x=>x['@type']),['Organization','WebSite']);
  for(const item of data['@graph'])assert.equal(item.url,url);
  assert.doesNotMatch(raw,/rating|review|SearchAction|student|question/i);
  assert.equal((seo.sitemap.match(/<loc>/g)||[]).length,1);assert.ok(seo.sitemap.includes('<loc>'+url+'</loc>'));
  assert.doesNotMatch(seo.sitemap,/#|admin|dashboard|fixture|login|results/);
  assert.ok(seo.robots.includes('Disallow: '+new URL(url).pathname+'reset-password.html'));
  assert.ok(seo.robots.includes('Sitemap: '+url+'sitemap.xml'));
  assert.equal(seo.redirectScript,null);
 }
});
test('only homepage is indexable; Auth, student, Admin, callbacks and unknown routes fail closed',()=>{
 for(const base of [oldSite,newSite]){
  for(const suffix of ['','index.html','#/home'])assert.equal(indexableHome(new URL(base+suffix),base),true);
  for(const suffix of ['#/admin','#/account','#/results','#/test/free','#/exams','#/login','reset-password.html','?code=synthetic','#access_token=synthetic','not-found'])assert.equal(indexableHome(new URL(base+suffix),base),false,suffix);
 }
});
test('optional old-site redirect preserves safe public route but never auth material or active sessions',()=>{
 const script=productionSeo(new URL(oldSite),newSite).redirectScript;
 const redirect=(suffix,storage={})=>{let to;const loc=new URL(oldSite+suffix);loc.replace=value=>{to=value;};runInNewContext(script,{location:loc,localStorage:storage});return to;};
 assert.equal(redirect(''),newSite);assert.equal(redirect('#/exam/odisha-police-si'),newSite+'#/exam/odisha-police-si');
 for(const path of ['?code=synthetic','#access_token=synthetic','?error=denied','#/test/free','#/results','#/dashboard','#/login','reset-password.html#access_token=synthetic','#/home?token=synthetic','#//evil.invalid'])assert.equal(redirect(path),undefined,path);
 assert.equal(redirect('',{'sb-fixture-auth-token':'synthetic'}),undefined);
 assert.throws(()=>productionSeo(new URL(newSite),newSite));
 assert.throws(()=>productionSeo(new URL(oldSite),'https://evil.invalid/'));
 assert.throws(()=>productionSeo(new URL(oldSite),newSite+'?token=anything'));
});
test('prepared dual-origin CORS permits exactly old/new HTTPS origins, keeps authentication and rejects local/untrusted',async()=>{
 let writes=0;
 const handler=makeHandler({config:{origins:[new URL(oldSite).origin,new URL(newSite).origin]},getUser:async()=>null,rpc:async()=>{writes++;return {};}});
 for(const origin of [new URL(oldSite).origin,new URL(newSite).origin]){
  const options=await handler(new Request('https://fixture.invalid',{method:'OPTIONS',headers:{origin}}));assert.equal(options.status,204);assert.equal(options.headers.get('access-control-allow-origin'),origin);
  assert.equal((await handler(new Request('https://fixture.invalid',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({action:'adminList',payload:{}})}))).status,401);
 }
 for(const origin of ['http://127.0.0.1:4173','https://evil.invalid','https://sahooexamnexa.github.io.evil.invalid'])assert.equal((await handler(new Request('https://fixture.invalid',{method:'OPTIONS',headers:{origin}}))).status,403);
 assert.equal(writes,0);
});
test('signup and password recovery use the exact root or subpath callback, without moving sessions',async()=>{
 const original=globalThis.document;
 try{for(const base of [oldSite,newSite]){
  globalThis.document={baseURI:base};let signup,reset;
  const gateway=createSupabaseGateway({auth:{signUp:async a=>{signup=a.options.emailRedirectTo;return {data:{session:null}};},resetPasswordForEmail:async(e,a)=>{reset=a.redirectTo;return {};}}},{});
  await gateway.register({displayName:'Fixture',email:'test@example.invalid',password:'fixture-only'});
  await gateway.requestPasswordReset('test@example.invalid');
  assert.equal(signup,base);assert.equal(reset,base+'reset-password.html');assert.equal(siteBase(base).href,base);
 }}finally{globalThis.document=original;}
});
