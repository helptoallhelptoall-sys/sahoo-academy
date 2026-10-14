-- Forward-only hierarchy visibility/validation. No data or mappings are changed.
-- Apply only after separate approval. Existing IDs, questions and dependencies stay intact.
begin;
drop policy public_subjects on public.subjects;
create policy public_subjects on public.subjects for select to anon,authenticated
 using(published and exists(select 1 from public.exams e where e.id=any(exam_ids) and e.published));
-- Existing topic/test policies inherit parent visibility through RLS; the
-- existing composite foreign key enforces matching test topic/subject IDs.

alter function public.academy_api(uuid,text,jsonb) rename to academy_hierarchy_base_api;
revoke all on function public.academy_hierarchy_base_api(uuid,text,jsonb) from public,anon,authenticated;

create function public.academy_api(actor uuid,action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare rec jsonb; ids text[];
begin
 if action='adminSave' and payload->>'entity' in ('exams','subjects','topics','tests') then
  if not exists(select 1 from public.profiles where id=actor and role='admin') then raise exception 'Admin required' using errcode='42501';end if;
  perform 1 from public.admin_settings where id=true for update;
 end if;
 if action='catalog' then
  return (with e as (select * from public.exams where published),
   s as (select * from public.subjects where published and exists(select 1 from e where e.id=any(exam_ids))),
   p as (select p.* from public.topics p join s on s.id=p.subject_id where p.published),
   t as (select t.* from public.tests t join p on p.id=t.topic_id and p.subject_id=t.subject_id where t.published)
   select jsonb_build_object('exams',(select coalesce(jsonb_agg(to_jsonb(e) order by name,id),'[]') from e),
    'subjects',(select coalesce(jsonb_agg(to_jsonb(s) order by name,id),'[]') from s),
    'topics',(select coalesce(jsonb_agg(to_jsonb(p) order by name,id),'[]') from p),
    'tests',(select coalesce(jsonb_agg(to_jsonb(t) order by title,id),'[]') from t)));
 end if;
 if action in ('start','verify','gateContext','createOrder') then
  -- Lock the complete path through the attempt/order transaction. Admin changes
  -- to any ancestor cannot race authorization. Entitlement checks remain downstream.
  perform 1 from public.admin_settings where id=true for share;
  perform 1 from public.exams order by id for share;
  perform 1 from public.subjects order by id for share;
  perform 1 from public.topics order by id for share;
  if action='createOrder' then
   if not exists(select 1 from public.subjects s where s.id=payload->>'subjectId' and s.published
     and exists(select 1 from public.exams e where e.id=any(s.exam_ids) and e.published)) then
    raise exception 'Subject unavailable';
   end if;
  elsif not exists(select 1 from public.tests t join public.topics p on p.id=t.topic_id and p.subject_id=t.subject_id
    join public.subjects s on s.id=t.subject_id where t.id=payload->>'testId' and t.published and p.published and s.published
    and exists(select 1 from public.exams e where e.id=any(s.exam_ids) and e.published)) then
   return jsonb_build_object('status','denied','reason','test_unavailable');
  end if;
 end if;
 if action='adminSave' and payload->>'entity' in ('subjects','topics','tests') then
  if not exists(select 1 from public.profiles where id=actor and role='admin') then raise exception 'Admin required' using errcode='42501';end if;
  rec=payload->'record';
  if payload->>'entity'='subjects' then
   if jsonb_typeof(rec->'exam_ids') is distinct from 'array' then raise exception 'Select the parent exam';end if;
   if exists(select 1 from jsonb_array_elements(rec->'exam_ids') x where jsonb_typeof(x)<>'string') then raise exception 'Invalid exam IDs';end if;
   select coalesce(array_agg(x),'{}') into ids from jsonb_array_elements_text(rec->'exam_ids') x;
   if cardinality(ids)<>(select count(distinct x) from unnest(ids) x)
     or exists(select 1 from unnest(ids) x where not exists(select 1 from public.exams e where e.id=x))
     or (coalesce((rec->>'published')::boolean,false) and cardinality(ids)=0) then raise exception 'Select valid, distinct parent exams';end if;
  elsif not exists(select 1 from public.subjects s where s.id=rec->>'subject_id') then raise exception 'Select an existing exam-specific subject';
  elsif payload->>'entity'='tests' and not exists(select 1 from public.topics p where p.id=rec->>'topic_id' and p.subject_id=rec->>'subject_id') then
   raise exception 'Topic must belong to the selected subject';
  end if;
 end if;
 return public.academy_hierarchy_base_api(actor,action,payload);
end $$;
revoke all on function public.academy_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.academy_api(uuid,text,jsonb) to service_role;
commit;
