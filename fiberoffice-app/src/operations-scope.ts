import {classify,type OperationRecord} from './operations-model';
export type ScopeView='assignment'|'additional'|'archive'|'all';
export const fdmGroups=['Vorher erledigt','Danach erledigt','Noch offen','Storniert'] as const;
export type FdmGroup=typeof fdmGroups[number];
export function fdmGroup(r:OperationRecord):FdmGroup|null {
 if(r.project!=='Bad Sassendorf'||r.workScope?.kind!=='fdm')return null;
 const s=classify(r).status;
 if(s==='Storniert')return 'Storniert';
 if(s==='Fertiggestellt')return r.workScope.completedBefore?'Vorher erledigt':'Danach erledigt';
 return 'Noch offen';
}
export function matchesScope(r:OperationRecord,view:ScopeView){
 if(r.project!=='Bad Sassendorf')return view==='assignment'||view==='all';
 if(view==='all')return true;
 if(view==='archive')return !r.workScope;
 return r.workScope?.kind===(view==='assignment'?'fdm':'additional');
}
export function scopeLabel(r:OperationRecord){return r.project!=='Bad Sassendorf'?'Projektauftrag':r.workScope?.kind==='fdm'?'FDM 02.11.2026':r.workScope?.kind==='additional'?'Zusatzauftrag':'Außerhalb FDM / ohne Zusatzzuordnung';}
export function summarizeFdm(records:OperationRecord[]){const counts=Object.fromEntries(fdmGroups.map(g=>[g,0])) as Record<FdmGroup,number>;for(const r of records){const g=fdmGroup(r);if(g)counts[g]++;}return {counts,total:Object.values(counts).reduce((a,b)=>a+b,0)};}
