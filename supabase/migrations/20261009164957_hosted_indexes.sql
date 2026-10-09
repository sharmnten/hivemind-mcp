-- Cover cascading foreign-key lookups identified by hosted Supabase advisors.
create index reports_memory on public.privacy_reports(brain_id,memory_id);
create index handoffs_memory on public.session_handoffs(brain_id,memory_id);
create index handoffs_session on public.session_handoffs(brain_id,session_id);
