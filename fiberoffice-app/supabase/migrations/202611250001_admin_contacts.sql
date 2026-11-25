create or replace function public.ops_update(p_id text,p_version integer,p_patch jsonb) returns void language plpgsql security definer set search_path='' as $$
declare m public.ops_members;c public.ops_records;k text;v jsonb;b jsonb;n jsonb;a uuid;contacts jsonb:='{}';
begin m:=private.ops_member();if m.user_id is null then raise exception 'Kein Zugriff';end if;
select * into c from public.ops_records where tenant_id=m.tenant_id and id=p_id for update;
if not found or not (private.ops_write(c.tenant_id,c.id) or (m.role='planner' and private.ops_read(c.tenant_id,c.id))) then raise exception 'Ausbaustatus schreibgeschützt oder kein Zugriff';end if;
if c.version<>p_version then raise exception 'Zwischenzeitlich geändert. Bitte neu laden';end if;
if jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then raise exception 'Ungültige Änderung';end if;
for k,v in select * from jsonb_each(p_patch) loop
 if not(k=any(case when m.role='admin' then array['status','steps','note','appointment','date','assignee','customer','email','phone','phone2'] when m.role='planner' then array['appointment','date','note'] else array['status','steps','note'] end)) then raise exception 'Feld nicht freigegeben';end if;
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
b:=coalesce(c.payload->'overrides','{}'::jsonb);for k in select unnest(array['customer','email','phone','phone2']) loop
 if p_patch ? k then
  contacts:=contacts||jsonb_build_object(k,btrim(p_patch->>k));
  b:=b||jsonb_build_object(k,c.payload->k);
 end if;
end loop;
n:=b||p_patch||contacts;
if m.role='planner' and p_patch->>'date'='' and p_patch->>'appointment'='' and b->>'status' in ('Terminiert','Intern geplant') then n:=jsonb_set(n,'{status}','"Offen"'::jsonb);end if;
update public.ops_records set payload=jsonb_set(jsonb_set(payload||contacts,'{overrides}',n),'{version}',to_jsonb(c.version+1)),version=c.version+1,assigned_user_id=a where tenant_id=c.tenant_id and id=c.id;
insert into public.ops_audits(tenant_id,record_id,actor_id,actor,before_data,after_data) values(m.tenant_id,c.id,m.user_id,m.email,b,n);
end $$;
