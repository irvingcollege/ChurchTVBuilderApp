-- Run against Supabase Postgres. No public write policies; intake uses a server-only RPC.
create extension if not exists pgcrypto;
create type public.submission_status as enum ('submitted','needs_info','approved','building','qa','publishing','published','rejected','on_hold');
create table public.staff_users(user_id uuid primary key references auth.users(id), role text not null check(role in ('admin','reviewer')),created_at timestamptz not null default now());
create function public.is_staff() returns boolean language sql stable security definer set search_path=public, pg_temp as $$ select exists(select 1 from public.staff_users where user_id=auth.uid()) $$;
create table public.churches(id uuid primary key default gen_random_uuid(),slug text unique not null,legal_name text not null,display_name text not null,contact_email text not null,website text,description text not null,created_at timestamptz not null default now());
create table public.church_configs(id uuid primary key default gen_random_uuid(),church_id uuid not null references public.churches(id),schema_version integer not null check(schema_version=1),config_json jsonb not null,created_at timestamptz not null default now());
create table public.assets(id uuid primary key default gen_random_uuid(),church_id uuid not null references public.churches(id),kind text not null check(kind in ('logo','banner')),bucket_path text unique not null,mime_type text not null check(mime_type in ('image/png','image/jpeg')),size_bytes integer not null check(size_bytes between 1 and 2097152),created_at timestamptz not null default now());
create table public.submissions(id uuid primary key default gen_random_uuid(),church_id uuid not null unique references public.churches(id),status public.submission_status not null default 'submitted',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.submission_status_events(id uuid primary key default gen_random_uuid(),submission_id uuid not null references public.submissions(id),from_status public.submission_status,to_status public.submission_status not null,actor_id uuid references auth.users(id),created_at timestamptz not null default now(),note text not null default '');
create table public.staff_notes(id uuid primary key default gen_random_uuid(),submission_id uuid not null references public.submissions(id),actor_id uuid not null references auth.users(id),body text not null check(length(body) between 1 and 4000),created_at timestamptz not null default now());
create table public.build_jobs(id uuid primary key default gen_random_uuid(),church_id uuid not null references public.churches(id),platform text not null check(platform in ('roku','androidtv','samsung','lg')),config_version uuid not null references public.church_configs(id),status text not null default 'queued' check(status in ('queued','running','failed','ready')),artifact_path text,simulation boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),error text,check(status<>'ready' or (not simulation and artifact_path is not null)));
create table public.publishing_records(id uuid primary key default gen_random_uuid(),church_id uuid not null references public.churches(id),platform text not null check(platform in ('roku','androidtv','samsung','lg')),account_owner text,status text not null,store_url text,submission_date timestamptz,decision_date timestamptz,notes text);
create table public.audit_log(id uuid primary key default gen_random_uuid(),actor_id uuid references auth.users(id),action text not null,entity_id uuid,detail jsonb not null default '{}',created_at timestamptz not null default now());
create table public.notifications(id uuid primary key default gen_random_uuid(),submission_id uuid not null references public.submissions(id),actor_id uuid not null references auth.users(id),body text not null,state text not null check(state in ('pending','simulated','sent','failed')),provider_id text,created_at timestamptz not null default now());
create table public.intake_limits(key text primary key,hits integer not null,expires_at timestamptz not null);
create index on public.submissions(created_at desc);
create index on public.submission_status_events(submission_id,created_at);
create index on public.audit_log(created_at desc);
create function public.immutable_record() returns trigger language plpgsql as $$ begin raise exception 'Append-only record'; end $$;
create trigger immutable_history before update or delete on public.submission_status_events for each row execute function public.immutable_record();
create trigger immutable_audit before update or delete on public.audit_log for each row execute function public.immutable_record();
-- Only service_role may submit intake or consume the global hourly abuse budget.
create function public.consume_intake_budget() returns boolean language plpgsql security definer set search_path=public, pg_temp as $$
declare n integer; begin
  insert into intake_limits(key,hits,expires_at) values('global',1,now()+interval '1 hour')
  on conflict(key) do update set hits=case when intake_limits.expires_at<now() then 1 else intake_limits.hits+1 end,expires_at=case when intake_limits.expires_at<now() then now()+interval '1 hour' else intake_limits.expires_at end returning hits into n;
  return n<=100;
end $$;
create function public.submit_church(tenant uuid, config jsonb, uploaded jsonb) returns uuid language plpgsql security definer set search_path=public, pg_temp as $$
declare sid uuid; begin
  insert into churches(id,slug,legal_name,display_name,contact_email,website,description) values(tenant,'church-'||replace(tenant::text,'-',''),config->>'legalName',config->>'displayName',config->>'contactEmail',config->>'website',config->>'description');
  insert into church_configs(church_id,schema_version,config_json) values(tenant,1,config);
  insert into submissions(church_id) values(tenant) returning id into sid;
  insert into assets(church_id,kind,bucket_path,mime_type,size_bytes) select tenant,x->>'kind',x->>'bucket_path',x->>'mime_type',(x->>'size_bytes')::integer from jsonb_array_elements(uploaded) x;
  insert into submission_status_events(submission_id,to_status,note) values(sid,'submitted','Intake submitted with rights and consent');
  insert into audit_log(action,entity_id) values('intake_submitted',sid);
  return sid;
end $$;
create function public.change_status(sid uuid,expected public.submission_status,target public.submission_status,reason text) returns void language plpgsql security definer set search_path=public, pg_temp as $$
declare current_status public.submission_status; allowed boolean; begin
  if not is_staff() then raise exception 'Forbidden'; end if;
  if length(trim(reason)) not between 1 and 4000 then raise exception 'Reason required'; end if;
  select status into current_status from submissions where id=sid for update;
  if not found or current_status<>expected then raise exception 'Stale status; reload'; end if;
  allowed:=case current_status
    when 'submitted' then target in ('needs_info','approved','rejected','on_hold')
    when 'needs_info' then target in ('approved','rejected','on_hold')
    when 'approved' then target in ('building','needs_info','rejected','on_hold')
    when 'building' then target in ('qa','needs_info','on_hold')
    when 'qa' then target in ('publishing','building','on_hold')
    when 'publishing' then target in ('published','qa','on_hold')
    when 'published' then target='on_hold'
    when 'on_hold' then target in ('needs_info','approved','rejected') else false end;
  if not allowed then raise exception 'Invalid transition'; end if;
  -- Workflow status alone must not imply a compiled artifact or successful publication.
  if target in ('qa','publishing','published') and not exists(select 1 from build_jobs b join church_configs c on c.id=b.config_version where b.church_id=(select church_id from submissions where id=sid) and c.church_id=b.church_id and b.status='ready' and not b.simulation and b.artifact_path is not null) then raise exception 'Actual compiled artifact required'; end if;
  if target='published' and not exists(select 1 from publishing_records where church_id=(select church_id from submissions where id=sid) and status='published' and store_url is not null) then raise exception 'Verified publishing record required'; end if;
  update submissions set status=target,updated_at=now() where id=sid;
  insert into submission_status_events(submission_id,from_status,to_status,actor_id,note) values(sid,current_status,target,auth.uid(),reason);
  insert into audit_log(actor_id,action,entity_id,detail) values(auth.uid(),'status_changed',sid,jsonb_build_object('from',current_status,'to',target));
end $$;
create function public.add_note(sid uuid,note text) returns void language plpgsql security definer set search_path=public, pg_temp as $$ begin
  if not is_staff() then raise exception 'Forbidden'; end if;
  insert into staff_notes(submission_id,actor_id,body) values(sid,auth.uid(),note);
  insert into audit_log(actor_id,action,entity_id) values(auth.uid(),'note_added',sid);
end $$;
create function public.queue_simulation(tenant uuid,config_id uuid,target text) returns uuid language plpgsql security definer set search_path=public, pg_temp as $$
declare jid uuid; begin
  if not is_staff() then raise exception 'Forbidden'; end if;
  if not exists(select 1 from church_configs where id=config_id and church_id=tenant) then raise exception 'Config tenant mismatch'; end if;
  insert into build_jobs(church_id,platform,config_version) values(tenant,target,config_id) returning id into jid;
  insert into audit_log(actor_id,action,entity_id) values(auth.uid(),'simulation_queued',jid);
  return jid;
end $$;
create function public.finish_simulation(jid uuid) returns void language plpgsql security definer set search_path=public, pg_temp as $$ begin
  if not is_staff() then raise exception 'Forbidden'; end if;
  update build_jobs set status='failed',error='SIMULATION ONLY: configuration validated; native build worker not installed. No artifact compiled.',updated_at=now() where id=jid and simulation and status='queued';
  if not found then raise exception 'Simulation not queued'; end if;
  insert into audit_log(actor_id,action,entity_id) values(auth.uid(),'simulation_finished_without_artifact',jid);
end $$;
create function public.request_materials(sid uuid,message text) returns uuid language plpgsql security definer set search_path=public, pg_temp as $$ declare nid uuid; begin
  if not is_staff() then raise exception 'Forbidden'; end if;
  if length(trim(message)) not between 1 and 4000 then raise exception 'Message required'; end if;
  insert into notifications(submission_id,actor_id,body,state) values(sid,auth.uid(),message,'pending') returning id into nid;
  insert into audit_log(actor_id,action,entity_id,detail) values(auth.uid(),'materials_requested',sid,jsonb_build_object('notification_id',nid));
  return nid;
end $$;
-- Every application table is closed to anonymous users. Staff reads use their verified JWT.
do $$ declare t text; begin
  foreach t in array array['staff_users','churches','church_configs','assets','submissions','submission_status_events','staff_notes','build_jobs','publishing_records','audit_log','notifications','intake_limits'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    if t<>'intake_limits' then
      execute format('grant select on public.%I to authenticated',t);
      execute format('create policy staff_read on public.%I for select to authenticated using (public.is_staff())',t);
    end if;
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
-- Explicit function ACLs: PostgreSQL defaults to PUBLIC execute.
revoke all on function public.consume_intake_budget(),public.submit_church(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.consume_intake_budget(),public.submit_church(uuid,jsonb,jsonb) to service_role;
revoke all on function public.change_status(uuid,public.submission_status,public.submission_status,text),public.add_note(uuid,text),public.queue_simulation(uuid,uuid,text),public.finish_simulation(uuid),public.request_materials(uuid,text) from public,anon;
grant execute on function public.change_status(uuid,public.submission_status,public.submission_status,text),public.add_note(uuid,text),public.queue_simulation(uuid,uuid,text),public.finish_simulation(uuid),public.request_materials(uuid,text) to authenticated;
revoke all on function public.is_staff() from public,anon;
grant execute on function public.is_staff() to authenticated,service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('church-assets','church-assets',false,2097152,array['image/png','image/jpeg']) on conflict(id) do nothing;
-- No browser storage policies: only authorized server endpoints sign 60-second read URLs.
