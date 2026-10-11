-- Forward-only extension. No existing content, imports, attempts or roles are changed.
begin;
create table public.manual_test_reviews (
 test_id text primary key references public.tests,
 reviewed_revision integer,
 reviewed_by uuid references public.profiles,
 review_note text
);
alter table public.manual_test_reviews enable row level security;
revoke all on public.manual_test_reviews from public,anon,authenticated;
grant all on public.manual_test_reviews to service_role;

alter function public.academy_api(uuid,text,jsonb) rename to academy_catalog_api;
revoke all on function public.academy_catalog_api(uuid,text,jsonb) from public,anon,authenticated;
create function public.academy_api(actor uuid,action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.tests; imp public.imports; old jsonb; q jsonb; opts jsonb; result jsonb; n integer; rec jsonb;
begin
 if action in ('adminQuestions','adminSaveQuestion','adminReviewQuestions') then
  if not exists(select 1 from public.profiles where id=actor and role='admin') then raise exception 'Admin required' using errcode='42501';end if;
  if action='adminQuestions' then
   return (select coalesce(jsonb_agg(to_jsonb(r) order by r.test_id,r.number),'[]') from (
    select x.test_id,x.number,x.content,catalog_test.title,catalog_test.subject_id,catalog_test.topic_id,catalog_test.published,catalog_test.revision
    from public.questions x join public.tests catalog_test on catalog_test.id=x.test_id
    where (nullif(payload->>'subjectId','') is null or catalog_test.subject_id=payload->>'subjectId')
      and (nullif(payload->>'topicId','') is null or catalog_test.topic_id=payload->>'topicId')
      and (nullif(payload->>'search','') is null or strpos(lower(x.content->>'text'),lower(left(payload->>'search',200)))>0)
    order by x.test_id,x.number limit 500
   ) r);
  end if;
  -- Match publication/start lock ordering. Revision is an optimistic editing guard.
  perform 1 from public.admin_settings where id=true for update;
  select * into t from public.tests where id=payload->>'testId' for update;
  if t.id is null or t.published then raise exception 'Select an unpublished test';end if;
  if t.revision is distinct from (payload->>'expectedRevision')::integer then raise exception 'Test changed; reload before editing';end if;
  if not exists(select 1 from public.topics where id=t.topic_id and subject_id=t.subject_id) then raise exception 'Invalid catalog placement';end if;
  select * into imp from public.imports where test_id=t.id for update;
  if action='adminReviewQuestions' then
   if imp.id is not null or t.question_count<1 or not exists(select 1 from public.manual_test_reviews where test_id=t.id)
      or payload->>'decision' is distinct from 'approve' or length(trim(coalesce(payload->>'reason','')))<20 then raise exception 'Review every manual question and provide evidence';end if;
   update public.manual_test_reviews set reviewed_revision=t.revision,reviewed_by=actor,review_note=payload->>'reason' where test_id=t.id;
   insert into public.admin_audit(actor_id,action,details) values(actor,action,payload);
   return jsonb_build_object('saved',true);
  end if;
  n=(payload->>'number')::integer;
  if n is null then
   if imp.id is not null then raise exception 'Cannot add to an exact-count HTML import';end if;
   select coalesce(max(number),0)+1 into n from public.questions where test_id=t.id;
  else
   select content into old from public.questions where test_id=t.id and number=n;
   if old is null then raise exception 'Question not found';end if;
  end if;
  if imp.id is not null and not imp.pass1 then raise exception 'Resolve original import structural issues first';end if;
  q=payload->'question';
  if jsonb_typeof(q) is distinct from 'object' or jsonb_typeof(q->'options') is distinct from 'array' then raise exception 'Question and options required';end if;
  if jsonb_array_length(q->'options')<>4 then raise exception 'Exactly four options required';end if;
  if jsonb_typeof(q->'text') is distinct from 'string' or length(trim(replace(q->>'text','🟢',''))) not between 1 and 20000
    or jsonb_typeof(q->'explanation') is distinct from 'string' or length(trim(q->>'explanation')) not between 1 and 30000 then raise exception 'Question and explanation required';end if;
  if exists(select 1 from jsonb_array_elements(q->'options') o where jsonb_typeof(o->'text') is distinct from 'string' or length(trim(o->>'text')) not between 1 and 10000)
    or (select count(distinct lower(trim(o->>'text'))) from jsonb_array_elements(q->'options') o)<>4 then raise exception 'Four distinct non-empty options required';end if;
  if jsonb_typeof(q->'tags') is distinct from 'array' then raise exception 'Tags must be an array';end if;
  if jsonb_array_length(q->'tags')>30 or exists(select 1 from jsonb_array_elements(q->'tags') v where jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}')>500) then raise exception 'Invalid tags';end if;
  -- Stable option IDs and private imported metadata survive text edits.
  select jsonb_agg(coalesce(old->'options'->(ord::integer-1),'{}')||jsonb_build_object('id',coalesce(old->'options'->(ord::integer-1)->>'id','o'||(ord-1)::text),'text',o->>'text') order by ord)
   into opts from jsonb_array_elements(q->'options') with ordinality x(o,ord);
  if jsonb_typeof(q->'correctIndex') is distinct from 'number' or (q->>'correctIndex') !~ '^[0-3]$' then raise exception 'Exactly one correct option required';end if;
  q=coalesce(old,'{}')||jsonb_build_object('id',coalesce(old->>'id','manual-'||gen_random_uuid()::text),'number',n,
    'text',replace(q->>'text','🟢',''),'options',opts,'correctOptionId',opts->((q->>'correctIndex')::integer)->>'id',
    'explanation',q->>'explanation','tags',q->'tags','topic',coalesce(old->>'topic',(select name from public.topics where id=t.topic_id)));
  insert into public.questions values(t.id,n,q) on conflict(test_id,number) do update set content=excluded.content;
  update public.tests set question_count=(select count(*) from public.questions where test_id=t.id),revision=revision+1 where id=t.id;
  if imp.id is not null then
   -- Preserve original HTML/canonical source and count. Every edit invalidates review.
   update public.imports set working=(select jsonb_agg(content order by number) from public.questions where test_id=t.id),audit=jsonb_set(audit,'{manualEditRevision}',to_jsonb(t.revision+1)),pass2=false,review_note=null,reviewed_by=null where id=imp.id;
  else
   insert into public.manual_test_reviews(test_id) values(t.id) on conflict(test_id) do update set reviewed_revision=null,reviewed_by=null,review_note=null;
  end if;
  insert into public.admin_audit(actor_id,action,details) values(actor,action,jsonb_build_object('testId',t.id,'number',n,'before',old,'after',q));
  return jsonb_build_object('saved',true,'number',n);
 end if;
 if action in ('adminImportDetail','adminVerifyContent') then
  if not exists(select 1 from public.profiles where id=actor and role='admin') then raise exception 'Admin required' using errcode='42501';end if;
  if action='adminImportDetail' then
   result=public.academy_catalog_api(actor,action,payload);
   return result||jsonb_build_object('testRevision',(select revision from public.tests where id=result->>'test_id'));
  end if;
  perform 1 from public.admin_settings where id=true for update;
  select * into t from public.tests where id=(select test_id from public.imports where id=(payload->>'importId')::uuid) for update;
  select * into imp from public.imports where id=(payload->>'importId')::uuid for update;
  if imp.audit ? 'manualEditRevision' and t.revision is distinct from (payload->>'expectedRevision')::integer then raise exception 'Reload and review the current imported revision';end if;
 end if;
 if action='adminImport' and exists(select 1 from public.manual_test_reviews where test_id=payload->>'testId') then raise exception 'Manual test already contains questions; choose an empty draft for HTML import';end if;
 if action='adminSave' and payload->>'entity'='tests' and exists(select 1 from public.manual_test_reviews where test_id=payload->'record'->>'id') then
  if not exists(select 1 from public.profiles where id=actor and role='admin') then raise exception 'Admin required' using errcode='42501';end if;
  perform 1 from public.admin_settings where id=true for update;
  rec=payload->'record';select * into t from public.tests where id=rec->>'id' for update;
  if coalesce((rec->>'published')::boolean,false) and (t.question_count<1 or not exists(select 1 from public.manual_test_reviews where test_id=t.id and reviewed_revision=t.revision)) then raise exception 'Complete the current content review before publication';end if;
  result=public.academy_catalog_api(actor,action,jsonb_set(payload,'{record,published}','false'));
  update public.tests set published=coalesce((rec->>'published')::boolean,false) where id=t.id;
  return result;
 end if;
 return public.academy_catalog_api(actor,action,payload);
end $$;
revoke all on function public.academy_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.academy_api(uuid,text,jsonb) to service_role;
commit;
