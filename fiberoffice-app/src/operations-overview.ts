import {classify,isScheduled,type OperationRecord} from './operations-model';
export const overviewStatuses=['Fertiggestellt','Fehlerstelle','Offen','Storniert','Klärungsbedarf'] as const;
export type OverviewStatus=typeof overviewStatuses[number];
export function overviewStatus(r:OperationRecord):OverviewStatus {
 const s=classify(r).status;
 if(s==='Fertiggestellt'||s==='Fehlerstelle'||s==='Storniert')return s;
 if(s==='Klärung'||s==='Altbestand prüfen')return 'Klärungsbedarf';
 return 'Offen';
}
export function inOverview(r:OperationRecord){return classify(r).status!=='Altbestand prüfen';}
export function overviewSummary(records:OperationRecord[]){const counts=Object.fromEntries(overviewStatuses.map(s=>[s,0])) as Record<OverviewStatus,number>;for(const r of records)counts[overviewStatus(r)]++;return {counts,total:records.length,sum:Object.values(counts).reduce((a,b)=>a+b,0),balanced:Object.values(counts).reduce((a,b)=>a+b,0)===records.length,scheduled:records.filter(isScheduled).length};}
