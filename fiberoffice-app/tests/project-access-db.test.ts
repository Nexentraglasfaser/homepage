import {workResultNote} from '../src/operations-workflow';
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
 for(const f of ['202611150001_project_import.sql','202611150002_import_indexes.sql','202611150003_status_context.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
});

beforeAll(async()=>{
 await create(1,'Duraku',30);await create(1,'Recklinghausen-Süd',31);project=id(30);
 await imp(1,[row('1')],id(600),id(30));await imp(1,[row('2')],id(601),id(31));
 await db.exec(`insert into public.ops_history select tenant_id,id,'{}' from public.ops_records on conflict do nothing;insert into public.ops_sources values('${id(10)}','{"secret":"all-project-source"}');insert into public.ops_files(tenant_id,record_id,path,name,mime,size) select tenant_id,id,tenant_id||'/'||id||'/test.pdf','test.pdf','application/pdf',1 from public.ops_records;insert into storage.objects(bucket_id,name) select 'operations-files',path from public.ops_files;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/202611160001_project_files.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../supabase/migrations/202611170001_project_access.sql',import.meta.url),'utf8'));
});
afterAll(async()=>{await db?.close();});
const grant=(email:string,ids:string[])=>as(1,'select public.ops_project_permissions($1,$2)',[email,ids]);
it('default deny; administrator retains all projects',async()=>{expect((await as(2,'select * from public.ops_projects')).rows).toHaveLength(0);expect((await as(1,'select * from public.ops_projects')).rows).toHaveLength(3);});
it('explicit list selection scopes all data surfaces',async()=>{
 await grant('gu@test.invalid',[id(30)]);
 expect((await as(2,'select name from public.ops_projects')).rows).toEqual([{name:'Duraku'}]);
 for(const table of ['ops_records','ops_history','ops_files','ops_audits'])expect((await as(2,`select * from public.${table}`)).rows).toHaveLength(1);
 expect((await as(2,'select * from storage.objects')).rows).toHaveLength(1);
 expect((await as(2,'select * from public.ops_sources')).rows).toHaveLength(0);
 expect((await as(1,'select public.ops_me() as me')).rows[0].me.members.find((m:any)=>m.email==='gu@test.invalid').projectIds).toEqual([id(30)]);
});
it('GU cannot self-grant and invalid admin grants roll back atomically',async()=>{
 await expect(as(2,'select public.ops_project_permissions($1,$2)',['gu@test.invalid',[id(31)]])).rejects.toThrow('Nur Nexentra');
 await expect(as(2,`insert into public.ops_project_members values('${id(10)}','${id(2)}','${id(31)}')`)).rejects.toThrow();
 await expect(grant('gu@test.invalid',[id(30),id(999)])).rejects.toThrow('nicht verfügbar');
 await expect(grant('foreign@test.invalid',[id(30)])).rejects.toThrow('Ungültiger');
 expect((await as(2,'select name from public.ops_projects')).rows).toEqual([{name:'Duraku'}]);
});
it('hidden project imports and replay requests are denied',async()=>{await expect(imp(2,[row('2')],id(601),id(31))).rejects.toThrow('nicht verfügbar');expect((await imp(2,[row('3')])).rows[0].result.inserted).toBe(1);});
it('status permission never overrides project scope',async()=>{await db.exec(`update public.ops_members set can_edit_status=true where user_id='${id(2)}'`);const r=(await as(1,"select id from public.ops_records where project='Recklinghausen-Süd'")).rows[0];await expect(as(2,'select public.ops_update($1,1,$2)',[r.id,JSON.stringify({status:'Fertiggestellt',note:'Test'})])).rejects.toThrow();});
it('multiple projects work and revocation affects the existing session',async()=>{await grant('gu@test.invalid',[id(30),id(31)]);expect((await as(2,'select * from public.ops_projects')).rows).toHaveLength(2);await grant('gu@test.invalid',[]);for(const t of ['ops_projects','ops_records','ops_history','ops_files','ops_audits'])expect((await as(2,`select * from public.${t}`)).rows).toHaveLength(0);expect((await as(2,'select * from storage.objects')).rows).toHaveLength(0);});
it('new GU-created projects await admin sharing, including retries',async()=>{await create(2,'Neu',33);expect((await as(2,'select * from public.ops_projects')).rows).toHaveLength(0);await expect(create(2,'Neu',33)).rejects.toThrow();await expect(imp(2,[row('4')],id(605),id(33))).rejects.toThrow('nicht verfügbar');});
it('NU requires both list access and address assignment',async()=>{await grant('nu@test.invalid',[id(30)]);expect((await as(3,'select * from public.ops_records')).rows).toHaveLength(0);await db.exec(`update public.ops_records set assigned_user_id='${id(3)}' where project='Duraku'`);expect((await as(3,'select * from public.ops_records')).rows).toHaveLength(2);expect((await as(3,'select * from public.ops_projects')).rows).toHaveLength(1);await grant('nu@test.invalid',[]);expect((await as(3,'select * from public.ops_records')).rows).toHaveLength(0);});

it('project document access follows the same list selection',async()=>{await grant('gu@test.invalid',[id(30)]);expect((await as(2,'select private.ops_project_file_access($1,false) as allowed',[id(31)])).rows[0].allowed).toBe(false);expect((await as(2,'select private.ops_project_file_access($1,true) as allowed',[id(31)])).rows[0].allowed).toBe(false);expect((await as(2,'select private.ops_project_file_access($1,true) as allowed',[id(30)])).rows[0].allowed).toBe(true);});

it('Auth provisioning commits membership, selected lists and audit together',async()=>{
 await db.exec(`alter table auth.users add column raw_app_meta_data jsonb;alter table auth.users add column raw_user_meta_data jsonb;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/202611170002_user_creation.sql',import.meta.url),'utf8'));
 const config={fiber_provision:{actor:id(1),role:'gu',projects:[id(30)],canEditStatus:false}};
 await db.query('insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)',[id(60),'new@test.invalid',JSON.stringify(config)]);
 expect((await as(60,'select name from public.ops_projects')).rows).toEqual([{name:'Duraku'}]);
 expect((await as(60,'select public.ops_me() as me')).rows[0].me.canEditStatus).toBe(false);
 expect((await as(1,"select * from public.ops_audits where after_data->>'action'='Benutzer angelegt'")).rows).toHaveLength(1);
 for(const patch of [{actor:id(2)},{role:'admin'},{projects:[id(999)]}]){
 await expect(db.query('insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)',[id(61),'bad@test.invalid',JSON.stringify({fiber_provision:{...config.fiber_provision,...patch}})])).rejects.toThrow();
 expect((await db.query('select * from auth.users where id=$1',[id(61)])).rows).toHaveLength(0);
 }
 await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)',[id(62),'signup@test.invalid',JSON.stringify(config)]);
 expect((await db.query('select * from public.ops_members where user_id=$1',[id(62)])).rows).toHaveLength(0);
});

it('blocking denies old sessions on all surfaces; only admin can change access',async()=>{
 await db.exec('create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz);alter table auth.users add column encrypted_password text;');
 await db.exec(readFileSync(new URL('../supabase/migrations/202611170003_user_management.sql',import.meta.url),'utf8'));
 await expect(as(2,'select public.ops_set_user_disabled($1,true)',['nu@test.invalid'])).rejects.toThrow('Nur die Administration');
 for(const email of ['admin@test.invalid','foreign@test.invalid'])await expect(as(1,'select public.ops_set_user_disabled($1,true)',[email])).rejects.toThrow('nicht verfügbar');
 await as(1,'select public.ops_set_user_disabled($1,true)',['gu@test.invalid']);
 await expect(as(2,'select public.ops_me()')).rejects.toThrow('Zugang gesperrt');
 for(const table of ['ops_projects','ops_records','ops_history','ops_files','ops_audits','ops_project_files'])expect((await as(2,`select * from public.${table}`)).rows).toHaveLength(0);
 expect((await as(2,'select * from storage.objects')).rows).toHaveLength(0);
 await expect(imp(2,[row('88')])).rejects.toThrow();
 const me=(await as(1,'select public.ops_me() as me')).rows[0].me;expect(me.members.find((m:any)=>m.email==='gu@test.invalid').disabled).toBe(true);
});
it('unblocking preserves lists but requires a genuinely new session, not refreshed JWT',async()=>{
 await db.exec(`insert into auth.sessions values('${id(80)}','${id(2)}',now()-interval '1 hour');select set_config('request.jwt.claims','{"session_id":"${id(80)}"}',false);`);
 await as(1,'select public.ops_set_user_disabled($1,false)',['gu@test.invalid']);
 await expect(as(2,'select public.ops_me()')).rejects.toThrow('Anmeldung abgelaufen');
 await db.exec(`insert into auth.sessions values('${id(81)}','${id(2)}',now()+interval '1 second');select set_config('request.jwt.claims','{"session_id":"${id(81)}"}',false);`);
 expect((await as(2,'select name from public.ops_projects')).rows).toEqual([{name:'Duraku'}]);
 await db.exec("select set_config('request.jwt.claims','{}',false)");
});
it('password reset atomically invalidates sessions, audits without secrets and keeps a blocked user blocked',async()=>{
 await as(1,'select public.ops_set_user_disabled($1,true)',['new@test.invalid']);
 const metadata={fiber_password_reset:{actor:id(1),requestId:'reset-1'}};
 await db.exec('begin');await db.query('update auth.users set encrypted_password=$1 where id=$2',['hash-only',id(60)]);await db.query('update auth.users set raw_app_meta_data=$1 where id=$2',[JSON.stringify(metadata),id(60)]);await db.exec('commit');
 const m=(await db.query('select disabled,access_after from public.ops_members where user_id=$1',[id(60)])).rows[0] as any;expect(m.disabled).toBe(true);expect(m.access_after).toBeTruthy();
 const audits=(await as(1,"select after_data from public.ops_audits where after_data->>'action'='Passwort zurückgesetzt'")).rows;expect(audits).toHaveLength(1);expect(JSON.stringify(audits)).not.toContain('hash-only');
 await expect(db.query('update auth.users set encrypted_password=$1,raw_app_meta_data=$2 where id=$3',['bad',JSON.stringify({fiber_password_reset:{actor:id(2),requestId:'reset-2'}}),id(60)])).rejects.toThrow('Nur die Administration');
 expect((await db.query('select encrypted_password from auth.users where id=$1',[id(60)])).rows[0]).toEqual({encrypted_password:'hash-only'});
});
it('staff access is list-scoped with distinct scheduling and construction permissions',async()=>{
 await db.exec(readFileSync(new URL('../supabase/migrations/202611220001_employee_roles.sql',import.meta.url),'utf8'));
 for(const [n,role] of [[90,'planner'],[91,'installer']] as const){
 await db.query('insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)',[id(n),role+'@test.invalid',JSON.stringify({fiber_provision:{actor:id(1),role,projects:[id(30)],canEditStatus:true}})]);
 expect((await as(n,'select name from public.ops_projects')).rows).toEqual([{name:'Duraku'}]);
 expect((await as(n,'select * from public.ops_records')).rows.length).toBeGreaterThan(1);
 await expect(create(n,'Forbidden '+role,95+n)).rejects.toThrow();
 await expect(as(n,'select public.ops_set_user_role($1,$2)',['gu@test.invalid','installer'])).rejects.toThrow();
 const hidden=(await as(1,"select id,version from public.ops_records where project='Recklinghausen-Süd'")).rows[0];
 await expect(as(n,'select public.ops_update($1,$2,$3)',[hidden.id,hidden.version,JSON.stringify({note:'Forbidden'})])).rejects.toThrow();
 }
 const planner=(await as(90,'select public.ops_me() as me')).rows[0].me;expect(planner.canEdit).toBe(true);expect(planner.canEditStatus).toBe(false);
 const r=(await as(90,'select id,version from public.ops_records order by id')).rows[0];
 await as(90,'select public.ops_update($1,$2,$3)',[r.id,r.version,JSON.stringify({date:'2026-11-24',appointment:'Geplanter Termin: 2026-11-24 | 09:30 Uhr',note:'Kunde bestätigt'})]);
 for(const patch of [{status:'Fertiggestellt',note:'Nicht erlaubt'},{assignee:'nu@test.invalid'}])await expect(as(90,'select public.ops_update($1,$2,$3)',[r.id,r.version+1,JSON.stringify(patch)])).rejects.toThrow('Feld');
 await expect(as(91,'select public.ops_update($1,$2,$3)',[r.id,r.version+1,JSON.stringify({date:'2026-11-25'})])).rejects.toThrow('Feld');
 await as(91,'select public.ops_update($1,$2,$3)',[r.id,r.version+1,JSON.stringify({status:'Fertiggestellt',note:'Montage dokumentiert'})]);
 await as(90,'select public.ops_update($1,$2,$3)',[r.id,r.version+2,JSON.stringify({date:'',appointment:'',note:'Termin aufgehoben'})]);
 expect((await as(90,'select payload from public.ops_records where id=$1',[r.id])).rows[0].payload.overrides.status).toBe('Fertiggestellt');
 await as(1,'select public.ops_set_user_role($1,$2)',['installer@test.invalid','planner']);
 expect((await as(91,'select public.ops_me() as me')).rows[0].me.canEditStatus).toBe(false);
 await grant('planner@test.invalid',[]);expect((await as(90,'select * from public.ops_records')).rows).toHaveLength(0);
 await as(1,'select public.ops_set_user_disabled($1,true)',['installer@test.invalid']);await expect(as(91,'select public.ops_me()')).rejects.toThrow();
});
it('small sync fingerprints follow RLS, updates and revoked membership',async()=>{
 await db.exec(readFileSync(new URL('../supabase/migrations/202611220002_efficient_sync.sql',import.meta.url),'utf8'));
 await grant('planner@test.invalid',[id(30)]);
 const stamp=async(n:number)=>(await as(n,'select public.ops_sync_state() as s')).rows[0].s;
 const before=await stamp(90);expect(before.token).toHaveLength(32);expect(before.me.role).toBe('planner');
 expect((await stamp(90)).token).toBe(before.token);
 await db.exec("update public.ops_records set payload=payload||'{\"note\":\"hidden change\"}' where project='Recklinghausen-Süd'");
 expect((await stamp(90)).token).toBe(before.token);
 await db.exec("update public.ops_records set payload=payload||'{\"note\":\"visible change\"}' where project='Duraku'");
 expect((await stamp(90)).token).not.toBe(before.token);
 const next=await stamp(90);await grant('planner@test.invalid',[]);expect((await stamp(90)).token).not.toBe(next.token);
 await as(1,'select public.ops_set_user_disabled($1,true)',['planner@test.invalid']);await expect(stamp(90)).rejects.toThrow('Zugang gesperrt');
});

it('provisions when Auth saves protected metadata after INSERT, without overwriting later permissions',async()=>{
 await db.exec(readFileSync(new URL('../supabase/migrations/202611220003_complete_user_provisioning.sql',import.meta.url),'utf8'));
 await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id(92),'delayed@test.invalid']);
 expect((await db.query('select * from public.ops_members where user_id=$1',[id(92)])).rows).toHaveLength(0);
 const meta={fiber_provision:{actor:id(1),role:'planner',projects:[id(30)],canEditStatus:false}};
 await db.query('update auth.users set raw_app_meta_data=$1 where id=$2',[JSON.stringify(meta),id(92)]);
 expect((await as(92,'select public.ops_me() as me')).rows[0].me.role).toBe('planner');
 expect((await as(92,'select name from public.ops_projects')).rows).toEqual([{name:'Duraku'}]);
 await grant('delayed@test.invalid',[]);
 await db.query('update auth.users set raw_app_meta_data=$1 where id=$2',[JSON.stringify(meta),id(92)]);
 expect((await as(92,'select * from public.ops_projects')).rows).toHaveLength(0);
 expect((await as(1,"select * from public.ops_audits where after_data->>'email'='delayed@test.invalid' and after_data->>'action'='Benutzer angelegt'")).rows).toHaveLength(1);
});
it('installer can save a fault without an extra remark, preserving appointment and audit',async()=>{
 await db.query('insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)',[id(992),'fault-installer@test.invalid',JSON.stringify({fiber_provision:{actor:id(1),role:'installer',projects:[id(30)],canEditStatus:true}})]);
 const before=(await as(992,'select id,version,payload from public.ops_records order by id')).rows[0];
 const patch={status:'Fehlerstelle',steps:[false,false,false,false,false],note:workResultNote('Fehlerstelle',[false,false,false,false,false],'','Termin bestätigt.')};
 await as(992,'select public.ops_update($1,$2,$3)',[before.id,before.version,JSON.stringify(patch)]);
 const after=(await as(992,'select version,payload from public.ops_records where id=$1',[before.id])).rows[0];
 expect(after.version).toBe(before.version+1);expect(after.payload.overrides).toMatchObject(patch);
 expect(after.payload.overrides.date).toBe(before.payload.overrides.date);expect(after.payload.overrides.appointment).toBe(before.payload.overrides.appointment);
 const audit=(await as(1,'select actor,after_data from public.ops_audits where record_id=$1 order by at desc limit 1',[before.id])).rows[0];
 expect(audit.actor).toBe('fault-installer@test.invalid');expect(audit.after_data.status).toBe('Fehlerstelle');
});

it('admin edits contact details with version check and audit, installer cannot',async()=>{
 await db.exec(readFileSync(new URL('../supabase/migrations/202611250001_admin_contacts.sql',import.meta.url),'utf8'));
 const r=(await as(992,'select id,version,payload from public.ops_records order by id')).rows[0];
 const sql='select public.ops_update($1,$2,$3)';
 const args=[r.id,r.version,JSON.stringify({customer:'Testkontakt',phone:'0123 45',phone2:''})];
 await expect(as(992,sql,args)).rejects.toThrow('Feld nicht freigegeben');
 await as(1,sql,args);
 await expect(as(1,sql,args)).rejects.toThrow('Zwischenzeitlich');
 const after=(await as(992,'select payload from public.ops_records where id=$1',[r.id])).rows[0].payload;
 expect(after).toMatchObject({customer:'Testkontakt',phone:'0123 45',phone2:''});
 expect(after.overrides.status).toBe(r.payload.overrides.status);
 const audit=(await as(1,'select before_data,after_data from public.ops_audits where record_id=$1 order by at desc limit 1',[r.id])).rows[0];
 expect(audit.before_data.phone??null).toBe(r.payload.phone??null);
 expect(audit.after_data.phone).toBe('0123 45');
});

it('speichert Kabeldaten am Einsatz mit Planwerten, Versionsprüfung und Änderungsprotokoll',async()=>{
 await db.exec(readFileSync(new URL('../supabase/migrations/202611250002_cable_measurements.sql',import.meta.url),'utf8'));
 const r=(await as(992,'select id,version,payload from public.ops_records order by id')).rows[0];
 const sql='select public.ops_update($1,$2,$3)';
 const cable={meterStart:'6000',meterEnd:'5800',fiberCount:'12',actualPipe:'Rot -',actualUnits:'2'};
 const args=[r.id,r.version,JSON.stringify(cable)];
 await expect(as(90,sql,args)).rejects.toThrow();
 await expect(as(992,sql,[r.id,r.version,JSON.stringify({fiberCount:'-2'})])).rejects.toThrow();
 await as(992,sql,args);
 await expect(as(992,sql,args)).rejects.toThrow('Zwischenzeitlich');
 const after=(await as(1,'select payload from public.ops_records where id=$1',[r.id])).rows[0].payload;
 expect(after.overrides).toMatchObject(cable);
 expect(after.units).toBe(r.payload.units);
 expect(after.pipe).toBe(r.payload.pipe);
 const entry=(await as(1,'select after_data from public.ops_audits where record_id=$1 order by at desc limit 1',[r.id])).rows[0];
 expect(entry.after_data).toMatchObject(cable);
});

it('verwaltet persönliche Monteure nur als zuständiger Admin und behält den Verlauf',async()=>{
 await db.exec('alter table auth.users add column banned_until timestamptz,add column deleted_at timestamptz;create table auth.identities(user_id uuid);');
 await db.exec(readFileSync(new URL('../supabase/migrations/202611250003_installer_management.sql',import.meta.url),'utf8'));
 const sql='select public.ops_manage_installer($1,$2,$3)';
 const target='fault-installer@test.invalid';
 await expect(as(992,sql,[target,'delete',null])).rejects.toThrow();
 await expect(as(1,sql,['admin@test.invalid','delete',null])).rejects.toThrow();
 await as(1,sql,[target,'name','Monteur Eins']);
 const me=(await as(1,'select public.ops_me() as me')).rows[0].me;
 expect(me.members.find((x:any)=>x.email===target).displayName).toBe('Monteur Eins');
 await as(1,sql,[target,'delete',null]);
 await expect(as(992,'select public.ops_me()')).rejects.toThrow();
 expect((await db.query('select * from public.ops_project_members where user_id=$1',[id(992)])).rows).toHaveLength(0);
 expect((await db.query('select * from public.ops_audits where actor=$1',[target])).rows.length).toBeGreaterThan(0);
 expect((await db.query('select email from auth.users where id=$1',[id(992)])).rows[0]).toEqual({email:null});
});
