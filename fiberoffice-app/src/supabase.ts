import {createClient} from '@supabase/supabase-js';
import {validateEdit,validateFileContent,type Snapshot,type Edit,type ImportRow,type Project} from './domain';
import type {Backend} from './backend';
const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_ANON_KEY;
if(Boolean(url)!==Boolean(key))throw new Error('Supabase-Konfiguration unvollständig. URL und öffentlicher Schlüssel sind gemeinsam erforderlich.');
export const supabase=url&&key?createClient(url,key):null;
export class SupabaseBackend implements Backend {
 mode='supabase' as const;
 async load():Promise<Snapshot|null>{
  const {data:{session}}=await supabase!.auth.getSession();if(!session)return null;
  const {data:profile,error}=await supabase!.from('profiles').select('*').eq('id',session.user.id).maybeSingle();if(error)throw error;if(!profile)return null;
  const names=['projects','contractors','connections','attachments','audit_events','invitations'];
  const result=await Promise.all(names.map(async n=>{
   const all: unknown[]=[];
   for(let offset=0;;offset+=1000){
    const response=await supabase!.from(n).select(n==='invitations'?'id,tenant_id,contractor_id,email,expires_at,accepted_at,revoked_at':'*').order('id').range(offset,offset+999);
    if(response.error)throw response.error;
    all.push(...response.data);if(response.data.length<1000)break;
   }
   return {data:all};
  }));
  const snapshot={profile,projects:result[0].data!,contractors:result[1].data!,connections:result[2].data!,attachments:result[3].data!,audits:result[4].data!,invites:result[5].data!} as unknown as Snapshot;
  snapshot.audits.sort((a,b)=>b.created_at.localeCompare(a.created_at));
  return snapshot;
 }
 subscribe(cb:()=>void){const ch=supabase!.channel('fiber-office').on('postgres_changes',{event:'*',schema:'public',table:'connections'},cb).on('postgres_changes',{event:'*',schema:'public',table:'attachments'},cb).subscribe();const timer=setInterval(cb,15000);const auth=supabase!.auth.onAuthStateChange(()=>queueMicrotask(cb));return()=>{clearInterval(timer);void supabase!.removeChannel(ch);auth.data.subscription.unsubscribe();};}
 private async rpc(name:string,args:Record<string,unknown>){const {data,error}=await supabase!.rpc(name,args);if(error)throw new Error(error.message);return data;}
 async createContractor(name:string){await this.rpc('create_contractor',{p_name:name});}
 async createProject(name:string,city:string):Promise<Project>{return this.rpc('create_project',{p_name:name,p_city:city});}
 async importRows(projectId:string,rows:ImportRow[]){await this.rpc('import_connections',{p_project:projectId,p_rows:rows});}
 async assign(ids:string[],contractorId:string|null){await this.rpc('assign_connections',{p_ids:ids,p_contractor:contractorId});}
 async update(id:string,version:number,edit:Edit){validateEdit(edit);await this.rpc('update_connection',{p_id:id,p_version:version,p_steps:edit.steps,p_note:edit.note,p_status:edit.status});}
 async upload(id:string,file:File){await validateFileContent(file);const s=await this.load();if(!s)throw new Error('Bitte anmelden.');const path=`${s.profile.tenant_id}/${id}/${crypto.randomUUID()}`;const {error}=await supabase!.storage.from('connection-files').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;try{await this.rpc('register_attachment',{p_connection:id,p_path:path,p_name:file.name});}catch(e){await supabase!.storage.from('connection-files').remove([path]);throw e;}}
 async fileUrl(path:string){const {data,error}=await supabase!.storage.from('connection-files').createSignedUrl(path,60);if(error)throw error;return data.signedUrl;}
 async invite(email:string,contractorId:string){return this.rpc('issue_invite',{p_email:email,p_contractor:contractorId});}
 async revoke(id:string){await this.rpc('revoke_invite',{p_id:id});}
 async accept(token:string){await this.rpc('accept_invite',{p_token:token});}
}
