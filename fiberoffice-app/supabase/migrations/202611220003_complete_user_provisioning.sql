begin;
create or replace function private.ops_provision_auth_user() returns trigger language plpgsql security definer set search_path='' as $$
declare config jsonb; actor public.ops_members; projects uuid[]; member_role text; edit_status boolean;
begin
 config:=new.raw_app_meta_data->'fiber_provision';
 if config is null then return new;end if;
 -- Auth may add protected app metadata in a later UPDATE of the same creation transaction.
 -- Existing memberships must never be recreated or have newer rights overwritten.
 if exists(select 1 from public.ops_members where user_id=new.id) then return new;end if;
 select m.* into actor from public.ops_members m join auth.users u on u.id=m.user_id where m.user_id=(config->>'actor')::uuid and m.role='admin' and not m.disabled and u.email_confirmed_at is not null for share of m;
 if not found then raise exception 'Nur die Administration darf Benutzer anlegen';end if;
 member_role:=config->>'role';
 if member_role is null or member_role not in ('gu','nu','planner','installer') or jsonb_typeof(config->'projects') is distinct from 'array' or jsonb_array_length(config->'projects')>100 then raise exception 'Ungültige Benutzerrechte';end if;
 select coalesce(array_agg(distinct value::uuid),'{}') into projects from jsonb_array_elements_text(config->'projects');
 if exists(select 1 from unnest(projects) x where x is null or not exists(select 1 from public.ops_projects p where p.id=x and p.tenant_id=actor.tenant_id)) then raise exception 'Projekt nicht verfügbar';end if;
 edit_status:=member_role<>'planner' and coalesce((config->>'canEditStatus')::boolean,false);
 insert into public.ops_members(user_id,tenant_id,email,role,can_edit_status) values(new.id,actor.tenant_id,lower(new.email),member_role,edit_status);
 insert into public.ops_project_members(tenant_id,user_id,project_id) select actor.tenant_id,new.id,unnest(projects);
 insert into public.ops_audits(tenant_id,actor_id,actor,after_data) values(actor.tenant_id,actor.user_id,actor.email,jsonb_build_object('action','Benutzer angelegt','email',lower(new.email),'role',member_role,'canEditStatus',edit_status,'projectIds',to_jsonb(projects)));
 return new;
end $$;

create trigger ops_provision_updated_auth_user after update of raw_app_meta_data on auth.users for each row execute function private.ops_provision_auth_user();
notify pgrst,'reload schema';
commit;
