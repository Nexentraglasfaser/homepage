begin;
create table public.ops_project_files (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.ops_projects(id),
 path text not null unique, name text not null, category text not null,
 mime text not null, size bigint not null, sha256 text not null,
 uploaded_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(project_id,sha256)
);
alter table public.ops_project_files enable row level security;
grant select on public.ops_project_files to authenticated;
create function private.ops_project_file_access(p uuid,w boolean) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ops_projects x where x.id=p and x.tenant_id=(private.ops_member()).tenant_id and
 ((private.ops_member()).role in ('admin','gu') or (not w and exists(select 1 from public.ops_records r where r.tenant_id=x.tenant_id and r.project=x.name and r.assigned_user_id=auth.uid()))))
$$;
create function private.ops_project_path_access(p text,w boolean) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if p !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$' then return false;end if;
 return split_part(p,'/',1)=(private.ops_member()).tenant_id::text and private.ops_project_file_access(split_part(p,'/',2)::uuid,w);
exception when invalid_text_representation then return false;
end $$;
revoke all on function private.ops_project_file_access(uuid,boolean),private.ops_project_path_access(text,boolean) from public;
grant execute on function private.ops_project_file_access(uuid,boolean),private.ops_project_path_access(text,boolean) to authenticated;
create policy project_file_read on public.ops_project_files for select to authenticated using(private.ops_project_file_access(project_id,false));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('project-files','project-files',false,52428800,array['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png']);
create policy project_object_upload on storage.objects for insert to authenticated with check(bucket_id='project-files' and owner_id=auth.uid()::text and private.ops_project_path_access(name,true));
create policy project_object_read on storage.objects for select to authenticated using(bucket_id='project-files' and private.ops_project_path_access(name,false) and exists(select 1 from public.ops_project_files f where f.path=storage.objects.name));
create policy project_orphan_cleanup on storage.objects for delete to authenticated using(bucket_id='project-files' and owner_id=auth.uid()::text and private.ops_project_path_access(name,true) and not exists(select 1 from public.ops_project_files f where f.path=storage.objects.name));
create function public.ops_register_project_file(p_project uuid,p_path text,p_name text,p_category text,p_sha256 text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o storage.objects; f public.ops_project_files; m public.ops_members;
begin
 m:=private.ops_member();
 if not coalesce(private.ops_project_file_access(p_project,true),false) then raise exception 'Kein Uploadrecht für dieses Projekt';end if;
 if split_part(p_path,'/',2)<>p_project::text or not coalesce(private.ops_project_path_access(p_path,true),false) then raise exception 'Ungültiger Dateipfad';end if;
 if coalesce(length(btrim(p_name)),0) not between 1 and 240 or p_name ~ '[/\\]' or coalesce(p_sha256,'') !~ '^[a-f0-9]{64}$' or p_category not in ('NVT- und Trassenpläne','Spleißpläne','Montageanleitungen','Weitere Arbeitsunterlagen') or p_category is null then raise exception 'Ungültige Dateiangaben';end if;
 select * into o from storage.objects where bucket_id='project-files' and name=p_path and owner_id=auth.uid()::text;
 if not found or (o.metadata->>'size')::bigint not between 1 and 52428800 or coalesce(o.metadata->>'mimetype','') not in ('application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png') then raise exception 'Datei nicht hochgeladen oder nicht zulässig';end if;
 insert into public.ops_project_files(project_id,path,name,category,mime,size,sha256,uploaded_by) values(p_project,p_path,btrim(p_name),p_category,o.metadata->>'mimetype',(o.metadata->>'size')::bigint,p_sha256,m.user_id) returning * into f;
 insert into public.ops_audits(tenant_id,actor_id,actor,after_data) values(m.tenant_id,m.user_id,m.email,jsonb_build_object('action','Projektdatei hochgeladen','file',to_jsonb(f)));
 return to_jsonb(f);
end $$;
revoke all on function public.ops_register_project_file(uuid,text,text,text,text) from public;
grant execute on function public.ops_register_project_file(uuid,text,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
