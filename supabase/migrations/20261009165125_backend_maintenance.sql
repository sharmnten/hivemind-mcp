-- Supabase Cron provides restart recovery without a service-role key in the app.
-- PGlite and minimal PostgreSQL environments without pg_cron keep the optional
-- Node worker path. Hosted Supabase supports pg_cron.
do $install$
begin
  if exists (select 1 from pg_available_extensions where name='pg_cron') then
    create extension if not exists pg_cron;
    -- Only trusted database operators may administer these jobs.
    revoke all on schema cron from public, anon, authenticated;
    perform cron.schedule('hivemind-drain-sync','30 seconds',$job$
      do $run$
      begin
        perform pg_catalog.set_config('request.jwt.claims','{"role":"service_role"}',true);
        perform private.drain_events(20);
      end $run$;
    $job$);
    perform cron.schedule('hivemind-retention','0 * * * *',$job$
      do $run$
      begin
        perform pg_catalog.set_config('request.jwt.claims','{"role":"service_role"}',true);
        perform private.retention();
        delete from cron.job_run_details
        where end_time < now()-interval '7 days'
          and jobid in (select jobid from cron.job where jobname in ('hivemind-drain-sync','hivemind-retention'));
      end $run$;
    $job$);
  end if;
end $install$;
