export function createHandler(env:{url:string;serviceKey:string},fetcher:typeof fetch=fetch){
 const cors={'Access-Control-Allow-Origin':'https://nexentra.de','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
 return async(req:Request):Promise<Response>=>{
 const respond=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return respond(405,{error:'Nur POST erlaubt.'});
 const token=req.headers.get('Authorization')||'';
 if(!/^Bearer \S+$/.test(token))return respond(401,{error:'Bitte anmelden.'});
 if(!env.url||!env.serviceKey)return respond(503,{error:'Benutzerverwaltung noch nicht eingerichtet.'});
 try{
 const callerHeaders={apikey:env.serviceKey,Authorization:token,'Content-Type':'application/json'};
 const auth=await fetcher(env.url+'/auth/v1/user',{headers:callerHeaders});
 if(!auth.ok)return respond(401,{error:'Bitte erneut anmelden.'});
 const actor=await auth.json();
 const role=await fetcher(env.url+'/rest/v1/rpc/ops_me',{method:'POST',headers:callerHeaders,body:'{}'});
 if(!role.ok||(await role.json()).role!=='admin')return respond(403,{error:'Nur die Administration darf Benutzer anlegen.'});
 const raw=await req.text();if(raw.length>16000)return respond(400,{error:'Eingabe zu groß.'});
 let input;try{input=JSON.parse(raw);}catch{return respond(400,{error:'Ungültige Eingabe.'});}
 if(!input||typeof input!=='object')return respond(400,{error:'Ungültige Eingabe.'});
 const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof input.password!=='string'||input.password.length<12||input.password.length>128||!['gu','nu','planner','installer'].includes(input.role)||!Array.isArray(input.projectIds)||input.projectIds.length>100||input.projectIds.some((id:unknown)=>typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))||(input.canEditStatus!==undefined&&typeof input.canEditStatus!=='boolean'))return respond(400,{error:'E-Mail, Rolle, Listen und Passwort (12–128 Zeichen) prüfen.'});
 const projects=await fetcher(env.url+'/rest/v1/ops_projects?select=id',{headers:callerHeaders});
 if(!projects.ok)return respond(503,{error:'Listen konnten nicht geprüft werden.'});
 const allowed=new Set((await projects.json()).map((p:{id:string})=>p.id));
 if(input.projectIds.some((id:string)=>!allowed.has(id)))return respond(403,{error:'Eine ausgewählte Liste ist nicht verfügbar.'});
 const payload={email,password:input.password,email_confirm:true,app_metadata:{fiber_provision:{actor:actor.id,role:input.role,projects:[...new Set(input.projectIds)],canEditStatus:input.role!=='planner'&&input.canEditStatus===true}}};
 const result=await fetcher(env.url+'/auth/v1/admin/users',{method:'POST',headers:{apikey:env.serviceKey,Authorization:'Bearer '+env.serviceKey,'Content-Type':'application/json'},body:JSON.stringify(payload)});
 if(!result.ok){const failure=await result.json().catch(()=>({}));if(['email_exists','email_address_not_authorized','user_already_exists'].includes(failure.code)||result.status===422)return respond(409,{error:'Diese E-Mail ist bereits vergeben oder nicht zulässig. Es wurden keine bestehenden Rechte geändert.'});return respond(502,{error:'Benutzer konnte nicht angelegt werden. Bitte Eingaben prüfen und erneut versuchen.'});}
 const created=await result.json();return respond(201,{email:created.email||email,role:input.role,projectIds:input.projectIds});
 }catch{return respond(503,{error:'Verbindung unterbrochen. Bitte zuerst die Benutzerliste aktualisieren, bevor du erneut anlegst.'});}
 };
}
