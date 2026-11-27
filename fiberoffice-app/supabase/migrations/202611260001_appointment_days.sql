begin;
-- Only the tenant operating the Nexentra website can publish to its calendar.
create table private.website_calendar_owner(
 site text primary key, tenant_id uuid not null references public.tenants(id)
);
insert into private.website_calendar_owner
 select 'nexentra.de',tenant_id from public.ops_members
 where role='admin' and lower(email)='info@nexentra.de';
create table public.ops_appointment_days(
 project_id uuid not null references public.ops_projects(id) on delete cascade,
 day date not null, windows text[] not null,
 primary key(project_id,day),
 check(cardinality(windows)>0 and array_position(windows,null) is null and windows <@ array['Vormittags','Mittags','Nachmittags']::text[])
);
alter table public.ops_appointment_days enable row level security;
revoke all on public.ops_appointment_days from anon,authenticated;
create function public.website_appointment_days() returns table(project text,city text,day date,windows text[])
language sql stable security definer set search_path='' as $$
 select p.name,coalesce(nullif(btrim(p.city),''),p.name),d.day,d.windows
 from public.ops_appointment_days d join public.ops_projects p on p.id=d.project_id
 join private.website_calendar_owner w on w.tenant_id=p.tenant_id and w.site='nexentra.de'
 where d.day >= (now() at time zone 'Europe/Berlin')::date order by p.name,d.day
$$;
create function public.ops_set_appointment_day(p_project uuid,p_day date,p_windows text[]) returns void
language plpgsql security definer set search_path='' as $$
declare actor public.ops_members; previous text[];
begin
 actor:=private.ops_member();
 if actor.role is distinct from 'admin' or not exists(select 1 from public.ops_projects p
 join private.website_calendar_owner w on w.tenant_id=p.tenant_id and w.site='nexentra.de'
 where p.id=p_project and p.tenant_id=actor.tenant_id) then raise exception 'Keine Berechtigung für dieses Projekt';end if;
 if p_day is null or p_day<(now() at time zone 'Europe/Berlin')::date or p_windows is null then raise exception 'Bitte ein aktuelles oder zukünftiges Datum auswählen';end if;
 perform 1 from public.ops_projects where id=p_project for update;
 select d.windows into previous from public.ops_appointment_days d where project_id=p_project and day=p_day;
 if coalesce(previous,'{}')=p_windows then return;end if;
 if cardinality(p_windows)=0 then delete from public.ops_appointment_days where project_id=p_project and day=p_day;
 else insert into public.ops_appointment_days values(p_project,p_day,p_windows)
 on conflict(project_id,day) do update set windows=excluded.windows;end if;
 insert into public.ops_audits(tenant_id,actor_id,actor,before_data,after_data)
 values(actor.tenant_id,actor.user_id,actor.email,to_jsonb(previous),jsonb_build_object('action','Homepage-Terminfreigabe','projectId',p_project,'day',p_day,'windows',p_windows));
end $$;
revoke all on function public.website_appointment_days(),public.ops_set_appointment_day(uuid,date,text[]) from public;
grant execute on function public.website_appointment_days() to anon,authenticated;
grant execute on function public.ops_set_appointment_day(uuid,date,text[]) to authenticated;
notify pgrst,'reload schema';
commit;
