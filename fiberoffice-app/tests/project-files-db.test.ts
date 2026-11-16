import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const id=(n:number)=>`22222222-2222-4222-8222-${String(n).padStart(12,'0')}`;
let db:PGlite;let project:string;let batch=100;
async function as(n:number,sql:string,args:unknown[]=[]){await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',false)`);try{return await db.query<any>(sql,args);}finally{await db.exec('reset role');}}
const create=(user:number,name:string,n:number)=>as(user,'select public.ops_create_project($1,$2,$3,$4,$5,$6) as result',[id(n),name,'Testort','Duraku','P-1','Testprojekt']);
const row=(n:string,extra:Record<string,unknown>={})=>({street:'Teststraße',number:n,city:'Testort',reference:'ID-'+n,sourceValues:{Status:'Fertiggestellt'},...extra});
const imp=(user:number,rows:unknown[],request=id(++batch),p=project)=>as(user,'select public.ops_import_addresses($1,$2,$3,$4,$5) as result',[p,request,JSON.stringify(rows),'Kunden.xlsx','Kunden']);
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role authenticated;create role anon;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public,storage to authenticated,anon;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb);alter table storage.objects enable row level security;grant select,insert,delete,update on storage.objects to authenticated;`);
 for(const f of ['202611140001_core.sql','202611140002_storage.sql','202611140004_operations.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 await db.exec(`insert into auth.users values('${id(1)}','admin@test.invalid',now()),('${id(2)}','gu@test.invalid',now()),('${id(3)}','nu@test.invalid',now()),('${id(4)}','foreign@test.invalid',now()),('${id(5)}','unconfirmed@test.invalid',null);insert into public.tenants values('${id(10)}','A'),('${id(11)}','B');insert into public.ops_members values('${id(1)}','${id(10)}','admin@test.invalid','admin',true),('${id(2)}','${id(10)}','gu@test.invalid','gu',false),('${id(3)}','${id(10)}','nu@test.invalid','nu',true),('${id(4)}','${id(11)}','foreign@test.invalid','gu',false),('${id(5)}','${id(10)}','unconfirmed@test.invalid','gu',false);insert into public.ops_records(tenant_id,id,project,payload) values('${id(10)}','legacy','Bestand','{"id":"legacy","project":"Bestand","street":"Altweg","number":"1","overrides":{"status":"Fertiggestellt"}}');`);
 for(const f of ['202611150001_project_import.sql','202611150002_import_indexes.sql','202611150003_status_context.sql','202611160001_project_files.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
});
afterAll(async()=>{await db?.close();});

it('GU uploads, assigned NU downloads, other projects and tenants blocked',async()=>{
 project=(await as(1,'select id from public.ops_projects')).rows[0].id;
 const path=`${id(10)}/${project}/${id(91)}`;
 await as(2,"insert into storage.objects(bucket_id,name,owner_id,metadata) values('project-files',$1,$2,$3)",[path,id(2),JSON.stringify({size:100,mimetype:'application/pdf'})]);
 await as(2,"select public.ops_register_project_file($1,$2,'NVT.pdf','NVT- und Trassenpläne',$3)",[project,path,'a'.repeat(64)]);
 expect((await as(2,'select * from public.ops_project_files')).rows).toHaveLength(1);
 for(const n of [3,4,5])expect((await as(n,'select * from public.ops_project_files')).rows).toHaveLength(0);
 expect((await as(3,"select * from storage.objects where bucket_id='project-files'")).rows).toHaveLength(0);
 await db.exec(`update public.ops_records set assigned_user_id='${id(3)}' where id='legacy'`);
 expect((await as(3,'select * from public.ops_project_files')).rows).toHaveLength(1);
 expect((await as(3,"select * from storage.objects where bucket_id='project-files'")).rows).toHaveLength(1);
 await expect(as(3,"insert into storage.objects(bucket_id,name,owner_id,metadata) values('project-files',$1,$2,'{}')",[`${id(10)}/${project}/${id(92)}`,id(3)])).rejects.toThrow();
 await expect(as(3,"select public.ops_register_project_file($1,$2,'x.pdf','Spleißpläne',$3)",[project,path,'b'.repeat(64)])).rejects.toThrow('Kein Uploadrecht');
 expect((await as(4,"select private.ops_project_path_access($1,true) as allowed",[path])).rows[0].allowed).toBe(false);
 await db.exec('set role anon');await expect(db.query('select * from public.ops_project_files')).rejects.toThrow();await db.exec('reset role');
});
it('registration requires own upload, registered files cannot be modified',async()=>{
 const path=`${id(10)}/${project}/${id(94)}`;
 await as(2,"insert into storage.objects(bucket_id,name,owner_id,metadata) values('project-files',$1,$2,$3)",[path,id(2),JSON.stringify({size:99,mimetype:'application/pdf'})]);
 expect((await as(3,'select * from storage.objects where name=$1',[path])).rows).toHaveLength(0);
 await expect(as(1,"select public.ops_register_project_file($1,$2,'x.pdf','Spleißpläne',$3)",[project,path,'b'.repeat(64)])).rejects.toThrow('nicht hochgeladen');
 await expect(as(2,"select public.ops_register_project_file($1,$2,'../x.pdf','Spleißpläne',$3)",[project,path,'b'.repeat(64)])).rejects.toThrow('Ungültige');
 await expect(as(2,"update public.ops_project_files set name='hack'")).rejects.toThrow();
 expect((await as(2,"delete from storage.objects where name=$1 returning name",[`${id(10)}/${project}/${id(91)}`])).rows).toHaveLength(0);
});
