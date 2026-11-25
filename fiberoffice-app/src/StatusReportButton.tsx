import {useEffect,useRef,useState} from 'react';
import type {OperationRecord} from './operations-model';

export function StatusReportButton({records,date,disabled=false}:{records:()=>OperationRecord[]|Promise<OperationRecord[]>;date:string;disabled?:boolean}){
 const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [url,setUrl]=useState('');
 const [preview,setPreview]=useState<'inline'|'large'|'closed'>('inline');
 const largeDialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(preview==='large')largeDialog.current?.showModal();},[preview]);

 useEffect(()=>{if(!file){setUrl('');return;}const href=URL.createObjectURL(file);setUrl(href);return()=>URL.revokeObjectURL(href);},[file]);
 async function generate(){
  setBusy(true);setError('');setFile(null);setPreview('inline');
  try{const rows=await records();const {createStatusReport}=await import('./status-report');const {pdf,name}=createStatusReport(rows,date);setFile(new File([pdf.output('blob')],name,{type:'application/pdf'}));}
  catch(e){setError(e instanceof Error?e.message:'PDF konnte nicht erstellt werden.');}
  finally{setBusy(false);}
 }
 async function share(){if(!file)return;try{await navigator.share({files:[file],title:file.name});}catch(e){if(!(e instanceof Error&&e.name==='AbortError'))setError('Teilen fehlgeschlagen. Bitte die PDF speichern und als Anhang senden.');}}
 return <section><button className="primary" type="button" disabled={disabled||busy} onClick={()=>void generate()}>{busy?'PDF wird erstellt …':'Statusmeldung für Auftraggeber'}</button>
 {file&&url&&!disabled&&<div><small>{file.name}</small>{preview==='inline'&&<iframe title="Vorschau der Statusmeldung" src={url} style={{width:'100%',height:'55vh',border:0}}/>}
 {preview==='large'&&<dialog ref={largeDialog} aria-label="Große PDF-Vorschau" style={{width:'96vw',maxWidth:'none',padding:8}} onCancel={e=>{e.stopPropagation();setPreview('closed');}}>
 <button type="button" onClick={()=>setPreview('closed')}>Vorschau schließen</button>
 <iframe title="Große Vorschau der Statusmeldung" src={url} style={{width:'100%',height:'78dvh',border:0}}/></dialog>}
 <p><button type="button" onClick={()=>setPreview('large')}>Vorschau öffnen</button> {preview==='inline'&&<button type="button" onClick={()=>setPreview('closed')}>Vorschau schließen</button>}</p><p><a href={url} download={file.name}>PDF speichern</a> {navigator.canShare?.({files:[file]})&&<button type="button" onClick={()=>void share()}>PDF teilen / senden</button>}</p></div>}
 {error&&<p role="alert">{error}</p>}</section>;
}
