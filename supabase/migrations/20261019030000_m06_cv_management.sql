-- Local preparation only. Depends on the M02 request-budget table; do not run remotely without release approval.
begin;
alter table public.profile_content
  add column cv_version uuid,
  add column cv_filename varchar(180),
  add column cv_size_bytes integer,
  add column cv_updated_at timestamptz,
  add constraint profile_cv_complete check (
    (cv_version is null and cv_filename is null and cv_size_bytes is null and cv_updated_at is null)
    or (cv_version is not null and cv_filename is not null and cv_size_bytes is not null
      and cv_updated_at is not null and cv_size_bytes between 1 and 5242880
      and length(btrim(cv_filename)) between 5 and 180
      and cv_filename ~* '\.pdf$' and cv_filename !~ '[[:cntrl:]/]' and position(chr(92) in cv_filename)=0)
  );

-- A table-level UPDATE grant already exists. A CV-only guard must also cover direct REST writes.
create function app_private.guard_cv_metadata()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and new.cv_version is not null) or
     (tg_op = 'UPDATE' and row(new.cv_version,new.cv_filename,new.cv_size_bytes,new.cv_updated_at)
       is distinct from row(old.cv_version,old.cv_filename,old.cv_size_bytes,old.cv_updated_at)) then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'CV metadata requires the validated server path' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_cv_metadata() from public, anon, authenticated;
create trigger profile_cv_server_only before insert or update on public.profile_content
  for each row execute function app_private.guard_cv_metadata();

create function public.can_manage_cv()
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.is_owner_admin_aal2();
$$;
revoke all on function public.can_manage_cv() from public, anon;
grant execute on function public.can_manage_cv() to authenticated;

create function public.activate_cv(p_previous uuid, p_version uuid, p_filename text, p_size integer)
returns setof public.profile_content language sql security invoker set search_path = '' as $$
  update public.profile_content
  set cv_version = p_version, cv_filename = p_filename, cv_size_bytes = p_size, cv_updated_at = now()
  where singleton_key = 1 and cv_version is not distinct from p_previous and p_version is not null
  returning *;
$$;
revoke all on function public.activate_cv(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.activate_cv(uuid,uuid,text,integer) to service_role;

-- Keep the M02 limiter function and its quotas unchanged; reuse only its event table.
create function public.consume_cv_budget(p_scope text, p_identity text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  window_size interval;
  max_attempts integer;
  moment timestamptz;
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Unsupported transaction isolation';
  end if;
  if p_identity is null or p_identity !~ '^[0-9a-f]{64}$' then raise exception 'Invalid identity'; end if;
  case p_scope
    when 'cv-download' then window_size := interval '1 minute'; max_attempts := 60;
    when 'cv-upload' then window_size := interval '10 minutes'; max_attempts := 5;
    else raise exception 'Invalid CV scope';
  end case;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_scope || ':' || p_identity, 0));
  moment := pg_catalog.clock_timestamp();
  delete from app_private.request_budget_events where scope=p_scope and identity_hash=p_identity
    and created_at <= moment-window_size;
  if (select count(*) from app_private.request_budget_events where scope=p_scope and identity_hash=p_identity
      and created_at>moment-window_size) >= max_attempts then return false; end if;
  insert into app_private.request_budget_events(scope,identity_hash,created_at) values(p_scope,p_identity,moment);
  return true;
end;
$$;
revoke all on function public.consume_cv_budget(text,text) from public,anon,authenticated;
grant execute on function public.consume_cv_budget(text,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('portfolio-cv','portfolio-cv',false,5242880,array['application/pdf']) on conflict(id) do nothing;
do $$ begin
  if not exists(select 1 from storage.buckets where id='portfolio-cv' and public=false
    and file_size_limit=5242880 and allowed_mime_types=array['application/pdf']) then
    raise exception 'Existing portfolio-cv bucket requires review';
  end if;
end $$;

create policy "CV anonymous raw access denied" on storage.objects as restrictive for all to anon
  using(bucket_id<>'portfolio-cv') with check(bucket_id<>'portfolio-cv');
create policy "CV raw reads require owner AAL2" on storage.objects as restrictive for select to authenticated
  using(bucket_id<>'portfolio-cv' or app_private.is_owner_admin_aal2());
create policy "Owner AAL2 can recover CV objects" on storage.objects for select to authenticated
  using(bucket_id='portfolio-cv' and app_private.is_owner_admin_aal2());
create policy "CV inserts require validated server" on storage.objects as restrictive for insert to authenticated
  with check(bucket_id<>'portfolio-cv');
create policy "CV updates require validated server" on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'portfolio-cv') with check(bucket_id<>'portfolio-cv');
create policy "CV deletion requires separate review" on storage.objects as restrictive for delete to authenticated
  using(bucket_id<>'portfolio-cv');
commit;
