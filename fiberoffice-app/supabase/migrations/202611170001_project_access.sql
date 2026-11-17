-- Explicit per-project access. No implicit access for GU users, including future projects.
begin;
create table public.ops_project_members (
 tenant_id uuid not null references public.tenants(id),
 user_id uuid not null references public.ops_members(user_id),
 project_id uuid not null references public.ops_projects(id),
 primary key(user_id,project_id)
);
alter table public.ops_project_members enable row level security;
grant select on public.ops_project_members to authenticated;
create policy ops_project_members_read on public.ops_project_members for select to authenticated using(
 tenant_id=(private.ops_member()).tenant_id and (user_id=auth.uid() or (private.ops_member()).role='admin'));
create function private.ops_project_access(t uuid,p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.ops_member() m join public.ops_projects pr on pr.id=p and pr.tenant_id=m.tenant_id where m.tenant_id=t and
 (m.role='admin' or exists(select 1 from public.ops_project_members pm where pm.tenant_id=t and pm.user_id=m.user_id and pm.project_id=p)))
$$;
revoke all on function private.ops_project_access(uuid,uuid) from public;
grant execute on function private.ops_project_access(uuid,uuid) to authenticated;
create or replace function private.ops_read(t uuid,r text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ops_records c join public.ops_projects p on p.tenant_id=c.tenant_id and p.name=c.project cross join private.ops_member() m
 where c.tenant_id=t and c.id=r and m.tenant_id=t and private.ops_project_access(t,p.id) and (m.role in ('admin','gu') or c.assigned_user_id=m.user_id))
$$;
drop policy ops_projects_read on public.ops_projects;
create policy ops_projects_read on public.ops_projects for select to authenticated using(private.ops_project_access(tenant_id,id) and
 ((private.ops_member()).role in ('admin','gu') or exists(select 1 from public.ops_records r where r.tenant_id=ops_projects.tenant_id and r.project=ops_projects.name and r.assigned_user_id=auth.uid())));
drop policy ops_history_gu on public.ops_history;
create policy ops_history_gu on public.ops_history for select to authenticated using(private.ops_read(tenant_id,id) and (private.ops_member()).role in ('admin','gu'));
drop policy ops_audits_read on public.ops_audits;
create policy ops_audits_read on public.ops_audits for select to authenticated using(tenant_id=(private.ops_member()).tenant_id and ((private.ops_member()).role='admin' or (record_id is not null and private.ops_read(tenant_id,record_id))));
-- The original source metadata is tenant-wide; do not disclose it to scoped users.
drop policy ops_sources_read on public.ops_sources;
create policy ops_sources_read on public.ops_sources for select to authenticated using(tenant_id=(private.ops_member()).tenant_id and (private.ops_member()).role='admin');
create function public.ops_project_permissions(p_email text,p_projects uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare m public.ops_members; target public.ops_members; old_ids jsonb;
begin
 m:=private.ops_member(); if m.role is distinct from 'admin' then raise exception 'Nur Nexentra darf Listen freigeben';end if;
 select * into target from public.ops_members where tenant_id=m.tenant_id and email=lower(btrim(p_email)) and role<>'admin' for update;
 if not found or p_projects is null then raise exception 'Ungültiger Zugang oder Listenauswahl';end if;
 if exists(select 1 from unnest(p_projects) x where x is null or not exists(select 1 from public.ops_projects p where p.id=x and p.tenant_id=m.tenant_id)) then raise exception 'Projekt nicht verfügbar';end if;
 select coalesce(jsonb_agg(project_id order by project_id),'[]') into old_ids from public.ops_project_members where user_id=target.user_id;
 delete from public.ops_project_members where user_id=target.user_id;
 insert into public.ops_project_members(tenant_id,user_id,project_id) select m.tenant_id,target.user_id,x from (select distinct unnest(p_projects) x) ids;
 insert into public.ops_audits(tenant_id,actor_id,actor,before_data,after_data) values(m.tenant_id,m.user_id,m.email,jsonb_build_object('email',target.email,'projectIds',old_ids),jsonb_build_object('action','Listenfreigabe geändert','email',target.email,'projectIds',to_jsonb(p_projects)));
end $$;
revoke all on function public.ops_project_permissions(text,uuid[]) from public;
grant execute on function public.ops_project_permissions(text,uuid[]) to authenticated;
create or replace function public.ops_me() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.ops_members;begin m:=private.ops_member();if m.user_id is null then raise exception 'Kein freigegebener Zugang';end if;
return jsonb_build_object('email',m.email,'role',m.role,'canEdit',m.role='admin','canEditStatus',m.role='admin' or m.can_edit_status,'members',case when m.role='admin' then
(select coalesce(jsonb_agg(jsonb_build_object('email',x.email,'role',x.role,'canEditStatus',x.can_edit_status,'projectIds',coalesce((select jsonb_agg(pm.project_id order by pm.project_id) from public.ops_project_members pm where pm.user_id=x.user_id),'[]')) order by x.email),'[]') from public.ops_members x where x.tenant_id=m.tenant_id) else '[]'::jsonb end);end $$;
create or replace function public.ops_import_addresses(p_project uuid,p_request uuid,p_rows jsonb,p_file text,p_sheet text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.ops_members;p public.ops_projects; b public.ops_import_batches; item jsonb; k text;v jsonb; rid text; payload jsonb;
 city text;street text;num text;ref text; match_id text; fingerprint text; result jsonb; added integer:=0;skipped jsonb:='[]'; ordinal integer:=0; raw jsonb;
begin
 m:=private.ops_member(); if m.role is null or m.role not in ('admin','gu') then raise exception 'Nur Nexentra und Generalunternehmer dürfen Adressen hinzufügen';end if;
 select * into p from public.ops_projects where id=p_project and tenant_id=m.tenant_id;
 if not found or not private.ops_project_access(m.tenant_id,p.id) then raise exception 'Projekt nicht verfügbar';end if;
 if p_request is null or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Ungültige Importanfrage';end if;
 if jsonb_array_length(p_rows) not between 1 and 5000 or octet_length(p_rows::text)>8000000 or coalesce(length(p_file),0) not between 1 and 240 or length(coalesce(p_sheet,''))>100 then raise exception 'Import umfasst höchstens 5.000 Zeilen; Dateiangaben prüfen';end if;
 perform pg_advisory_xact_lock(hashtextextended(m.tenant_id::text||':'||p.id::text,0));
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_project,p_rows,p_file,p_sheet)::text,'UTF8')),'hex');
 select * into b from public.ops_import_batches where tenant_id=m.tenant_id and request_id=p_request;
 if found then
  if b.fingerprint<>fingerprint then raise exception 'Importanfrage bereits für andere Daten verwendet';end if;
  return b.result;
 end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  ordinal:=ordinal+1;
  if jsonb_typeof(item) is distinct from 'object' then raise exception 'Ungültige Zeile %',ordinal;end if;
  for k,v in select * from jsonb_each(item) loop
   if k='sourceValues' then
    if jsonb_typeof(v) is distinct from 'object' or (select count(*) from jsonb_object_keys(v))>100 or exists(select 1 from jsonb_each(v) e where jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>20000 or length(e.key)>250) then raise exception 'Ungültige Quellwerte in Zeile %',ordinal;end if;
   elsif not(k=any(array['street','number','city','postcode','reference','customer','email','phone','phone2','nvt','units','ne4','pipe','note'])) or jsonb_typeof(v)<>'string' or length(v#>>'{}')>(case when k='note' then 20000 else 1000 end) then raise exception 'Nicht erlaubtes Feld oder ungültiger Wert in Zeile %: %',ordinal,k;
   end if;
  end loop;
  street:=btrim(coalesce(item->>'street',''));num:=btrim(coalesce(item->>'number',''));city:=coalesce(nullif(btrim(item->>'city'),''),p.city);ref:=btrim(coalesce(item->>'reference',''));
  if length(street) not between 1 and 160 or length(num) not between 1 and 30 or length(city) not between 1 and 100 or private.ops_key(street)='' or private.ops_key(num)='' or (coalesce(item->>'postcode','')<>'' and (item->>'postcode')!~'^[0-9]{5}$') then raise exception 'Straße, Hausnummer, Ort oder PLZ in Zeile % ungültig',ordinal;end if;
  if coalesce(item->>'email','')<>'' and (item->>'email')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'E-Mail in Zeile % ungültig',ordinal;end if;
  match_id:=null;
  select r.id into match_id from public.ops_records r where r.tenant_id=m.tenant_id and r.project=p.name
   and private.ops_key(r.payload->>'street')=private.ops_key(street) and private.ops_key(r.payload->>'number')=private.ops_key(num)
   and private.ops_key(coalesce(nullif(r.payload->>'city',''),p.city))=private.ops_key(city) limit 1;
  if match_id is not null then skipped:=skipped||jsonb_build_array(jsonb_build_object('row',ordinal,'address',street||' '||num,'reason','Adresse bereits vorhanden'));continue;end if;
  if ref<>'' and exists(select 1 from public.ops_records r where r.tenant_id=m.tenant_id and r.project=p.name and private.ops_key(r.payload->>'reference')=private.ops_key(ref)) then
   skipped:=skipped||jsonb_build_array(jsonb_build_object('row',ordinal,'address',street||' '||num,'reason','Anschluss-ID bereits für eine andere Adresse vorhanden'));continue;
  end if;
  rid:=gen_random_uuid()::text;raw:=coalesce(item->'sourceValues','{}');
  payload:=jsonb_build_object('id',rid,'project',p.name,'street',street,'number',num,'city',city,'postcode',coalesce(item->>'postcode',''),'reference',ref,
   'customer',coalesce(item->>'customer',''),'email',coalesce(item->>'email',''),'phone',coalesce(item->>'phone',''),'phone2',coalesce(item->>'phone2',''),'nvt',coalesce(item->>'nvt',''),'units',coalesce(item->>'units',''),'ne4',coalesce(item->>'ne4',''),'pipe',coalesce(item->>'pipe',''),'note',coalesce(item->>'note',''),
   'appointment','','date','','time','','version',1,'conflicts','[]'::jsonb,'history','[]'::jsonb,'source',p_file||case when coalesce(p_sheet,'')<>'' then ' · '||p_sheet else '' end||' · Importzeile '||ordinal,
   'sources',jsonb_build_array(jsonb_build_object('sheet',p_sheet,'row',ordinal,'priority',100,'fields',raw,'status','Offen','appointment','','date','','time','','note',coalesce(item->>'note',''))),
   'overrides',jsonb_build_object('status','Offen'),'createdBy',m.email,'createdAt',now(),'importBatch',p_request);
  insert into public.ops_records(tenant_id,id,project,payload) values(m.tenant_id,rid,p.name,payload);
  insert into public.ops_history(tenant_id,id,payload) values(m.tenant_id,rid,'[]');
  insert into public.ops_audits(tenant_id,record_id,actor_id,actor,after_data) values(m.tenant_id,rid,m.user_id,m.email,jsonb_build_object('action','Adresse hinzugefügt','project',p.name,'status','Offen','file',p_file,'sheet',p_sheet,'row',ordinal,'batch',p_request,'record',payload));
  added:=added+1;
 end loop;
 result:=jsonb_build_object('inserted',added,'skipped',skipped,'total',ordinal,'project',p.name);
 insert into public.ops_import_batches values(m.tenant_id,p_request,p_project,m.user_id,fingerprint,result,now());
 return result;
end $$;
revoke all on function private.ops_key(text) from public;
create or replace function public.ops_create_project(p_id uuid,p_name text,p_city text,p_client text,p_code text,p_note text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.ops_members; p public.ops_projects;
begin
 m:=private.ops_member(); if m.role is null or m.role not in ('admin','gu') then raise exception 'Nur Nexentra und Generalunternehmer dürfen Projekte anlegen'; end if;
 if p_id is null or coalesce(length(btrim(p_name)),0) not between 1 and 100 or private.ops_key(p_name)='' or coalesce(length(btrim(p_city)),0) not between 1 and 100 or length(coalesce(p_client,''))>200 or length(coalesce(p_code,''))>100 or length(coalesce(p_note,''))>3000 then raise exception 'Projektname und Ort sind erforderlich; bitte Feldlängen prüfen'; end if;
 perform pg_advisory_xact_lock(hashtextextended(m.tenant_id::text||':projects',0));
 select * into p from public.ops_projects where tenant_id=m.tenant_id and id=p_id;
 if found then
  if m.role<>'admin' and not private.ops_project_access(m.tenant_id,p.id) then raise exception 'Projekt wartet auf Freigabe durch Nexentra';end if;
  if p.name=btrim(p_name) and p.city=btrim(p_city) and p.client=coalesce(p_client,'') and p.code=coalesce(p_code,'') and p.note=coalesce(p_note,'') then return to_jsonb(p);end if;
  raise exception 'Anfrage bereits mit anderen Projektdaten verwendet';
 end if;
 if exists(select 1 from public.ops_projects where tenant_id=m.tenant_id and private.ops_key(name)=private.ops_key(p_name)) then raise exception 'Ein Projekt mit diesem Namen ist bereits vorhanden'; end if;
 insert into public.ops_projects(id,tenant_id,name,city,client,code,note,created_by) values(p_id,m.tenant_id,btrim(p_name),btrim(p_city),coalesce(p_client,''),coalesce(p_code,''),coalesce(p_note,''),m.user_id) returning * into p;
 insert into public.ops_audits(tenant_id,actor_id,actor,after_data) values(m.tenant_id,m.user_id,m.email,jsonb_build_object('action','Projekt angelegt','project',to_jsonb(p)));
 return to_jsonb(p);
end $$;


create or replace function private.ops_project_file_access(p uuid,w boolean) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.ops_projects x where x.id=p and private.ops_project_access(x.tenant_id,x.id) and ((private.ops_member()).role in ('admin','gu') or (not w and exists(select 1 from public.ops_records r where r.tenant_id=x.tenant_id and r.project=x.name and r.assigned_user_id=auth.uid()))))
$$;
notify pgrst,'reload schema';
commit;
