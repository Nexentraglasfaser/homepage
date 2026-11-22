/** UI gate only: project and write permissions continue to be enforced by Supabase RLS. */
export function canUseInstallerApp(role:string){return role==='installer'||role==='admin';}

export function installerLoginEmail(login:string){const value=login.trim().toLowerCase();return value==='nexentra'?'monteur@nexentra.de':value;}
