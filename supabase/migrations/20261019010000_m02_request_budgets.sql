begin;

create table app_private.request_budget_events (
  scope text not null,
  identity_hash text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index request_budget_lookup on app_private.request_budget_events
  (scope, identity_hash, created_at);
alter table app_private.request_budget_events enable row level security;
revoke all on app_private.request_budget_events from public, anon, authenticated;

-- Service-only, fixed limits, sliding windows. Lock precedes count and insert.
create function public.consume_request_budget(p_scope text, p_identity text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  window_size interval;
  max_attempts integer;
  moment timestamptz;
begin
  -- Count after a lock must see the preceding holder's committed insert.
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Unsupported transaction isolation';
  end if;
  if p_identity !~ '^[0-9a-f]{64}$' or p_identity is null then
    raise exception 'Invalid identity';
  end if;
  case p_scope
    when 'guestbook' then window_size := interval '10 minutes'; max_attempts := 3;
    when 'certificate' then window_size := interval '1 minute'; max_attempts := 60;
    else raise exception 'Invalid scope';
  end case;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_scope || ':' || p_identity, 0));
  moment := pg_catalog.clock_timestamp();
  delete from app_private.request_budget_events
    where scope = p_scope and identity_hash = p_identity
      and created_at <= moment - window_size;
  if (select count(*) from app_private.request_budget_events
      where scope = p_scope and identity_hash = p_identity) >= max_attempts then
    return false;
  end if;
  insert into app_private.request_budget_events(scope, identity_hash, created_at)
    values (p_scope, p_identity, moment);
  return true;
end;
$$;
revoke all on function public.consume_request_budget(text, text) from public, anon, authenticated;
grant execute on function public.consume_request_budget(text, text) to service_role;

commit;
