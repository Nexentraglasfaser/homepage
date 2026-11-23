/** Network and server failures never imply that saved credentials were revoked. */
export function requiresLogin(error:unknown){
 const e=error as {code?:string;message?:string};
 return ['refresh_token_not_found','refresh_token_already_used','session_not_found','bad_jwt'].includes(e?.code||'') || /Zugang gesperrt oder Anmeldung abgelaufen|Invalid Refresh Token|JWT expired/i.test(e?.message||'');
}
export function singleFlightFactory<T>(create:()=>Promise<T>){
 let pending:Promise<T>|undefined;
 return ()=>pending??(pending=create().catch(error=>{pending=undefined;throw error;}));
}
export function authIdentityChanged(event:string,userId:string|undefined,previous:string|undefined){
 return event==='SIGNED_OUT'||event==='USER_UPDATED'||(event==='SIGNED_IN'&&userId!==previous);
}
