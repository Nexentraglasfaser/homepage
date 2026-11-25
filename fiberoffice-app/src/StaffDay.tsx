import {spontaneousJobs} from './installer-search';
import {StatusReportButton} from './StatusReportButton';
import {useEffect,useState} from 'react';
import {appointmentDate,recordNote,type OperationRecord} from './operations-model';
import {appointmentTimeLabel,compareAppointments} from './operations-appointments';
import {makeAppointmentPdf} from './operations-export';
import {overviewStatus} from './operations-overview';
export const berlinToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function dayJobs(records:OperationRecord[],date:string,project:string){return records.filter(r=>!!date&&appointmentDate(r)===date&&(!project||r.project===project)).sort(compareAppointments);}
export function distributorLocation(r:OperationRecord){
 const label=/(?:^|[\s;])(?:NVT|MVT|GVS)[-\s]+Standort\s*:\s*([^\n\r;]+)/i;
 for(const value of [recordNote(r),r.overrides.appointment,r.appointment,r.note]){
  const match=value?.match(label);
  if(match){
   const location=match[1].split(/\s+(?:Quelle|Bisheriger Verlauf|Bemerkung|Hinweis|Kassette)\s*:|\.\s+(?=[A-ZÄÖÜ][a-zäöü]+:)|\s+\d{1,2}\.\d{1,2}\.\d{4}:/i)[0].replace(/\.$/,'').trim();
   if(location)return location;
  }
 }
 // Some imports store the distributor identifier and street together.
 return r.nvt?.match(/\s[-–—]\s(.+\d[\da-z]*(?:,.*)?)$/i)?.[1]||'Adresse nicht hinterlegt';
}
export function StaffDay({records,open,loadRecords,compact=false}:{compact?:boolean;records:OperationRecord[];open:(r:OperationRecord)=>void;loadRecords:()=>Promise<OperationRecord[]>}){
 const [today,setToday]=useState(berlinToday),[chosenDate,setChosenDate]=useState<string|null>(null),[project,setProject]=useState('');
 const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
 const date=chosenDate??today;
 const downloadDay=async()=>{setExporting(true);setExportError('');try{const fresh=dayJobs(await loadRecords(),date,project);if(!fresh.length)throw Error('Keine freigegebenen Einsätze für diesen Tag.');const pdf=await makeAppointmentPdf(fresh);pdf.save(`Nexentra-Tagesliste-${date}.pdf`);}catch(e){setExportError(e instanceof Error?e.message:'PDF konnte nicht erstellt werden. Bitte erneut versuchen.');}finally{setExporting(false);}};
 useEffect(()=>{const update=()=>setToday(berlinToday());const timer=setInterval(update,30000);document.addEventListener('visibilitychange',update);window.addEventListener('focus',update);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update);window.removeEventListener('focus',update);};},[]);
 const [spontaneous,setSpontaneous]=useState(false);
 const jobs=dayJobs(records,date,project);
 const reportProjects=[...new Set(jobs.map(job=>job.project))].sort((a,b)=>a.localeCompare(b,'de'));
 const reportProject=project || (reportProjects.length===1 ? reportProjects[0] : '');
 const [choosingProject,setChoosingProject]=useState(false);
 return <section className="ops-staff"><div className="ops-day-filter"><label>Einsätze am<input type="date" value={date} onChange={e=>setChosenDate(e.target.value)}/></label><button onClick={()=>{setToday(berlinToday());setChosenDate(null);}}>Heute</button><label>Freigegebene Liste<select value={project} onChange={e=>setProject(e.target.value)}><option value="">Alle Listen</option>{[...new Set(records.map(r=>r.project))].sort().map(p=><option key={p}>{p}</option>)}</select></label>{compact&&<button type="button" aria-pressed={spontaneous} onClick={()=>setSpontaneous(!spontaneous)}>{spontaneous?'Zurück zu den Terminen':'Spontanmontage'}</button>}{!spontaneous&&<button disabled={exporting||!jobs.length} onClick={()=>void downloadDay()}>{exporting?'PDF wird erstellt …':'Tagesliste als PDF'}</button>}</div>{spontaneous?<section><h2>Spontanmontage</h2>{project?<><p>Offene Adressen ohne Termin · {project}</p><SpontaneousList records={records} project={project} open={open}/></>:<p>Bitte oben eine freigegebene Projektliste auswählen.</p>}</section>:<>{compact&&(reportProject || !jobs.length ?
  <StatusReportButton key={date+reportProject+jobs.map(r=>r.id+':'+r.version).join(',')} date={date} disabled={!jobs.length} records={async()=>dayJobs(await loadRecords(),date,reportProject)}/>
  : <section><button type="button" className="primary" aria-expanded={choosingProject} onClick={()=>setChoosingProject(!choosingProject)}>Statusmeldung für Auftraggeber</button>
   {choosingProject&&<label>Projekt für die Statusmeldung<select value="" onChange={e=>{setProject(e.target.value);setChoosingProject(false);}}>
    <option value="">Projekt auswählen</option>{reportProjects.map(name=><option key={name}>{name}</option>)}</select></label>}</section>)}{exportError&&<p role="alert">{exportError}</p>}<p>{jobs.length} Einsätze · Alle Termine deiner freigegebenen Listen, auch bereits erledigte Einsätze.</p><div className="ops-job-grid">{jobs.map(r=><article className="ops-job" key={r.id}><header><strong>{appointmentTimeLabel(r)}</strong><span>{overviewStatus(r)}</span></header><small>{r.project} · ID {r.reference||'offen'}</small><h2>{r.street} {r.number}</h2><p>{[r.postcode,r.city].filter(Boolean).join(' ')}<br/>{r.customer||'Kontakt nicht hinterlegt'}</p><div className="ops-job-contact">{[r.phone,r.phone2].filter(Boolean).map((phone,i)=><span key={i}>{/^[+\d\s()/.-]+$/.test(phone)&&!phone.includes('/')?<a href={'tel:'+phone.replace(/[^+\d]/g,'')}>{phone}</a>:phone}</span>)}</div><dl>{[['NVT / GVS',r.nvt],['Rohrfarbe',r.pipe],['Wohneinheiten',r.units],['NE4',r.ne4],...(compact?[['NVT-Standort',distributorLocation(r)]]:[])].map(([label,value])=><div key={label} style={label==='NVT-Standort'?{gridColumn:'1 / -1'}:undefined}><dt>{label}</dt><dd>{value||'Nicht hinterlegt'}</dd></div>)}</dl>{!compact&&<><p className="ops-job-note">{r.overrides.appointment??r.appointment}</p><p className="ops-job-note">{recordNote(r)||'Keine Bemerkung hinterlegt.'}</p>{r.conflicts.length>0&&<p className="ops-warning">Quellabweichungen: Details vor Ausführung prüfen.</p>}</>}<button className="primary" onClick={()=>open(r)}>Einsatz öffnen · Technik & Dokumentation</button></article>)}</div>{!jobs.length&&<div className="empty">Keine Termine für diesen Tag in den ausgewählten Listen.</div>}</>}</section>;
}

function SpontaneousList({records,project,open}:{records:OperationRecord[];project:string;open:(r:OperationRecord)=>void}){
 const jobs=spontaneousJobs(records,project);
 return jobs.length ? <>{jobs.map(r=><button key={r.id} className="installer-address" onClick={()=>open(r)}><strong>{r.street} {r.number}</strong><span>{r.customer}</span></button>)}</> : <p>Keine offenen Adressen ohne Termin.</p>;
}
