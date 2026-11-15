import type {Snapshot,ImportRow,Edit,Project} from './domain';
export interface Backend {
 mode: 'demo'|'supabase';
 load(): Promise<Snapshot|null>;
 subscribe(callback:()=>void):()=>void;
 createContractor(name:string):Promise<void>;
 createProject(name:string,city:string):Promise<Project>;
 importRows(projectId:string,rows:ImportRow[]):Promise<void>;
 assign(ids:string[],contractorId:string|null):Promise<void>;
 update(id:string,version:number,edit:Edit):Promise<void>;
 upload(id:string,file:File):Promise<void>;
 fileUrl(path:string):Promise<string>;
 invite(email:string,contractorId:string):Promise<string>;
 revoke(id:string):Promise<void>;
 accept(token:string):Promise<void>;
}
