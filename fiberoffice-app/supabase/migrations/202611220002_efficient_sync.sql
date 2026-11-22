begin;
-- SECURITY INVOKER: fingerprint only rows visible under the caller's RLS.
-- xmin detects direct source corrections as well as normal versioned edits.
create function public.ops_sync_state() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare membership jsonb; revision text;
begin
 membership:=public.ops_me();
 select md5(concat_ws('|',auth.uid()::text,membership::text,
 (select string_agg(id||':'||xmin::text,',' order by id) from public.ops_records),
 (select string_agg(id::text||':'||xmin::text,',' order by id) from public.ops_files),
 (select string_agg(tenant_id::text||':'||xmin::text,',' order by tenant_id) from public.ops_sources),
 (select string_agg(id::text||':'||xmin::text,',' order by id) from public.ops_audits),
 (select string_agg(id||':'||xmin::text,',' order by id) from public.ops_history),
 (select string_agg(id::text||':'||xmin::text,',' order by id) from public.ops_projects)
 )) into revision;
 return jsonb_build_object('token',revision,'me',membership);
end $$;
revoke all on function public.ops_sync_state() from public;
grant execute on function public.ops_sync_state() to authenticated;
notify pgrst,'reload schema';
commit;
