import {requiresLogin} from './session-recovery';
import {InstallApp} from './InstallApp';
import {useEffect,useRef,useState} from 'react';
import {CalendarDays,Search,LogOut,RefreshCw,Network} from 'lucide-react';
import {operationApi as api,operationsClient} from './operations-client';
import {StaffDay} from './StaffDay';
import {RecordDialog,type Me} from './OperationsApp';
import {type OperationsData,type OperationRecord} from './operations-model';
import {inOverview} from './operations-overview';
import {InstallerAddressSearch} from './InstallerAddressSearch';
import {canUseInstallerApp,installerLoginEmail} from './installer-access';
import './installer.css';
export function InstallerApp(){
 const [data,setData]=useState<OperationsData|null>(null),[me,setMe]=useState<Me|null>(null);
 const [authenticated,setAuthenticated]=useState<boolean|null>(null);
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[tab,setTab]=useState<'day'|'search'>('day');
 const [selected,setSelected]=useState<OperationRecord|null>(null);
 const epoch=useRef(0),flight=useRef<Promise<void>|null>(null);
 const clear=()=>{epoch.current++;setAuthenticated(false);setData(null);setMe(null);setSelected(null);setNotice('');};
 const refresh=()=>{
  if(flight.current)return flight.current;
  const generation=epoch.current;
  const task=(async()=>{try{
   const c=await operationsClient();const sessionResult=await c.auth.getSession();if(sessionResult.error)throw sessionResult.error;const session=sessionResult.data.session;
   if(!session){if(generation===epoch.current){clear();setReady(true);}return;}
   if(generation!==epoch.current)return;setAuthenticated(true);
   const identity:Me=await api('me');
   if(generation!==epoch.current)return;
   setMe(identity);
   if(!canUseInstallerApp(identity.role)){setData(null);setSelected(null);return;}
   const next=await api('operations/sync');
   if(generation!==epoch.current)return;
   if(!canUseInstallerApp(next.me.role)){setMe(next.me);setData(null);setSelected(null);return;}
   setData(next.data);setMe(next.me);setError('');
   setSelected(old=>old&&next.data.records.some((r:OperationRecord)=>r.id===old.id)?old:null);
  }catch(e){if(generation===epoch.current){setData(null);setSelected(null);if(requiresLogin(e)){setAuthenticated(false);setMe(null);}setError((e as Error).message);}}
  finally{if(generation===epoch.current)setReady(true);}})().finally(()=>{flight.current=null;});
  flight.current=task;return task;
 };
 useEffect(()=>{
  let disposed=false;let unsubscribe:undefined|(()=>void);
  void operationsClient().then(c=>{if(disposed)return;const sub=c.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){clear();setReady(true);}});unsubscribe=()=>sub.data.subscription.unsubscribe();}).catch(()=>{});
  void refresh();
  const check=()=>{if(document.visibilityState==='visible')void refresh();};
  const timer=setInterval(check,15000);document.addEventListener('visibilitychange',check);window.addEventListener('online',check);window.addEventListener('focus',check);
  return()=>{disposed=true;clearInterval(timer);unsubscribe?.();document.removeEventListener('visibilitychange',check);window.removeEventListener('online',check);window.removeEventListener('focus',check);};
 },[]);
 const logout=async()=>{clear();setPassword('');setEmail('');await (await operationsClient()).auth.signOut({scope:'local'});};
 const login=async()=>{setBusy(true);setError('');try{const {error}=await (await operationsClient()).auth.signInWithPassword({email:installerLoginEmail(email),password});if(error)throw Error('Anmeldung fehlgeschlagen. Bitte Benutzername oder E-Mail und Passwort prüfen.');setPassword('');await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 if(!data)return <main className="installer-login"><Network size={40}/><h1>FiberOffice <span>Connect</span></h1><p>Deine Einsätze. Alles dabei.</p><InstallApp/>{error&&<p role="alert" className="error">{error}</p>}{!ready?<p>Verbindung wird geprüft …</p>:me&&!canUseInstallerApp(me.role)?<><p>Diese App ist für Monteure. Bitte lass dir von der Administration die Rolle „Mitarbeiter – Monteur“ und die passenden Listen freigeben.</p><button onClick={()=>void logout()}>Abmelden</button></>:authenticated!==false?<><p>Die Verbindung ist unterbrochen. Bitte erneut versuchen; eine gespeicherte Anmeldung wird automatisch wiederhergestellt.</p><button onClick={()=>void logout()}>Abmelden</button></>:<form onSubmit={e=>{e.preventDefault();void login();}}><label>Benutzername oder E-Mail<input required type="text" autoCapitalize="none" spellCheck={false} autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Passwort<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{busy?'Anmeldung läuft …':'Anmelden'}</button><small>Nur mit einem von Nexentra angelegten Konto. Keine Selbstregistrierung. Passwort vergessen? Bitte die Administration kontaktieren.</small></form>}{ready&&error&&<button onClick={()=>void refresh()}>Verbindung erneut prüfen</button>}<small>Zum Abrufen und Speichern ist Internet erforderlich.</small></main>;
 const records=data.records.filter(inOverview);
 return <div className="ops-shell installer-shell"><header className="installer-header"><div><strong>FiberOffice Connect</strong><small>{me?.role==='admin'?'Administration · Monteuransicht':'Monteur · Nexentra'}</small></div><button aria-label="Abmelden" onClick={()=>void logout()}><LogOut size={20}/></button></header><main className="installer-main"><InstallApp/><div className="installer-title"><h1>{tab==='day'?'Deine Einsätze':'Adressen suchen'}</h1><button aria-label="Aktualisieren" onClick={()=>void refresh()}><RefreshCw size={20}/></button></div><p className="installer-hint">{me?.canEditStatus?'Arbeitsschritte und Dokumentation freigegeben':'Leserechte · Statusänderungen nicht freigegeben'}</p>{notice&&<p role="status" className="success">{notice}</p>}{tab==='day'?<StaffDay compact records={records} open={setSelected} loadRecords={async()=>{const generation=epoch.current;const next=await api('operations/sync');if(generation!==epoch.current||!canUseInstallerApp(next.me.role))throw Error('Zugriff geändert. Bitte erneut anmelden.');setData(next.data);setMe(next.me);return next.data.records.filter(inOverview);}}/>:null}<div hidden={tab!=='search'}><InstallerAddressSearch records={records} open={setSelected}/></div></main><nav className="installer-nav" aria-label="Monteur-Navigation"><button aria-current={tab==='day'?'page':undefined} onClick={()=>setTab('day')}><CalendarDays/>Termine</button><button aria-current={tab==='search'?'page':undefined} onClick={()=>setTab('search')}><Search/>Adressen</button></nav>{selected&&me&&<RecordDialog key={selected.id+':'+selected.version} updatedRecord={data.records.find(r=>r.id===selected.id)} loadUpdated={setSelected} installerView record={selected} data={data} me={me} close={()=>setSelected(null)} saved={async()=>{await refresh();setSelected(null);setNotice('Gespeichert. Der neue Stand ist im Portal verfügbar.');}}/>}</div>;
}
