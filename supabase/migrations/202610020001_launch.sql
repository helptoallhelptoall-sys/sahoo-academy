-- Fresh-project migration. Never run against an unrelated database.
-- All mutations and question delivery use a service-only RPC behind verified Edge auth.
begin;
create table public.profiles (id uuid primary key references auth.users on delete cascade, display_name text not null default '', role text not null default 'student' check(role in ('student','admin')), created_at timestamptz not null default now());
create table public.exams (id text primary key, name text not null, published boolean not null default false);
create table public.subjects (id text primary key, name text not null, exam_ids text[] not null default '{}', price_paise integer not null default 0 check(price_paise>=0), validity_months integer not null default 3 check(validity_months between 1 and 36), published boolean not null default false);
create table public.topics (id text primary key, subject_id text not null references public.subjects, name text not null, published boolean not null default false, unique(id,subject_id));
create table public.tests (id text primary key, subject_id text not null references public.subjects, topic_id text not null, title text not null, access text not null default 'free' check(access in ('free','paid')), published boolean not null default false, duration_seconds integer not null default 600 check(duration_seconds between 15 and 21600), question_count integer not null default 0, revision integer not null default 0, foreign key(topic_id,subject_id) references public.topics(id,subject_id));
create table public.admin_settings (id boolean primary key default true check(id), telegram_required boolean not null default true, telegram_url text, youtube_url text, upi_id text, payee_name text, qr_url text, version integer not null default 1);
insert into public.admin_settings(id) values(true);
create table public.entitlements (student_id uuid references public.profiles, subject_id text references public.subjects, activated_at timestamptz not null, expires_at timestamptz not null, revoked_at timestamptz, primary key(student_id,subject_id), check(expires_at>activated_at));
create table public.payment_submissions (id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles, subject_id text not null references public.subjects, price_paise integer not null check(price_paise>0), validity_months integer not null check(validity_months between 1 and 36), status text not null default 'awaiting_payment' check(status in ('awaiting_payment','pending_review','approved','rejected')), utr text unique, created_at timestamptz not null default now(), reviewed_at timestamptz, reviewer_id uuid references public.profiles, review_note text, idempotency_key uuid not null, unique(student_id,idempotency_key));
create unique index one_pending_subject_payment on public.payment_submissions(student_id,subject_id) where status in ('awaiting_payment','pending_review');
create table public.telegram_verifications (student_id uuid primary key references public.profiles, telegram_id bigint unique, nonce_hash text unique, nonce_expires_at timestamptz, checked_at timestamptz, member boolean not null default false);
create table public.imports (id uuid primary key default gen_random_uuid(), test_id text not null unique references public.tests, source_html text not null, source_sha256 text not null, source_count integer not null check(source_count>0), imported_count integer not null check(imported_count=source_count), added integer not null default 0 check(added=0), removed integer not null default 0 check(removed=0), original jsonb not null, working jsonb not null, audit jsonb not null, issues jsonb not null, pass1 boolean not null, pass2 boolean not null default false, review_note text, reviewed_by uuid references public.profiles, created_by uuid not null references public.profiles, created_at timestamptz not null default now());
create table public.questions (test_id text references public.tests, number integer not null check(number>0), content jsonb not null, primary key(test_id,number));
create table public.attempts (id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles, test_id text not null references public.tests, started_at timestamptz not null default now(), deadline timestamptz not null, snapshot jsonb not null, answers jsonb not null default '{}', flags jsonb not null default '[]', submitted_at timestamptz, result jsonb, idempotency_key uuid not null, unique(student_id,idempotency_key));
create table public.admin_audit (id bigint generated always as identity primary key, actor_id uuid not null references public.profiles, action text not null, details jsonb not null, created_at timestamptz not null default now());
create index attempts_owner on public.attempts(student_id);
create index payments_owner on public.payment_submissions(student_id);

create function public.create_student_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id,display_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'displayName',''),100)); return new; end $$;
create trigger new_student after insert on auth.users for each row execute function public.create_student_profile();
revoke all on function public.create_student_profile() from public,anon,authenticated;

do $$ declare t text; begin
foreach t in array array['profiles','exams','subjects','topics','tests','admin_settings','entitlements','payment_submissions','telegram_verifications','imports','questions','attempts','admin_audit'] loop
execute format('alter table public.%I enable row level security',t);
execute format('revoke all on public.%I from public, anon, authenticated',t);
execute format('grant all on public.%I to service_role',t);
end loop; end $$;
grant usage,select on sequence public.admin_audit_id_seq to service_role;
grant select on public.exams,public.subjects,public.topics,public.tests to anon,authenticated;
create policy public_exams on public.exams for select to anon,authenticated using(published);
create policy public_subjects on public.subjects for select to anon,authenticated using(published);
create policy public_topics on public.topics for select to anon,authenticated using(published and exists(select 1 from public.subjects s where s.id=subject_id and s.published));
create policy public_tests on public.tests for select to anon,authenticated using(published and exists(select 1 from public.topics t where t.id=topic_id and t.published));
grant select on public.profiles,public.entitlements,public.payment_submissions to authenticated;
create policy own_profile on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy own_entitlements on public.entitlements for select to authenticated using(student_id=(select auth.uid()));
create policy own_payments on public.payment_submissions for select to authenticated using(student_id=(select auth.uid()));
-- No browser role can read raw questions, answer keys, import HTML, Telegram IDs/nonces,
-- attempt snapshots or private settings. Their safe projections come from authorized RPC.

create function public.academy_api(actor uuid, action text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare
  cfg public.admin_settings; offer public.subjects; testrow public.tests; payment public.payment_submissions;
  attempt public.attempts; ent public.entitlements; imp public.imports; who public.profiles;
  out jsonb; qs jsonb; q jsonb; ans jsonb; review jsonb='[]'; count_correct integer=0; count_answered integer=0;
  n integer; expires timestamptz; target uuid; subject text; op text; key text; rec jsonb; verified boolean;
begin
 select * into cfg from public.admin_settings where id=true;
 if action='policy' then return jsonb_build_object('version',cfg.version,'loginRequired',true,'recheckFreeAccessEveryAttempt',true,'telegramRequired',cfg.telegram_required,'telegramChannelUrl',cfg.telegram_url,'youtubeChannelUrl',cfg.youtube_url,'defaultValidityCalendarMonths',3); end if;
 if action='catalog' then return jsonb_build_object(
 'exams',(select coalesce(jsonb_agg(to_jsonb(e) order by e.name),'[]') from public.exams e where e.published),
 'subjects',(select coalesce(jsonb_agg(to_jsonb(s) order by s.name),'[]') from public.subjects s where s.published),
 'topics',(select coalesce(jsonb_agg(to_jsonb(t) order by t.name),'[]') from public.topics t join public.subjects s on s.id=t.subject_id where t.published and s.published),
 'tests',(select coalesce(jsonb_agg(to_jsonb(t) order by t.title),'[]') from public.tests t join public.topics p on p.id=t.topic_id join public.subjects s on s.id=t.subject_id where t.published and p.published and s.published)); end if;
 -- This action is only called by the secret-authenticated Telegram webhook.
 if action='telegramConsume' then
   update public.telegram_verifications set telegram_id=(payload->>'telegramId')::bigint,nonce_hash=null,nonce_expires_at=null,member=false,checked_at=null
   where nonce_hash=payload->>'nonceHash' and nonce_expires_at>now() returning student_id into target;
   return jsonb_build_object('linked',target is not null);
 end if;
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into who from public.profiles where id=actor;
 if who.id is null then raise exception 'Account unavailable' using errcode='42501'; end if;
 if action like 'admin%' and who.role<>'admin' then raise exception 'Admin required' using errcode='42501'; end if;
 if action='account' then return to_jsonb(who); end if;
 if action='updateProfile' then update public.profiles set display_name=left(trim(payload->>'displayName'),100) where id=actor; return jsonb_build_object('saved',true); end if;
 if action='telegramBegin' then
   insert into public.telegram_verifications(student_id,nonce_hash,nonce_expires_at) values(actor,payload->>'nonceHash',now()+interval '10 minutes')
   on conflict(student_id) do update set nonce_hash=excluded.nonce_hash,nonce_expires_at=excluded.nonce_expires_at;
   return jsonb_build_object('created',true);
 end if;
 if action='telegramState' then return coalesce((select to_jsonb(t) from public.telegram_verifications t where student_id=actor),'{}'); end if;
 if action='telegramRecord' then update public.telegram_verifications set checked_at=now(),member=coalesce((payload->>'member')::boolean,false) where student_id=actor;return jsonb_build_object('saved',true);end if;
 if action='access' then
   subject=payload->>'subjectId'; select * into ent from public.entitlements where student_id=actor and subject_id=subject;
   if ent.revoked_at is null and ent.expires_at>now() then return jsonb_build_object('subjectId',subject,'state','active','activatedAt',ent.activated_at,'expiresAt',ent.expires_at); end if;
   select * into payment from public.payment_submissions where student_id=actor and subject_id=subject and status in ('awaiting_payment','pending_review');
   if payment.id is not null then return jsonb_build_object('subjectId',subject,'state','payment_pending','orderId',payment.id); end if;
   return jsonb_build_object('subjectId',subject,'state',case when ent.expires_at<=now() and ent.revoked_at is null then 'expired' else 'locked' end,'expiresAt',ent.expires_at);
 end if;
 if action='orders' then return jsonb_build_object('orders',(select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc),'[]') from public.payment_submissions p where p.student_id=actor),'entitlements',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from public.entitlements e where e.student_id=actor)); end if;
 if action='createOrder' then
   select * into offer from public.subjects where id=payload->>'subjectId' and published for share;
   if offer.id is null or offer.price_paise<=0 or nullif(cfg.upi_id,'') is null or nullif(cfg.payee_name,'') is null or nullif(cfg.qr_url,'') is null then raise exception 'Purchases are not configured'; end if;
   insert into public.payment_submissions(student_id,subject_id,price_paise,validity_months,idempotency_key) values(actor,offer.id,offer.price_paise,offer.validity_months,(payload->>'idempotencyKey')::uuid) on conflict do nothing;
   select * into payment from public.payment_submissions where student_id=actor and subject_id=offer.id and status in ('awaiting_payment','pending_review');
   if payment.id is null then select * into payment from public.payment_submissions where student_id=actor and idempotency_key=(payload->>'idempotencyKey')::uuid; end if;
   return jsonb_build_object('order',to_jsonb(payment),'upiId',cfg.upi_id,'payeeName',cfg.payee_name,'qrUrl',cfg.qr_url);
 end if;
 if action='submitPayment' then
   key=upper(trim(payload->>'utr')); if key is null or key !~ '^[A-Z0-9]{8,35}$' then raise exception 'Enter a valid transaction reference'; end if;
   select * into payment from public.payment_submissions where id=(payload->>'orderId')::uuid and student_id=actor for update;
   if payment.id is null then raise exception 'Order not found' using errcode='42501'; end if;
   if payment.status='pending_review' and payment.utr=key then return to_jsonb(payment); end if;
   if payment.status<>'awaiting_payment' then raise exception 'Order cannot be changed'; end if;
   update public.payment_submissions set utr=key,status='pending_review' where id=payment.id returning * into payment; return to_jsonb(payment);
 end if;
 if action='adminReviewPayment' then
   if length(trim(coalesce(payload->>'reason','')))<5 then raise exception 'Receipt verification/rejection reason required'; end if;
   select * into payment from public.payment_submissions where id=(payload->>'orderId')::uuid for update;
   if payment.id is null or payment.status<>'pending_review' then raise exception 'Payment is not pending'; end if;
   op=payload->>'decision'; if op not in ('approve','reject') then raise exception 'Invalid decision'; end if;
   if op='approve' then
     perform pg_advisory_xact_lock(hashtextextended(payment.student_id::text||':'||payment.subject_id,0));
     select * into ent from public.entitlements where student_id=payment.student_id and subject_id=payment.subject_id for update;
     expires=(case when ent.revoked_at is null and ent.expires_at>now() then ent.expires_at else now() end)+make_interval(months=>payment.validity_months);
     insert into public.entitlements values(payment.student_id,payment.subject_id,now(),expires,null) on conflict(student_id,subject_id) do update set activated_at=case when ent.revoked_at is null and ent.expires_at>now() then ent.activated_at else excluded.activated_at end,expires_at=excluded.expires_at,revoked_at=null;
   end if;
   update public.payment_submissions set status=case when op='approve' then 'approved' else 'rejected' end,reviewed_at=now(),reviewer_id=actor,review_note=payload->>'reason' where id=payment.id;
   insert into public.admin_audit(actor_id,action,details) values(actor,action,payload); return jsonb_build_object('saved',true);
 end if;
 if action='adminAccess' then
   target=(payload->>'studentId')::uuid;subject=payload->>'subjectId';op=payload->>'operation';
   if length(trim(coalesce(payload->>'reason','')))<5 then raise exception 'Reason required'; end if;
   perform pg_advisory_xact_lock(hashtextextended(target::text||':'||subject,0));
   select * into offer from public.subjects where id=subject; select * into ent from public.entitlements where student_id=target and subject_id=subject for update;
   if op='revoke' then update public.entitlements set revoked_at=now() where student_id=target and subject_id=subject;
   elsif op in ('grant','extend') then
     if op='grant' and ent.revoked_at is null and ent.expires_at>now() then raise exception 'Active access exists; use extend'; end if;
     expires=(case when op='extend' and ent.revoked_at is null and ent.expires_at>now() then ent.expires_at else now() end)+make_interval(months=>offer.validity_months);
     insert into public.entitlements values(target,subject,now(),expires,null) on conflict(student_id,subject_id) do update set activated_at=case when ent.revoked_at is null and ent.expires_at>now() then ent.activated_at else excluded.activated_at end,expires_at=excluded.expires_at,revoked_at=null;
   else raise exception 'Invalid access operation'; end if;
   insert into public.admin_audit(actor_id,action,details) values(actor,action,payload);return jsonb_build_object('saved',true);
 end if;
 if action in ('verify','start') then
   select t.* into testrow from public.tests t join public.subjects s on s.id=t.subject_id join public.topics p on p.id=t.topic_id where t.id=payload->>'testId' and t.published and s.published and p.published for share of t,s,p;
   if testrow.id is null then return jsonb_build_object('status','denied','reason','test_unavailable'); end if;
   if testrow.access='paid' and not exists(select 1 from public.entitlements where student_id=actor and subject_id=testrow.subject_id and revoked_at is null and expires_at>now()) then return jsonb_build_object('status','denied','reason','subject_locked'); end if;
   -- telegramVerified is supplied only by the Edge Function after a fresh Bot API call.
   if testrow.access='free' and cfg.telegram_required and (coalesce((payload->>'telegramVerified')::boolean,false)=false or (payload->>'policyVersion')::integer is distinct from cfg.version) then return jsonb_build_object('status','denied','reason','requirements_unmet'); end if;
   if action='verify' then return jsonb_build_object('status','eligible'); end if;
   select coalesce(jsonb_agg(content order by number),'[]') into qs from public.questions where test_id=testrow.id;
   if jsonb_array_length(qs)=0 or jsonb_array_length(qs)<>testrow.question_count then raise exception 'Test content unavailable'; end if;
   insert into public.attempts(student_id,test_id,deadline,snapshot,idempotency_key) values(actor,testrow.id,now()+make_interval(secs=>testrow.duration_seconds),qs,(payload->>'idempotencyKey')::uuid) on conflict(student_id,idempotency_key) do nothing;
   select * into attempt from public.attempts where student_id=actor and idempotency_key=(payload->>'idempotencyKey')::uuid;
   if attempt.test_id<>testrow.id or attempt.submitted_at is not null or attempt.deadline<=now() then raise exception 'Attempt no longer available'; end if;
   select jsonb_agg(jsonb_build_object('id',x->>'id','number',x->'number','text',x->>'text','options',x->'options','subjectLabel',x->>'topic','sourceTags',x->'tags') order by (x->>'number')::integer) into out from jsonb_array_elements(attempt.snapshot) x;
   return jsonb_build_object('status','started','testId',testrow.id,'title',testrow.title,'access',testrow.access,'page',jsonb_build_object('attemptId',attempt.id,'deadline',attempt.deadline,'serverNow',now(),'questions',out,'questionCount',testrow.question_count));
 end if;
 if action in ('saveAttempt','submitAttempt','result') then
   select * into attempt from public.attempts where id=(payload->>'attemptId')::uuid and student_id=actor for update;
   if attempt.id is null then raise exception 'Attempt unavailable' using errcode='42501'; end if;
   select * into testrow from public.tests where id=attempt.test_id;
   if testrow.access='paid' and not exists(select 1 from public.entitlements where student_id=actor and subject_id=testrow.subject_id and revoked_at is null and expires_at>now()) then raise exception 'Subject access expired' using errcode='42501'; end if;
   if action='result' then if attempt.submitted_at is null then raise exception 'Submit the attempt first'; end if; return attempt.result; end if;
   if attempt.submitted_at is not null then return attempt.result; end if;
   if now()<attempt.deadline and payload ? 'answers' then
     ans=payload->'answers'; if jsonb_typeof(ans)<>'object' then raise exception 'Invalid answers'; end if;
     for key,rec in select * from jsonb_each(ans) loop
       select value into q from jsonb_array_elements(attempt.snapshot) where value->>'id'=key;
       if q is null or not exists(select 1 from jsonb_array_elements(q->'options') o where o->>'id'=rec#>>'{}') then raise exception 'Invalid answer mapping'; end if;
     end loop;
     if payload ? 'flags' then
       if jsonb_typeof(payload->'flags')<>'array' or jsonb_array_length(payload->'flags')>jsonb_array_length(attempt.snapshot) then raise exception 'Invalid review flags'; end if;
       for rec in select value from jsonb_array_elements(payload->'flags') loop
         if jsonb_typeof(rec)<>'string' or not exists(select 1 from jsonb_array_elements(attempt.snapshot) x where x->>'id'=rec#>>'{}') then raise exception 'Invalid review flag'; end if;
       end loop;
     end if;
     update public.attempts set answers=ans,flags=coalesce(payload->'flags','[]') where id=attempt.id returning * into attempt;
   end if;
   if action='saveAttempt' then return jsonb_build_object('saved',now()<attempt.deadline,'deadline',attempt.deadline); end if;
   for q in select value from jsonb_array_elements(attempt.snapshot) loop
     key=attempt.answers->>(q->>'id'); if key is not null then count_answered=count_answered+1; end if;
     if key=q->>'correctOptionId' then count_correct=count_correct+1; end if;
     review=review||jsonb_build_array(q||jsonb_build_object('chosenOptionId',key));
   end loop;
   n=jsonb_array_length(attempt.snapshot);
   out=jsonb_build_object('attemptId',attempt.id,'testId',attempt.test_id,'title',testrow.title,'total',n,'correct',count_correct,'incorrect',count_answered-count_correct,'unattempted',n-count_answered,'score',count_correct,'submittedAt',now(),'elapsedSeconds',least(extract(epoch from now()-attempt.started_at)::integer,extract(epoch from attempt.deadline-attempt.started_at)::integer),'review',review);
   update public.attempts set result=out,submitted_at=now() where id=attempt.id;return out;
 end if;
 if action='results' then return (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'testId',a.test_id,'startedAt',a.started_at,'deadline',a.deadline,'submittedAt',a.submitted_at,'score',a.result->'score','total',a.result->'total') order by a.started_at desc),'[]') from public.attempts a where a.student_id=actor); end if;
 if action='adminList' then
   op=payload->>'entity';
   if op in ('exams','subjects','topics','tests','profiles','payment_submissions','entitlements','admin_settings') then
     execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]'') from (select * from public.%I limit 500) x',op) into out; return out;
   elsif op='imports' then return (select coalesce(jsonb_agg(to_jsonb(i)-'source_html'-'original'-'working'),'[]') from public.imports i);
   end if; raise exception 'Unsupported collection';
 end if;
 if action='adminSave' then
   op=payload->>'entity'; rec=payload->'record'; key=rec->>'id';
   if op<>'admin_settings' and (key is null or key !~ '^[a-z0-9][a-z0-9-]{0,99}$') then raise exception 'Use a stable lowercase ID'; end if;
   if op='exams' then insert into public.exams values(key,rec->>'name',coalesce((rec->>'published')::boolean,false)) on conflict(id) do update set name=excluded.name,published=excluded.published;
   elsif op='subjects' then insert into public.subjects values(key,rec->>'name',array(select jsonb_array_elements_text(coalesce(rec->'exam_ids','[]'))),(rec->>'price_paise')::integer,coalesce((rec->>'validity_months')::integer,3),coalesce((rec->>'published')::boolean,false)) on conflict(id) do update set name=excluded.name,exam_ids=excluded.exam_ids,price_paise=excluded.price_paise,validity_months=excluded.validity_months,published=excluded.published;
   elsif op='topics' then insert into public.topics values(key,rec->>'subject_id',rec->>'name',coalesce((rec->>'published')::boolean,false)) on conflict(id) do update set name=excluded.name,published=excluded.published;
   elsif op='tests' then
     if coalesce((rec->>'published')::boolean,false) and not exists(select 1 from public.imports where test_id=key and pass1 and pass2) then raise exception 'Both verification passes are required before publication'; end if;
     insert into public.tests(id,subject_id,topic_id,title,access,published,duration_seconds) values(key,rec->>'subject_id',rec->>'topic_id',rec->>'title',rec->>'access',coalesce((rec->>'published')::boolean,false),(rec->>'duration_seconds')::integer) on conflict(id) do update set title=excluded.title,access=excluded.access,published=excluded.published,duration_seconds=excluded.duration_seconds;
   elsif op='admin_settings' then
     if nullif(rec->>'youtube_url','') is not null and (rec->>'youtube_url') !~ '^https://(www\.)?youtube\.com/[^[:space:]]+$' then raise exception 'Invalid YouTube URL'; end if;
     if nullif(rec->>'telegram_url','') is not null and (rec->>'telegram_url') !~ '^https://t\.me/[A-Za-z0-9_+/-]+$' then raise exception 'Invalid Telegram URL'; end if;
     if nullif(rec->>'qr_url','') is not null and (rec->>'qr_url') !~ '^https://[^[:space:]]+$' then raise exception 'QR URL must use HTTPS'; end if;
     update public.admin_settings set telegram_required=(rec->>'telegram_required')::boolean,telegram_url=nullif(rec->>'telegram_url',''),youtube_url=nullif(rec->>'youtube_url',''),upi_id=nullif(rec->>'upi_id',''),payee_name=nullif(rec->>'payee_name',''),qr_url=nullif(rec->>'qr_url',''),version=version+1 where id=true;
   else raise exception 'Unsupported edit'; end if;
   insert into public.admin_audit(actor_id,action,details) values(actor,action,payload);return jsonb_build_object('saved',true);
 end if;
 if action='adminImport' then
   select * into testrow from public.tests where id=payload->>'testId' and not published for update;
   if testrow.id is null then raise exception 'Select an existing unpublished test'; end if;
   if exists(select 1 from public.imports where test_id=testrow.id) then raise exception 'An import already exists; no replacement is permitted'; end if;
   rec=payload->'import';qs=rec->'imported';n=jsonb_array_length(qs);
   if n<=0 or n<>jsonb_array_length(rec->'original') or n<>(rec->'audit'->>'sourceQuestions')::integer or n<>(rec->'audit'->>'importedQuestions')::integer or coalesce((rec->'audit'->>'countMatch')::boolean,false)=false then raise exception 'Exact question count must be preserved'; end if;
   insert into public.imports(test_id,source_html,source_sha256,source_count,imported_count,original,working,audit,issues,pass1,created_by) values(testrow.id,payload->>'html',rec->>'sourceSha256',n,n,rec->'original',qs,rec->'audit',rec->'issues',jsonb_array_length(rec->'issues')=0,actor);
   -- Invalid imports are stored in full for correction/review, not partially installed.
   if jsonb_array_length(rec->'issues')=0 then
     for q in select value from jsonb_array_elements(qs) loop insert into public.questions values(testrow.id,(q->>'number')::integer,q); end loop;
     update public.tests set question_count=n,revision=revision+1 where id=testrow.id;
   end if;
   return jsonb_build_object('audit',rec->'audit','issues',rec->'issues','pass2','pending','published',false);
 end if;
 if action='adminImportDetail' then select * into imp from public.imports where id=(payload->>'importId')::uuid;return to_jsonb(imp)-'source_html'; end if;
 if action='adminVerifyContent' then
   if payload->>'decision'<>'approve' or length(trim(coalesce(payload->>'reason','')))<20 then raise exception 'Explicit full content-review approval and evidence required'; end if;
   select * into imp from public.imports where id=(payload->>'importId')::uuid for update;
   if imp.id is null or not imp.pass1 then raise exception 'Resolve structural findings first; nothing was changed'; end if;
   update public.imports set pass2=true,review_note=payload->>'reason',reviewed_by=actor where id=imp.id;
   insert into public.admin_audit(actor_id,action,details) values(actor,action,payload);return jsonb_build_object('saved',true);
 end if;
 raise exception 'Unsupported action';
end $$;
revoke all on function public.academy_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.academy_api(uuid,text,jsonb) to service_role;
commit;
