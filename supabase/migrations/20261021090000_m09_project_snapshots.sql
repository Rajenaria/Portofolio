-- LOCAL SOURCE ONLY. Coordinated application/API cutover required; never run remotely without release approval.
begin;
alter table public.projects add column published_revision_id uuid,
  add column publication_version bigint not null default 0 check (publication_version >= 0);

create table app_private.project_working_drafts (
  project_id uuid primary key references public.projects(id),
  schema_version smallint not null default 1 check (schema_version = 1),
  draft_version bigint not null default 0 check (draft_version >= 0),
  base_published_revision_id uuid,
  base_publication_version bigint not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 524288),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create table app_private.project_revisions (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
  schema_version smallint not null default 1 check (schema_version = 1),
  payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=524288),
  public_payload jsonb not null check (jsonb_typeof(public_payload)='object'),
  manifest jsonb not null check (jsonb_typeof(manifest)='array'),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'), operation_id uuid not null unique,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(project_id,id)
);
alter table public.projects add constraint projects_revision_owner_fk
  foreign key (id,published_revision_id) references app_private.project_revisions(project_id,id);
alter table app_private.project_working_drafts add constraint project_draft_base_owner_fk
 foreign key(project_id,base_published_revision_id) references app_private.project_revisions(project_id,id);
create table app_private.project_assets (
  id uuid primary key, project_id uuid not null references public.projects(id),
  version uuid not null unique, components jsonb not null default '{}',
  state text not null default 'uploading' check (state in ('uploading','ready','failed')),
  provenance text not null default 'original-upload' check (provenance in ('original-upload','legacy-derivative-only')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index project_assets_project on app_private.project_assets(project_id);
create table app_private.project_publish_operations (
  id uuid primary key, project_id uuid not null references public.projects(id),
  actor uuid not null references auth.users(id), draft_version bigint not null check (draft_version>=0), publication_version bigint not null check (publication_version>=0),
  mode text not null check (mode in ('publish','show','hide','archive','trash','restore')),
  content_hash text not null, state text not null check (state in ('preparing','committed')),
  result jsonb, created_at timestamptz not null default now()
);
create index project_operations_project on app_private.project_publish_operations(project_id,created_at);
alter table app_private.project_revisions add constraint project_revision_operation_fk
 foreign key(operation_id) references app_private.project_publish_operations(id);
alter table app_private.project_working_drafts enable row level security;
alter table app_private.project_revisions enable row level security;
alter table app_private.project_assets enable row level security;
alter table app_private.project_publish_operations enable row level security;
revoke all on app_private.project_working_drafts, app_private.project_revisions,
 app_private.project_assets, app_private.project_publish_operations from public,anon,authenticated;

create function public.can_manage_projects() returns boolean language sql stable security definer
set search_path = '' as $$ select app_private.is_owner_admin_aal2(); $$;
revoke all on function public.can_manage_projects() from public,anon;
grant execute on function public.can_manage_projects() to authenticated;

-- Legacy adapter reads only actual stored content. No invented case-study sections.
create function app_private.project_legacy_payload(p_id uuid,p_private boolean default false) returns jsonb
language sql stable security definer set search_path = '' as $$
select jsonb_build_object('schema_version',1,'general',jsonb_build_object(
 'title',p.title,'slug',p.slug,'category',coalesce(p.card_category,''),'summary',coalesce(p.short_description,''),
 'role',coalesce(p.role,''),'period',coalesce(p.project_date::text,''),'stage',coalesce(p.project_type,''),
 'github_url',coalesce(p.github_url,''),'demo_url',coalesce(p.demo_url,''),'featured',p.featured,'sort_order',p.sort_order),
 'cover',case when (p.cover_bucket='portfolio-media' or (p_private and p.cover_bucket='portfolio-staging')) and p.cover_desktop_path is not null then jsonb_build_object(
  'id',p.id,'asset_id',null,'legacy',jsonb_build_object('id',p.id,'bucket',p.cover_bucket,'desktop',p.cover_desktop_path,'mobile',coalesce(p.cover_mobile_path,p.cover_desktop_path)),
  'alt',coalesce(p.cover_alt,p.title),'crop',jsonb_build_object('fit',p.cover_fit,'aspect','card','x',p.cover_position_x,'y',p.cover_position_y,'zoom',1)) else null end,
 'hero',case when (p.cover_bucket='portfolio-media' or (p_private and p.cover_bucket='portfolio-staging')) and p.cover_desktop_path is not null then jsonb_build_object(
  'id',md5(p.id::text||':hero')::uuid,'asset_id',null,'legacy',jsonb_build_object('id',p.id,'bucket',p.cover_bucket,'desktop',p.cover_desktop_path,'mobile',coalesce(p.cover_mobile_path,p.cover_desktop_path)),
  'alt',coalesce(p.cover_alt,p.title),'crop',jsonb_build_object('fit','cover','aspect','hero','x',50,'y',50,'zoom',1)) else null end,
 'sections',case when exists(select 1 from public.project_media m where m.project_id=p.id and m.is_active and (m.bucket_name='portfolio-media' or (p_private and m.bucket_name='portfolio-staging'))) then
 jsonb_build_array(jsonb_build_object('id',md5(p.id::text||':gallery')::uuid,'type','gallery','title','Project Artifacts','enabled',true,'text','','secondary','',
 'items',(select jsonb_agg(jsonb_build_object('id',md5(m.id::text||':item')::uuid,'title',coalesce(m.alt_text,p.title),'description','',
 'media',jsonb_build_object('id',m.id,'asset_id',null,'legacy',jsonb_build_object('id',m.id,'bucket',m.bucket_name,'desktop',m.desktop_path,'mobile',m.mobile_path),
 'alt',coalesce(m.alt_text,p.title),'crop',jsonb_build_object('fit','cover','aspect','landscape','x',50,'y',50,'zoom',1))) order by m.sort_order,m.id)
 from public.project_media m where m.project_id=p.id and m.is_active and (m.bucket_name='portfolio-media' or (p_private and m.bucket_name='portfolio-staging'))))) else '[]'::jsonb end,'legacy',jsonb_build_object(
 'paragraphs',coalesce((select jsonb_agg(x.content order by x.sort_order,x.id) from public.project_paragraphs x where x.project_id=p.id),'[]'),
 'technologies',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'icon',coalesce(t.icon_key,'')) order by x.sort_order,t.id)
 from public.project_technologies x join public.technologies t on t.id=x.technology_id where x.project_id=p.id),'[]'),
 'intro',coalesce(p.detail_intro,''),'heading',coalesce(p.about_heading,''),'title_main',coalesce(p.detail_title_main,''),'title_highlight',coalesce(p.detail_title_highlight,'')))
from public.projects p where p.id=p_id;
$$;

-- Public projection excludes hidden items and edges to hidden nodes, as well as their media.
create function app_private.project_public_payload(p jsonb) returns jsonb language sql immutable set search_path = '' as $$
 select jsonb_set(p,'{sections}',coalesce((select jsonb_agg(
  case when s->>'type'='architecture' then jsonb_set(
   jsonb_set(s,'{items}',coalesce((select jsonb_agg(i order by item_order) from jsonb_array_elements(s->'items') with ordinality y(i,item_order)
    where coalesce(i->>'enabled','true')='true'),'[]')),
   '{edges}',coalesce((select jsonb_agg(e order by edge_order) from jsonb_array_elements(coalesce(s->'edges','[]')) with ordinality z(e,edge_order)
    where exists(select 1 from jsonb_array_elements(s->'items') i where i->>'id'=e->>'source' and coalesce(i->>'enabled','true')='true')
    and exists(select 1 from jsonb_array_elements(s->'items') i where i->>'id'=e->>'target' and coalesce(i->>'enabled','true')='true')),'[]'))
  else jsonb_set(s,'{items}',coalesce((select jsonb_agg(i order by item_order) from jsonb_array_elements(s->'items') with ordinality y(i,item_order)
    where coalesce(i->>'enabled','true')='true'),'[]')) end order by section_order)
 from jsonb_array_elements(p->'sections') with ordinality x(s,section_order) where s->>'enabled'='true'),'[]'));
$$;
revoke all on function app_private.project_public_payload(jsonb) from public,anon,authenticated;

-- Service-only gateway: Edge validates the full payload and verifies the caller's JWT + AAL2.
create function public.project_command(p_actor uuid,p_action text,p_id uuid,p_expected bigint default 0,
 p_publication bigint default 0,p_payload jsonb default null,p_operation uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.projects; d app_private.project_working_drafts; op app_private.project_publish_operations;
 r app_private.project_revisions; a jsonb; asset app_private.project_assets; public_doc jsonb; manifest jsonb := '[]';
 h text; v_id uuid; v_result jsonb; target text; component text;
begin
 if not exists(select 1 from app_private.admin_users where user_id=p_actor) then raise exception 'FORBIDDEN'; end if;
 if p_action='create' then
  insert into public.projects(id,slug,title) values(p_id,'draft-'||p_id::text,'Project baru') on conflict(id) do nothing;
 end if;
 select * into p from public.projects where id=p_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p_action='read' or p_action='create' then
  select * into d from app_private.project_working_drafts where project_id=p_id;
  if not found then
   insert into app_private.project_working_drafts(project_id,base_published_revision_id,base_publication_version,payload,updated_by)
   values(p_id,p.published_revision_id,p.publication_version,coalesce((select payload from app_private.project_revisions where id=p.published_revision_id),app_private.project_legacy_payload(p_id,true)),p_actor)
   returning * into d;
  end if;
  return jsonb_build_object('project',to_jsonb(p),'draft',to_jsonb(d));
 end if;
 select * into d from app_private.project_working_drafts where project_id=p_id for update;
 if p_action='save' then
  if d.project_id is null or d.draft_version<>p_expected or p.publication_version<>p_publication then raise exception 'REVISION_CONFLICT'; end if;
  if jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>524288 or p_payload->>'schema_version'<>'1' then raise exception 'INVALID_PAYLOAD'; end if;
  if p.published_at is not null and p_payload#>>'{general,slug}'<>p.slug then raise exception 'SLUG_LOCKED'; end if;
  update app_private.project_working_drafts set payload=p_payload,draft_version=draft_version+1,updated_by=p_actor,updated_at=now()
   where project_id=p_id returning * into d;
  return jsonb_build_object('project',to_jsonb(p),'draft',to_jsonb(d));
 end if;
 if p_action='operation' then
  select * into op from app_private.project_publish_operations where id=p_operation and project_id=p_id and actor=p_actor;
  return coalesce(op.result,jsonb_build_object('state','not_committed'));
 end if;
 if p_action not in ('publish','show','hide','archive','trash','restore') or p_operation is null then raise exception 'INVALID_ACTION'; end if;
 h := encode(sha256(convert_to(coalesce(p_payload::text,''),'UTF8')),'hex');
 select * into op from app_private.project_publish_operations where id=p_operation;
 if found then
  if op.project_id<>p_id or op.actor<>p_actor or op.mode<>p_action or op.draft_version<>p_expected or op.publication_version<>p_publication or op.content_hash<>h then raise exception 'OPERATION_CONFLICT'; end if;
  return op.result;
 end if;
 if p.publication_version<>p_publication then raise exception 'PUBLICATION_CONFLICT'; end if;
 if p_action='publish' and (d.project_id is null or d.draft_version<>p_expected or d.base_publication_version<>p_publication) then raise exception 'REVISION_CONFLICT'; end if;
 insert into app_private.project_publish_operations(id,project_id,actor,draft_version,publication_version,mode,content_hash,state)
 values(p_operation,p_id,p_actor,p_expected,p_publication,p_action,h,'preparing');
 if p_action in ('publish','show') then
  if p_action='publish' then
   if d.payload is distinct from p_payload then raise exception 'PAYLOAD_CONFLICT'; end if;
  else
   if p.published_revision_id is not null then select payload into p_payload from app_private.project_revisions where id=p.published_revision_id;
   elsif p.published_at is not null then p_payload := app_private.project_legacy_payload(p_id);
   else raise exception 'NEVER_PUBLISHED'; end if;
  end if;
  if coalesce(p_payload#>>'{general,title}','')='' or coalesce(p_payload#>>'{general,slug}','')='' then raise exception 'INCOMPLETE'; end if;
  -- Edge has validated shape. Independently bind EVERY placement to this project registry or actual legacy reference.
  for a in select v from (select p_payload->'cover' v union all select p_payload->'hero'
   union all select i->'media' from jsonb_array_elements(p_payload->'sections') s cross join lateral jsonb_array_elements(s->'items') i where s->>'enabled'='true' and coalesce(i->>'enabled','true')='true') q
   where v is not null and v<>'null'::jsonb loop
   if a->>'asset_id' is not null then
    select * into asset from app_private.project_assets where id=(a->>'asset_id')::uuid and project_id=p_id and state='ready';
    if not found then raise exception 'ASSET_NOT_READY'; end if;
   elsif not ((a#>>'{legacy,bucket}'='portfolio-media') and (
    (a#>>'{legacy,desktop}'=p.cover_desktop_path and a#>>'{legacy,mobile}'=coalesce(p.cover_mobile_path,p.cover_desktop_path)) or
    exists(select 1 from public.project_media m where m.project_id=p_id and m.bucket_name='portfolio-media' and m.desktop_path=a#>>'{legacy,desktop}' and m.mobile_path=a#>>'{legacy,mobile}'))) then raise exception 'INVALID_LEGACY_REFERENCE'; end if;
  end loop;
  if p_action='publish' or p.published_revision_id is null then
   v_id:=gen_random_uuid(); public_doc:=p_payload;
   public_doc:=app_private.project_public_payload(p_payload);
   for a in select v from (select public_doc->'cover' v union all select public_doc->'hero'
    union all select i->'media' from jsonb_array_elements(public_doc->'sections') s cross join lateral jsonb_array_elements(s->'items') i) q
    where v is not null and v<>'null'::jsonb and v->>'asset_id' is not null loop
    manifest:=manifest || jsonb_build_array(a->>'asset_id');
   end loop;
   insert into app_private.project_revisions(id,project_id,payload,public_payload,manifest,content_hash,operation_id,created_by)
    values(v_id,p_id,p_payload,public_doc,manifest,encode(sha256(convert_to(p_payload::text,'UTF8')),'hex'),p_operation,p_actor);
  else v_id:=p.published_revision_id; end if;
  update public.projects set published_revision_id=v_id,publication_version=publication_version+1,status='published',deleted_at=null,archived_at=null,
   title=p_payload#>>'{general,title}',slug=p_payload#>>'{general,slug}',card_category=p_payload#>>'{general,category}',short_description=p_payload#>>'{general,summary}',
   featured=(p_payload#>>'{general,featured}')::boolean,sort_order=(p_payload#>>'{general,sort_order}')::integer,published_at=coalesce(published_at,now()) where id=p_id returning * into p;
 else
  target:=case when p_action='archive' then 'archived' else 'draft' end;
  update public.projects set status=target,publication_version=publication_version+1,
   archived_at=case when p_action='archive' then now() else null end,
   deleted_at=case when p_action='trash' then now() when p_action='restore' then null else deleted_at end where id=p_id returning * into p;
 end if;
 update app_private.project_working_drafts set base_publication_version=p.publication_version,base_published_revision_id=p.published_revision_id where project_id=p_id;
 v_result:=jsonb_build_object('state','committed','operation_id',p_operation,'revision_id',p.published_revision_id,'publication_version',p.publication_version,'status',p.status,'deleted_at',p.deleted_at);
 update app_private.project_publish_operations set state='committed',result=v_result where id=p_operation;
 return v_result;
end; $$;
revoke all on function public.project_command(uuid,text,uuid,bigint,bigint,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.project_command(uuid,text,uuid,bigint,bigint,jsonb,uuid) to service_role;

create function app_private.project_card_payload(p jsonb) returns jsonb language sql immutable set search_path = '' as $$
 select jsonb_build_object('schema_version',1,'general',p->'general','cover',p->'cover','hero',null,'sections','[]'::jsonb,
 'legacy',jsonb_build_object('paragraphs','[]'::jsonb,'technologies',coalesce(p#>'{legacy,technologies}','[]')||
 coalesce((select jsonb_agg(jsonb_build_object('id',i->>'technology_id','name',i->>'title','icon',''))
 from jsonb_array_elements(p->'sections') s cross join lateral jsonb_array_elements(s->'items') i where s->>'enabled'='true' and s->>'type'='decisions'),'[]')));
$$;
revoke all on function app_private.project_card_payload(jsonb) from public,anon,authenticated;
create function public.project_catalog(p_after uuid default null,p_limit integer default 100,p_slug text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'revision_id',q.published_revision_id,'publication_version',q.publication_version,
 'payload',case when p_slug is null then app_private.project_card_payload(coalesce(r.public_payload,app_private.project_legacy_payload(q.id)))
 else coalesce(r.public_payload,app_private.project_legacy_payload(q.id)) end) order by q.id),'[]')
 from (select * from public.projects p where p.status='published' and p.deleted_at is null
  and (p_after is null or p.id>p_after) and (p_slug is null or p.slug=p_slug) order by p.id limit greatest(1,least(p_limit,100))) q
 left join app_private.project_revisions r on r.id=q.published_revision_id;
$$;
revoke all on function public.project_catalog(uuid,integer,text) from public;
grant execute on function public.project_catalog(uuid,integer,text) to anon,authenticated,service_role;

-- Legacy DML bypass is closed, including stale clients; old clients receive errors, never false successful saves.
revoke insert,update,delete,truncate,references,trigger on public.projects,public.project_paragraphs,public.project_media,public.project_technologies from public,anon,authenticated;
-- Also revoke column grants left by earlier releases.
do $$ declare t text; c record; begin
 foreach t in array array['projects','project_paragraphs','project_media','project_technologies'] loop
  for c in select column_name from information_schema.columns where table_schema='public' and table_name=t loop
   execute format('revoke insert (%I), update (%I), references (%I) on public.%I from public, anon, authenticated',c.column_name,c.column_name,c.column_name,t);
  end loop;
 end loop;
end $$;
revoke all on function app_private.project_legacy_payload(uuid,boolean) from public,anon,authenticated;

create function public.project_published_for_owner(p_actor uuid,p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select coalesce(r.payload,app_private.project_legacy_payload(p.id)) from public.projects p
 left join app_private.project_revisions r on r.id=p.published_revision_id
 where p.id=p_id and p.published_at is not null and exists(select 1 from app_private.admin_users where user_id=p_actor);
$$;
revoke all on function public.project_published_for_owner(uuid,uuid) from public,anon,authenticated;
grant execute on function public.project_published_for_owner(uuid,uuid) to service_role;

create function public.project_admin_catalog(p_actor uuid,p_after uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object(
 'title',case when p.published_at is null then coalesce(d.payload#>>'{general,title}',p.title) else p.title end,
 'has_working_draft',d.project_id is not null,'draft_version',d.draft_version) order by p.id),'[]')
 from (select * from public.projects where (p_after is null or id>p_after)
 and exists(select 1 from app_private.admin_users where user_id=p_actor) order by id limit 100) p
 left join app_private.project_working_drafts d on d.project_id=p.id;
$$;
revoke all on function public.project_admin_catalog(uuid,uuid) from public,anon,authenticated;
grant execute on function public.project_admin_catalog(uuid,uuid) to service_role;
commit;
