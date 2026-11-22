/** UI gate only: project and write permissions continue to be enforced by Supabase RLS. */
export function canUseInstallerApp(role:string){return role==='installer'||role==='admin';}
