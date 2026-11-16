import {appointmentTimeLabel,appointmentNotes,compareAppointments} from './operations-appointments';
import type {OperationRecord,OperationsData} from './operations-model';
import {classify,summarizeStatuses,recordNote,appointmentDate,isScheduled,isScheduledGBox} from './operations-model';
import {overviewStatus,overviewSummary,overviewStatuses} from './operations-overview';
import {safeCell} from './domain';
const values=(r:OperationRecord)=>[r.project,r.reference,`${r.street} ${r.number}`,overviewStatus(r),r.customer,r.email,r.phone,r.phone2,r.nvt,r.units,r.ne4,r.pipe,appointmentDate(r),r.overrides.appointment??r.appointment,appointmentTimeLabel(r),r.overrides.assignee||'',recordNote(r),classify(r).basis,r.source,r.conflicts.map(c=>`${c.field}: ${c.values.join(' | ')}`).join('\n'),isScheduled(r)?(isScheduledGBox(r)?'Ja · G-Box-Einsatz':'Ja'):'Nein',r.postcode||'',r.city||''];
const headers=['Projekt','Anschluss-ID','Adresse','Aktueller Status','Kunde / Ansprechpartner','E-Mail','Telefon 1','Telefon 2','NVT / GVS','WE laut Quelle','NE4','Rohrfarbe','Termindatum','Terminstatus / Hinweise','Zeitfenster','Zugewiesen an','Aktuelle Bemerkung','Statusgrundlage','Führende Quelle','Datenwidersprüche','Terminiert / eingeplant','PLZ','Ort'];
export async function makeOperationsWorkbook(rows:OperationRecord[],data:OperationsData){
 const ExcelJS=(await import('exceljs')).default;const wb=new ExcelJS.Workbook();wb.creator='FiberOffice Connect';
 const ws=wb.addWorksheet('Aktueller Stand');ws.addRow(headers);rows.forEach(r=>ws.addRow(values(r).map(safeCell)));ws.autoFilter={from:'A1',to:'W1'};ws.views=[{state:'frozen',ySplit:1}];
 const summary=wb.addWorksheet('Statusübersicht');summary.addRow(['Projekt',...overviewStatuses,'Summe Status','Adresszahl','Prüfung']);for(const project of ['',...new Set(rows.map(r=>r.project))]){const scope=project?rows.filter(r=>r.project===project):rows,totals=overviewSummary(scope);summary.addRow([project||'Gesamtauswahl',...overviewStatuses.map(s=>totals.counts[s]),totals.sum,totals.total,totals.balanced?'Stimmt':'Prüfen'].map(v=>typeof v==='string'?safeCell(v):v));}
 const source=wb.addWorksheet('Quellwerte und Verlauf');source.addRow(['Projekt','Adresse','Anschluss-ID','Tabellenblatt','Quellzeile','Feld / Spalte','Wert','Zuordnung']);
 function append(r:OperationRecord,sheet:string,row:number,fields:Record<string,string>,mode:string){for(const [k,v] of Object.entries(fields)){for(let i=0;i<v.length;i+=30000)source.addRow([r.project,`${r.street} ${r.number}`,r.reference,sheet,row,k,v.slice(i,i+30000),mode].map(v=>typeof v==='string'?safeCell(v):v));}}
 rows.forEach(r=>{r.sources.forEach(s=>append(r,s.sheet,s.row,s.fields,'Adressabgleich'));r.history.forEach(h=>{append(r,h.sheet,h.row,h.values,(h as {ambiguousId?:boolean}).ambiguousId?'ID mehrdeutig – Adressbezug prüfen':'Historie, kein aktueller Status');if(h.notes)append(r,h.sheet,h.row,h.notes,'Zellnotiz');});});
 const log=wb.addWorksheet('Änderungsprotokoll');log.addRow(['Zeit','Adresse-ID','Bearbeiter','Vorher','Nachher']);const ids=new Set(rows.map(r=>r.id));data.audits.filter(a=>ids.has(a.recordId)).forEach(a=>log.addRow([a.at,a.recordId,a.actor,JSON.stringify(a.before),JSON.stringify(a.after)].map(safeCell)));
 const meta=wb.addWorksheet('Quellenstand');meta.addRows([['Quelle',data.source.title],['URL',data.source.url],['Quellmappe geändert',data.source.modifiedAt],['Importiert',data.source.importedAt],['Auswahl',`${rows.length} Adressen`],['Hinweis','Vergangene Termine belegen keine Fertigstellung. Frühere behobene Fehler bleiben nur im Verlauf. Historische ID-Zuordnungen können mehrdeutig sein.']]);
 wb.eachSheet(s=>{s.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};s.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF087AF6'}};s.columns.forEach((c,i)=>{c.width=i===6?65:25;});s.eachRow(r=>r.alignment={vertical:'top',wrapText:true});});return wb;
}
export async function exportOperations(rows:OperationRecord[],data:OperationsData,format:'xlsx'|'pdf',faults=false,appointments=false){
 if(appointments)rows=[...rows].sort(compareAppointments);
 const name=`FiberOffice-${faults?'Fehlerstellen':appointments?'Terminliste':'Projektuebersicht'}-${new Date().toISOString().slice(0,10)}`;
 if(format==='xlsx'){const wb=await makeOperationsWorkbook(rows,data);const buffer=await wb.xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([buffer as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=name+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
 if(appointments){const pdf=await makeAppointmentPdf(rows);pdf.save(name+'.pdf');return;}
 const {jsPDF}=await import('jspdf');const pdf=new jsPDF();let y=20;
 const line=(text:string,size=9)=>{pdf.setFontSize(size);const lines=pdf.splitTextToSize(text.replaceAll('→','>').replaceAll('·',' / '),178);for(const l of lines){if(y>278){pdf.addPage();y=20;}pdf.text(l,16,y);y+=size*.48;}y+=3;};
 line(`FiberOffice Connect | ${faults?'Aktuelle Fehlerstellen':'Projektübersicht'}`,16);line(`${rows.length} Adressen | Quellstand ${new Date(data.source.modifiedAt).toLocaleString('de-DE')}`);
 const totals=overviewSummary(rows);line(overviewStatuses.map(s=>`${s}: ${totals.counts[s]}`).join(' | '));line(`Summe Status: ${totals.sum} / Adressen: ${totals.total}. Jede Adresse wird einmal gezählt.`);
 rows.forEach(r=>{if(y>245){pdf.addPage();y=20;}line(`${r.project} | ${r.street} ${r.number} | ${overviewStatus(r)}`,12);const v=values(r);for(let i=1;i<v.length;i++)if(i!==2 && i!==3 && v[i])line(`${headers[i]}: ${v[i]}`);y+=5;});
 for(let p=1;p<=pdf.getNumberOfPages();p++){pdf.setPage(p);pdf.setFontSize(8);pdf.text(`FiberOffice Connect · ${p} / ${pdf.getNumberOfPages()}`,16,290);}pdf.save(name+'.pdf');
}

export async function makeAppointmentPdf(records:OperationRecord[]){
 const {jsPDF}=await import('jspdf');const pdf=new jsPDF();let y=18;
 const line=(text:string,size=10,bold=false)=>{pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);for(const l of pdf.splitTextToSize(text,178)){if(y>278){pdf.addPage();y=18;}pdf.text(l,16,y);y+=size*.48;}y+=2;};
 line('NEXENTRA | Terminliste',17,true);
 line(`${records.length} Termine · Nach Datum und Uhrzeit sortiert`,9);
 let day='';
 for(const r of [...records].sort(compareAppointments)){
  const d=appointmentDate(r),label=d?new Date(d+'T12:00').toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}):'Datum offen';
  if(y>235){pdf.addPage();y=18;day='';}
  if(day!==label){line(label,12,true);day=label;}
  line(`${appointmentTimeLabel(r)} | ${r.street} ${r.number}`,12,true);
  line([r.project,r.reference&&'ID: '+r.reference].filter(Boolean).join(' · '));
  line([r.customer,[r.phone,r.phone2].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')||'Kontakt nicht hinterlegt');
  line([r.nvt&&'NVT: '+r.nvt,r.pipe&&'Rohr: '+r.pipe,r.units&&r.units+' WE',r.ne4&&'NE4: '+r.ne4].filter(Boolean).join(' · '));
  const notes=appointmentNotes(r.overrides.appointment??r.appointment);if(notes)line('Termin / Zugang: '+notes);
  if(recordNote(r))line('Bemerkung: '+recordNote(r));y+=5;
 }
 for(let p=1;p<=pdf.getNumberOfPages();p++){pdf.setPage(p);pdf.setFontSize(8);pdf.text(`NEXENTRA · Terminliste · ${p} / ${pdf.getNumberOfPages()}`,16,290);}
 return pdf;
}
