-- Auth invokes this hook before signing tokens. Ordinary password sessions
-- keep their dashboard audience; OAuth client sessions are bound to our MCP.
create or replace function public.hivemind_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare claims jsonb := event->'claims';
begin
  if nullif(claims->>'client_id', '') is not null then
    claims := jsonb_set(claims, '{aud}', '"https://mio-hivemind.vercel.app/mcp"'::jsonb);
  end if;
  return jsonb_build_object('claims', claims);
end;
$$;
revoke all on function public.hivemind_access_token_hook(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema public to supabase_auth_admin;
    grant execute on function public.hivemind_access_token_hook(jsonb) to supabase_auth_admin;
  end if;
end $$;
