/* Real Chromium mobile reader layout + interactions.
 * node tests/mobile-reader-browser.cjs (requires playwright@1.56.1)
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const {chromium}=require("playwright");
const cwd=process.cwd();
const mime={".html":"text/html;charset=utf-8",".js":"text/javascript;charset=utf-8",
 ".css":"text/css;charset=utf-8",".json":"application/json;charset=utf-8"};
const server=http.createServer((req,res)=>{
 const uri=new URL(req.url,"http://local.test");
 const file=path.resolve(cwd,"."+decodeURIComponent(uri.pathname==="/"?"/index.html":uri.pathname));
 if(!file.startsWith(cwd+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("Not Found");return;
 }
 res.setHeader("Content-Type",mime[path.extname(file)]||"application/octet-stream");
 fs.createReadStream(file).pipe(res);
});
const title="Erich Maria Remarque\\Drei Kameraden\\Kapitel 1\\";
const text=("Der Himmel war gelb wie Messing. Er erkannte seinen Freund. \n\n").repeat(80);
const stored={title,text,activeTextId:"one",aid:"B1",
 library:[{id:"one",title,text}],words:{himmel:{display:"Himmel",stage:1,translation:"небо",next:0,correct:0,wrong:0}},
 results:{total:0,correct:0}};
(async()=>{
 await new Promise(done=>server.listen(0,"127.0.0.1",done));
 const url="http://127.0.0.1:"+server.address().port+"/";
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const theme of ["classic","tfr","loji"])for(const width of [320,375,430,768]){
   const ctx=await browser.newContext({viewport:{width,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:1});
   await ctx.addInitScript(({theme,stored})=>{
    localStorage.setItem("langrad-theme",theme);
    localStorage.setItem("langrad-v01",JSON.stringify(stored));
   },{theme,stored});
   const page=await ctx.newPage();const errs=[];
   page.on("pageerror",e=>errs.push(String(e)));
   await page.goto(url,{waitUntil:"domcontentloaded"});
   await page.waitForFunction(()=>!!window.langradMobileReader&&document.documentElement.dataset.mobileReaderReady==="true",null,{timeout:10000});
   const info=await page.evaluate(()=>{
    const rect=sel=>{
     const r=document.querySelector(sel).getBoundingClientRect();
     return {top:r.top,bottom:r.bottom,width:r.width,height:r.height};
    };
    const css=getComputedStyle(document.querySelector("#reader"));
    return {vw:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,
      header:rect("body>header"),bar:rect("#lr-mobile-reader-controls"),text:rect("#reader"),
      readerFont:css.fontSize,readerLine:css.lineHeight,
      modeHidden:!document.querySelector("#lr-mobile-reader-settings").open,
      actionsHidden:!document.querySelector("#lr-mobile-reader-actions").open,
      pagerParent:document.querySelector("#lr-page-nav-top").parentElement.id,
      levelParent:document.querySelector("#lr-level-panel").parentElement.id,
      content:document.querySelector("#docTitle").textContent};
   });
   assert.equal(info.scroll,width,theme+" "+width+": horizontal overflow");
   assert.equal(info.pagerParent,"lr-mobile-navline",theme+": pager missing");
   assert.equal(info.levelParent,"lr-mobile-reader-settings",theme+": level missing");
   assert.equal(info.readerFont,"20px",theme+": wrong initial font");
   assert.equal(info.readerLine,"36px",theme+": wrong initial line spacing");
   assert.ok(info.modeHidden&&info.actionsHidden,theme+": settings open unexpectedly");
   assert.ok(info.text.top<375,theme+" "+width+": book text starts too low: "+info.text.top);
   assert.equal(info.content,title,theme+": user title mutated");
   await page.locator("#lr-mobile-font-up").click();
   assert.equal(await page.locator("#reader").evaluate(el=>getComputedStyle(el).fontSize),"21px");
   await page.locator("#lr-mobile-reader-settings > summary").click();
   await page.locator("#lr-mobile-line-height").selectOption("2.05");
   assert.equal(await page.locator("#reader").evaluate(el=>getComputedStyle(el).lineHeight),"43.05px");
   assert.equal(await page.locator("#lr-mobile-reader-settings #aid").count(),1);
   await page.locator("#lr-mobile-reader-settings #aid").selectOption("A2");
   assert.equal(await page.locator("#lr-mobile-reader-settings #aid").inputValue(),"A2");
   const before=await page.evaluate(()=>window.langradPager.pageNumber());
   await page.locator('#lr-mobile-navline #lr-page-nav-top button:last-child').click();
   const after=await page.evaluate(()=>window.langradPager.pageNumber());
   assert.equal(after,before+1,theme+": next-page button not working");
   await page.waitForFunction(n=>document.querySelector("#lr-mobile-pages").textContent.startsWith("Стр. "+n+" /"),after);
   await page.evaluate(()=>{
    const node=document.querySelector("#reader");
    const start=new Event("touchstart",{bubbles:true});
    Object.defineProperty(start,"touches",{value:[{clientX:260,clientY:230}]});
    node.dispatchEvent(start);
    const end=new Event("touchend",{bubbles:true});
    Object.defineProperty(end,"changedTouches",{value:[{clientX:75,clientY:243}]});
    node.dispatchEvent(end);
   });
   assert.equal(await page.evaluate(()=>window.langradPager.pageNumber()),after+1,theme+": swipe failed");
   const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("langrad-v01")));
   assert.equal(saved.title,title);
   assert.equal(saved.library[0].text,text);
   assert.equal(saved.words.himmel.translation,"небо");
   const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem("langrad-mobile-reading-v1")));
   assert.equal(prefs.size,21);
   assert.equal(prefs.leading,2.05);
   assert.deepEqual(errs,[],theme+" browser errors");
   console.log("PASS",theme,width+"px",
    JSON.stringify({textStarts:Math.round(info.text.top),header:info.header.height,bar:Math.round(info.bar.height),reader:"20px / 1.8",controls:"working"}));
   await ctx.close();
  }
  // Ensure our stage does not mutate desktop layout even after viewport changes.
  const ctx=await browser.newContext({viewport:{width:375,height:790},isMobile:false});
  await ctx.addInitScript(x=>{localStorage.setItem("langrad-theme","classic");localStorage.setItem("langrad-v01",JSON.stringify(x))},stored);
  const page=await ctx.newPage();
  await page.goto(url,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>!!window.langradMobileReader&&document.documentElement.dataset.mobileReaderReady==="true");
  await page.setViewportSize({width:1100,height:800});
  await page.waitForFunction(()=>!document.documentElement.dataset.mobileReaderReady);
  const desktop=await page.evaluate(()=>({
   pager:document.querySelector("#lr-page-nav-top").parentElement.id,
   level:document.querySelector("#lr-level-panel").parentElement.id,
   actions:document.querySelector("#addText").parentElement.parentElement.id,
   mobileBar:getComputedStyle(document.querySelector("#lr-mobile-reader-controls")).display,
   overflow:document.documentElement.scrollWidth,
   text:document.querySelector("#docTitle").textContent
  }));
  assert.equal(desktop.pager,"lr-classic-reader-tools");
  assert.equal(desktop.level,"lr-classic-reader-tools");
  assert.equal(desktop.actions,"read");
  assert.equal(desktop.mobileBar,"none");
  assert.equal(desktop.overflow,1100);
  assert.equal(desktop.text,title);
  await page.setViewportSize({width:375,height:790});
  await page.waitForFunction(()=>document.documentElement.dataset.mobileReaderReady==="true");
  assert.equal(await page.locator("#lr-mobile-navline #lr-page-nav-top").count(),1);
  console.log("PASS resize phone → desktop → phone: original controls restored correctly");
  await ctx.close();
  console.log("MOBILE READER BROWSER: ALL PASS");
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error("FAIL",e.stack);server.close();process.exit(1)});
