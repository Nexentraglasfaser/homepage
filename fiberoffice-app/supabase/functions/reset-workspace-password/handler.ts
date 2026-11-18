export function resetHandler(env:{url:string;serviceKey:string},fetcher:typeof fetch=fetch){
 const cors={'Access-Control-Allow-Origin':'https://nexentra.de','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
 return async(req:Request):Promise<Response>=>{
 const respond=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return respond(405,{error:'Nur POST erlaubt.'});
 const token=req.headers.get('Authorization')||'';
 if(!/^Bearer \S+$/.test(token))return respond(401,{error:'Bitte anmelden.'});
 if(!env.url||!env.serviceKey)return respond(503,{error:'Benutzerverwaltung nicht eingerichtet.'});
 try{
 const headers={apikey:env.serviceKey,Authorization:token,'Content-Type':'application/json'};
 const auth=await fetcher(env.url+'/auth/v1/user',{headers});if(!auth.ok)return respond(401,{error:'Bitte erneut anmelden.'});const actor=await auth.json();
 const role=await fetcher(env.url+'/rest/v1/rpc/ops_me',{method:'POST',headers,body:'{}'});
 if(!role.ok||(await role.json()).role!=='admin')return respond(403,{error:'Nur die Administration darf Passwörter zurücksetzen.'});
 const raw=await req.text();if(raw.length>4000)return respond(400,{error:'Eingabe zu groß.'});
 let input;try{input=JSON.parse(raw);}catch{return respond(400,{error:'Ungültige Eingabe.'});}
 if(!input||typeof input.email!=='string'||input.email.length>254||typeof input.password!=='string'||input.password.length<12||input.password.length>128)return respond(400,{error:'E-Mail und Passwort (12–128 Zeichen) prüfen.'});
 const email=input.email.trim().toLowerCase();
 const members=await fetcher(env.url+'/rest/v1/ops_members?select=user_id,role,email&email=eq.'+encodeURIComponent(email),{headers});if(!members.ok)return respond(503,{error:'Benutzer konnte nicht geprüft werden.'});
 const rows=await members.json();const target=rows.length===1?rows[0]:null;
 if(!target||target.role==='admin'||target.user_id===actor.id)return respond(403,{error:'Dieser Zugang kann hier nicht geändert werden.'});
 const result=await fetcher(env.url+'/auth/v1/admin/users/'+target.user_id,{method:'PUT',headers:{apikey:env.serviceKey,Authorization:'Bearer '+env.serviceKey,'Content-Type':'application/json'},body:JSON.stringify({password:input.password,app_metadata:{fiber_password_reset:{actor:actor.id,requestId:crypto.randomUUID()}}})});
 if(!result.ok)return respond(502,{error:'Passwort konnte nicht geändert werden. Bitte ein anderes sicheres Passwort versuchen.'});
 return respond(200,{email:target.email,ok:true});
 }catch{return respond(503,{error:'Verbindung unterbrochen. Ergebnis bitte im Änderungsprotokoll prüfen.'});}
 };
}
