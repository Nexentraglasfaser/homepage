const CACHE='nexentra-academy-login-2026-11-28-2';
const scope=new URL(self.registration.scope);
const index=new URL('index.html',scope);
const files=['index.html','login.js','login.css','style.css','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png'];
const paths=new Set(files.map(file=>new URL(file,scope).pathname));

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.all(files.map(async file=>{
      const url=new URL(file,scope);
      const response=await fetch(url,{cache:'reload'});
      if(!response.ok||response.redirected)throw Error('Login noch nicht verfügbar');
      await cache.put(url,response);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const name of await caches.keys()){
      if(name.startsWith('nexentra-academy-login-')&&name!==CACHE)await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const {request}=event;
  const url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  const isEntry=request.mode==='navigate'&&(url.pathname===scope.pathname||url.pathname===index.pathname);
  if(!isEntry&&(!paths.has(url.pathname)||url.search))return;
  const canonical=isEntry?index.href:url.origin+url.pathname;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    return await cache.match(canonical)||fetch(request);
  })());
});
