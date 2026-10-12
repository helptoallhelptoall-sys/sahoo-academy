begin;
create table public.api_rate_limits(student_id uuid references public.profiles, bucket timestamptz not null, hits integer not null default 0, primary key(student_id,bucket));
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public,anon,authenticated;
grant all on public.api_rate_limits to service_role;
-- Wrapped separately to keep the main migration readable and make the limit testable.
alter function public.academy_api(uuid,text,jsonb) rename to academy_internal;
revoke all on function public.academy_internal(uuid,text,jsonb) from public,anon,authenticated;
create function public.academy_api(actor uuid,action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if action='rateLimit' then
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  insert into public.api_rate_limits values(actor,date_trunc('minute',now()),1) on conflict(student_id,bucket) do update set hits=public.api_rate_limits.hits+1 returning hits into n;
  if n>20 then raise exception 'Too many requests'; end if;
  delete from public.api_rate_limits where student_id=actor and bucket<now()-interval '1 day';
  return jsonb_build_object('allowed',true);
 end if;
 return public.academy_internal(actor,action,payload);
end $$;
revoke all on function public.academy_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.academy_api(uuid,text,jsonb) to service_role;
commit;
