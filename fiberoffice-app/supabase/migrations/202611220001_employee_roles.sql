begin;
alter table public.ops_members drop constraint ops_members_role_check;
alter table public.ops_members add constraint ops_members_role_check check(role in ('admin','gu','nu','planner','installer'));
create or replace function private.ops_read(t uuid,r text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ops_records c join public.ops_projects p on p.tenant_id=c.tenant_id and p.name=c.project cross join private.ops_member() m
 where c.tenant_id=t and c.id=r and m.tenant_id=t and private.ops_project_access(t,p.id) and (m.role in ('admin','gu','planner','installer') or c.assigned_user_id=m.user_id))
$$;
drop policy ops_projects_read on public.ops_projects;
create policy ops_projects_read on public.ops_projects for select to authenticated using(private.ops_project_access(tenant_id,id) and
 ((private.ops_member()).role in ('admin','gu','planner','installer') or exists(select 1 from public.ops_records r where r.tenant_id=ops_projects.tenant_id and r.project=ops_projects.name and r.assigned_user_id=auth.uid())));
drop policy ops_history_gu on public.ops_history;
create policy ops_history_gu on public.ops_history for select to authenticated using(private.ops_read(tenant_id,id) and (private.ops_member()).role in ('admin','gu','planner','installer'));

create or replace function private.ops_write(t uuid,r text) returns boolean language sql stable security definer set search_path='' as $$ select private.ops_read(t,r) and exists(select 1 from private.ops_member() m where m.role='admin' or (m.role<>'planner' and m.can_edit_status)) $$;
create or replace function private.ops_project_file_access(p uuid,w boolean) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.ops_projects x where x.id=p and private.ops_project_access(x.tenant_id,x.id) and ((private.ops_member()).role in ('admin','gu') or (not w and (private.ops_member()).role in ('planner','installer')) or (not w and exists(select 1 from public.ops_records r where r.tenant_id=x.tenant_id and r.project=x.name and r.assigned_user_id=auth.uid()))))
$$;
create or replace function public.ops_me() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.ops_members;begin m:=private.ops_member();if m.user_id is null then raise exception 'Zugang gesperrt oder Anmeldung abgelaufen. Bitte erneut anmelden.';end if;
return jsonb_build_object('email',m.email,'role',m.role,'canEdit',m.role in ('admin','planner'),'canEditStatus',m.role='admin' or (m.role<>'planner' and m.can_edit_status),'members',case when m.role='admin' then
(select coalesce(jsonb_agg(jsonb_build_object('email',x.email,'role',x.role,'disabled',x.disabled,'canEditStatus',x.can_edit_status,'projectIds',coalesce((select jsonb_agg(pm.project_id order by pm.project_id) from public.ops_project_members pm where pm.user_id=x.user_id),'[]')) order by x.email),'[]') from public.ops_members x where x.tenant_id=m.tenant_id) else '[]'::jsonb end);end $$;
create or replace function private.ops_provision_auth_user() returns trigger language plpgsql security definer set search_path='' as $$
declare config jsonb; actor public.ops_members; projects uuid[]; member_role text; edit_status boolean;
begin
 config:=new.raw_app_meta_data->'fiber_provision';
 if config is null then return new;end if;
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
create or replace function public.ops_update(p_id text,p_version integer,p_patch jsonb) returns void language plpgsql security definer set search_path='' as $$
declare m public.ops_members;c public.ops_records;k text;v jsonb;b jsonb;n jsonb;a uuid;
begin m:=private.ops_member();if m.user_id is null then raise exception 'Kein Zugriff';end if;
select * into c from public.ops_records where tenant_id=m.tenant_id and id=p_id for update;
if not found or not (private.ops_write(c.tenant_id,c.id) or (m.role='planner' and private.ops_read(c.tenant_id,c.id))) then raise exception 'Ausbaustatus schreibgeschützt oder kein Zugriff';end if;
if c.version<>p_version then raise exception 'Zwischenzeitlich geändert. Bitte neu laden';end if;
if jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then raise exception 'Ungültige Änderung';end if;
for k,v in select * from jsonb_each(p_patch) loop
 if not(k=any(case when m.role='admin' then array['status','steps','note','appointment','date','assignee'] when m.role='planner' then array['appointment','date','note'] else array['status','steps','note'] end)) then raise exception 'Feld nicht freigegeben';end if;
 if k='steps' then
  if jsonb_typeof(v)<>'array' then raise exception 'Ungültige Schritte';end if;
  if jsonb_array_length(v)<>5 or exists(select 1 from jsonb_array_elements(v) t where jsonb_typeof(t)<>'boolean') then raise exception 'Ungültige Schritte';end if;
 elsif jsonb_typeof(v)<>'string' or length(p_patch->>k)>(case when k='note' then 20000 else 1000 end) then raise exception 'Ungültiger Text';end if;
end loop;
if p_patch ? 'status' and not((p_patch->>'status')=any(array['Offen','Terminiert','Intern geplant','Teilleistung','Fehlerstelle','Repariert · Montage offen','Fertiggestellt','Storniert','Klärung','Rückmeldung offen','Altbestand prüfen'])) then raise exception 'Ungültiger Status';end if;
if (p_patch ? 'status' or p_patch ? 'steps') and coalesce(btrim(p_patch->>'note'),'')='' then raise exception 'Statusänderung benötigt einen Vermerk';end if;
if coalesce(p_patch->>'date','')<>'' and (p_patch->>'date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Ungültiges Datum';end if;
a:=c.assigned_user_id;
if p_patch ? 'assignee' then
 a:=null;if coalesce(p_patch->>'assignee','')<>'' then select user_id into a from public.ops_members where tenant_id=m.tenant_id and email=lower(p_patch->>'assignee') and role='nu';if not found then raise exception 'Nachunternehmer muss zuerst als Zugang eingerichtet sein';end if;end if;
end if;
b:=coalesce(c.payload->'overrides','{}'::jsonb);n:=b||p_patch;
if m.role='planner' and p_patch->>'date'='' and p_patch->>'appointment'='' and b->>'status' in ('Terminiert','Intern geplant') then n:=jsonb_set(n,'{status}','"Offen"'::jsonb);end if;
update public.ops_records set payload=jsonb_set(jsonb_set(payload,'{overrides}',n),'{version}',to_jsonb(c.version+1)),version=c.version+1,assigned_user_id=a where tenant_id=c.tenant_id and id=c.id;
insert into public.ops_audits(tenant_id,record_id,actor_id,actor,before_data,after_data) values(m.tenant_id,c.id,m.user_id,m.email,b,n);
end $$;

create function public.ops_set_user_role(p_email text,p_role text) returns void language plpgsql security definer set search_path='' as $$
declare actor public.ops_members; target public.ops_members;
begin
actor:=private.ops_member();if actor.role is distinct from 'admin' then raise exception 'Nur die Administration darf Rollen ändern';end if;
if p_role is null or p_role not in ('gu','nu','planner','installer') then raise exception 'Ungültige Rolle';end if;
select * into target from public.ops_members where tenant_id=actor.tenant_id and email=lower(btrim(p_email)) and role<>'admin' for update;
if not found then raise exception 'Zugang nicht verfügbar';end if;
if target.role=p_role then return;end if;
update public.ops_members set role=p_role,can_edit_status=false where user_id=target.user_id;
insert into public.ops_audits(tenant_id,actor_id,actor,before_data,after_data) values(actor.tenant_id,actor.user_id,actor.email,jsonb_build_object('email',target.email,'role',target.role,'canEditStatus',target.can_edit_status),jsonb_build_object('action','Benutzerrolle geändert','email',target.email,'role',p_role,'canEditStatus',false));
end $$;
revoke all on function public.ops_set_user_role(text,text) from public;
grant execute on function public.ops_set_user_role(text,text) to authenticated;
notify pgrst,'reload schema';
commit;
