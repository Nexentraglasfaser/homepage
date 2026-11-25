import {jsPDF} from 'jspdf';
import {classify,recordNote,type OperationRecord} from './operations-model';
import {blownLength,cableValues} from './cable-measurement';

export function reportState(r:OperationRecord){
 const status=classify(r).status;
 if(status==='Fehlerstelle')return {label:status,ink:'#BD161C',fill:'#FFF2F2',border:'#F08788'};
 if(status==='Fertiggestellt')return {label:status,ink:'#226641',fill:'#F5F8FB',border:'#AFBFD2'};
 return {label:status==='Teilleistung'?'Teilweise abgeschlossen':status,ink:'#805900',fill:'#FFF8DF',border:'#DBC36D'};
}
export function createStatusReport(rows:OperationRecord[],date:string){
 if(!rows.length || rows.some(r=>r.project!==rows[0].project))throw Error('Bitte ein Projekt mit Einsätzen auswählen.');
 const pdf=new jsPDF({unit:'mm',format:'a4',compress:true});
 const when=new Date(date+'T12:00:00'),short=when.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});
 const project=rows[0].project,done=rows.filter(r=>classify(r).status==='Fertiggestellt'),other=rows.filter(r=>classify(r).status!=='Fertiggestellt');
 const we=(r:OperationRecord)=>r.overrides.actualUnits||r.units;
 const count=(list:OperationRecord[])=>list.length+' Adr.'+(list.length&&list.every(r=>/^\d+$/.test(we(r)))?' / '+list.reduce((n,r)=>n+Number(we(r)),0)+' WE':'');
 const font=(size:number,bold=false,color='#253647')=>{pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(color);};
 let y=27;
 function pageHeader(){font(7,true,'#53677B');pdf.text('NEXENTRA  |  MONTAGE',190,10,{align:'right'});}
 pageHeader();
 font(18,true,'#154E86');
 for(const line of pdf.splitTextToSize('Statusmeldung - '+project,170)){pdf.text(line,20,y);y+=8;}
 font(10,true,'#52687C');pdf.text('Montagearbeiten | '+when.toLocaleDateString('de-DE',{weekday:'long'})+', '+short,20,y);y+=6;
 font(8);pdf.text('Einsatzart: Hausanschlussmontage',20,y);y+=4;pdf.text('Abrechnung: keine Angabe',20,y);y+=8;
 const tiles=[[String(rows.length),'Adresspositionen'],[count(done),'erledigt'],[count(other),'übrige Positionen'],['k. A.','Mehraufwand']];
 tiles.forEach(([value,label],i)=>{const x=28.5+i*38;pdf.setFillColor('#EAF2F8');pdf.setDrawColor('#B2C2D4');pdf.setLineWidth(.2);pdf.rect(x,y,38,12,'FD');font(10,true,'#154E86');pdf.text(value,x+19,y+5.4,{align:'center'});font(7,false,'#54687B');pdf.text(label,x+19,y+9.5,{align:'center'});});
 y+=19;font(8);pdf.text('Tagesgrundlage: Dokumentierter Arbeitsstand der aufgeführten Einsätze.',20,y);y+=5;
 const nextPage=()=>{pdf.addPage();pageHeader();y=20;};
 for(const r of rows){
  const state=reportState(r),c=cableValues(r.overrides),length=blownLength(c.meterStart,c.meterEnd);
  const steps=['Hausbegehung','Hauseinführung','Eingeblasen','Gespleißt','Dokumentiert'].filter((_,i)=>r.overrides.steps?.[i]);
  const details=[r.customer,r.phone,r.reference&&'ID '+r.reference,r.nvt&&'NVT / GVS: '+r.nvt,(c.actualPipe||r.pipe)&&'Rohr: '+(c.actualPipe||r.pipe),we(r)&&we(r)+' WE',c.actualUnits&&r.units&&'Plan: '+r.units+' WE',c.fiberCount&&c.fiberCount+' Fasern'].filter(Boolean).join(' | ');
  const meters=[c.meterStart&&'Start '+c.meterStart+' m',c.meterEnd&&'Ende '+c.meterEnd+' m',length!==null?'eingeblasene Strecke '+length.toLocaleString('de-DE')+' m':''].filter(Boolean).join(' / ');
  const remark=(recordNote(r)||'').split(/Bisheriger Verlauf:/i)[0].trim();
  const sections=[[r.street+' '+r.number+' // '+state.label,true],[details,false],[meters&&'Kabelzähler: '+meters,false],[steps.length?'Bestätigte Schritte: '+steps.join(', '):'',false],[remark,false]] as const;
  const lines=sections.flatMap(([value,bold])=>{font(bold?9:8,bold);return value?(pdf.splitTextToSize(value.replaceAll('→',' > '),146) as string[]).map(text=>({text,bold})):[];});
  if(y+Math.min(lines.length,6)*4+6>278)nextPage();
  for(let i=0;i<lines.length;){
   const n=Math.min(lines.length-i,Math.floor((278-y-5)/4));
   if(n<1){nextPage();continue;}
   const height=n*4+5;
   pdf.setFillColor(state.fill);pdf.setDrawColor(state.border);pdf.rect(28.5,y,153,height,'FD');pdf.setFillColor(state.ink);pdf.rect(28.5,y,1,height,'F');
   for(let k=0;k<n;k++){const l=lines[i+k];font(l.bold?9:8,l.bold,l.bold?state.ink:'#263748');pdf.text(l.text,31,y+5+k*4);}
   y+=height+3;i+=n;
  }
 }
 for(let p=1;p<=pdf.getNumberOfPages();p++){pdf.setPage(p);font(7,false,'#52687C');pdf.text(project+' | '+short,157,288,{align:'right',maxWidth:135});pdf.text('Seite '+p,190,288,{align:'right'});}
 const suffix=rows.length===1?'_'+rows[0].street+' '+rows[0].number:'';
 return {pdf,name:('Statusmeldung_'+project+'_'+short+suffix).replace(/[^\p{L}\p{N} ._-]/gu,'_')+'.pdf'};
}
