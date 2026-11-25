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
 const {jsPDF}=await import('jspdf');
 const pdf=new jsPDF(), ordered=[...records].sort(compareAppointments);
 const projects=[...new Set(records.map(r=>r.project))];
 const appendix:{title:string;lines:string[]}[]=[];
 const font=(size:number,bold=false,color='#263748')=>{pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(color);};
 const wrap=(text:string,width:number)=>pdf.splitTextToSize(text.replaceAll('→',' > '),width) as string[];
 const brand=()=>{font(7,true,'#53677B');pdf.text('NEXENTRA  |  MONTAGE',190,10,{align:'right'});};
 let y=27;
 const next=()=>{pdf.addPage();brand();y=23;};
 brand();font(18,true,'#154E86');
 for(const l of wrap('Tagesliste'+(projects.length===1?' - '+projects[0]:''),170)){pdf.text(l,20,y);y+=8;}
 font(10,true,'#52687C');pdf.text('Montageeinsätze',20,y);y+=6;
 const stats=[[String(records.length),'Termine'],[String(projects.length),'Projekte']];
 stats.forEach(([value,label],i)=>{const x=28.5+76.5*i;pdf.setFillColor('#EAF2F8');pdf.setDrawColor('#B2C2D4');pdf.rect(x,y,76.5,12,'FD');font(10,true,'#154E86');pdf.text(value,x+38.25,y+5.3,{align:'center'});font(7);pdf.text(label,x+38.25,y+9.5,{align:'center'});});
 y+=20;
 let previous='';
 for(const r of ordered){
  const date=appointmentDate(r),day=date?new Date(date+'T12:00').toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}):'Datum offen';
  const title=appointmentTimeLabel(r)+' | '+r.street+' '+r.number;
  const access=appointmentNotes(r.overrides.appointment??r.appointment);
  const note=recordNote(r)||'';
  const current=note.split(/\b(?:Bisheriger Verlauf|Bisheriger Vermerk|Historie):/i)[0].trim();
  const location=note.match(/(?:NVT|MVT|GVS)[ -]Standort:\s*([^\n;]+)/i)?.[0].split(/\s+Quelle:/i)[0];
  const tech=[r.nvt&&'NVT: '+r.nvt,(r.overrides.actualPipe||r.pipe)&&'Rohr: '+(r.overrides.actualPipe||r.pipe),(r.overrides.actualUnits||r.units)&&(r.overrides.actualUnits||r.units)+' WE',r.ne4&&'NE4: '+r.ne4].filter(Boolean).join(' | ');
  font(9);
  const details=[projects.length>1?r.project:'',r.reference&&'ID '+r.reference,[r.postcode,r.city].filter(Boolean).join(' ')].filter(Boolean).join(' | ');
  const info=[details,[r.customer,r.phone,r.phone2].filter(Boolean).join(' | ')||'Kontakt nicht hinterlegt',tech,location].filter(Boolean).flatMap(t=>wrap(t!,147));
  const extra=[access&&'Termin / Zugang: '+access,current&&'Bemerkung: '+current].filter(Boolean).flatMap(t=>wrap(t,147));
  const long=extra.length>5||note!==current;
  if(long)appendix.push({title:r.street+' '+r.number+' | '+day,lines:[access&&'Termin / Zugang: '+access,note&&'Bemerkung: '+note].filter(Boolean).flatMap(t=>wrap(t,165))});
  const body=[...info,...extra.slice(0,5),...(long?['Vollständige Hinweise im Anhang ('+appendix.length+').']:[])];
  font(11,true);const heading=wrap(title,147);
  if(y+(heading.length+body.length)*4.4+13>278){next();previous='';}
  if(day!==previous){font(10,true,'#154E86');pdf.text(day,20,y);y+=4;previous=day;}
  const lines=[...heading.map(text=>({text,bold:true})),...body.map(text=>({text,bold:false}))];
  while(lines.length){
   if(y>263)next();
   const block=lines.splice(0,Math.floor((278-y-6)/4.4));
   const h=block.length*4.4+6;
   pdf.setFillColor('#F5F8FB');pdf.setDrawColor('#AFBFD2');pdf.rect(28.5,y,153,h,'FD');pdf.setFillColor('#154E86');pdf.rect(28.5,y,1,h,'F');
   block.forEach(({text,bold},i)=>{font(bold?11:9,bold,bold?'#154E86':'#263748');pdf.text(text,31,y+5.6+i*4.4);});y+=h+4;
  }
 }
 if(appendix.length){next();font(14,true,'#154E86');pdf.text('Anhang - vollständige Hinweise',20,y);y+=9;}
 appendix.forEach(({title,lines},i)=>{if(y>255)next();font(10,true,'#154E86');for(const l of wrap((i+1)+'. '+title,165)){pdf.text(l,20,y);y+=5;}for(const l of lines){if(y>276)next();font(9);pdf.text(l,20,y);y+=4.4;}y+=5;});
 for(let p=1;p<=pdf.getNumberOfPages();p++){pdf.setPage(p);font(7,false,'#52687C');pdf.text('NEXENTRA | Tagesliste',20,288);pdf.text('Seite '+p+' / '+pdf.getNumberOfPages(),190,288,{align:'right'});}
 return pdf;
}
