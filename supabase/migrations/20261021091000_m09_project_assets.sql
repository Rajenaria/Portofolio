insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('portfolio-project-assets','portfolio-project-assets',false,15728640,array['image/jpeg','image/png','image/webp'])
 on conflict(id) do nothing;
do $$ begin
 if exists(select 1 from storage.buckets where id='portfolio-project-assets' and
  (public or file_size_limit is distinct from 15728640::bigint or allowed_mime_types is distinct from array['image/jpeg','image/png','image/webp']))
 then raise exception 'Existing project bucket conflicts with private contract'; end if;
end $$;
-- No browser writes, deletes, signed URLs, or anonymous reads. All I/O uses validated Edge handlers.
create policy "M09 project assets server only" on storage.objects as restrictive
 for all to anon,authenticated using (bucket_id <> 'portfolio-project-assets')
 with check (bucket_id <> 'portfolio-project-assets');
create function public.project_asset_command(p_actor uuid,p_project uuid,p_asset uuid,p_component text default null,p_metadata jsonb default null,p_legacy boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a app_private.project_assets;
begin
 if not exists(select 1 from app_private.admin_users where user_id=p_actor) then raise exception 'FORBIDDEN'; end if;
 if p_component is null then
  select * into a from app_private.project_assets where id=p_asset and project_id=p_project;
  return to_jsonb(a);
 end if;
 if p_component not in ('original','desktop','mobile') then raise exception 'INVALID_COMPONENT'; end if;
 if p_metadata->>'path' <> p_project::text||'/'||p_asset::text||'/'||p_component||'.'||(case p_metadata->>'mime' when 'image/png' then 'png' when 'image/jpeg' then 'jpg' else 'webp' end)
  or (p_metadata->>'size')::integer not between 1 and (case when p_component='original' then 15728640 else 5242880 end)
  or p_metadata->>'hash' !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_METADATA'; end if;
 insert into app_private.project_assets(id,version,project_id,created_by,provenance) values(p_asset,p_asset,p_project,p_actor,case when p_legacy then 'legacy-derivative-only' else 'original-upload' end) on conflict(id) do nothing;
 select * into a from app_private.project_assets where id=p_asset for update;
 if a.project_id<>p_project then raise exception 'ASSET_CONFLICT'; end if;
 if a.components ? p_component then
  if a.components->p_component is distinct from p_metadata then raise exception 'IMMUTABLE_ASSET'; end if;
 else
  update app_private.project_assets set components=components||jsonb_build_object(p_component,p_metadata) where id=p_asset returning * into a;
 end if;
 if a.components ?& array['original','desktop','mobile'] or (a.provenance='legacy-derivative-only' and a.components ?& array['desktop','mobile']) then
  update app_private.project_assets set state='ready' where id=p_asset returning * into a;
 end if;
 return to_jsonb(a);
end; $$;
revoke all on function public.project_asset_command(uuid,uuid,uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.project_asset_command(uuid,uuid,uuid,text,jsonb,boolean) to service_role;

create function public.project_assets_for_owner(p_actor uuid,p_project uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'state',state,'provenance',provenance) order by created_at),'[]')
 from app_private.project_assets where project_id=p_project and exists(select 1 from app_private.admin_users where user_id=p_actor);
$$;
revoke all on function public.project_assets_for_owner(uuid,uuid) from public,anon,authenticated;
grant execute on function public.project_assets_for_owner(uuid,uuid) to service_role;

create function public.project_asset_delivery(p_project uuid,p_asset uuid,p_variant text)
returns jsonb language sql stable security definer set search_path = '' as $$
 select a.components->p_variant from app_private.project_assets a
 join public.projects p on p.id=a.project_id
 join app_private.project_revisions r on r.id=p.published_revision_id and r.project_id=p.id
 where p.id=p_project and a.id=p_asset and a.state='ready' and p.status='published' and p.deleted_at is null
 and r.manifest ? p_asset::text and p_variant in ('desktop','mobile');
$$;
revoke all on function public.project_asset_delivery(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.project_asset_delivery(uuid,uuid,text) to service_role;

-- Separate project budget; existing M02/M06 scopes and limits are not modified.
create function public.consume_project_budget(p_identity text,p_upload boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
declare moment timestamptz; scope_name text:=case when p_upload then 'project-upload' else 'project-media' end;
begin
 if current_setting('transaction_isolation')<>'read committed' or p_identity is null or p_identity !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_BUDGET'; end if;
 perform pg_advisory_xact_lock(hashtextextended(scope_name||':'||p_identity,0)); moment:=clock_timestamp();
 delete from app_private.request_budget_events where scope=scope_name and identity_hash=p_identity and created_at<=moment-interval '1 minute';
 if (select count(*) from app_private.request_budget_events where scope=scope_name and identity_hash=p_identity)>=(case when p_upload then 30 else 240 end) then return false; end if;
 insert into app_private.request_budget_events(scope,identity_hash,created_at) values(scope_name,p_identity,moment); return true;
end; $$;
revoke all on function public.consume_project_budget(text,boolean) from public,anon,authenticated;
grant execute on function public.consume_project_budget(text,boolean) to service_role;
