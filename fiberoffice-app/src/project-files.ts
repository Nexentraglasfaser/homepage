export const fileCategories=['NVT- und Trassenpläne','Spleißpläne','Montageanleitungen','Weitere Arbeitsunterlagen'];
export interface ProjectFile{id:string;project_id:string;name:string;category:string;size:number;created_at:string;sha256:string}
export async function inspectProjectFile(file:File){
 if(!file.size||file.size>50*1024*1024)throw Error('Die Datei muss zwischen 1 Byte und 50 MB groß sein.');
 const bytes=new Uint8Array(await file.arrayBuffer());const ext=file.name.split('.').pop()?.toLowerCase();
 const types:Record<string,string>={pdf:'application/pdf',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png'};
 const mime=types[ext||''];
 const valid=ext==='pdf'?new TextDecoder().decode(bytes.slice(0,5))==='%PDF-':ext==='xlsx'?bytes[0]===80&&bytes[1]===75&&bytes[2]===3&&bytes[3]===4:ext==='png'?bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10':(ext==='jpg'||ext==='jpeg')&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(!mime||!valid)throw Error('Bitte eine gültige PDF-, XLSX-, JPG- oder PNG-Datei auswählen.');
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 return {mime,sha256};
}
