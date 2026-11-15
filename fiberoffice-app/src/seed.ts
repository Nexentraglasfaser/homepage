import type { Snapshot, Profile, Connection } from './domain';
const tenant='11111111-1111-4111-8111-111111111111';
export const demoProfiles: Profile[]=[
 {id:'gu-demo',tenant_id:tenant,role:'gu',contractor_id:null,name:'Anna Weber'},
 {id:'nu-demo',tenant_id:tenant,role:'nu',contractor_id:'partner-a',name:'Malik Demir'},
 {id:'nu-other',tenant_id:tenant,role:'nu',contractor_id:'partner-b',name:'Lena Fischer'},
 {id:'gu-other',tenant_id:'tenant-b',role:'gu',contractor_id:null,name:'Tom Berg'}
];
export function seed(): Snapshot {
 const now=new Date().toISOString();
 const streets=['Ahornweg','Lindenstraße','Birkenallee','Gartenstraße','Buchenweg','Parkstraße','Feldweg','Rosenweg','Kirchstraße','Wiesenweg','Eichenstraße','Schulstraße'];
 const connections: Connection[]=streets.map((street,i)=>({id:`connection-${i+1}`,tenant_id:tenant,project_id:i<9?'project-a':'project-b',reference:`FO-${String(2401+i)}`,street,house_number:['12','8a','24','7','16','3','11','5','22','9','14','6'][i],postcode:'48100',city:'Musterstadt',units:[2,4,1,6,2,1,3,2,4,1,2,8][i],contractor_id:i%4===3?null:i%4===2?'partner-b':'partner-a',status:i===2||i===7?'Blockiert':i===1||i===4?'Fertig':i===0||i===5||i===8?'In Arbeit':'Offen',steps:i===1||i===4?[true,true,true,true,true]:i===0||i===5||i===8?[true,true,false,false,false]:[false,false,false,false,false],note:i===2?'Zugang zum Hausanschlussraum fehlt. Rückmeldung abwarten.':i===7?'Leerrohr blockiert. Prüfung durch Tiefbau erforderlich.':'',version:1,updated_at:now}));
 connections.push({...connections[0],id:'foreign-connection',tenant_id:'tenant-b',project_id:'project-c',contractor_id:null,reference:'FB-1001',street:'Teststraße'});
 return {profile:demoProfiles[0],projects:[{id:'project-a',tenant_id:tenant,name:'Musterstadt · Nord',city:'Musterstadt',created_at:now},{id:'project-b',tenant_id:tenant,name:'Musterstadt · West',city:'Musterstadt',created_at:now},{id:'project-c',tenant_id:'tenant-b',name:'Fremder Mandant',city:'Teststadt',created_at:now}],contractors:[{id:'partner-a',tenant_id:tenant,name:'Nordlicht Montage'},{id:'partner-b',tenant_id:tenant,name:'Trassenwerk GmbH'}],connections,attachments:[],invites:[],audits:[{id:'initial',tenant_id:tenant,connection_id:null,actor:'System',action:'Fiktive Demodaten angelegt',before_data:null,after_data:{hinweis:'Keine echten Kunden- oder Anschlussdaten'},created_at:now}]};
}
