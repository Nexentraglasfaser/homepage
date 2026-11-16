export const operationStatuses = ['Offen','Terminiert','Teilleistung','Fehlerstelle','Repariert · Montage offen','Fertiggestellt','Storniert','Klärung','Rückmeldung offen','Altbestand prüfen'] as const;
export type OperationStatus = typeof operationStatuses[number] | 'Intern geplant';
export type SourceRow = {sheet:string;row:number;priority:number;fields:Record<string,string>;status:string;appointment:string;date:string;time:string;note:string};
export type WorkScope = {kind: "fdm"|"additional";cutoff?:string;completedBefore?:boolean;evidence:string};
export type OperationRecord = {workScope?:WorkScope;id:string;project:string;reference:string;street:string;number:string;city?:string;postcode?:string;customer:string;email:string;phone:string;phone2:string;nvt:string;ne4:string;units:string;pipe:string;appointment:string;date:string;time:string;note:string;source:string;version:number;conflicts:{field:string;values:string[]}[];sources:SourceRow[];history:{sheet:string;row:number;values:Record<string,string>;notes?:Record<string,string>}[];overrides:{status?:OperationStatus;note?:string;appointment?:string;date?:string;assignee?:string;steps?:boolean[]};attachments?:{id:string;name:string;mime:string;size:number;createdAt:string}[]};
export type OperationsData={projects?:import("./operations-import").OpsProject[];source:{title:string;url:string;modifiedAt:string;importedAt:string;sha256:string;sheets:number;scope:string};records:OperationRecord[];audits:{id:string;recordId:string;actor:string;at:string;before:unknown;after:unknown;hash:string;previousHash:string}[]};
// Status columns are authoritative; narrative history is retained separately.
// In particular a repaired old fault must not re-open a completed connection.
export function classify(r:OperationRecord):{status:OperationStatus;basis:string} {
 if(r.overrides.status){const status=r.overrides.status==='Intern geplant'?'Terminiert':r.overrides.status;return operationStatuses.includes(status)?{status,basis:'Im Arbeitsbereich dokumentiert'}:{status:'Klärung',basis:'Unbekannter gespeicherter Status – bitte prüfen'};}
 if(r.project==='Warburg') {
  const current=r.note.split(/Bisheriger Verlauf:/i)[0].toLowerCase();
  if(/vollständige fertigstellung.*ausdrücklich bestätigt/s.test(current))return {status:'Fertiggestellt',basis:'Ausdrücklich bestätigter Gesamtabschluss im aktuellen Quellvermerk'};
  if(/teilleistung|nicht ausdrücklich bestätigt/.test(current))return {status:'Teilleistung',basis:'Einblasung dokumentiert; Montage-/Testabschluss noch nicht belegt'};
  if(/kabelstopp|keine luft/.test(current) && !/keine technische fehlerstelle/.test(current))return {status:'Fehlerstelle',basis:'Aktueller technischer Fehler im Quellvermerk'};
  return {status:'Offen',basis:'Kein Gesamtabschluss dokumentiert'};
 }
 if(r.project==='Dortmund')return {status: appointmentStatus(r.appointment),basis:r.appointment || 'Noch kein Montagestatus dokumentiert; „Gebaut“ bezeichnet die Kundenlisten-Auswahl'};
 for(const s of r.sources) {
  const v=(s.status+' '+s.appointment).toLowerCase();
  if(/^(?:fertig|erledigt|abgeschlossen)|\babgeschlossen(?:\s|$)|\bfertiggestellt\b/.test(v) && !/nicht (?:fertig|abgeschlossen)|abschluss.*prüfen/.test(v))return {status:'Fertiggestellt',basis:s.sheet+' · Zeile '+s.row+': '+(s.status==='HA gebaut'?s.appointment:s.status)};
  if(/storniert|storno/.test(v))return {status:'Storniert',basis:s.sheet+' · '+s.status+' '+s.appointment};
  if(/repariert|fehler(?:stelle)? behoben/.test(v))return {status:'Repariert · Montage offen',basis:s.sheet+' · Reparatur dokumentiert; Gesamtabschluss fehlt'};
  if(/fehlerstelle|kabelstopp|keine luft/.test(v))return {status:'Fehlerstelle',basis:s.sheet+' · '+s.status+' '+s.appointment};
  if(/altbestand prüfen/.test(v))return {status:'Altbestand prüfen',basis:s.sheet+' · '+s.status};
  if(/rückmeldung offen/.test(v))return {status:'Rückmeldung offen',basis:s.sheet+' · '+s.status};
  if(/klärfall|prüfen|prüffall|klärung/.test(v))return {status:'Klärung',basis:s.sheet+' · '+s.status};
  if(/teilleistung|restmontage|spleißen.*offen/.test(v))return {status:'Teilleistung',basis:s.sheet+' · '+s.appointment};
  if(/^offen|^kontakt offen|^montage offen/.test(v))return {status:'Offen',basis:s.sheet+' · '+s.status};
  if(/terminiert|bestätigt|geplant|joker|reserve|vorgemerkt/.test(v))return {status:appointmentStatus(v),basis:s.sheet+' · '+s.appointment};
 }
 return {status:'Klärung',basis:'Kein eindeutiger Montageabschluss oder aktiver Fehler im Statusfeld. „HA gebaut“ allein genügt nicht.'};
}
export function appointmentStatus(v:string):OperationStatus {
 if(/^Geplanter Termin: \d{4}-\d{2}-\d{2} \|/.test(v))return 'Terminiert';
 if(/nicht terminiert|noch zu terminieren|neu terminieren|nicht geplant|abgesagt|storno|aufgehoben/i.test(v))return 'Offen';
 if(/\bgeplant\b/i.test(v))return 'Terminiert';
 if(/rückmeldung offen|unzustellbar/i.test(v))return 'Offen';
 if(/term(?:iniert|in bestätigt)|bestätigung versandt|telefonisch terminiert|ankunft.*bestätigt/i.test(v) && !/ausstehend|zugang offen/i.test(v))return 'Terminiert';
 return 'Offen';
}
export function appointmentDate(r:OperationRecord) {
 const val=r.overrides.date ?? r.date;
 if(/^\d{4}-\d{2}-\d{2}$/.test(val))return val;
 const m=(val || (r.overrides.appointment ?? r.appointment)).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
 return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : '';
}
// A dated G-Box deployment is scheduled work, even without a house-access appointment.
// Keep the original access notes and construction status independently visible.
export function isScheduledGBox(r:OperationRecord) {
 const text=r.overrides.appointment ?? r.appointment;
 return !!appointmentDate(r) && /g[ -]?box/i.test(text) && /geplant|terminiert/i.test(text)
  && !/abgesagt|storno|aufgehoben|nicht geplant|nicht terminiert|neu terminieren|joker|reserve/i.test(text);
}
export function isScheduled(r:OperationRecord) {
 const status=classify(r).status;
 if(status==='Fertiggestellt'||status==='Storniert')return false;
 const text=r.overrides.appointment ?? r.appointment;
 if(/^Geplanter Termin: \d{4}-\d{2}-\d{2} \|/.test(text))return true;
 if(/abgesagt|storno|aufgehoben|nicht terminiert|noch zu terminieren|neu terminieren/i.test(text))return false;
 return appointmentStatus(text)==='Terminiert' || isScheduledGBox(r)
  || (r.overrides.appointment===undefined && status==='Terminiert');
}
export function matchesStatusFilter(r:OperationRecord,status:string) {
 return !status || classify(r).status===(status==='Intern geplant'?'Terminiert':status);
}
export function needsFollowup(r:OperationRecord,today=new Date().toLocaleDateString('sv-SE')) {
 const s=classify(r).status,d=appointmentDate(r);
 return !!d && d<today && (isScheduled(r)||['Intern geplant','Teilleistung'].includes(s));
}
export const recordNote=(r:OperationRecord)=>r.overrides.note ?? r.note;
export function searchText(r:OperationRecord) {return [r.project,r.reference,r.street,r.number,r.customer,r.email,r.phone,r.phone2,r.nvt,recordNote(r),...r.sources.map(s=>Object.values(s.fields).join(' '))].join(' ').toLocaleLowerCase('de');}

// Construction categories are mutually exclusive; appointments are a separate view.
export function summarizeStatuses(records:OperationRecord[]){
 const counts=Object.fromEntries(operationStatuses.map(s=>[s,0])) as Record<typeof operationStatuses[number],number>;
 for(const record of records)counts[classify(record).status as keyof typeof counts]++;
 const sum=Object.values(counts).reduce((a,b)=>a+b,0);
 return {counts,total:records.length,sum,balanced:sum===records.length,scheduled:records.filter(isScheduled).length};
}
