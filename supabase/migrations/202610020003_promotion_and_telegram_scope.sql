-- Targeted extension. Existing payment, entitlement, question/import and scoring code stays intact.
begin;
alter table public.admin_settings
 add column telegram_chat_id text check(telegram_chat_id is null or telegram_chat_id ~ '^-[0-9]{5,20}$'),
 add column telegram_scope text not null default 'all' check(telegram_scope in ('all','selected')),
 add column youtube_name text not null default 'Sahoo ExamNexa' check(length(youtube_name) between 1 and 100),
 add column youtube_cta text not null default 'Subscribe on YouTube' check(length(youtube_cta) between 1 and 80),
 add column youtube_videos_url text;
alter table public.tests add column telegram_required boolean not null default false;

alter function public.academy_api(uuid,text,jsonb) rename to academy_base_api;
revoke all on function public.academy_base_api(uuid,text,jsonb) from public,anon,authenticated;
create function public.academy_api(actor uuid,action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.admin_settings; t public.tests; r jsonb; result jsonb; required boolean;
begin
 if action in ('policy','gateContext','start','verify') then
   -- Hold policy and test locks through authorization/attempt creation so changes
   -- during the remote membership lookup cannot authorize the wrong channel/scope.
   select * into cfg from public.admin_settings where id=true for share;
   if action='policy' then
     return public.academy_base_api(actor,action,payload)||jsonb_build_object(
       'youtubeChannelName',cfg.youtube_name,'youtubeCtaText',cfg.youtube_cta,'youtubeVideosUrl',cfg.youtube_videos_url,
       'telegramScope',cfg.telegram_scope,'telegramTestIds',(select coalesce(jsonb_agg(id),'[]') from public.tests where published and access='free' and telegram_required));
   end if;
   if actor is null or not exists(select 1 from public.profiles where id=actor) then raise exception 'Authentication required' using errcode='42501'; end if;
   select * into t from public.tests where id=payload->>'testId' for share;
   required=t.access='free' and cfg.telegram_required and (cfg.telegram_scope='all' or t.telegram_required);
   if action='gateContext' then return jsonb_build_object('required',coalesce(required,false),'channelId',case when required then cfg.telegram_chat_id else null end,'policyVersion',cfg.version);end if;
   if t.access='paid' then return public.academy_base_api(actor,action,payload);end if;
   if required and (cfg.telegram_chat_id is null or payload->>'telegramChatId' is distinct from cfg.telegram_chat_id or (payload->>'policyVersion')::integer is distinct from cfg.version or coalesce((payload->>'telegramVerified')::boolean,false)=false) then
     return jsonb_build_object('status','denied','reason','requirements_unmet');
   end if;
   -- The legacy core enforces the global switch. Only this service-only wrapper
   -- can exempt an unselected free test; it ignores all client-side flags.
   return public.academy_base_api(actor,action,payload||jsonb_build_object('telegramVerified',true,'policyVersion',cfg.version));
 end if;
 if action='adminSave' and payload->>'entity' in ('admin_settings','tests') then
   if not exists(select 1 from public.profiles where id=actor and role='admin') then raise exception 'Admin required' using errcode='42501'; end if;
   r=payload->'record';
   if payload->>'entity'='admin_settings' then
     if nullif(r->>'youtube_videos_url','') is not null and r->>'youtube_videos_url' !~ '^https://(www\.)?(youtube\.com|youtu\.be)/[^[:space:]]+$' then raise exception 'Invalid YouTube video URL';end if;
     result=public.academy_base_api(actor,action,payload);
     update public.admin_settings set
       telegram_chat_id=case when r ? 'telegram_chat_id' then nullif(trim(r->>'telegram_chat_id'),'') else telegram_chat_id end,
       telegram_scope=coalesce(r->>'telegram_scope',telegram_scope),
       youtube_name=coalesce(nullif(trim(r->>'youtube_name'),''),youtube_name),
       youtube_cta=coalesce(nullif(trim(r->>'youtube_cta'),''),youtube_cta),
       youtube_videos_url=case when r ? 'youtube_videos_url' then nullif(r->>'youtube_videos_url','') else youtube_videos_url end
     where id=true;
     return result;
   end if;
   -- Same lock ordering as start: settings first, then test. A scope change
   -- invalidates in-flight membership evidence even when the channel is unchanged.
   select * into cfg from public.admin_settings where id=true for update;
   result=public.academy_base_api(actor,action,payload);
   update public.tests set telegram_required=coalesce((r->>'telegram_required')::boolean,telegram_required) where id=r->>'id';
   update public.admin_settings set version=version+1 where id=true;
   return result;
 end if;
 return public.academy_base_api(actor,action,payload);
end $$;
revoke all on function public.academy_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.academy_api(uuid,text,jsonb) to service_role;
commit;
