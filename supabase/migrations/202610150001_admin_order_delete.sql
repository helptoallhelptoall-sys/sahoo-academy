-- Forward only. Application history and original import evidence are never cascaded.
begin;
alter table public.exams add column display_order integer not null default 0, add column deleted_at timestamptz;
alter table public.subjects add column display_order integer not null default 0, add column deleted_at timestamptz;
alter table public.topics add column display_order integer not null default 0, add column deleted_at timestamptz;
alter table public.tests add column display_order integer not null default 0, add column deleted_at timestamptz;
alter table public.questions add column display_order integer not null default 0;
-- Original extraction count remains exact; later explicit removals are separately audited.
alter table public.imports drop constraint imports_removed_check;
alter table public.imports add constraint imports_removed_check check(removed between 0 and source_count);
-- Preserve the pre-migration alphabetical catalog and source bank order.
with ranked as(select id,row_number() over(order by name,id) n from public.exams) update public.exams e set display_order=r.n from ranked r where r.id=e.id;
with ranked as(select id,row_number() over(partition by exam_ids order by name,id) n from public.subjects) update public.subjects e set display_order=r.n from ranked r where r.id=e.id;
with ranked as(select id,row_number() over(partition by subject_id order by name,id) n from public.topics) update public.topics e set display_order=r.n from ranked r where r.id=e.id;
with ranked as(select id,row_number() over(partition by topic_id order by title,id) n from public.tests) update public.tests e set display_order=r.n from ranked r where r.id=e.id;
update public.questions set display_order=number;
-- Tombstones also stay unavailable through direct browser table reads.
create policy active_exams on public.exams as restrictive for select to anon,authenticated using(deleted_at is null);
create policy active_subjects on public.subjects as restrictive for select to anon,authenticated using(deleted_at is null);
create policy active_topics on public.topics as restrictive for select to anon,authenticated using(deleted_at is null);
create policy active_tests on public.tests as restrictive for select to anon,authenticated using(deleted_at is null);

create function public.academy_working_questions(tid text) returns jsonb language sql stable set search_path='' as $$
 select coalesce((select working from public.imports where test_id=tid),(select jsonb_agg(content order by display_order,number) from public.questions where test_id=tid),'[]');
$$;
-- Validate the remaining *working* bank. Original source numbering stays private,
-- while ordinality defines the editable position; no source ID is renumbered.
create function public.academy_working_issues(bank jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare q jsonb; n integer=0; issues jsonb='[]'; ids text[]='{}'; fingerprints text[]='{}'; fp text; bad text[];
begin
 for q in select value from jsonb_array_elements(bank) loop
  n=n+1; bad='{}';
  if jsonb_typeof(q) is distinct from 'object' then bad=array_append(bad,'item');else
   if nullif(q->>'id','') is null or q->>'id'=any(ids) then bad=array_append(bad,'id');end if; ids=array_append(ids,q->>'id');
   if jsonb_typeof(q->'text') is distinct from 'string' or length(trim(q->>'text'))=0 then bad=array_append(bad,'text');end if;
   if jsonb_typeof(q->'options') is distinct from 'array' then bad=array_append(bad,'options');else
    if jsonb_array_length(q->'options')<>4 or (select count(distinct o->>'id') from jsonb_array_elements(q->'options') o)<>4
     or exists(select 1 from jsonb_array_elements(q->'options') o where nullif(o->>'id','') is null or jsonb_typeof(o->'text') is distinct from 'string' or length(trim(o->>'text'))=0) then bad=array_append(bad,'options');end if;
    if nullif(q->>'correctOptionId','') is null or (select count(*) from jsonb_array_elements(q->'options') o where o->>'id'=q->>'correctOptionId')<>1 then bad=array_append(bad,'answer');end if;
    fp=jsonb_build_array(q->'text',(select jsonb_agg(o->'text') from jsonb_array_elements(q->'options') o))::text;
    if fp=any(fingerprints) then bad=array_append(bad,'duplicate');end if; fingerprints=array_append(fingerprints,fp);
   end if;
   if jsonb_typeof(q->'explanation') is distinct from 'string' or length(trim(q->>'explanation'))=0 then bad=array_append(bad,'explanation');end if;
   if jsonb_typeof(q->'topic') is distinct from 'string' or length(trim(q->>'topic'))=0 then bad=array_append(bad,'topic');end if;
   if jsonb_typeof(q->'tags') is distinct from 'array' then bad=array_append(bad,'tags');end if;
  end if;
  select issues||coalesce(jsonb_agg(jsonb_build_object('number',n,'field',b,'severity','blocking','message','Working record requires review: '||b)),'[]') into issues from unnest(bad) b;
 end loop;
 return issues;
end $$;

create function public.academy_order_rows(entity text,parent text) returns jsonb language plpgsql stable set search_path='' as $$
declare r jsonb;
begin
 if entity='exams' then select jsonb_agg(to_jsonb(x) order by display_order,id) into r from public.exams x where deleted_at is null;
 elsif entity='subjects' then
  -- Explicit shared legacy subjects cannot accidentally move between exam scopes.
  select jsonb_agg(to_jsonb(x) order by display_order,id) into r from public.subjects x where deleted_at is null and exam_ids=array[parent];
 elsif entity='topics' then select jsonb_agg(to_jsonb(x) order by display_order,id) into r from public.topics x where deleted_at is null and subject_id=parent;
 elsif entity='tests' then select jsonb_agg(to_jsonb(x) order by display_order,id) into r from public.tests x where deleted_at is null and topic_id=parent;
 elsif entity='questions' then
  if not exists(select 1 from public.tests where id=parent and deleted_at is null) then raise exception 'Test unavailable';end if;
  select jsonb_agg(jsonb_build_object('id',q->>'id','name',q->>'text','display_order',n,'published',t.published,'revision',t.revision) order by n) into r
   from public.tests t,jsonb_array_elements(public.academy_working_questions(parent)) with ordinality x(q,n) where t.id=parent;
 else raise exception 'Unsupported collection';end if;
 return coalesce(r,'[]');
end $$;

create function public.academy_delete_impact(entity text,rid text,parent text) returns jsonb language plpgsql stable set search_path='' as $$
declare r jsonb; ss text[]='{}'; ps text[]='{}'; ts text[]='{}'; out jsonb; qs jsonb;
begin
 if entity in ('exams','subjects','topics','tests') then
  execute format('select to_jsonb(x) from public.%I x where id=$1 and deleted_at is null',entity) into r using rid;
 elsif entity='questions' then
  select q into r from jsonb_array_elements(public.academy_working_questions(parent)) q where q->>'id'=rid;
  if (select count(*) from jsonb_array_elements(public.academy_working_questions(parent)) q where q->>'id'=rid)<>1 then raise exception 'Question identity is ambiguous';end if;
 else raise exception 'Unsupported collection';end if;
 if r is null then raise exception 'Record unavailable';end if;
 if entity='exams' then
  if exists(select 1 from public.subjects where rid=any(exam_ids) and cardinality(exam_ids)>1 and deleted_at is null) then raise exception 'Shared subject: explicitly separate its exam placement before deleting';end if;
  select coalesce(array_agg(id),'{}') into ss from public.subjects where rid=any(exam_ids) and deleted_at is null;
 elsif entity='subjects' then ss=array[rid];end if;
 select coalesce(array_agg(id),'{}') into ps from public.topics where (subject_id=any(ss) or (entity='topics' and id=rid)) and deleted_at is null;
 select coalesce(array_agg(id),'{}') into ts from public.tests where (topic_id=any(ps) or (entity='tests' and id=rid) or (entity='questions' and id=parent)) and deleted_at is null;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'revision',t.revision,'bankHash',md5(public.academy_working_questions(t.id)::text)) order by t.id),'[]') into qs from public.tests t where id=any(ts);
 out=jsonb_build_object('entity',entity,'id',rid,'parentId',parent,'label',coalesce(r->>'name',r->>'title',r->>'text',rid),'published',case when entity='questions' then (select published from public.tests where id=parent) else (r->>'published')::boolean end,
 'subjects',ss,'topics',ps,'tests',ts,'childRecords',case when entity='questions' then 0 else greatest(cardinality(ss)+cardinality(ps)+cardinality(ts)-case when entity in ('subjects','topics','tests') then 1 else 0 end,0) end,
 'questions',case when entity='questions' then 1 else (select coalesce(sum(jsonb_array_length(public.academy_working_questions(id))),0) from public.tests where id=any(ts)) end,
 'imports',(select count(*) from public.imports where test_id=any(ts)),
 'attempts',(select count(*) from public.attempts where test_id=any(ts)),
 'results',(select count(*) from public.attempts where test_id=any(ts) and submitted_at is not null),
 'payments',(select count(*) from public.payment_submissions where subject_id=any(ss)),
 'entitlements',(select count(*) from public.entitlements where subject_id=any(ss)),
 'record',r,'banks',qs);
 return out||jsonb_build_object('version',md5(out::text));
end $$;

-- Only this helper replaces active working rows. Sources, audit and attempts stay immutable.
create function public.academy_install_working(tid text,bank jsonb,who uuid,operation text,detail jsonb) returns void language plpgsql set search_path='' as $$
declare imp public.imports; work_issues jsonb; q jsonb; n integer; rev integer;
begin
 select * into imp from public.imports where test_id=tid for update;
 work_issues=public.academy_working_issues(bank);
 delete from public.questions where test_id=tid;
 if jsonb_array_length(work_issues)=0 then
  for q,n in select value,ordinality::integer from jsonb_array_elements(bank) with ordinality loop
   insert into public.questions(test_id,number,content,display_order) values(tid,(q->>'number')::integer,q,n);
  end loop;
 end if;
 update public.tests set question_count=case when jsonb_array_length(work_issues)=0 then jsonb_array_length(bank) else 0 end,revision=revision+1,published=false where id=tid returning revision into rev;
 if imp.id is not null then
  update public.imports set working=bank,removed=source_count-jsonb_array_length(bank),issues=work_issues,pass1=jsonb_array_length(work_issues)=0,pass2=false,review_note=null,reviewed_by=null,
   audit=audit||jsonb_build_object('activeQuestions',jsonb_array_length(bank),'intentionalRemoved',source_count-jsonb_array_length(bank),'manualEditRevision',rev,'workingOperations',coalesce(audit->'workingOperations','[]')||jsonb_build_array(jsonb_build_object('action',operation,'actor',who,'at',now(),'detail',detail))) where id=imp.id;
 else
  insert into public.manual_test_reviews(test_id) values(tid) on conflict(test_id) do update set reviewed_revision=null,reviewed_by=null,review_note=null;
 end if;
end $$;

alter function public.academy_api(uuid,text,jsonb) rename to academy_order_base_api;
revoke all on function public.academy_order_base_api(uuid,text,jsonb) from public,anon,authenticated;
create function public.academy_api(actor uuid,action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare entity text=payload->>'entity'; parent text=coalesce(payload->>'parentId',''); rid text=payload->>'id'; rows jsonb; bank jsonb; oldbank jsonb; impact jsonb; result jsonb; rec jsonb; ids text[]; oldids text[]; pos integer; v_index integer; item jsonb;
begin
 if action like 'admin%' then
  if not exists(select 1 from public.profiles where id=actor and role='admin') then raise exception 'Admin required' using errcode='42501';end if;
  -- One lock order serializes hierarchy edits, content changes, previews applied,
  -- publication and start authorization. A preview by itself never locks/writes.
  if action not in ('adminList','adminQuestions','adminOrderList','adminDeletePreview','adminImportDetail') then perform 1 from public.admin_settings where id=true for update;end if;
 end if;
 if action='adminOrderList' then rows=public.academy_order_rows(entity,parent);return jsonb_build_object('records',rows,'version',md5(rows::text));end if;
 if action in ('adminDeletePreview','adminDelete') then
  impact=public.academy_delete_impact(entity,rid,parent);
  if action='adminDeletePreview' then return impact-'record'-'banks';end if;
  if payload->>'confirmation' is distinct from 'Delete permanently' or payload->>'expectedVersion' is distinct from impact->>'version' then raise exception 'Confirm the current deletion preview';end if;
  if length(trim(coalesce(payload->>'reason','')))<5 then raise exception 'Deletion reason required';end if;
  if entity='questions' then
   oldbank=public.academy_working_questions(parent);
   select coalesce(jsonb_agg(q order by n),'[]') into bank from jsonb_array_elements(oldbank) with ordinality x(q,n) where q->>'id'<>rid;
   perform public.academy_install_working(parent,bank,actor,action,jsonb_build_object('removedId',rid,'reason',payload->>'reason','before',impact->'record'));
  else
   -- Retain FK tombstones for historical result/payment references. Remove active
   -- questions, but never raw imports, immutable snapshots, results or audit rows.
   for rid in select jsonb_array_elements_text(impact->'tests') loop
    perform public.academy_install_working(rid,'[]',actor,action,jsonb_build_object('reason',payload->>'reason','ancestor',impact->>'id'));
    update public.tests set deleted_at=now(),published=false where id=rid;
   end loop;
   update public.topics set deleted_at=now(),published=false where id in(select jsonb_array_elements_text(impact->'topics'));
   update public.subjects set deleted_at=now(),published=false where id in(select jsonb_array_elements_text(impact->'subjects'));
   if entity='exams' then update public.exams set deleted_at=now(),published=false where id=payload->>'id';end if;
  end if;
  insert into public.admin_audit(actor_id,action,details) values(actor,action,jsonb_build_object('impact',impact,'reason',payload->>'reason'));
  return jsonb_build_object('saved',true,'historyPreserved',true);
 end if;
 if action='adminReorder' then
  rows=public.academy_order_rows(entity,parent);
  if payload->>'expectedVersion' is distinct from md5(rows::text) or jsonb_typeof(payload->'ids') is distinct from 'array' then raise exception 'Order changed; reload first';end if;
  select array_agg(x) into ids from jsonb_array_elements_text(payload->'ids') x;
  select array_agg(x->>'id') into oldids from jsonb_array_elements(rows) x;
  if cardinality(ids) is distinct from cardinality(oldids) or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) or not(ids @> oldids and ids <@ oldids) then raise exception 'Exact sibling IDs required';end if;
  if entity='questions' then
   oldbank=public.academy_working_questions(parent);
   select jsonb_agg(q order by n) into bank from unnest(ids) with ordinality x(id,n) join lateral jsonb_array_elements(oldbank) q on q->>'id'=x.id;
   perform public.academy_install_working(parent,bank,actor,action,jsonb_build_object('before',oldids,'after',ids));
  else
   for v_index in 1..cardinality(ids) loop execute format('update public.%I set display_order=$1 where id=$2 and deleted_at is null',entity) using v_index,ids[v_index];end loop;
  end if;
  insert into public.admin_audit(actor_id,action,details) values(actor,action,jsonb_build_object('entity',entity,'parentId',parent,'before',oldids,'after',ids));return jsonb_build_object('saved',true);
 end if;
 if action='adminQuestions' then
  return (select coalesce(jsonb_agg(to_jsonb(r) order by r.test_id,r.display_order),'[]') from (
   select t.id test_id,(q->>'number')::integer number,n display_order,q content,t.title,t.subject_id,t.topic_id,t.published,t.revision
   from public.tests t cross join lateral jsonb_array_elements(public.academy_working_questions(t.id)) with ordinality x(q,n)
   where t.deleted_at is null and (nullif(payload->>'subjectId','') is null or t.subject_id=payload->>'subjectId')
    and (nullif(payload->>'topicId','') is null or t.topic_id=payload->>'topicId')
    and (nullif(payload->>'search','') is null or strpos(lower(q->>'text'),lower(left(payload->>'search',200)))>0)
   order by t.id,n limit 500) r);
 end if;
 -- Deleted IDs may not be reused, edited, reimported or republished through legacy APIs.
 if action='adminSave' and entity in ('exams','subjects','topics','tests') then
  rec=payload->'record';execute format('select to_jsonb(x) from public.%I x where id=$1',entity) into item using rec->>'id';
  if item->>'deleted_at' is not null then raise exception 'Deleted identity is reserved for history';end if;
  if entity='subjects' and exists(select 1 from jsonb_array_elements_text(rec->'exam_ids') x join public.exams e on e.id=x where e.deleted_at is not null) then raise exception 'Deleted parent';end if;
  if entity in ('topics','tests') and exists(select 1 from public.subjects where id=rec->>'subject_id' and deleted_at is not null) then raise exception 'Deleted parent';end if;
  if entity='tests' and exists(select 1 from public.topics where id=rec->>'topic_id' and deleted_at is not null) then raise exception 'Deleted parent';end if;
  if entity='tests' and coalesce((rec->>'published')::boolean,false) and exists(select 1 from public.tests where id=rec->>'id' and question_count=0) then raise exception 'An empty test cannot be published';end if;
 end if;
 if action in ('adminSaveQuestion','adminReviewQuestions','adminImport') and exists(select 1 from public.tests where id=payload->>'testId' and deleted_at is not null) then raise exception 'Deleted test';end if;
 if action='adminSaveQuestion' and exists(select 1 from public.imports where test_id=payload->>'testId' and audit ? 'workingOperations') then raise exception 'Revised import is read-only; use its reviewed working copy';end if;
 if action in ('adminVerifyContent','adminImportDetail') and exists(select 1 from public.imports i join public.tests t on t.id=i.test_id where i.id=(payload->>'importId')::uuid and t.deleted_at is not null) then raise exception 'Deleted test; source retained privately for audit';end if;
 result=public.academy_order_base_api(actor,action,payload);
 if action in ('adminSaveQuestion','adminImport') then
  update public.questions set display_order=number where test_id=payload->>'testId' and display_order=0;
 end if;
 if action='catalog' then
  foreach entity in array array['exams','subjects','topics','tests'] loop
   select coalesce(jsonb_agg(x order by (x->>'display_order')::integer,x->>'id'),'[]') into rows from jsonb_array_elements(result->entity) x where x->>'deleted_at' is null;
   result=jsonb_set(result,array[entity],rows);
  end loop;
 elsif action='adminList' and entity in ('exams','subjects','topics','tests') then
  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by display_order,id),''[]'') from public.%I x where deleted_at is null',entity) into result;
 elsif action='adminList' and entity='imports' then
  select coalesce(jsonb_agg(x),'[]') into result from jsonb_array_elements(result) x where exists(select 1 from public.tests where id=x->>'test_id' and deleted_at is null);
 elsif action='adminSave' and entity in ('exams','subjects','topics','tests') then
  rec=payload->'record';
  if item is null and not(rec ? 'display_order') and not(entity='subjects' and jsonb_array_length(rec->'exam_ids')<>1) then rec=rec||jsonb_build_object('display_order',9999999);end if;
  if rec ? 'display_order' then
   if coalesce(rec->>'display_order','') !~ '^[1-9][0-9]{0,6}$' then raise exception 'Display order must be a positive position';end if;
   parent=case entity when 'subjects' then rec->'exam_ids'->>0 when 'topics' then rec->>'subject_id' when 'tests' then rec->>'topic_id' else '' end;
   rows=public.academy_order_rows(entity,parent);pos=least((rec->>'display_order')::integer,jsonb_array_length(rows));
   if not exists(select 1 from jsonb_array_elements(rows) x where x->>'id'=rec->>'id') then raise exception 'Separate shared subject placement before reordering';end if;
   select array_agg(x->>'id' order by n) into ids from jsonb_array_elements(rows) with ordinality a(x,n) where x->>'id'<>rec->>'id';
   ids=coalesce(ids,'{}');ids=ids[1:pos-1]||array[rec->>'id']||ids[pos:cardinality(ids)];
   for v_index in 1..cardinality(ids) loop execute format('update public.%I set display_order=$1 where id=$2',entity) using v_index,ids[v_index];end loop;
  end if;
 end if;
 return result;
end $$;
revoke all on function public.academy_api(uuid,text,jsonb),public.academy_working_questions(text),public.academy_working_issues(jsonb),public.academy_order_rows(text,text),public.academy_delete_impact(text,text,text),public.academy_install_working(text,jsonb,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.academy_api(uuid,text,jsonb) to service_role;
commit;
