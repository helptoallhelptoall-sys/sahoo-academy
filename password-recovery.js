// Dedicated recovery session: never reuse the main app's persistent Admin session.
import {validPublicConfig} from './supabase-gateway.js';
import {siteBase} from './site-path.js';
const status=document.querySelector('#recovery-status'),form=document.querySelector('#recovery-update');
const message=text=>{status.textContent=text;};
const marker='examnexa-recovery-user';
let client,verifiedId,updated=false;
async function confirmedUser(){
  const {data,error}=await client.auth.getUser();
  if(error||!data.user?.email_confirmed_at)throw Error('Invalid session');
  return data.user;
}
async function finish(){
  const {error}=await client.auth.signOut({scope:'global'});
  // The SDK removes local state even on many server sign-out errors. Never claim
  // a second call without a session proves global revocation. Clear our isolated
  // recovery storage in all cases; do not touch the main app's account storage.
  for(const key of Object.keys(sessionStorage))if(key.startsWith('examnexa-password-recovery'))sessionStorage.removeItem(key);
  sessionStorage.removeItem(marker);verifiedId=null;
  message(error?'Password updated; local recovery session cleared. Server-wide sign-out could not be confirmed. Log in again and sign out to retry; other sessions may remain active.':'Password updated. Recovery session signed out. Return to login with your new password.');
}
async function init(){
  const response=await fetch(new URL('public-config.json',siteBase()),{cache:'no-store'}),config=await response.json();
  if(!response.ok||!validPublicConfig(config))throw Error('Configuration unavailable');
  const {createClient}=await import('./supabase-vendor.js');
  client=createClient(config.url,config.publishableKey,{auth:{flowType:'implicit',detectSessionInUrl:true,persistSession:true,autoRefreshToken:false,storage:sessionStorage,storageKey:'examnexa-password-recovery'}});
  let recoveryEvent=false;
  client.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')recoveryEvent=true;});
  const {data,error}=await client.auth.getSession();
  // Scrub even failed/expired callback parameters; never log or render them.
  history.replaceState(null,'',new URL('reset-password.html',siteBase()).pathname);
  if(error||!data.session)throw Error('Recovery unavailable');
  const user=await confirmedUser();
  if(!recoveryEvent&&sessionStorage.getItem(marker)!==user.id)throw Error('Recovery link required');
  verifiedId=user.id;sessionStorage.setItem(marker,verifiedId);
  form.hidden=false;message('Recovery session verified. Enter your new password privately.');
}
form.addEventListener('submit',async event=>{
  event.preventDefault();if(updated||!verifiedId)return;
  const button=form.querySelector('button');let password=form.elements.password.value;
  if(password.length<12||password!==document.querySelector('#confirm-password').value){message('Use at least 12 characters and make both passwords match.');return;}
  button.disabled=true;
  try{
    if((await confirmedUser()).id!==verifiedId)throw Error('Account changed');
    const {data,error}=await client.auth.updateUser({password});password='';form.reset();
    if(error||data.user?.id!==verifiedId||!data.user.email_confirmed_at)throw Error('Update failed');
    updated=true;form.hidden=true;await finish();
  }catch{password='';form.reset();message('Password update could not be confirmed. Check the password policy or request a fresh recovery email if this session expired.');button.disabled=false;}
});
init().catch(()=>{history.replaceState(null,'',new URL('reset-password.html',siteBase()).pathname);form.hidden=true;sessionStorage.removeItem(marker);message('This recovery link is invalid or expired. Request a new recovery email and open its newest link.');});
