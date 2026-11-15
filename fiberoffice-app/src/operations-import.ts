import Papa from 'papaparse';
import type {OperationRecord} from './operations-model';
export type OpsProject={id:string;name:string;city:string;client:string;code:string;note:string};
export const importFields=[['street','Straße'],['number','Hausnummer'],['address','Straße und Hausnummer zusammen'],['city','Ort'],['postcode','PLZ'],['reference','Anschluss-ID'],['customer','Kunde / Ansprechpartner'],['email','E-Mail'],['phone','Telefon'],['phone2','Weiteres Telefon'],['nvt','NVT / GVS'],['units','Wohneinheiten'],['ne4','NE4'],['pipe','Rohrfarbe'],['note','Bemerkung']] as const;
export type ImportField=typeof importFields[number][0];
export type ImportRow=Partial<Record<Exclude<ImportField,'address'>,string>>&{street:string;number:string;city:string;sourceValues:Record<string,string>};
export type Mapping=Partial<Record<ImportField,number>>;
export type ImportSheet={name:string;rows:string[][]};
export type ImportCheck={row:number;address:string;issue:string;kind:'error'|'duplicate'};
export const importKey=(v:string)=>v.toLowerCase().replaceAll('ä','ae').replaceAll('ö','oe').replaceAll('ü','ue').replaceAll('ß','ss').replaceAll('strasse','str').replaceAll('str.','str').replace(/[^a-z0-9]/g,'');
const aliases:Record<ImportField,string[]>={street:['straße','strasse','street'],number:['nr','hausnummer','hausnr','hnr','house_number'],address:['adresse','anschrift','address'],city:['ort','stadt','city'],postcode:['plz','postleitzahl','postcode'],reference:['cs_id','cs-id','hausanschlussid','anschluss-id','reference','ha-id'],customer:['kunde','kundenname','name','eigentümer name','ansprechpartner','kunde / ansprechpartner'],email:['email','e-mail','ap email','gee_ap_e_mail'],phone:['telefon','telefon 1','tel 1','telefonnummer'],phone2:['telefon 2','tel 2','mobil'],nvt:['nvt','gvs','nvt / gvs'],units:['we','wohneinheiten','gepl. we'],ne4:['ne4'],pipe:['rohrfarbe','pipe','farbe'],note:['bemerkung','bemerkungen','kommentare','notiz','note']};
export function guessMapping(headers:string[]):Mapping {const result:Mapping={};for(const [field] of importFields){const i=headers.findIndex(h=>aliases[field].some(a=>importKey(a)===importKey(h)));if(i>=0)result[field]=i;}return result;}
export function validateImportRow(r:ImportRow):string[]{const errors:string[]=[];
 if(!r.street?.trim()||r.street.length>160||!importKey(r.street))errors.push('Straße fehlt oder ist ungültig');
 if(!r.number?.trim()||r.number.length>30||!importKey(r.number))errors.push('Hausnummer fehlt oder ist ungültig');
 if(!r.city?.trim()||r.city.length>100)errors.push('Ort fehlt oder ist zu lang');
 if(r.postcode&&!/^\d{5}$/.test(r.postcode))errors.push('PLZ muss fünf Ziffern enthalten');
 if(r.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))errors.push('E-Mail prüfen');
 for(const [k,v] of Object.entries(r))if(k!=='sourceValues'&&typeof v==='string'&&v.length>(k==='note'?20000:1000))errors.push('Feld zu lang: '+k);
 if(Object.values(r.sourceValues).some(v=>v.length>20000))errors.push('Quellzelle ist zu lang');
 return errors;
}
export function prepareImport(sheet:ImportSheet,headerIndex:number,mapping:Mapping,project:OpsProject,existing:OperationRecord[]){
 const headers=sheet.rows[headerIndex]||[], rows:ImportRow[]=[],issues:ImportCheck[]=[];let total=0;
 const addresses=new Set(existing.filter(r=>r.project===project.name).map(r=>[r.city||project.city,r.street,r.number].map(importKey).join('|')));
 const references=new Set(existing.filter(r=>r.project===project.name&&r.reference).map(r=>importKey(r.reference)));
 for(let i=headerIndex+1;i<sheet.rows.length;i++){const cells=sheet.rows[i];if(!cells.some(v=>v.trim()))continue;total++;
  const row:ImportRow={street:'',number:'',city:project.city,sourceValues:{'Quelldatei-Zeile':String(i+1)}};
  const values:Partial<Record<ImportField,string>>={};for(const [f,col] of Object.entries(mapping))if(col!==undefined&&col>=0)values[f as ImportField]=(cells[col]||'').trim();
  for(const [f] of importFields)if(f!=='address'&&values[f]!==undefined)row[f]=values[f];
  row.city=row.city||project.city;
  if(values.address&&(!row.street||!row.number)){const match=values.address.match(/^(.+?)\s+(\d[\w\s/.-]*)$/u);if(match){row.street=row.street||match[1].trim();row.number=row.number||match[2].trim();}}
  cells.forEach((v,j)=>{row.sourceValues[(headers[j]||'Spalte') .slice(0,200)+` [${j+1}]`]=v;});
  const error=validateImportRow(row),address=row.street+' '+row.number,key=[row.city,row.street,row.number].map(importKey).join('|');
  if(error.length){issues.push({row:i+1,address,issue:error.join('; '),kind:'error'});continue;}
  if(addresses.has(key)){issues.push({row:i+1,address,issue:'Adresse bereits vorhanden oder doppelt in dieser Datei',kind:'duplicate'});continue;}
  if(row.reference&&references.has(importKey(row.reference))){issues.push({row:i+1,address,issue:'Anschluss-ID bereits vorhanden; Zuordnung prüfen',kind:'duplicate'});continue;}
  addresses.add(key);if(row.reference)references.add(importKey(row.reference));rows.push(row);
 }
 return {rows,issues,total};
}
export async function readImportWorkbook(file:File):Promise<ImportSheet[]>{
 if(file.size>5*1024*1024)throw Error('Bitte höchstens 5 MB hochladen.');
 const check=(rows:string[][])=>{if(rows.length>5001||rows.some(r=>r.length>99))throw Error('Maximal 5.000 Datenzeilen und 99 Spalten pro Tabellenblatt.');return rows;};
 if(/\.csv$/i.test(file.name)){const r=Papa.parse<string[]>(await file.text(),{skipEmptyLines:'greedy'});if(r.errors.length)throw Error('CSV konnte nicht gelesen werden: '+r.errors[0].message);return [{name:'CSV',rows:check(r.data)}];}
 if(!/\.xlsx$/i.test(file.name))throw Error('Bitte Excel (.xlsx) oder CSV wählen. Alte .xls-Dateien bitte zuerst als .xlsx speichern.');
 const {Workbook}=await import('exceljs');const wb=new Workbook();await wb.xlsx.load(await file.arrayBuffer());
 const sheets=wb.worksheets.filter(s=>s.rowCount>0).map(s=>{if(s.rowCount>5001||s.columnCount>99)throw Error(`„${s.name}“: maximal 5.000 Datenzeilen und 99 Spalten.`);const rows:string[][]=[];
  s.eachRow({includeEmpty:true},row=>{const vals:string[]=[];for(let c=1;c<=s.columnCount;c++){const cell=row.getCell(c);let text=cell.text;if(typeof cell.value==='number'&&/^0{2,}$/.test(cell.numFmt||''))text=String(cell.value).padStart(cell.numFmt.length,'0');vals.push(text);}rows.push(vals);});return {name:s.name,rows:check(rows)};});
 if(!sheets.length)throw Error('Die Arbeitsmappe enthält keine Daten.');return sheets;
}
