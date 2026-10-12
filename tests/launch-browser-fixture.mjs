// Test-runner-only interception. This file is never in the server allowlist.
// No application query flag, demo login or browser-storage bypass exists.
export const authorizedModule=`
export {createLaunchAccess,launchPolicyPreview,safeChannelUrl,subjectAccessLabel} from '/launch-access.js?actual';
import {launchPolicyPreview} from '/launch-access.js?actual';
export const fixtureState={loggedIn:true,telegram:true,attemptCalls:0};
const checks=()=>[{provider:'telegram',required:true,status:fixtureState.telegram?'verified':'not_member'}];
const eligibility=testId=>({testId,policyVersion:1,status:fixtureState.telegram?'eligible':'requirements_unmet',checks:checks(),checkedAt:new Date().toISOString()});
export const launchGateway={connected:true,
getSession:async()=>fixtureState.loggedIn?{status:'authenticated',student:{id:'fixture-student',displayName:'Test student',email:'fixture@example.invalid',emailVerified:true},expiresAt:'2099-01-01T00:00:00Z'}:{status:'anonymous'},
getLaunchPolicy:async()=>({...launchPolicyPreview,version:1,youtubeChannelUrl:'https://www.youtube.com/@fixture',telegramChannelUrl:'https://t.me/fixture'}),
verifyFreeAccess:async testId=>eligibility(testId),
startAttempt:async({testId})=>{fixtureState.attemptCalls++;return !fixtureState.loggedIn?{status:'denied',reason:'login_required'}:fixtureState.telegram?{status:'started',testId,page:{attemptId:'fixture-'+fixtureState.attemptCalls}}:{status:'denied',reason:'requirements_unmet',freeAccess:eligibility(testId)};},
logout:async()=>{fixtureState.loggedIn=false;},login:async()=>{fixtureState.loggedIn=true;},register:async()=>{fixtureState.loggedIn=false;return {status:'email_confirmation_required'};},
beginSocialLink:async()=>{throw new Error('No real OAuth in tests');}
};`;
