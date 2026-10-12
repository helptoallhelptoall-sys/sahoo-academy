import {Buffer} from 'node:buffer';
Object.assign(globalThis,{Buffer});
import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {makeHandler} from '../_shared/handler.mjs';
import {inspectCanonicalHtml} from '../../../scripts/html-import.mjs';
import {inspectSourceArrayHtml} from '../../../scripts/source-array-import.mjs';
const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const rpc=async(actor:string|null,action:string,payload:unknown)=>{const {data,error}=await client.rpc('academy_api',{actor,action,payload});if(error)throw error;return data;};
Deno.serve(makeHandler({rpc,getUser:async(token:string)=>{const {data,error}=await client.auth.getUser(token);if(error)throw error;return data.user;},config:{origins:(Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean),botUsername:Deno.env.get('TELEGRAM_BOT_USERNAME'),botToken:Deno.env.get('TELEGRAM_BOT_TOKEN'),webhookSecret:Deno.env.get('TELEGRAM_WEBHOOK_SECRET')},inspectHtml:(html:string,expectedCount:number)=>html.includes('<script type="application/json" id="sahoo-mock-data">')?inspectCanonicalHtml(html):inspectSourceArrayHtml(html,{expectedCount})}));
