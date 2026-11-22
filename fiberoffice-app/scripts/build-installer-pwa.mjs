import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,cpSync,readdirSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base='/fiberoffice/monteure/',out=path.join(root,'dist-monteure');
for(const [file,args] of [['typescript/bin/tsc',['--noEmit']],['vite/bin/vite.js',['build','--base='+base,'--outDir=dist-monteure']]]){
 const run=spawnSync(process.execPath,[path.join(root,'node_modules',file),...args],{cwd:root,stdio:'inherit',env:{...process.env,VITE_INSTALLER_APP:'true',VITE_INSTALLER_PWA:'true',VITE_STATIC_HOST:'true'}});if(run.status!==0)process.exit(run.status||1);
}
for(const file of ['config.json','offline.html','icon.svg','icon-192.png','icon-512.png'])cpSync(path.join(root,'pwa',file),path.join(out,file));
rmSync(path.join(out,'beispiel-adressen.csv'),{force:true});
const config=JSON.parse(readFileSync(path.join(root,'pwa/config.json'),'utf8'));
if(!config.supabaseKey?.startsWith('sb_publishable_')||Object.keys(config).some(k=>!['supabaseKey','supabaseUrl'].includes(k)))throw Error('Only public configuration allowed');
const manifest={id:base,name:'FiberOffice Connect · Monteure',short_name:'FiberOffice',description:'Termine und Dokumentation für freigegebene Nexentra-Monteure.',lang:'de',start_url:base,scope:base,display:'standalone',background_color:'#f3f7fc',theme_color:'#104ca0',prefer_related_applications:false,icons:[{src:'icon-192.png',sizes:'192x192',type:'image/png',purpose:'any maskable'},{src:'icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]};
writeFileSync(path.join(out,'manifest.webmanifest'),JSON.stringify(manifest,null,2));
const html=readFileSync(path.join(out,'index.html'),'utf8').replace('initial-scale=1.0','initial-scale=1.0, viewport-fit=cover').replace('FiberOffice Connect – lokale Glasfaser-Projektdemo','FiberOffice Connect – Monteur-App').replace('#071323','#104ca0').replace('</head>',`<link rel="manifest" href="${base}manifest.webmanifest"><link rel="apple-touch-icon" href="${base}icon-192.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="FiberOffice"><meta name="robots" content="noindex,nofollow"></head>`);
writeFileSync(path.join(out,'index.html'),html);
const assets=readdirSync(path.join(out,'assets')).map(f=>base+'assets/'+f);
const cached=[...assets,...['offline.html','icon-192.png','icon-512.png'].map(f=>base+f)];
const version=createHash('sha256').update(html+readFileSync(path.join(out,'offline.html'),'utf8')).digest('hex').slice(0,12);
// Deliberately no API, authentication, config, navigation HTML or user-file caching.
writeFileSync(path.join(out,'sw.js'),`const CACHE='fiber-monteure-${version}';const FILES=${JSON.stringify(cached)};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('fiber-monteure-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin)return;if(e.request.mode==='navigate'&&u.pathname.startsWith('${base}')){e.respondWith(fetch(e.request).catch(()=>caches.match('${base}offline.html')));return;}if(!u.search&&FILES.includes(u.pathname))e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request)));});`);
