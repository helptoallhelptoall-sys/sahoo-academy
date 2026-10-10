import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {makeWebhook} from '../_shared/handler.mjs';
const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(makeWebhook({secret:Deno.env.get('TELEGRAM_WEBHOOK_SECRET'),rpc:async(actor:string|null,action:string,payload:unknown)=>{const {data,error}=await client.rpc('academy_api',{actor,action,payload});if(error)throw error;return data;}}));
