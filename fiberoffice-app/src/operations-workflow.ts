import type {OperationStatus} from './operations-model';
export function statusAfterSteps(previous:OperationStatus,steps:boolean[]):OperationStatus {
 if(previous==='Fehlerstelle'||previous==='Storniert')return previous;
 if(steps[2]&&steps[3]&&steps[4])return 'Fertiggestellt';
 return steps.some(Boolean)?'Teilleistung':'Offen';
}
export function workResultNote(status:OperationStatus,steps:boolean[],remark:string,history:string){
 const names=['Hausbegehung','Hauseinführung','Eingeblasen','Gespleißt','Dokumentiert'];
 return `${new Date().toLocaleDateString('de-DE')}: Arbeitsergebnis: ${status}. Bestätigte Schritte: ${names.filter((_,i)=>steps[i]).join(', ')||'keine einzeln bestätigt'}.${remark.trim()?' '+remark.trim():''}${history.trim()?'\n\nBisheriger Verlauf:\n'+history.trim():''}`;
}

export function removeAppointment(status:OperationStatus,date:string,appointment:string,note:string){
 return {date:'',appointment:'',status:status==='Terminiert'?'Offen' as const:status,
 note:`${new Date().toLocaleDateString('de-DE')}: Termin entfernt. Frühere Terminangabe: ${[date,appointment].filter(Boolean).join(' · ')||'Terminiert ohne Datumsangabe'}.${note.trim()?'\n\nBisheriger Verlauf:\n'+note:''}`};
}
