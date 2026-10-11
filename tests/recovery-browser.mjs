// Official Supabase SDK + isolated Auth responses. Never send real email/passwords.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=(process.env.TEST_BASE_URL||'http://127.0.0.1:4174/sahoo-academy/').replace(/\/?$/,'/');
const project='https://fixture.supabase.co',id='10000000-0000-4000-8000-000000000003';
const user={id,email:'admin@fixture.invalid',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{},aud:'authenticated',role:'authenticated'};
const exp=Math.floor(Date.now()/1000)+3600,b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const token=b({alg:'HS256'})+'.'+b({sub:id,exp,role:'authenticated'})+'.synthetic';
const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext(),page=await context.newPage();
let requestRedirect,updates=0,signouts=0,failUpdate=false,failLogout=false,invalid=false;const errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
await context.route(base+'**',async r=>{
 const response=await r.fetch();let body=await response.body();
 if(response.headers()['content-type']?.includes('text/html'))body=Buffer.from(body.toString().replace(/https:\/\/[a-z0-9-]+\.supabase\.co/g,project));
 await r.fulfill({response,body});
});
await context.route(base+'public-config.json',r=>r.fulfill({json:{url:project,publishableKey:'sb_publishable_fixture'}}));
await context.route(project+'/**',async r=>{
 const req=r.request(),u=new URL(req.url()),headers={'access-control-allow-origin':new URL(base).origin,'access-control-allow-headers':'authorization,apikey,content-type,x-client-info,x-supabase-api-version','access-control-allow-methods':'GET,POST,PUT,OPTIONS'};
 if(req.method()==='OPTIONS')return r.fulfill({status:204,headers});
 if(u.pathname==='/auth/v1/recover'){requestRedirect=u.searchParams.get('redirect_to');assert.deepEqual(req.postDataJSON(),{email:user.email,code_challenge:null,code_challenge_method:null,gotrue_meta_security:{}});return r.fulfill({json:{},headers});}
 if(u.pathname==='/auth/v1/user'){
  if(invalid)return r.fulfill({status:401,json:{message:'Synthetic expired session'},headers});
  if(req.method()==='PUT'){assert.deepEqual(Object.keys(req.postDataJSON()).sort(),['code_challenge','code_challenge_method','password']);assert.equal(req.postDataJSON().code_challenge,null);assert.equal(req.postDataJSON().code_challenge_method,null);updates++;if(failUpdate)return r.fulfill({status:422,json:{message:'Synthetic policy failure'},headers});}
  return r.fulfill({json:user,headers});
 }
 if(u.pathname==='/auth/v1/logout'){signouts++;assert.equal(u.searchParams.get('scope'),'global');return r.fulfill(failLogout?{status:500,json:{message:'Synthetic outage'},headers}:{status:204,headers});}
 if(u.pathname==='/functions/v1/academy-api')return r.fulfill({json:{version:1,loginRequired:true,recheckFreeAccessEveryAttempt:true,telegramRequired:false,defaultValidityCalendarMonths:3},headers});
 throw Error('Unexpected Auth endpoint '+u.pathname);
});
const callback=()=>base+'reset-password.html#access_token='+token+'&refresh_token=synthetic-refresh&expires_in=3600&token_type=bearer&type=recovery';
const openRecovery=async url=>{await page.goto('about:blank');await page.goto(url);};
const fill=async(confirm='Synthetic password 123!')=>{await page.locator('#new-password').fill('Synthetic password 123!');await page.locator('#confirm-password').fill(confirm);await page.locator('#recovery-update button').click();};
try{
 await page.goto(base+'#/login');await page.getByRole('link',{name:'Forgot password?'}).click();await page.locator('#recovery-email').fill(user.email);await page.getByRole('button',{name:'Send recovery email'}).click();await page.getByText(/If this account is eligible/).waitFor();assert.equal(requestRedirect,base+'reset-password.html');checks.push('Login → Forgot password sends official recover request to base-aware permanent callback');
 await openRecovery(base+'reset-password.html');await page.getByText(/invalid or expired/).waitFor();assert.equal(await page.locator('#recovery-update').isVisible(),false);checks.push('Missing session fails closed');
 await openRecovery(base+'reset-password.html#error=access_denied&error_description=synthetic-expired');await page.getByText(/invalid or expired/).waitFor();assert.equal(new URL(page.url()).hash,'');checks.push('Expired/error callback scrubbed; no password form');
 await openRecovery(callback());await page.locator('#recovery-update').waitFor({state:'visible'});assert.equal(new URL(page.url()).hash,'');await page.reload();await page.locator('#recovery-update').waitFor({state:'visible'});checks.push('Official SDK recovery event, remote confirmed-user check, clean URL and reload restore');
 await fill('Does not match 123!');await page.getByText(/make both passwords match/).waitFor();assert.equal(updates,0);failUpdate=true;await fill();await page.getByText(/Password update could not be confirmed/).waitFor();assert.equal(await page.locator('#new-password').inputValue(),'');failUpdate=false;checks.push('Mismatch and rejected password handled without success claim');
 for(const width of [320,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await page.locator('.brand img').evaluate(i=>i.complete&&i.naturalWidth>0),true);}
 await page.setViewportSize({width:320,height:900});await page.screenshot({path:'test-artifacts/permanent-recovery-mobile.png'});checks.push('320px and desktop reset page: logo loaded, no horizontal overflow');
 await fill();await page.getByText(/Recovery session signed out/).waitFor();assert.equal(signouts,1);assert.equal(updates,2);checks.push('Same confirmed user updated, no signup/role writes, global sign-out succeeds');
 await page.getByRole('link',{name:'Return to login'}).click();await page.locator('#auth-form').waitFor();await openRecovery(base+'reset-password.html');await page.getByText(/invalid or expired/).waitFor();checks.push('Return to login; recovery session unavailable after logout');
 failLogout=true;await openRecovery(callback());await page.locator('#recovery-update').waitFor({state:'visible'});await fill();await page.getByText(/Server-wide sign-out could not be confirmed/).waitFor();assert.equal(await page.locator('#recovery-update').isVisible(),false);assert.equal(await page.evaluate(()=>sessionStorage.getItem('examnexa-password-recovery')),null);failLogout=false;checks.push('Server sign-out outage clears isolated local session and reports uncertainty honestly');
 invalid=true;await openRecovery(callback());await page.getByText(/invalid or expired/).waitFor();assert.equal(await page.locator('#recovery-update').isVisible(),false);checks.push('Revoked session cannot update password');
 assert.deepEqual(errors,[]);fs.writeFileSync('test-artifacts/recovery-browser-results.json',JSON.stringify({passed:checks.length,checks,errors,liveEmailSent:false},null,2));console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
}catch(error){console.error(JSON.stringify({checks,errors,status:await page.locator('main').innerText().catch(()=>''),requestRedirect}));throw error;}finally{await browser.close();}
