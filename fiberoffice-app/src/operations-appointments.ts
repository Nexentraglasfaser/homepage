import {appointmentDate,type OperationRecord} from './operations-model';
// Keep scheduling in the existing audited appointment field so older clients retain it.
const header=/^Geplanter Termin: \d{4}-\d{2}-\d{2} \| ([^\n]*)\n?/;
export function appointmentTimes(r:OperationRecord){
 const text=r.overrides.appointment??r.appointment;
 const saved=text.match(header);
 const candidate=saved?saved[1]:text;
 const parse=(s:string)=>{const m=s.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?:\s*(?:–|—|-|bis)\s*([01]?\d|2[0-3]):([0-5]\d))?/);return m?{start:m[1].padStart(2,'0')+':'+m[2],end:m[3]?m[3].padStart(2,'0')+':'+m[4]:''}:null;};
 return parse(candidate)||(!saved&&r.overrides.appointment===undefined?parse(r.time):null)||{start:'',end:''};
}
export const appointmentTimeLabel=(r:OperationRecord)=>{const t=appointmentTimes(r);return t.start?`${t.start}${t.end?'–'+t.end:''} Uhr`:'Uhrzeit offen';};
export const appointmentNotes=(text:string)=>text.replace(header,'');
export function plannedAppointment(date:string,start:string,end:string,notes:string){
 if(!date&&(start||end))throw Error('Bitte ein Termindatum eingeben.');
 if(end&&!start)throw Error('Bitte eine Beginn-Uhrzeit eingeben.');
 if([start,end].some(t=>t&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))throw Error('Bitte gültige Uhrzeiten eingeben.');
 if(start&&end&&end<=start)throw Error('Das Ende muss nach dem Beginn liegen.');
 return date?`Geplanter Termin: ${date} | ${start?start+(end?'–'+end:'')+' Uhr':'Uhrzeit offen'}\n${appointmentNotes(notes)}`.trim():notes;
}
export function compareAppointments(a:OperationRecord,b:OperationRecord){return (appointmentDate(a)||'9999').localeCompare(appointmentDate(b)||'9999')||(appointmentTimes(a).start||'99:99').localeCompare(appointmentTimes(b).start||'99:99')||a.project.localeCompare(b.project,'de')||a.street.localeCompare(b.street,'de')||a.number.localeCompare(b.number,'de',{numeric:true});}
export function localDateOffset(days:number){const d=new Date();d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
