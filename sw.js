const CACHE='antar-obat-stage6b1-hf1a-cachefix-v2';
const STATIC=['./','./index.html','./manifest.webmanifest','./icons/logo-rsud.png','./icons/icon-192.png','./icons/icon-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC)));
  // Update tidak dipaksa aktif. User memilih "Muat Ulang Aman" agar transaksi aktif tidak terpotong.
});

self.addEventListener('message',event=>{
  if(event.data && event.data.type==='SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;

  if(event.request.mode==='navigate' || /\.(?:js|css|html)$/.test(url.pathname)){
    event.respondWith(fetch(event.request,{cache:'no-store'})
      .then(response=>{
        if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
        return response;
      })
      .catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
    return;
  }

  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
    return response;
  })));
});
