-- Only expose a boolean about the caller's own verified OAuth session.
create or replace function private.oauth_session_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from auth.sessions s
    join auth.oauth_consents c on c.user_id = s.user_id and c.client_id = s.oauth_client_id
    where s.user_id = auth.uid()
      and s.id::text = auth.jwt()->>'session_id'
      and s.oauth_client_id::text = auth.jwt()->>'client_id'
      and (s.not_after is null or s.not_after > now())
      and c.revoked_at is null
  );
$$;
revoke all on function private.oauth_session_active() from public, anon;
grant execute on function private.oauth_session_active() to authenticated;
create or replace function public.hivemind_oauth_session_active()
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.oauth_session_active();
$$;
revoke all on function public.hivemind_oauth_session_active() from public, anon;
grant execute on function public.hivemind_oauth_session_active() to authenticated;
