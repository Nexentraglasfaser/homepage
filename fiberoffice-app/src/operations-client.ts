import {singleFlightFactory,authIdentityChanged} from './session-recovery';
import {createSnapshotSync} from './operations-sync';
const snapshotSync=createSnapshotSync<any,any>();
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {inspectProjectFile} from './project-files';
import {validateFileContent} from './domain';
let client:SupabaseClient|null=null;
export const isLocal=()=>new URLSearchParams(location.search).get('workspace')==='local';
export const operationsClient=singleFlightFactory(async()=>{
 if(client)return client;
 const r=await fetch(import.meta.env.VITE_STATIC_HOST==='true'?import.meta.env.BASE_URL+'config.json':'/api/config');const cfg=await r.json();if(!cfg.supabaseUrl||!cfg.supabaseKey)throw Error('Die Supabase-Verbindung wird noch eingerichtet. Kundendaten sind bis dahin nicht online verfügbar.');
 client=createClient(cfg.supabaseUrl,cfg.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,storageKey:import.meta.env.VITE_INSTALLER_APP==='true'?'fiber-installer-auth':'fiber-operations-auth'}});let identity:string|undefined;client.auth.onAuthStateChange((event,session)=>{const next=session?.user.id;if(authIdentityChanged(event,next,identity))snapshotSync.clear();identity=next;});return client;
});
async function all(c:SupabaseClient,table:string){const list:Record<string,any>[]=[];for(let offset=0;;offset+=500){const q=await c.from(table).select('*').order(table==='ops_sources'?'tenant_id':table==='ops_members'?'user_id':'id').range(offset,offset+499);if(q.error)throw q.error;list.push(...q.data);if(q.data.length<500)return list;}}
export async function operationApi(path:string,options?:RequestInit):Promise<any>{
 if(isLocal()&&path==='operations/sync')return {data:await operationApi('operations'),me:await operationApi('me')};
 if(isLocal()){const r=await fetch('/api/'+path,options),d=await r.json();if(!r.ok)throw Error(d.error||'Anfrage fehlgeschlagen');return d;}
 const c=await operationsClient();const rpc=async(name:string,args:Record<string,unknown>={})=>{const {data,error}=await c.rpc(name,args);if(error)throw Error(error.message);return data;};
 const input=typeof options?.body==='string'?JSON.parse(options.body):{};
 if(path==='operations/sync')return snapshotSync.read(()=>rpc('ops_sync_state'),()=>operationApi('operations'));
 if(path==='project-files')return all(c,'ops_project_files');
 if(path.startsWith('project-upload?')){
  const params=new URLSearchParams(path.split('?')[1]),projectId=params.get('project')!,category=params.get('category')!;
  const file=options?.body as File;const {mime,sha256}=await inspectProjectFile(file);
  const existing=await c.from('ops_project_files').select('id').eq('project_id',projectId).eq('sha256',sha256).maybeSingle();if(existing.error)throw existing.error;if(existing.data)return {duplicate:true};
  const user=(await c.auth.getUser()).data.user;if(!user)throw Error('Bitte neu anmelden.');
  const m=await c.from('ops_members').select('tenant_id').eq('user_id',user.id).single();if(m.error)throw m.error;
  const filePath=`${m.data.tenant_id}/${projectId}/${crypto.randomUUID()}`;
  const up=await c.storage.from('project-files').upload(filePath,file,{contentType:mime});if(up.error)throw up.error;
  try{await rpc('ops_register_project_file',{p_project:projectId,p_path:filePath,p_name:file.name,p_category:category,p_sha256:sha256});}catch(e){await c.storage.from('project-files').remove([filePath]);throw e;}return {ok:true};
 }
 if(path.startsWith('project-file?')){
  const id=new URLSearchParams(path.split('?')[1]).get('id');const f=await c.from('ops_project_files').select('path,name').eq('id',id).single();if(f.error)throw f.error;
  const s=await c.storage.from('project-files').createSignedUrl(f.data.path,60,{download:f.data.name});if(s.error)throw s.error;return {url:s.data.signedUrl};
 }
 if(path==='users/installer')return rpc('ops_manage_installer',{p_email:input.email,p_action:input.action,p_name:input.name??null});
 if(path==='users/disabled')return rpc('ops_set_user_disabled',{p_email:input.email,p_disabled:input.disabled});
 if(path==='users/create'||path==='users/password'){const {data,error}=await c.functions.invoke(path==='users/create'?'create-workspace-user':'reset-workspace-password',{body:input});if(error){let message='Benutzer konnte nicht angelegt werden.';try{message=(await error.context.json()).error||message;}catch{}throw Error(message);}return data;}
 if(path==='me')return rpc('ops_me');
 if(path==='projects/create')return rpc('ops_create_project',{p_id:input.id,p_name:input.name,p_city:input.city,p_client:input.client,p_code:input.code,p_note:input.note});
 if(path==='addresses/import')return rpc('ops_import_addresses',{p_project:input.projectId,p_request:input.requestId,p_rows:input.rows,p_file:input.file,p_sheet:input.sheet});
 if(path==='project-permissions')return rpc('ops_project_permissions',{p_email:input.email,p_projects:input.projectIds});
 if(path==='users/role')return rpc('ops_set_user_role',{p_email:input.email,p_role:input.role});
 if(path==='permissions')return rpc('ops_permissions',{p_email:input.email,p_allowed:input.canEditStatus});
 if(path==='update')return rpc('ops_update',{p_id:input.id,p_version:input.version,p_patch:input.patch});
 if(path==='operations'){
  const [records,files,sources,audits,histories,projects]=await Promise.all(['ops_records','ops_files','ops_sources','ops_audits','ops_history','ops_projects'].map(t=>all(c,t)));
  const source=sources[0]?.payload||{title:'Freigegebene Projektlisten',url:'',modifiedAt:'',importedAt:'',sha256:'',sheets:0,scope:'Nur freigegebene Projekte'};
  return {projects,source,records:records.map(r=>({...r.payload,history:histories.find(h=>h.id===r.id)?.payload||[],version:r.version,attachments:files.filter(f=>f.record_id===r.id).map(f=>({...f,createdAt:f.created_at}))})),audits:audits.sort((a,b)=>b.at.localeCompare(a.at)).map(a=>({...a,recordId:a.record_id,before:a.before_data,after:a.after_data}))};
 }
 if(path.startsWith('upload?')){
  const id=new URLSearchParams(path.split('?')[1]).get('id')!;const file=options?.body as File;await validateFileContent(file);
  const {data:m,error}=await c.from('ops_members').select('tenant_id').eq('user_id',(await c.auth.getUser()).data.user!.id).single();if(error)throw error;
  const filePath=`${m.tenant_id}/${id}/${crypto.randomUUID()}`;const up=await c.storage.from('operations-files').upload(filePath,file,{contentType:file.type});if(up.error)throw up.error;
  try{await rpc('ops_register_file',{p_id:id,p_path:filePath,p_name:file.name});}catch(e){await c.storage.from('operations-files').remove([filePath]);throw e;}return {ok:true};
 }
 if(path.startsWith('file?')){const id=new URLSearchParams(path.split('?')[1]).get('id');const f=await c.from('ops_files').select('path').eq('id',id).single();if(f.error)throw f.error;const s=await c.storage.from('operations-files').createSignedUrl(f.data.path,60,{download:true});if(s.error)throw s.error;return {url:s.data.signedUrl};}
 throw Error('Unbekannte Aktion');
}
