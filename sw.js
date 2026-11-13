/* Langrad offline shell / mobile stage 5.
 * Only public same-origin app files and explicitly fetched dictionary shards
 * may enter CacheStorage. Personal books, vocabulary and API keys remain in
 * browser storage; Gemini, third-party requests and POSTs are never cached.
 *
 * Bump VERSION when changing offline behavior. HTML/CSS/JS are network-first
 * even without bumping, so new site deployments are not held hostage by SW.
 */
const VERSION="2026-11-13-public-books";
const PREFIX="langrad-pwa-";
const SHELL_CACHE=PREFIX+"shell-"+VERSION;
const DICT_CACHE=PREFIX+"dict-"+VERSION;
const MAX_DICT_SHARDS=36;
const CORE=[
 "/",
 "/manifest.webmanifest",
 "/icons/langrad.svg",
 "/icons/langrad-192.png",
 "/icons/langrad-512.png",
 "/icons/langrad-maskable-512.png",
 "/icons/apple-touch-icon.png",
 "/reader-layout.css",
 "/loji-theme.css",
 "/loji-machine.css",
 "/loji-observation.css",
 "/word-status.css",
 "/classic-refresh.css",
 "/classic-details.css",
 "/mobile-shell.css",
 "/mobile-reader.css",
 "/mobile-sheet.css",
 "/mobile-sections.css",
 "/pwa.css",
 "/discover.css",
 "/reader-lexicon.js",
 "/reader-pagination.js",
 "/loji-interface.js",
 "/loji-observation.js",
 "/word-status.js",
 "/classic-refresh.js",
 "/classic-details.js",
 "/mobile-shell.js",
 "/mobile-reader.js",
 "/mobile-sheet.js",
 "/mobile-sections.js",
 "/pwa.js",
 "/reading-session.css",
 "/reading-session.js",
 "/books/text-pipeline.js",
 "/books/epub.js",
 "/books/private-library.js",
 "/books/private-library.css",
 "/books/public-catalog.js",
 "/books/public-catalog.css",
 "/discover.js"
];
const OPTIONAL=[
 "/dictionary.json",
 "/dictionary-meta.json",
 "/dict/manifest.json",
 "/discover.json",
 "/discover-series.json",
 "/books/de-frequency.txt",
 "/books/public-covers.json",
 "/books/public-vocabulary.json",
 "/books/catalog.json"
];
const SHELL_PATHS=new Set([...CORE,...OPTIONAL,"/index.html"]);
const isDictionary=(path)=>{
 // German shard names may contain umlauts/ß (percent-encoded in URLs).
 // Accept only a single safe JSON basename inside these public directories.
 try {
  return /^\/(?:dict|forms)\/[\p{L}\p{N}_-]+\.json$/u.test(decodeURIComponent(path));
 }catch(_){return false}
};
const isCacheable=(response)=>response&&response.ok&&response.type!=="opaque";
async function save(cacheName,key,response){
 if(!isCacheable(response))return;
 try{
  const cache=await caches.open(cacheName);
  await cache.put(key,response.clone());
  if(cacheName===DICT_CACHE){
   const keys=await cache.keys();
   while(keys.length>MAX_DICT_SHARDS){
    await cache.delete(keys.shift());
   }
  }
 }catch(error){
  // Storage may be full or blocked. Online reading must still work.
 }
}
self.addEventListener("install",event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(SHELL_CACHE);
  // Mandatory app shell: failures must block activation of a broken offline
  // version. Optional dictionaries may be missing on new deployments.
  await cache.addAll(CORE);
  await Promise.allSettled(OPTIONAL.map(async path=>{
   const response=await fetch(path,{cache:"no-store"});
   await save(SHELL_CACHE,path,response);
  }));
  await self.skipWaiting();
 })());
});
self.addEventListener("activate",event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==SHELL_CACHE&&k!==DICT_CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
 })());
});
async function networkFirst(request,{navigation=false,dictionary=false}={}){
 const url=new URL(request.url);
 const key=navigation?"/":request;
 const cacheName=dictionary?DICT_CACHE:SHELL_CACHE;
 try{
  const response=await fetch(request);
  if(isCacheable(response)){
   // App pages are cached only as "/", even if opened with tracking params.
   // Other resources keep their exact same-origin path.
   await save(cacheName,key,response);
  }
  return response;
 }catch(_){
  const cached=await caches.match(key);
  if(cached)return cached;
  if(navigation){
   const fallback=await caches.match("/");
   if(fallback)return fallback;
  }
  return Response.error();
 }
}
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 const path=url.pathname;
 if(request.mode==="navigate"){
  // Never turn unknown routes into cached copies of private documents.
  if(path==="/"||path==="/index.html")
   event.respondWith(networkFirst(request,{navigation:true}));
  return;
 }
 if(SHELL_PATHS.has(path)){
  event.respondWith(networkFirst(request));
  return;
 }
 if(isDictionary(path)){
  event.respondWith(networkFirst(request,{dictionary:true}));
 }
 // API routes, other downloads, extensions and third-party calls are untouched.
});
self.addEventListener("message",event=>{
 if(event.data?.type!=="LANGRAD_PWA_STATUS"||!event.ports?.[0])return;
 event.waitUntil((async()=>{
  const shell=await caches.open(SHELL_CACHE);
  const dict=await caches.open(DICT_CACHE);
  const root=await shell.match("/");
  const baseDict=await shell.match("/dictionary.json");
  const shards=await dict.keys();
  event.ports[0].postMessage({
   type:"LANGRAD_PWA_STATUS",
   shellReady:Boolean(root),
   baseDictionaryReady:Boolean(baseDict),
   cachedShards:shards.length,
   version:VERSION
  });
 })());
});
