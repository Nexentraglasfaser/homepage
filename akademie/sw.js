const CACHE='nexentra-academy-login-2026-11-27-1';
const FILES=['./','./index.html','./login.js','./login.css','./style.css','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
const urls=FILES.map(path=>new URL(path,self.registration.scope).href);
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);for(const url of urls){const response=await fetch(url,{cache:'reload'});if(!response.ok||response.redirected)throw Error('Login noch nicht verfügbar');await cache.put(url,response);}await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('nexentra-academy-login-')&&name!==CACHE)await caches.delete(name);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!urls.includes(url.href))return;
 event.respondWith(fetch(event.request).catch(async()=>await caches.match(event.request)||Response.error()));
});
