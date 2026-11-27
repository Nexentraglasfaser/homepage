import {useEffect,useState} from 'react';
import {operationApi} from './operations-client';

const periods=['Vormittags','Mittags','Nachmittags'];
type Release={project:string;city:string;day:string;windows:string[]};
export function AppointmentDays({projects}:{projects:{id:string;name:string}[]}){
 const [open,setOpen]=useState(false),[project,setProject]=useState(''),[date,setDate]=useState('');
 const [end,setEnd]=useState('');
 const [rows,setRows]=useState<Release[]>([]),[windows,setWindows]=useState<string[]>([]);
 const [busy,setBusy]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  if(!open)return;
  let active=true;setReady(false);setError('');
  operationApi('appointment-days').then(list=>{if(active){setRows(list);setReady(true);}}).catch(e=>{if(active)setError(e.message);});
  return ()=>{active=false;};
 },[open]);
 const name=projects.find(p=>p.id===project)?.name;
 const current=rows.filter(row=>row.project===name);
 const selectDate=(day:string,single=false)=>{setEnd(!day||single||end===date||end<day?day:end);setDate(day);setWindows(current.find(r=>r.day===day)?.windows||[...periods]);setNotice('');};
 const validRange=Boolean(date&&end&&end>=date);
 async function save(values:string[]){
  setBusy(true);setError('');setNotice('');
  try{
   await operationApi('appointment-days/range',{method:'POST',body:JSON.stringify({project,date,end,windows:values})});
   setRows(await operationApi('appointment-days'));
   setDate('');setEnd('');setWindows([]);setNotice(values.length?'Terminfreigabe gespeichert.':'Freigabe zurückgenommen.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="panel"><button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>Terminfreigaben für die Homepage</button>
 {open&&<><p>Lege fest, an welchen Tagen und zu welchen Zeiträumen Kunden einen Termin anfragen können.</p>
 <fieldset disabled={busy||!ready} className="ops-edit-grid"><legend>Freigabe verwalten</legend>
 <label>Projekt<select value={project} onChange={e=>{setProject(e.target.value);setDate('');setEnd('');setWindows([]);setNotice('');}}>
 <option value="">Projekt wählen</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <label>Beginn<input type="date" disabled={!project} min={new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'})} value={date} onChange={e=>selectDate(e.target.value)}/></label>
 <label>Ende<input type="date" disabled={!date} min={date} value={end} onChange={e=>{setEnd(e.target.value);setNotice('');}}/></label>
 {date&&end&&end<date&&<p role="alert">Das Ende muss am oder nach dem Beginn liegen.</p>}
 {end>date&&date&&<p>Die gewählten Zeitfenster gelten für alle Kalendertage von Beginn bis Ende, einschließlich Wochenenden.</p>}
 {date&&<div>{periods.map(w=><label key={w}><input type="checkbox" checked={windows.includes(w)} onChange={e=>setWindows(e.target.checked?[...windows,w]:windows.filter(v=>v!==w))}/>{w}</label>)}</div>}
 <button type="button" className="primary" disabled={!project||!validRange||!windows.length} onClick={()=>void save(periods.filter(w=>windows.includes(w)))}>Freigabe speichern</button>
 {validRange&&current.some(r=>r.day>=date&&r.day<=end)&&<button type="button" onClick={()=>void save([])}>Freigabe zurücknehmen</button>}
 </fieldset>{project&&ready&&<div><h3>Freigegebene Tage</h3>{current.length?current.map(r=><button type="button" disabled={busy} key={r.day} onClick={()=>selectDate(r.day,true)}>{r.day.split('-').reverse().join('.')} · {r.windows.join(', ')}</button>):<p>Für dieses Projekt sind keine Tage freigegeben.</p>}</div>}
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}</>}</section>;
}
