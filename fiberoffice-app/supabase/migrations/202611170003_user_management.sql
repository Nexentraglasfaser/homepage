begin;
alter table public.ops_members add column disabled boolean not null default false;
alter table public.ops_members add column access_after timestamptz;
create or replace function private.ops_member() returns public.ops_members language sql stable security definer set search_path='' as $$
select m from public.ops_members m join auth.users u on u.id=m.user_id where m.user_id=auth.uid() and u.email_confirmed_at is not null and not m.disabled and
(m.access_after is null or exists(select 1 from auth.sessions s where s.user_id=m.user_id and s.id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')::uuid and s.created_at>m.access_after))
$$;
create function public.ops_set_user_disabled(p_email text,p_disabled boolean) returns void language plpgsql security definer set search_path='' as $$
declare actor public.ops_members; target public.ops_members;
begin
actor:=private.ops_member();if actor.role is distinct from 'admin' then raise exception 'Nur die Administration darf Zugänge sperren';end if;
select * into target from public.ops_members where tenant_id=actor.tenant_id and email=lower(btrim(p_email)) and role<>'admin' and user_id<>actor.user_id for update;
if not found or p_disabled is null then raise exception 'Zugang nicht verfügbar';end if;
if target.disabled=p_disabled then return;end if;
update public.ops_members set disabled=p_disabled,access_after=clock_timestamp() where user_id=target.user_id;
insert into public.ops_audits(tenant_id,actor_id,actor,before_data,after_data) values(actor.tenant_id,actor.user_id,actor.email,jsonb_build_object('email',target.email,'disabled',target.disabled),jsonb_build_object('action',case when p_disabled then 'Zugang gesperrt' else 'Zugang entsperrt' end,'email',target.email,'disabled',p_disabled));
end $$;
revoke all on function public.ops_set_user_disabled(text,boolean) from public;
grant execute on function public.ops_set_user_disabled(text,boolean) to authenticated;
create or replace function public.ops_me() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.ops_members;begin m:=private.ops_member();if m.user_id is null then raise exception 'Zugang gesperrt oder Anmeldung abgelaufen. Bitte erneut anmelden.';end if;
return jsonb_build_object('email',m.email,'role',m.role,'canEdit',m.role='admin','canEditStatus',m.role='admin' or m.can_edit_status,'members',case when m.role='admin' then
(select coalesce(jsonb_agg(jsonb_build_object('email',x.email,'role',x.role,'disabled',x.disabled,'canEditStatus',x.can_edit_status,'projectIds',coalesce((select jsonb_agg(pm.project_id order by pm.project_id) from public.ops_project_members pm where pm.user_id=x.user_id),'[]')) order by x.email),'[]') from public.ops_members x where x.tenant_id=m.tenant_id) else '[]'::jsonb end);end $$;
create function private.ops_password_reset_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare config jsonb; actor public.ops_members; target public.ops_members;
begin
config:=new.raw_app_meta_data->'fiber_password_reset';
if config is null or config is not distinct from old.raw_app_meta_data->'fiber_password_reset' then return new;end if;
select m.* into actor from public.ops_members m join auth.users u on u.id=m.user_id where m.user_id=(config->>'actor')::uuid and m.role='admin' and not m.disabled and u.email_confirmed_at is not null for share of m;
if not found then raise exception 'Nur die Administration darf Passwörter zurücksetzen';end if;
select * into target from public.ops_members where user_id=new.id and tenant_id=actor.tenant_id and role<>'admin' and user_id<>actor.user_id for update;
if not found or coalesce(config->>'requestId','')='' then raise exception 'Ungültiges Passwort-Update';end if;
update public.ops_members set access_after=clock_timestamp() where user_id=target.user_id;
insert into public.ops_audits(tenant_id,actor_id,actor,after_data) values(actor.tenant_id,actor.user_id,actor.email,jsonb_build_object('action','Passwort zurückgesetzt','email',target.email));
return new;
end $$;
revoke all on function private.ops_password_reset_audit() from public;
create trigger ops_password_reset_after_update after update of encrypted_password,raw_app_meta_data on auth.users for each row execute function private.ops_password_reset_audit();
-- Provisioning also rejects a disabled administrator.
DO $patch$ declare old text; updated text; begin
select pg_get_functiondef('private.ops_provision_auth_user()'::regprocedure) into old;
updated:=replace(old,'and m.role=''admin'' and u.email_confirmed_at','and m.role=''admin'' and not m.disabled and u.email_confirmed_at');
if updated=old then raise exception 'Provisioning definition mismatch';end if;execute updated;
end $patch$;
notify pgrst,'reload schema';
commit;
