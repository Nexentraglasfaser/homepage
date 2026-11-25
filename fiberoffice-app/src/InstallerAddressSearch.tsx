import {useState} from 'react';
import {Search} from 'lucide-react';
import {isScheduled, type OperationRecord} from './operations-model';
import {overviewStatus} from './operations-overview';
import {installerStatuses, matchesInstallerFilters, type InstallerStatus} from './installer-search';

export function InstallerAddressSearch({records, open}: {records: OperationRecord[]; open: (record: OperationRecord) => void}) {
 const [project, setProject] = useState('');
 const [status, setStatus] = useState<InstallerStatus>('Alle Status');
 const [query, setQuery] = useState('');
 const [limit, setLimit] = useState(100);
 const projects = [...new Set(records.map(record => record.project))].sort((a,b) => a.localeCompare(b,'de'));
 const results = records.filter(record => matchesInstallerFilters(record, project, status, query));

 return <>
  <label className="installer-search"><Search size={20}/><input type="search" aria-label="Adresse, Name oder ID suchen" placeholder="Adresse, Name, ID …" value={query} onChange={e => {setQuery(e.target.value); setLimit(100);}}/></label>
  <div className="installer-filters">
   <label>Projekt<select value={project} onChange={e => {setProject(e.target.value); setLimit(100);}}>
    <option value="">Alle Projekte</option>{projects.map(name => <option key={name}>{name}</option>)}
   </select></label>
   <label>Status<select value={status} onChange={e => {setStatus(e.target.value as InstallerStatus); setLimit(100);}}>
    {installerStatuses.map(value => <option key={value}>{value}</option>)}
   </select></label>
  </div>
  <p role="status">{results.length === 0 ? 'Keine passenden Adressen gefunden.' : results.length === 1 ? '1 Adresse' : results.length + ' Adressen'}</p>
  {results.slice(0,limit).map(record => {
   const category = overviewStatus(record);
   return <button className="installer-address" key={record.id} onClick={() => open(record)}>
    <strong>{record.street} {record.number}</strong><span>{record.project} · {record.customer || 'Kontakt offen'}</span>
    <small>{category === 'Offen' ? (isScheduled(record) ? 'Offen · terminiert' : 'Offen · ohne Termin') : category}</small>
   </button>;
  })}
  {results.length > limit && <button onClick={() => setLimit(limit + 100)}>Weitere Adressen anzeigen</button>}
 </>;
}
