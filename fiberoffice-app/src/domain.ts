export type Role = 'gu' | 'nu';
export type Status = 'Offen' | 'In Arbeit' | 'Blockiert' | 'Fertig';
export const STEPS = ['Hausbegehung', 'Hauseinführung', 'Kabel eingeblasen', 'APL montiert', 'Messung & Dokumentation'] as const;
export type Profile = { id: string; tenant_id: string; role: Role; contractor_id: string | null; name: string };
export type Project = { id: string; tenant_id: string; name: string; city: string; created_at: string };
export type Contractor = { id: string; tenant_id: string; name: string };
export type Connection = { id: string; tenant_id: string; project_id: string; reference: string; street: string; house_number: string; postcode: string; city: string; units: number; contractor_id: string | null; status: Status; steps: boolean[]; note: string; version: number; updated_at: string };
export type Attachment = { id: string; tenant_id: string; connection_id: string; name: string; path: string; mime: string; size: number; created_at: string };
export type Audit = { id: string; tenant_id: string; connection_id: string | null; actor: string; action: string; before_data: unknown; after_data: unknown; created_at: string };
export type Invite = { id: string; tenant_id: string; contractor_id: string; email: string; expires_at: string; accepted_at: string | null; revoked_at: string | null };
export type Snapshot = { profile: Profile; projects: Project[]; contractors: Contractor[]; connections: Connection[]; attachments: Attachment[]; audits: Audit[]; invites: Invite[] };
export type ImportRow = Pick<Connection, 'reference'|'street'|'house_number'|'postcode'|'city'|'units'>;
export type Edit = Pick<Connection, 'steps'|'note'|'status'>;
export const fields: {key: keyof ImportRow; label: string; required: boolean}[] = [
  {key:'reference',label:'Anschluss-ID',required:true}, {key:'street',label:'Straße',required:true},
  {key:'house_number',label:'Hausnummer',required:true}, {key:'postcode',label:'PLZ',required:true},
  {key:'city',label:'Ort',required:true}, {key:'units',label:'Wohneinheiten',required:false}
];
export function canRead(p: Profile, c: Connection) { return p.tenant_id === c.tenant_id && (p.role === 'gu' || (!!p.contractor_id && p.contractor_id === c.contractor_id)); }
export function requireGU(p: Profile) { if(p.role !== 'gu') throw new Error('Nur der Generalunternehmer darf diese Aktion ausführen.'); }
export function validateEdit(edit: Edit) {
  if (edit.steps.length !== STEPS.length || edit.steps.some(x=>typeof x !== 'boolean')) throw new Error('Ungültige Arbeitsschritte.');
  if (!['Offen','In Arbeit','Blockiert','Fertig'].includes(edit.status)) throw new Error('Ungültiger Status.');
  if(edit.status === 'Fertig' && edit.steps.some(x=>!x)) throw new Error('Für „Fertig“ müssen alle Arbeitsschritte bestätigt sein.');
  if(edit.note.length > 4000) throw new Error('Bemerkung darf höchstens 4.000 Zeichen enthalten.');
  if(edit.status === 'Blockiert' && !edit.note.trim()) throw new Error('Bitte den Grund der Blockierung eintragen.');
}
export function validateFile(file: Pick<File,'size'|'type'|'name'>) {
  if(!['image/jpeg','image/png','application/pdf'].includes(file.type)) throw new Error('Bitte JPG, PNG oder PDF auswählen.');
  if(!file.size || file.size > 10*1024*1024) throw new Error('Dateien dürfen höchstens 10 MB groß und nicht leer sein.');
}
export async function validateFileContent(file: File) {
  validateFile(file);
  const b = new Uint8Array(await file.slice(0,8).arrayBuffer());
  const valid = file.type === 'application/pdf' ? String.fromCharCode(...b.slice(0,5)) === '%PDF-' : file.type === 'image/png' ? b[0]===137 && b[1]===80 && b[2]===78 && b[3]===71 : b[0]===255 && b[1]===216 && b[2]===255;
  if(!valid) throw new Error('Der Dateiinhalt passt nicht zum angegebenen Dateityp.');
}
export function mapRows(raw: string[][], mapping: Record<string,number>, existing: string[] = []) {
  const rows: ImportRow[]=[]; const errors: string[]=[]; const seen=new Set(existing.map(x=>x.trim().toLowerCase()));
  raw.forEach((r,i)=>{
    if(r.every(x=>!x.trim())) return;
    const row = Object.fromEntries(fields.map(f=>[f.key,(r[mapping[f.key]] || '').trim()])) as unknown as ImportRow;
    row.units=Number(row.units || 1);
    const missing=fields.filter(f=>f.required && !row[f.key]).map(f=>f.label);
    if(missing.length) errors.push(`Zeile ${i+2}: ${missing.join(', ')} fehlt.`);
    else if(!/^\d{5}$/.test(row.postcode)) errors.push(`Zeile ${i+2}: PLZ muss fünfstellig sein (als Text importieren).`);
    else if(!Number.isInteger(row.units) || row.units<1 || row.units>10000) errors.push(`Zeile ${i+2}: Ungültige Wohneinheiten.`);
    else if(Object.values(row).some(v=>typeof v==='string' && v.length>200)) errors.push(`Zeile ${i+2}: Feld ist länger als 200 Zeichen.`);
    else if(seen.has(row.reference.toLowerCase())) errors.push(`Zeile ${i+2}: Anschluss-ID ${row.reference} ist bereits vorhanden.`);
    else {seen.add(row.reference.toLowerCase()); rows.push(row);}
  });
  if(raw.length>5000) errors.push('Maximal 5.000 Zeilen pro Import.');
  return {rows,errors};
}
export function safeCell(v: string) { return /^[=+@\-\t\r]/.test(v) ? `'${v}` : v; }
export const address = (c: Connection) => `${c.street} ${c.house_number}`;
