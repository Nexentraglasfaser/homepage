begin;
alter table public.ops_members add column display_name text not null default '';
create or replace function public.ops_me() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.ops_members;begin m:=private.ops_member();if m.user_id is null then raise exception 'Zugang gesperrt oder Anmeldung abgelaufen. Bitte erneut anmelden.';end if;
return jsonb_build_object('email',m.email,'role',m.role,'canEdit',m.role in ('admin','planner'),'canEditStatus',m.role='admin' or (m.role<>'planner' and m.can_edit_status),'members',case when m.role='admin' then
(select coalesce(jsonb_agg(jsonb_build_object('email',x.email,'displayName',x.display_name,'role',x.role,'disabled',x.disabled,'canEditStatus',x.can_edit_status,'projectIds',coalesce((select jsonb_agg(pm.project_id order by pm.project_id) from public.ops_project_members pm where pm.user_id=x.user_id),'[]')) order by x.email),'[]') from public.ops_members x where x.tenant_id=m.tenant_id) else '[]'::jsonb end);end $$;

create function public.ops_manage_installer(p_email text,p_action text,p_name text default null) returns void
language plpgsql security definer set search_path='' as $$
declare actor public.ops_members; target public.ops_members;
begin
 actor:=private.ops_member();
 if actor.role is distinct from 'admin' then raise exception 'Nur für die Administration';end if;
 select * into target from public.ops_members where tenant_id=actor.tenant_id and role='installer'
  and email=lower(btrim(p_email)) and user_id<>actor.user_id for update;
 if not found then raise exception 'Monteurzugang nicht verfügbar';end if;
 if p_action='name' then
  if p_name is null or length(btrim(p_name))>100 then raise exception 'Name zu lang oder ungültig';end if;
  update public.ops_members set display_name=btrim(p_name) where user_id=target.user_id;
 elsif p_action='delete' then
  -- Keep references to past uploads and work under the original user ID.
  if exists(select 1 from public.profiles where id=target.user_id) then
   raise exception 'Der Zugang hat ein weiteres Anwendungsprofil. Bitte zuerst den Zugang sperren und die Zuordnung prüfen.';
  end if;
  update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)-'fiber_provision'-'fiber_password_reset',
    banned_until='9999-12-31 00:00:00+00', encrypted_password=null, email=null,deleted_at=now()
    where id=target.user_id;
  delete from auth.identities where user_id=target.user_id;
  delete from auth.sessions where user_id=target.user_id;
  delete from public.ops_project_members where user_id=target.user_id;
  delete from public.ops_members where user_id=target.user_id;
 else raise exception 'Unbekannte Aktion';end if;
 insert into public.ops_audits(tenant_id,actor_id,actor,before_data,after_data)
 values(actor.tenant_id,actor.user_id,actor.email,jsonb_build_object('email',target.email,'name',target.display_name),
 jsonb_build_object('action',case when p_action='name' then 'Monteur umbenannt' else 'Monteurzugang gelöscht' end,'name',case when p_action='name' then btrim(p_name) end));
end $$;
revoke all on function public.ops_manage_installer(text,text,text) from public;
grant execute on function public.ops_manage_installer(text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
