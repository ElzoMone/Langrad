/* Langrad PWA Stage 5 — Chromium manifest, service worker and offline test.
 * node tests/pwa-browser.cjs (requires playwright@1.56.1)
 */
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const assert=require("node:assert/strict"),{chromium}=require("playwright");
const root=process.cwd();
const mime={
 ".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
 ".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",
 ".json":"application/json; charset=utf-8",".webmanifest":"application/manifest+json"
};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,"http://localhost");
 const p=decodeURIComponent(url.pathname==="/"?"/index.html":url.pathname);
 const file=path.resolve(root,"."+p);
 if(req.method!=="GET"||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("Not found");return;
 }
 res.setHeader("Content-Type",mime[path.extname(file)]||"application/octet-stream");
 if(p==="/sw.js")res.setHeader("Cache-Control","no-cache, no-store, must-revalidate");
 else res.setHeader("Cache-Control","no-cache");
 fs.createReadStream(file).pipe(res);
});
const text="Der Himmel war gelb. Er erkannte die Stadt. \n".repeat(35);
const title="Erich Maria Remarque\\Drei Kameraden\\Kapitel 1\\";
const stored={title,text,aid:"B1",activeTextId:"book",library:[{id:"book",title,text}],
 words:{himmel:{display:"Himmel",stage:2,translation:"небо",reported:false,correct:0,wrong:0,next:0}},
 results:{total:3,correct:2}};
(async()=>{
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 const origin="http://127.0.0.1:"+server.address().port;
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const ctx=await browser.newContext({viewport:{width:375,height:780},isMobile:true,hasTouch:true,serviceWorkers:"allow"});
  await ctx.addInitScript(({stored})=>{
   localStorage.setItem("langrad-theme","classic");
   localStorage.setItem("langrad-v01",JSON.stringify(stored));
   localStorage.setItem("lr-ai-key","this-is-a-test-value-never-cache");
  },{stored});
  const page=await ctx.newPage();
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(origin+"/",{waitUntil:"domcontentloaded",timeout:30000});
  await page.waitForFunction(()=>window.langradPwa&&navigator.serviceWorker?.controller&&window.langradPwa.isOfflineReady(),null,{timeout:25000});
  const manifest=await page.evaluate(async()=>{
   const res=await fetch("/manifest.webmanifest");
   return {status:res.status,contentType:res.headers.get("content-type"),body:await res.json()};
  });
  assert.equal(manifest.status,200);
  assert.equal(manifest.body.short_name,"Langrad");
  assert.equal(manifest.body.start_url,"/");
  assert.equal(manifest.body.scope,"/");
  assert.equal(manifest.body.display,"standalone");
  assert.ok(manifest.body.icons.some(x=>x.sizes==="192x192"));
  assert.ok(manifest.body.icons.some(x=>x.sizes==="512x512"&&x.purpose==="any"));
  assert.ok(manifest.body.icons.some(x=>x.purpose==="maskable"));
  for(const icon of manifest.body.icons){
   const response=await page.request.get(origin+icon.src);
   assert.equal(response.status(),200,icon.src);
   assert.equal(response.headers()["content-type"],"image/png");
   const buffer=await response.body();
   assert.equal(buffer[0],137);
   assert.equal(buffer[1],80);
   assert.equal(buffer[2],78);
   assert.equal(buffer[3],71);
   const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20);
   const expected=Number(icon.sizes.split("x")[0]);
   assert.equal(width,expected);assert.equal(height,expected);
  }
  const apple=await page.request.get(origin+"/icons/apple-touch-icon.png");
  assert.equal(apple.status(),200);
  assert.equal((await apple.body()).readUInt32BE(16),180);
  assert.equal(await page.locator('link[rel="manifest"]').getAttribute("href"),"/manifest.webmanifest");
  assert.equal(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute("content"),"yes");
  const status=page.locator("#lr-pwa-status");
  assert.ok((await status.textContent()).includes("Офлайн-интерфейс готов"));
  assert.equal(await page.locator('#settings .lr-mobile-settings-group[data-section="lr-pwa-settings"]').count(),1);
  console.log("PASS install manifest, PNG icons, iOS metadata, registered and controlling service worker");

  const cached=await page.evaluate(async()=>{
   const keys=await caches.keys();
   const shell=await caches.open(keys.find(x=>x.includes("shell-")));
   return {keys,root:!!await shell.match("/"),base:!!await shell.match("/dictionary.json"),
    css:!!await shell.match("/pwa.css"),js:!!await shell.match("/pwa.js"),
    icon:!!await shell.match("/icons/langrad-192.png")};
  });
  assert.equal(cached.keys.length,2);
  assert.ok(cached.root&&cached.css&&cached.js&&cached.icon);
  assert.ok(cached.base,"Base dictionary must be cached for offline word translations");
  await page.evaluate(async()=>{
   const response=await fetch("/dict/er.json");
   if(!response.ok)throw new Error("Test shard missing");
   await response.arrayBuffer();
  });
  await page.waitForFunction(async()=>{
   const keys=await caches.keys();
   const cache=await caches.open(keys.find(k=>k.includes("dict-")));
   return !!await cache.match("/dict/er.json");
  },null,{timeout:9000});
  console.log("PASS offline app shell, core dictionary and on-demand shard caching");

  await ctx.setOffline(true);
  await page.reload({waitUntil:"domcontentloaded",timeout:25000});
  await page.waitForFunction(()=>window.langradPwa&&navigator.serviceWorker?.controller&&!!document.querySelector("header nav [data-tab='library']"),null,{timeout:18000});
  const offline=await page.evaluate(async()=>{
   const base=await fetch("/dictionary.json");
   const shard=await fetch("/dict/er.json");
   return {url:location.href,base:base.ok,shard:shard.ok,
     sw:Boolean(navigator.serviceWorker.controller),
     title:document.getElementById("docTitle").textContent,
     text:JSON.parse(localStorage.getItem("langrad-v01")).library[0].text,
     translation:JSON.parse(localStorage.getItem("langrad-v01")).words.himmel.translation,
     offline:navigator.onLine===false};
  });
  assert.ok(offline.sw&&offline.base&&offline.shard);
  assert.equal(offline.title,title);
  assert.equal(offline.text,text);
  assert.equal(offline.translation,"небо");
  assert.equal(offline.offline,true);
  await page.locator('header nav [data-tab="library"]').click();
  await page.waitForFunction(()=>!document.querySelector("#library").classList.contains("hidden"));
  assert.ok(await page.locator("#lr-library-list").textContent().then(s=>s.includes("Drei Kameraden")));
  await page.locator('header nav [data-tab="words"]').click();
  assert.ok((await page.locator("#wordList").textContent()).includes("Himmel"));
  await page.locator('header nav [data-tab="read"]').click();
  const bookToken=page.locator("#reader .token").filter({hasText:/^Himmel$/}).first();
  await bookToken.click();
  assert.equal(await page.evaluate(()=>window.langradMobileSheet.isOpen()),true);
  await page.locator("#lr-mobile-sheet-close").click();
  console.log("PASS true offline reload, cached German dictionary, library, words and sheet");

  await ctx.setOffline(false);
  const themes={classic:"#f4f8fa",tfr:"#171022",loji:"#10080c"};
  await page.locator('header nav [data-tab="settings"]').click();
  for(const [theme,color] of Object.entries(themes)){
   await page.locator("#lr-theme-select").selectOption(theme);
   assert.equal(await page.locator('meta[name="theme-color"]').getAttribute("content"),color);
  }
  assert.deepEqual(errors,[]);
  console.log("PASS theme-matched browser chrome, no JavaScript errors");
  await ctx.close();
  console.log("PWA CHROMIUM: ALL PASS");
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error("FAIL",error.stack);server.close();process.exit(1)});
