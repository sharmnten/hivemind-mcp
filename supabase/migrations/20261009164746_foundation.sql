-- Project-only data. No conversations, personal profiles, or embedding provider.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private, extensions to authenticated, service_role;

create table public.brains (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 3 and 80),
  overview text not null default '' check (length(overview) <= 1000),
  is_global boolean not null default false,
  retention_days integer not null default 90 check (retention_days between 7 and 3650),
  created_at timestamptz not null default now()
);
create table public.brain_members (
  brain_id uuid not null references public.brains on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','member')),
  primary key (brain_id,actor_id)
);
create index brain_members_actor on public.brain_members(actor_id,brain_id);
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  brain_id uuid not null references public.brains on delete cascade,
  topic text not null check (length(topic) between 3 and 100),
  content text not null check (length(content) between 10 and 3000),
  type text not null check (type in ('overview','architecture','convention','technical_fact','design','completed_task','bug','discovery','handoff','documentation')),
  provenance text not null check (provenance in ('suggestion','agent_assumption','team_decision','code_change')),
  layer text not null default 'working' check (layer in ('working','established')),
  status text not null default 'unverified' check (status in ('unverified','verified','disputed','superseded')),
  version integer not null default 1 check (version > 0),
  actor_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  search_document tsvector generated always as (to_tsvector('english', topic || ' ' || content)) stored,
  unique (brain_id,id)
);
create unique index memories_deduplicate on public.memories(brain_id,fingerprint) where status <> 'superseded';
create index memories_brain_recent on public.memories(brain_id,updated_at desc);
create index memories_topic on public.memories(brain_id,topic) where status <> 'superseded';
create index memories_fts on public.memories using gin(search_document);
create index memories_trigram on public.memories using gin(content extensions.gin_trgm_ops);
create table public.memory_revisions (
  id uuid primary key default gen_random_uuid(), brain_id uuid not null,
  memory_id uuid not null, version integer not null, snapshot jsonb not null,
  actor_id uuid not null, created_at timestamptz not null default now(),
  foreign key (brain_id,memory_id) references public.memories(brain_id,id) on delete cascade,
  unique (memory_id,version)
);
create index revisions_brain on public.memory_revisions(brain_id,memory_id,version);
create table public.memory_sources (
  id uuid primary key default gen_random_uuid(), brain_id uuid not null, memory_id uuid not null,
  file text check (length(file) <= 240), commit_ref text check (commit_ref ~ '^[a-f0-9]{7,40}$'),
  foreign key (brain_id,memory_id) references public.memories(brain_id,id) on delete cascade,
  unique (memory_id)
);
create index sources_brain on public.memory_sources(brain_id,memory_id);
create table public.sessions (
  id uuid primary key default gen_random_uuid(), brain_id uuid not null references public.brains on delete cascade,
  actor_id uuid not null, session_key text not null check (session_key ~ '^[a-f0-9]{64}$'),
  client text not null check (client in ('claude-code','cursor','vscode','cli')),
  started_at timestamptz not null default now(), ended_at timestamptz,
  unique (brain_id,id), unique (brain_id,actor_id,client,session_key)
);
create index sessions_brain on public.sessions(brain_id,started_at desc);
create table public.session_handoffs (
  id uuid primary key default gen_random_uuid(), brain_id uuid not null,
  session_id uuid not null, memory_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (brain_id,session_id) references public.sessions(brain_id,id) on delete cascade,
  foreign key (brain_id,memory_id) references public.memories(brain_id,id) on delete cascade,
  unique (session_id,memory_id)
);
create index handoffs_brain on public.session_handoffs(brain_id,created_at desc);
create table public.synchronization_events (
  id uuid primary key default gen_random_uuid(), brain_id uuid not null references public.brains on delete cascade,
  actor_id uuid not null, event_key text not null check (event_key ~ '^[a-f0-9]{64}$'),
  payload_hash text not null, payload jsonb,
  status text not null default 'pending' check (status in ('pending','completed','failed')),
  attempts integer not null default 0, error_code text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(), completed_at timestamptz,
  unique (brain_id,actor_id,event_key)
);
create index sync_pending on public.synchronization_events(next_attempt_at) where status='pending';
create index sync_brain_recent on public.synchronization_events(brain_id,created_at desc);
create table public.privacy_reports (
  id uuid primary key default gen_random_uuid(), brain_id uuid not null, memory_id uuid not null,
  actor_id uuid not null,
  reason text not null check (reason in ('personal_information','secret','unrelated','incorrect','prompt_injection')),
  request_deletion boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (brain_id,memory_id) references public.memories(brain_id,id) on delete cascade
);
create index reports_brain on public.privacy_reports(brain_id,created_at desc);

-- Membership helper is deliberately private, definer, identity-bound, with no caller actor parameter.
create function private.is_member(b uuid, admin_only boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    and exists (select 1 from public.brain_members where brain_id=b and actor_id=auth.uid() and (not admin_only or role='admin'))
$$;
revoke all on function private.is_member(uuid,boolean) from public, anon;
grant execute on function private.is_member(uuid,boolean) to authenticated;

alter table public.brains enable row level security;
create policy brain_read on public.brains for select to authenticated using ((select private.is_member(id)));
alter table public.brain_members enable row level security;
create policy members_read on public.brain_members for select to authenticated using (private.is_member(brain_id));
alter table public.memories enable row level security;
create policy memories_read on public.memories for select to authenticated using (private.is_member(brain_id));
alter table public.memory_revisions enable row level security;
create policy revisions_read on public.memory_revisions for select to authenticated using (private.is_member(brain_id));
alter table public.memory_sources enable row level security;
create policy sources_read on public.memory_sources for select to authenticated using (private.is_member(brain_id));
alter table public.sessions enable row level security;
create policy sessions_read on public.sessions for select to authenticated using (private.is_member(brain_id));
alter table public.session_handoffs enable row level security;
create policy handoffs_read on public.session_handoffs for select to authenticated using (private.is_member(brain_id));
alter table public.synchronization_events enable row level security;
create policy sync_read on public.synchronization_events for select to authenticated using (private.is_member(brain_id));
alter table public.privacy_reports enable row level security;
create policy reports_read on public.privacy_reports for select to authenticated using (private.is_member(brain_id,true));
revoke all on public.brains, public.brain_members, public.memories, public.memory_revisions, public.memory_sources, public.sessions, public.session_handoffs, public.synchronization_events, public.privacy_reports from anon, authenticated;
grant select on public.brains, public.brain_members, public.memories, public.memory_revisions, public.memory_sources, public.sessions, public.session_handoffs, public.synchronization_events, public.privacy_reports to authenticated;

create function private.assert_keys(p jsonb, allowed text[], required text[] default '{}') returns void
language plpgsql set search_path = '' as $$
begin
  if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>100000 then raise exception 'INVALID_INPUT'; end if;
  if exists(select 1 from jsonb_object_keys(p) k where not k=any(allowed)) or exists(select 1 from unnest(required) k where not p ? k or p->k='null'::jsonb) then raise exception 'INVALID_INPUT'; end if;
end $$;

create function private.safe_text(value text, project_required boolean default true) returns text
language plpgsql immutable set search_path = '' as $$
declare clean text;
begin
  clean := trim(translate(normalize(coalesce(value,''),NFKC), U&'\200B\200C\200D\200E\200F\202A\202B\202C\202D\202E\2060\2061\2062\2063\2064\2065\2066\2067\2068\2069\206A\206B\206C\206D\206E\206F\FEFF',''));
  if clean ~* '\m(home|address|birthday|birthdate|phone|contact|email|family|wife|husband|partner|pregnant|relationship|health|medical|medication|diabetes|depression|salary|finance|bank|academic|school|university|personal|private conversation|lives in|my name|developer name|I|my|mine)\M'
    or clean ~* '\m(password|passwd|secret|credential|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|private[ _-]?key|authorization|bearer)\M|sk-[a-z0-9_-]{8,}|gh[pousr]_[a-z0-9]{16,}|AKIA[A-Z0-9]{16}|-----BEGIN|\meyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+'
    or clean ~* '[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d ()-]{8,}\d|\m\d{1,5}\s+\w+\s+(street|road|avenue|lane|drive)\M'
    or clean ~* 'ignore\s+(all\s+)?(previous|prior|system)|system\s*(prompt|message|instruction)|reveal\s+(secrets|tokens)|developer\s+message|</?(system|assistant|user)>|you\s+(must|are required to)|execute\s+(this|the following)|do\s+not\s+follow'
    or clean ~ '[A-Za-z0-9+/=_-]{40,}'
    or clean ~ U&'[\0001-\0008\000B\000C\000E-\001F\007F]'
    then raise exception 'PRIVACY_REJECTED'; end if;
  if project_required and clean !~* '\m(project|game|roblox|luau|lua|code|coding|commit|file|module|script|architecture|inventory|combat|multiplayer|matchmaking|server|client|database|api|bug|implementation|task|convention|design|knit|rojo|studio|test|build|deployment|enemy|spawning|state machine|documentation|replication|datastore|workspace)\M' then raise exception 'PROJECT_RELEVANCE_UNCERTAIN'; end if;
  return clean;
end $$;

create function private.screen_fact(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare result jsonb; f text;
begin
  perform private.assert_keys(p,array['topic','content','type','provenance','source'],array['topic','content','type']);
  if jsonb_typeof(p->'topic')<>'string' or jsonb_typeof(p->'content')<>'string'
    or length(p->>'topic') not between 3 and 100 or length(p->>'content') not between 10 and 3000
    or p->>'type' not in ('overview','architecture','convention','technical_fact','design','completed_task','bug','discovery','handoff','documentation')
    or coalesce(p->>'provenance','agent_assumption') not in ('suggestion','agent_assumption','team_decision','code_change') then raise exception 'INVALID_INPUT'; end if;
  result := jsonb_build_object('topic',lower(private.safe_text(p->>'topic',false)), 'content',private.safe_text(p->>'content'), 'type',p->>'type','provenance',coalesce(p->>'provenance','agent_assumption'));
  if p ? 'source' then
    perform private.assert_keys(p->'source',array['file','commit']);
    if p->'source' ? 'file' then
      if jsonb_typeof(p->'source'->'file')<>'string' then raise exception 'INVALID_INPUT'; end if;
      f := private.safe_text(p->'source'->>'file',false);
      if length(f) not between 1 and 240 or f !~ '^[\w./-]+$' or f ~* '^/|(^|/)\.{1,2}(/|$)|//|/$|(^|/)(\.env[^/]*|credentials[^/]*|id_rsa|\.aws|\.ssh|\.git)(/|$)' then raise exception 'UNSAFE_SOURCE'; end if;
      p := jsonb_set(p,'{source,file}',to_jsonb(f));
    end if;
    if p->'source' ? 'commit' and coalesce(p->'source'->>'commit','') !~ '^[a-f0-9]{7,40}$' then raise exception 'INVALID_INPUT'; end if;
    result := result || jsonb_build_object('source',p->'source');
  end if;
  return result;
end $$;

create function private.record_revision(m public.memories, actor uuid) returns void
language plpgsql set search_path = '' as $$
declare s jsonb;
begin
  select jsonb_strip_nulls(jsonb_build_object('file',file,'commit',commit_ref)) into s from public.memory_sources where memory_id=m.id;
  insert into public.memory_revisions(brain_id,memory_id,version,snapshot,actor_id)
    values(m.brain_id,m.id,m.version,(to_jsonb(m)-'search_document'-'fingerprint') || jsonb_build_object('source',coalesce(s,'{}'::jsonb)),actor);
end $$;

create function private.save_memory(b uuid, actor uuid, fact jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare p jsonb; m public.memories; h text; disputed boolean;
begin
  p := private.screen_fact(fact);
  h := encode(sha256(convert_to(lower(regexp_replace(trim(p->>'content'),'\s+',' ','g')),'UTF8')),'hex');
  select * into m from public.memories where brain_id=b and fingerprint=h and status<>'superseded';
  if found then return (to_jsonb(m)-'fingerprint'-'search_document') || jsonb_build_object('duplicate',true); end if;
  select exists(select 1 from public.memories where brain_id=b and topic=p->>'topic' and status<>'superseded') into disputed;
  insert into public.memories(brain_id,topic,content,type,provenance,actor_id,status,fingerprint)
    values(b,p->>'topic',p->>'content',p->>'type',p->>'provenance',actor,case when disputed then 'disputed' else 'unverified' end,h) returning * into m;
  if p ? 'source' then insert into public.memory_sources(brain_id,memory_id,file,commit_ref) values(b,m.id,p->'source'->>'file',p->'source'->>'commit'); end if;
  perform private.record_revision(m,actor);
  return (to_jsonb(m)-'fingerprint'-'search_document') || jsonb_build_object('duplicate',false);
end $$;

create function private.mutate(action text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); b uuid; m public.memories; old public.memories; f jsonb; x jsonb; job public.synchronization_events; h text; admin boolean;
begin
  if actor is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'UNAUTHENTICATED'; end if;
  if jsonb_typeof(p)<>'object' or octet_length(p::text)>100000 then raise exception 'INVALID_INPUT'; end if;
  if action='create_brain' then
    perform private.assert_keys(p,array['name','overview','is_global'],array['name']);
    if jsonb_typeof(p->'name')<>'string' or length(p->>'name') not between 3 and 80 or length(coalesce(p->>'overview',''))>1000 then raise exception 'INVALID_INPUT'; end if;
    insert into public.brains(name,overview,is_global) values(private.safe_text(p->>'name',false),case when coalesce(p->>'overview','')='' then '' else private.safe_text(p->>'overview') end,coalesce((p->>'is_global')::boolean,false)) returning id into b;
    insert into public.brain_members values(b,actor,'admin');
    return jsonb_build_object('id',b,'success',true);
  end if;
  b := (p->>'brain_id')::uuid;
  -- One brain row lock serializes membership changes, deduplication and conflict decisions.
  perform 1 from public.brains where id=b for update;
  if not found or not private.is_member(b) then raise exception 'FORBIDDEN'; end if;
  admin := private.is_member(b,true);
  if action in ('delete_brain','set_member','remove_member','delete_memory','resolve_conflict','set_retention') and not admin then raise exception 'ADMIN_REQUIRED'; end if;

  case action
  when 'delete_brain' then
    perform private.assert_keys(p,array['brain_id'],array['brain_id']);
    delete from public.brains where id=b;
    return jsonb_build_object('success',true);
  when 'set_retention' then
    perform private.assert_keys(p,array['brain_id','retention_days'],array['brain_id','retention_days']);
    update public.brains set retention_days=(p->>'retention_days')::integer where id=b;
    return jsonb_build_object('success',true);
  when 'set_member' then
    perform private.assert_keys(p,array['brain_id','actor_id','role'],array['brain_id','actor_id','role']);
    if p->>'role' not in ('member','admin') then raise exception 'INVALID_INPUT'; end if;
    if p->>'role'='member' and exists(select 1 from public.brain_members where brain_id=b and actor_id=(p->>'actor_id')::uuid and role='admin') and (select count(*) from public.brain_members where brain_id=b and role='admin')=1 then raise exception 'LAST_ADMIN'; end if;
    insert into public.brain_members values(b,(p->>'actor_id')::uuid,p->>'role') on conflict(brain_id,actor_id) do update set role=excluded.role;
    return jsonb_build_object('success',true);
  when 'remove_member' then
    perform private.assert_keys(p,array['brain_id','actor_id'],array['brain_id','actor_id']);
    if exists(select 1 from public.brain_members where brain_id=b and actor_id=(p->>'actor_id')::uuid and role='admin') and (select count(*) from public.brain_members where brain_id=b and role='admin')=1 then raise exception 'LAST_ADMIN'; end if;
    delete from public.brain_members where brain_id=b and actor_id=(p->>'actor_id')::uuid;
    return jsonb_build_object('success',true);
  when 'write_memory' then
    perform private.assert_keys(p,array['brain_id','topic','content','type','provenance','source'],array['brain_id']);
    return private.save_memory(b,actor,p-'brain_id');
  when 'update_memory' then
    perform private.assert_keys(p,array['brain_id','memory_id','expected_version','topic','content','type','provenance','source','promote'],array['brain_id','memory_id','expected_version']);
    select * into old from public.memories where brain_id=b and id=(p->>'memory_id')::uuid for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if (old.layer='established' or coalesce((p->>'promote')::boolean,false)) and not admin then raise exception 'ADMIN_REQUIRED'; end if;
    if old.version<>(p->>'expected_version')::integer then raise exception 'VERSION_CONFLICT'; end if;
    if old.status='superseded' then raise exception 'SUPERSEDED'; end if;
    f:=private.screen_fact(p-'brain_id'-'memory_id'-'expected_version'-'promote');
    if not admin and exists(select 1 from public.memories where brain_id=b and id<>old.id and topic=f->>'topic' and status<>'superseded') then raise exception 'CONFLICT_REQUIRES_REVIEW'; end if;
    update public.memories set topic=f->>'topic',content=f->>'content',type=f->>'type',provenance=f->>'provenance',version=version+1,updated_at=now(),actor_id=actor,
      fingerprint=encode(sha256(convert_to(lower(regexp_replace(trim(f->>'content'),'\s+',' ','g')),'UTF8')),'hex'),
      layer=case when coalesce((p->>'promote')::boolean,false) then 'established' else layer end,
      status=case when coalesce((p->>'promote')::boolean,false) then 'verified' else status end
      where id=old.id returning * into m;
    delete from public.memory_sources where memory_id=m.id;
    if f ? 'source' then insert into public.memory_sources(brain_id,memory_id,file,commit_ref) values(b,m.id,f->'source'->>'file',f->'source'->>'commit'); end if;
    perform private.record_revision(m,actor);
    return to_jsonb(m)-'search_document'-'fingerprint';
  when 'resolve_conflict' then
    perform private.assert_keys(p,array['brain_id','memory_id','superseded_memory_id','expected_version','expected_superseded_version'],array['brain_id','memory_id','superseded_memory_id','expected_version','expected_superseded_version']);
    select * into old from public.memories where brain_id=b and id=(p->>'superseded_memory_id')::uuid;
    select * into m from public.memories where brain_id=b and id=(p->>'memory_id')::uuid;
    if m.id is null or old.id is null or m.id=old.id or m.topic<>old.topic or old.status='superseded' or m.status='superseded' then raise exception 'INVALID_RESOLUTION'; end if;
    if m.version<>(p->>'expected_version')::integer or old.version<>(p->>'expected_superseded_version')::integer then raise exception 'VERSION_CONFLICT'; end if;
    update public.memories set status='superseded',version=version+1,updated_at=now(),actor_id=actor where id=old.id returning * into old;
    perform private.record_revision(old,actor);
    update public.memories set status='verified',layer='established',version=version+1,updated_at=now(),actor_id=actor where id=m.id returning * into m;
    perform private.record_revision(m,actor);
    return to_jsonb(m)-'search_document'-'fingerprint';
  when 'delete_memory' then
    perform private.assert_keys(p,array['brain_id','memory_id'],array['brain_id','memory_id']);
    select * into m from public.memories where brain_id=b and id=(p->>'memory_id')::uuid;
    if not found then raise exception 'NOT_FOUND'; end if;
    update public.synchronization_events set payload=null,status='failed',error_code='PRIVACY_PURGED' where brain_id=b and status='pending' and exists(select 1 from jsonb_array_elements(payload->'facts') queued(value) where queued.value->>'topic'=m.topic);
    delete from public.memories where id=m.id;
    return jsonb_build_object('success',true);
  when 'report_memory' then
    perform private.assert_keys(p,array['brain_id','memory_id','reason','request_deletion'],array['brain_id','memory_id','reason']);
    insert into public.privacy_reports(brain_id,memory_id,actor_id,reason,request_deletion) values(b,(p->>'memory_id')::uuid,actor,p->>'reason',coalesce((p->>'request_deletion')::boolean,false));
    return jsonb_build_object('success',true);
  when 'enqueue_sync' then
    perform private.assert_keys(p,array['brain_id','event_key','session_key','client','event','facts'],array['brain_id','event_key','session_key','client','event','facts']);
    if p->>'event_key' !~ '^[a-f0-9]{64}$' or p->>'session_key' !~ '^[a-f0-9]{64}$' or p->>'client' not in ('claude-code','cursor','vscode','cli') or p->>'event' not in ('session_start','decision','task_completed','session_end','file_changed') or jsonb_typeof(p->'facts')<>'array' or jsonb_array_length(p->'facts')>20 then raise exception 'INVALID_INPUT'; end if;
    x := '[]'::jsonb;
    for f in select value from jsonb_array_elements(p->'facts') loop x:=x||jsonb_build_array(private.screen_fact(f)); end loop;
    p:=jsonb_set(p,'{facts}',x);
    h:=encode(sha256(convert_to(p::text,'UTF8')),'hex');
    select * into job from public.synchronization_events where brain_id=b and actor_id=actor and event_key=p->>'event_key';
    if found then
      if job.payload_hash<>h then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
      return jsonb_build_object('id',job.id,'status',job.status,'success',true);
    end if;
    if (select count(*) from public.synchronization_events where brain_id=b and actor_id=actor and created_at>now()-interval '1 minute')>=60 then raise exception 'RATE_LIMITED'; end if;
    insert into public.synchronization_events(brain_id,actor_id,event_key,payload_hash,payload) values(b,actor,p->>'event_key',h,p) returning * into job;
    return jsonb_build_object('id',job.id,'status',job.status,'success',true);
  else raise exception 'UNKNOWN_ACTION';
  end case;
end $$;

create function public.hivemind_mutate(action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.mutate(action,payload) $$;
revoke all on function private.mutate(text,jsonb), public.hivemind_mutate(text,jsonb) from public, anon;
grant execute on function private.mutate(text,jsonb), public.hivemind_mutate(text,jsonb) to authenticated;

create function private.search(b uuid,q text,n integer,t text,l text,s text,recent_first boolean default false)
returns table(id uuid,brain_id uuid,topic text,content text,type text,provenance text,layer text,status text,version integer,actor_id uuid,created_at timestamptz,updated_at timestamptz,source jsonb,score real)
language plpgsql security invoker set search_path='' as $$
begin
  if not private.is_member(b) then raise exception 'FORBIDDEN'; end if;
  if n not between 1 and 30 or length(q)>500 then raise exception 'INVALID_INPUT'; end if;
  return query
  select m.id,m.brain_id,m.topic,m.content,m.type,m.provenance,m.layer,m.status,m.version,m.actor_id,m.created_at,m.updated_at,
    jsonb_strip_nulls(jsonb_build_object('file',ms.file,'commit',ms.commit_ref)),
    (4*ts_rank_cd(m.search_document,websearch_to_tsquery('english',q)) + extensions.word_similarity(q,m.topic || ' ' || m.content) + case when m.status='verified' then 0.2 else 0 end + (0.1/(1+extract(epoch from now()-m.updated_at)/86400)))::real ranking
  from public.memories m left join public.memory_sources ms on ms.memory_id=m.id
  where m.brain_id=b and (s is null and m.status<>'superseded' or s is not null and m.status=s)
    and (t is null or m.type=t) and (l is null or m.layer=l)
    and (q='' or m.search_document @@ websearch_to_tsquery('english',q) or extensions.word_similarity(q,m.topic || ' ' || m.content)>0.2)
  order by case when recent_first then m.updated_at end desc,ranking desc,m.updated_at desc,m.id limit n;
end $$;
create function public.search_memories(p_brain_id uuid,p_query text default '',p_limit integer default 10,p_type text default null,p_layer text default null,p_status text default null,p_recent boolean default false)
returns table(id uuid,brain_id uuid,topic text,content text,type text,provenance text,layer text,status text,version integer,actor_id uuid,created_at timestamptz,updated_at timestamptz,source jsonb,score real)
language sql security invoker set search_path='' as $$ select * from private.search(p_brain_id,p_query,p_limit,p_type,p_layer,p_status,p_recent) $$;
revoke all on function private.search(uuid,text,integer,text,text,text,boolean),public.search_memories(uuid,text,integer,text,text,text,boolean) from public,anon;
grant execute on function private.search(uuid,text,integer,text,text,text,boolean),public.search_memories(uuid,text,integer,text,text,text,boolean) to authenticated;

create function private.process_event(event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.synchronization_events; f jsonb; result jsonb; session_id uuid; b uuid; worker boolean := coalesce(auth.jwt()->>'role','')='service_role';
begin
  select brain_id into b from public.synchronization_events where id=event_id;
  if b is null then raise exception 'NOT_FOUND'; end if;
  -- Same lock ordering as memory deletion and membership changes.
  perform 1 from public.brains where id=b for update;
  select * into job from public.synchronization_events where id=event_id for update;
  if not worker and (auth.uid() is null or job.actor_id<>auth.uid() or not private.is_member(b)) then raise exception 'FORBIDDEN'; end if;
  if job.status<>'pending' or job.next_attempt_at>now() then return jsonb_build_object('id',job.id,'status',job.status); end if;
  update public.synchronization_events set attempts=attempts+1 where id=job.id returning * into job;
  if not exists(select 1 from public.brain_members where brain_id=b and actor_id=job.actor_id) then
    update public.synchronization_events set status='failed',payload=null,error_code='MEMBERSHIP_REVOKED' where id=job.id;
    return jsonb_build_object('id',job.id,'status','failed');
  end if;
  begin
    insert into public.sessions(brain_id,actor_id,session_key,client) values(b,job.actor_id,job.payload->>'session_key',job.payload->>'client')
      on conflict(brain_id,actor_id,client,session_key) do update set ended_at=case when job.payload->>'event'='session_end' then now() else public.sessions.ended_at end returning id into session_id;
    if job.payload->>'event'='session_end' then update public.sessions set ended_at=now() where id=session_id; end if;
    for f in select value from jsonb_array_elements(job.payload->'facts') loop
      result:=private.save_memory(b,job.actor_id,f);
      if f->>'type'='handoff' then insert into public.session_handoffs(brain_id,session_id,memory_id) values(b,session_id,(result->>'id')::uuid) on conflict do nothing; end if;
    end loop;
    update public.synchronization_events set status='completed',payload=null,completed_at=now(),error_code=null where id=job.id;
    return jsonb_build_object('id',job.id,'status','completed');
  exception when others then
    -- SQLERRM can echo private input. Persist only a generic code, with bounded retries.
    update public.synchronization_events set status=case when attempts>=5 then 'failed' else 'pending' end,
      payload=case when attempts>=5 then null else payload end,error_code='PROCESSING_FAILED',next_attempt_at=now()+make_interval(secs => power(2,attempts)::integer)
      where id=job.id;
    return jsonb_build_object('id',job.id,'status',case when job.attempts>=5 then 'failed' else 'pending' end);
  end;
end $$;
create function public.process_sync_event(p_event_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.process_event(p_event_id) $$;
revoke all on function private.process_event(uuid),public.process_sync_event(uuid) from public,anon;
grant execute on function private.process_event(uuid),public.process_sync_event(uuid) to authenticated,service_role;

create function private.drain_events(batch_size integer default 20) returns integer
language plpgsql security definer set search_path='' as $$
declare j record; count_done integer:=0;
begin
  if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'FORBIDDEN'; end if;
  for j in select id from public.synchronization_events where status='pending' and next_attempt_at<=now() order by created_at limit least(greatest(batch_size,1),100) loop
    perform private.process_event(j.id); count_done:=count_done+1;
  end loop;
  return count_done;
end $$;
create function public.drain_sync_events(p_batch_size integer default 20) returns integer language sql security invoker set search_path='' as $$ select private.drain_events(p_batch_size) $$;
revoke all on function private.drain_events(integer),public.drain_sync_events(integer) from public,anon,authenticated;
grant execute on function private.drain_events(integer),public.drain_sync_events(integer) to service_role;

create function private.retention() returns integer language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
  if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'FORBIDDEN'; end if;
  delete from public.memories m using public.brains b where m.brain_id=b.id and m.layer='working' and m.updated_at<now()-make_interval(days=>b.retention_days);
  get diagnostics removed=row_count;
  update public.synchronization_events set payload=null,status='failed',error_code='EXPIRED' where status='pending' and created_at<now()-interval '7 days';
  delete from public.synchronization_events where status<>'pending' and created_at<now()-interval '30 days';
  delete from public.sessions where started_at<now()-interval '90 days';
  return removed;
end $$;
create function public.apply_retention() returns integer language sql security invoker set search_path='' as $$ select private.retention() $$;
revoke all on function private.retention(),public.apply_retention() from public,anon,authenticated;
grant execute on function private.retention(),public.apply_retention() to service_role;

-- Internal functions must not be executable by arbitrary roles.
revoke all on function private.assert_keys(jsonb,text[],text[]), private.safe_text(text,boolean), private.screen_fact(jsonb), private.record_revision(public.memories,uuid), private.save_memory(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
