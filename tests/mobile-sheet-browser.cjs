/* Mobile stage 3: actual Chrome bottom-sheet geometry and interactions.
 * npm i --no-save playwright@1.56.1; node tests/mobile-sheet-browser.cjs
 */
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const assert=require("node:assert/strict"),{chromium}=require("playwright");
const root=process.cwd();
const types={".html":"text/html;charset=utf-8",".js":"text/javascript;charset=utf-8",
 ".css":"text/css;charset=utf-8",".json":"application/json;charset=utf-8"};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,"http://local.test");
 const pathname=decodeURIComponent(url.pathname==="/"?"/index.html":url.pathname);
 const file=path.resolve(root,"."+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("Not Found");return;
 }
 res.setHeader("Content-Type",types[path.extname(file)]||"application/octet-stream");
 fs.createReadStream(file).pipe(res);
});
const bookTitle="Erich Maria Remarque\\Drei Kameraden\\Kapitel 1\\";
const source=("Der Himmel war gelb wie Messing. Er erkannte das Haus.\n\n").repeat(110);
const saved={title:bookTitle,text:source,activeTextId:"a",aid:"B1",
 library:[{id:"a",title:bookTitle,text:source}],
 words:{himmel:{display:"Himmel",stage:0,reported:false,translation:"небо",next:0,correct:0,wrong:0}},
 results:{total:0,correct:0}};
const setData=({theme,saved})=>{
 localStorage.setItem("langrad-theme",theme);
 localStorage.setItem("langrad-v01",JSON.stringify(saved));
};
(async()=>{
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const url="http://127.0.0.1:"+server.address().port+"/";
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const theme of ["classic","tfr","loji"])for(const width of [320,375,430,768]){
   const height=780;
   const ctx=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1});
   await ctx.addInitScript(setData,{theme,saved});
   const page=await ctx.newPage(),errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   await page.goto(url,{waitUntil:"domcontentloaded",timeout:20000});
   await page.waitForFunction(()=>window.langradMobileSheet?.isMounted()&&window.langradMobileReader,null,{timeout:12000});
   const hidden=await page.evaluate(()=>{
    const a=document.querySelector("#lr-mobile-word-sheet");
    return {display:getComputedStyle(a).display,aria:a.getAttribute("aria-hidden"),inert:a.inert,
     parent:a.parentElement.tagName,detailCount:document.querySelectorAll("#detail").length};
   });
   assert.equal(hidden.display,"none",theme+" "+width+": unselected sheet visible");
   assert.equal(hidden.aria,"true");
   assert.equal(hidden.inert,true);
   assert.equal(hidden.detailCount,1);
   assert.equal(hidden.parent,"BODY");
   await page.locator("#reader .token").filter({hasText:/^Himmel$/}).first().click();
   await page.waitForFunction(()=>window.langradMobileSheet.isOpen());
   const geom=await page.evaluate(()=>{
    const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}};
    const sheet=document.querySelector("#lr-mobile-word-sheet");
    const backdrop=document.querySelector("#lr-mobile-sheet-backdrop");
    return {vw:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      modal:sheet.getAttribute("aria-modal"),role:sheet.getAttribute("role"),
      ariaLabel:sheet.getAttribute("aria-labelledby"),
      focused:document.activeElement.id,
      sheet:box(sheet),backdrop:box(backdrop),
      detail:box(document.querySelector("#detail")),
      close:box(document.querySelector("#lr-mobile-sheet-close")),
      mode:getComputedStyle(sheet).position,
      bodyOverflow:getComputedStyle(document.body).overflow,
      heading:document.querySelector("#lr-mobile-sheet-title").textContent,
      translated:document.querySelector("#detail .translation").textContent,
      page:window.langradPager.pageNumber(),
      y:scrollY
    };
   });
   assert.equal(geom.scrollWidth,width,theme+" "+width+": horizontal overflow");
   assert.equal(geom.mode,"fixed");
   assert.ok(Math.abs(geom.sheet.bottom-height)<2,theme+" "+width+": sheet not at bottom");
   assert.ok(geom.sheet.height<=height*.80,theme+" "+width+": sheet covers whole reader");
   assert.ok(geom.sheet.left>=-2&&geom.sheet.right<=width+2,theme+" "+width+": sheet escapes screen");
   assert.equal(geom.role,"dialog");
   assert.equal(geom.modal,"true");
   assert.equal(geom.focused,"lr-mobile-sheet-close");
   assert.equal(geom.heading,"Himmel");
   assert.equal(geom.translated,"небо");
   assert.equal(geom.bodyOverflow,"hidden");
   assert.ok(geom.detail.height>100,"detail content not scrollable region");
   assert.ok(geom.close.width>=38);
   assert.equal(geom.page,1);
   // Long grammar results must scroll INSIDE the sheet, not the book behind it.
   await page.evaluate(()=>{
    const more=document.createElement("p");
    more.textContent="Грамматика. ".repeat(800);
    document.querySelector("#detail").append(more);
    document.querySelector("#detail").scrollTop=280;
   });
   const scroll=await page.locator("#detail").evaluate(e=>({scrollTop:e.scrollTop,clientHeight:e.clientHeight,scrollHeight:e.scrollHeight}));
   assert.ok(scroll.scrollHeight>scroll.clientHeight+300,theme+" "+width+": grammar not scrollable");
   assert.ok(scroll.scrollTop>=200,theme+" "+width+": inner scroll failed");
   await page.locator("#lr-mobile-sheet-close").click();
   await page.waitForFunction(()=>!window.langradMobileSheet.isOpen());
   assert.equal(await page.locator("#lr-mobile-word-sheet").getAttribute("aria-hidden"),"true");
   await page.locator("#reader .token").filter({hasText:/^Himmel$/}).first().click();
   await page.locator("#study").click();
   const recorded=await page.evaluate(()=>JSON.parse(localStorage.getItem("langrad-v01")).words.himmel.stage);
   assert.equal(recorded,1,theme+" "+width+": study action failed");
   assert.equal(await page.evaluate(()=>window.langradMobileSheet.isOpen()),true);
   await page.keyboard.press("Escape");
   assert.equal(await page.evaluate(()=>window.langradMobileSheet.isOpen()),false);
   const snapshot=await page.evaluate(()=>({
     title:document.querySelector("#docTitle").textContent,
     text:JSON.parse(localStorage.getItem("langrad-v01")).library[0].text,
     page:window.langradPager.pageNumber()
   }));
   assert.equal(snapshot.title,bookTitle);
   assert.equal(snapshot.text,source);
   assert.equal(snapshot.page,1);
   assert.deepEqual(errors,[],theme+" "+width+": JS errors");
   console.log("PASS",theme,width+"px",
    JSON.stringify({sheetHeight:Math.round(geom.sheet.height),detailScroll:scroll.scrollTop,
     width:geom.scrollWidth,word:geom.heading}));
   await ctx.close();
  }
  // A non-mobile desktop and resize must keep the right column, with a
  // single original #detail and no modal presentation.
  const ctx=await browser.newContext({viewport:{width:375,height:780}});
  await ctx.addInitScript(setData,{theme:"classic",saved});
  const page=await ctx.newPage();
  await page.goto(url,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>window.langradMobileSheet?.isMounted());
  await page.locator("#reader .token").filter({hasText:/^Himmel$/}).first().click();
  assert.equal(await page.evaluate(()=>window.langradMobileSheet.isOpen()),true);
  await page.setViewportSize({width:1200,height:800});
  await page.waitForFunction(()=>!window.langradMobileSheet.isMounted());
  assert.equal(await page.locator(".layout > aside.details #detail").count(),1);
  assert.equal(await page.evaluate(()=>document.querySelector("#lr-mobile-word-sheet").getAttribute("role")),null);
  assert.equal(await page.locator("#lr-mobile-sheet-backdrop").isVisible(),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),1200);
  await page.setViewportSize({width:375,height:780});
  await page.waitForFunction(()=>window.langradMobileSheet.isMounted());
  await page.locator("#reader .token").filter({hasText:/^Himmel$/}).first().click();
  assert.equal(await page.evaluate(()=>window.langradMobileSheet.isOpen()),true);
  console.log("PASS resize phone → desktop → phone, one original word detail");
  await ctx.close();
  console.log("MOBILE WORD SHEET BROWSER: ALL PASS");
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error("FAIL",error.stack);server.close();process.exit(1)});
