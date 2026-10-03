// Presentation/integration boundary only. Real authorization belongs to the server.
// No tokens, fake accounts, persistent flags, payment approvals or social verification.
export const launchPolicyPreview=Object.freeze({version:0,loginRequired:true,recheckFreeAccessEveryAttempt:true,telegramRequired:true,telegramScope:'all',telegramTestIds:[],youtubeChannelUrl:null,youtubeChannelName:'Sahoo ExamNexa',youtubeCtaText:'Subscribe on YouTube',youtubeVideosUrl:null,telegramChannelUrl:null,defaultValidityCalendarMonths:3});
const unavailable=async()=>{throw Object.assign(new Error('Backend/Supabase integration is not connected.'),{code:'BACKEND_UNAVAILABLE'});};
import {configuredGateway} from './supabase-gateway.js';
export const launchGateway=await configuredGateway()||Object.freeze({connected:false,getSession:unavailable,register:unavailable,login:unavailable,logout:unavailable,getMyAccount:unavailable,getLaunchPolicy:unavailable,beginSocialLink:unavailable,verifyFreeAccess:unavailable,startAttempt:unavailable,getSubjectAccess:unavailable,updateLaunchPolicy:unavailable,updateSubjectOffer:unavailable,updateTestAccess:unavailable});

export function safeChannelUrl(value,provider){
  try{const u=new URL(value);const hosts=provider==='youtube'?['youtube.com','www.youtube.com']:provider==='youtubeVideo'?['youtube.com','www.youtube.com','youtu.be']:['t.me','telegram.me'];return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&hosts.includes(u.hostname)&&u.pathname!=='/'?u.href:null;}catch{return null;}
}
function validPolicy(p){return p&&Number.isInteger(p.version)&&p.version>=0&&p.loginRequired===true&&p.recheckFreeAccessEveryAttempt===true&&typeof p.telegramRequired==='boolean'&&Number.isInteger(p.defaultValidityCalendarMonths)&&p.defaultValidityCalendarMonths>0;}
function validEligibility(v,id){return v?.testId===id&&['eligible','login_required','requirements_unmet','verification_unavailable','test_unavailable'].includes(v.status)&&Array.isArray(v.checks);}

export function createLaunchAccess(gateway=launchGateway){
  let state={status:'checking',user:null,policy:launchPolicyPreview,eligibility:null,busy:false,message:''};let generation=0;
  const snapshot=()=>structuredClone(state);
  const fail=(message='Access cannot be verified. Backend integration is required.')=>{state={...state,status:'unavailable',user:null,eligibility:null,message};};
  async function sessionAndPolicy(ticket){
    const [session,receivedPolicy]=await Promise.all([gateway.getSession(),gateway.getLaunchPolicy()]);
    // A legacy YouTube requirement has no role in the current access policy.
    const policy=receivedPolicy&&{version:receivedPolicy.version,loginRequired:receivedPolicy.loginRequired,recheckFreeAccessEveryAttempt:receivedPolicy.recheckFreeAccessEveryAttempt,telegramRequired:receivedPolicy.telegramRequired,telegramScope:receivedPolicy.telegramScope==='selected'?'selected':'all',telegramTestIds:Array.isArray(receivedPolicy.telegramTestIds)?receivedPolicy.telegramTestIds:[],youtubeChannelUrl:receivedPolicy.youtubeChannelUrl??null,youtubeChannelName:receivedPolicy.youtubeChannelName||'Sahoo ExamNexa',youtubeCtaText:receivedPolicy.youtubeCtaText||'Subscribe on YouTube',youtubeVideosUrl:receivedPolicy.youtubeVideosUrl??null,telegramChannelUrl:receivedPolicy.telegramChannelUrl??null,defaultValidityCalendarMonths:receivedPolicy.defaultValidityCalendarMonths};
    if(ticket!==generation)return false;
    if(!validPolicy(policy))throw new Error('Invalid launch policy');
    if(session?.status==='anonymous'){state={...state,status:'anonymous',user:null,policy,eligibility:null,message:'Log in or register before attempting a mock test.'};return false;}
    if(session?.status!=='authenticated'||!session.student?.id||session.student.emailVerified!==true||!Number.isFinite(Date.parse(session.expiresAt)))throw new Error('Session not confirmed');
    state={...state,status:'authenticated',user:session.student,policy,message:''};return true;
  }
  async function operation(work){
    if(state.busy)return null;
    const ticket=++generation;state={...state,busy:true,message:''};
    try{return await work(ticket);}catch{if(ticket===generation)fail(gateway.realBackend?'Sign-in or access check failed. Check your credentials, email confirmation and connection.':undefined);return null;}finally{if(ticket===generation)state={...state,busy:false};}
  }
  const restore=()=>operation(async ticket=>{state.eligibility=null;await sessionAndPolicy(ticket);return snapshot();});
  return {
    get snapshot(){return snapshot();},
    restore,
    authenticate(mode,credentials){return operation(async ticket=>{
      if(!['register','login'].includes(mode))throw new Error('Invalid operation');
      const result=await gateway[mode](credentials);if(ticket!==generation)return null;
      await sessionAndPolicy(ticket);if(ticket!==generation)return null;
      if(result?.status==='email_confirmation_required'&&state.status!=='authenticated')state.message='Check your email to confirm registration, then log in.';
      return snapshot();
    });},
    async logout(){
      const ticket=++generation;state={...state,status:'anonymous',user:null,eligibility:null,busy:true,message:''};
      try{await gateway.logout();if(ticket===generation)state.message='You are logged out.';}
      catch{if(ticket===generation)fail('Local account view cleared. Server logout could not be confirmed; reconnect and sign out again.');}
      finally{if(ticket===generation)state.busy=false;}
      return snapshot();
    },
    verify(testId){return operation(async ticket=>{
      state.eligibility=null;if(!await sessionAndPolicy(ticket))return null;
      const result=await gateway.verifyFreeAccess(testId);if(ticket!==generation)return null;
      if(!validEligibility(result,testId))throw new Error('Invalid eligibility response');
      state.eligibility=result;state.message=result.status==='eligible'?'Requirements verified. They will be checked again when you start.':'Complete the requirements shown below, then verify again.';return result;
    });},
    start(testId){return operation(async ticket=>{
      state.eligibility=null;if(!await sessionAndPolicy(ticket))return null;
      // This endpoint MUST independently recheck login, current policy, Telegram membership,
      // publication and any paid entitlement before creating EACH attempt.
      const result=await gateway.startAttempt({testId,idempotencyKey:globalThis.crypto.randomUUID()});if(ticket!==generation)return null;
      if(result?.status==='denied'){
        if(validEligibility(result.freeAccess,testId))state.eligibility=result.freeAccess;
        if(result.reason==='login_required'){state.status='anonymous';state.user=null;}
        state.message=result.freeAccess?.status==='verification_unavailable'?'Telegram verification is temporarily unavailable. Please retry; access has not been granted.':result.freeAccess?.checks?.some(c=>c.status==='not_linked')?'Connect your Telegram account, join the channel, then verify membership.':'Access was not granted. Review the requirements and try again.';return null;
      }
      if(result?.status!=='started'||result.testId!==testId||!result.page?.attemptId)throw new Error('No confirmed attempt');
      return result;
    });}
  };
}

// Formats server-derived states; it does not create or extend an entitlement.
export function subjectAccessLabel(record){
  if(record?.state==='payment_pending')return 'Payment pending';
  if(record?.state==='active'&&Number.isFinite(Date.parse(record.expiresAt)))return 'Active until '+new Date(record.expiresAt).toLocaleDateString('en-IN',{year:'numeric',month:'short',day:'numeric'});
  if(record?.state==='expired')return 'Expired · Renew access';
  return 'Locked';
}
