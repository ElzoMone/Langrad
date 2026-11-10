/* Langrad Mobile Stage 4 — real Chromium layouts and functional smoke tests.
 * npm i --no-save playwright@1.56.1 && node tests/mobile-sections-browser.cjs
 */
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const assert=require("node:assert/strict"),{chromium}=require("playwright");
const root=process.cwd();
const mime={".html":"text/html;charset=utf-8",".js":"text/javascript;charset=utf-8",".css":"text/css;charset=utf-8",".json":"application/json;charset=utf-8"};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,"http://local.test").pathname);
 const file=path.resolve(root,"."+(pathname==="/"?"/index.html":pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end("Not Found");return}
 res.setHeader("Content-Type",mime[path.extname(file)]||"application/octet-stream");
 fs.createReadStream(file).pipe(res);
});
const longTitle="Erich Maria Remarque\\Drei Kameraden\\Kapitel 1\\";
const book=("Der Himmel war gelb wie Messing. Er erkannte seinen Freund. \n\n").repeat(85);
const initial={title:longTitle,text:book,activeTextId:"a",aid:"B1",
 library:[{id:"a",title:longTitle,text:book},
  {id:"b",title:"Wissenschaft · Sterne",text:"Die Astronauten sehen viele Sterne."},
  {id:"c",title:"Geschichte · Berlin",text:"Berlin hat eine lange Geschichte."}],
 words:{
  himmel:{display:"Himmel",stage:2,reported:false,translation:"небо",correct:1,wrong:0,next:0},
  rauch:{display:"Rauch",stage:1,reported:false,translation:"дым",correct:0,wrong:0,next:0},
  messing:{display:"Messing",stage:3,reported:true,translation:"латунь",correct:3,wrong:1,next:0}},
 results:{total:8,correct:6}};
(async()=>{
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 const site="http://127.0.0.1:"+server.address().port+"/";
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
 for(const theme of ["classic","tfr","loji"])for(const width of [320,375,430,768]){
  const ctx=await browser.newContext({viewport:{width,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await ctx.addInitScript(({theme,initial})=>{
   localStorage.setItem("langrad-theme",theme);
   localStorage.setItem("langrad-v01",JSON.stringify(initial));
  },{theme,initial});
  const page=await ctx.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("dialog",async dlg=>{await dlg.accept("Neuer Titel")});
  await page.goto(site,{waitUntil:"domcontentloaded",timeout:20000});
  await page.waitForFunction(()=>!!window.langradMobileSections&&!!window.langradMobileSheet,null,{timeout:14000});
  const nav='header nav.topnav';
  async function go(name){
   await page.locator(nav+' [data-tab="'+name+'"]').click();
   await page.waitForFunction(n=>!document.getElementById(n).classList.contains("hidden"),name);
  }
  async function noOverflow(where){
   const info=await page.evaluate(()=>{
    const doc=document.documentElement;
    return {vw:doc.clientWidth,scroll:doc.scrollWidth,inner:innerWidth,nav:document.querySelector("header nav").getBoundingClientRect().bottom};
   });
   assert.equal(info.scroll,width,theme+" "+width+" "+where+": horizontal overflow "+JSON.stringify(info));
   assert.ok(Math.abs(info.nav-780)<2,theme+" "+width+" "+where+": bottom nav moved");
  }
  await go("library");
  await noOverflow("library");
  const lib=await page.evaluate(()=>{
   const entries=[...document.querySelectorAll("#lr-library-list .lr-library-entry")];
   return {list:entries.map(x=>{
    const buttons=[...x.querySelectorAll(".lr-library-actions button")].map(b=>b.getBoundingClientRect());
    return {title:x.querySelector(".lr-library-title").textContent,
      width:x.getBoundingClientRect().width,
      touchTargets:buttons.map(r=>({width:r.width,height:r.height,right:r.right,left:r.left}))};
   }),
   search:document.querySelector("#lr-mobile-library-search").getBoundingClientRect().height,
   count:document.querySelector("#lr-mobile-library-count").textContent};
  });
  assert.equal(lib.list.length,3);
  assert.equal(lib.count,"3 текстов");
  assert.ok(lib.search>=42);
  for(const item of lib.list){
   assert.ok(item.width>width*.65);
   for(const button of item.touchTargets){
    assert.ok(button.width>=52&&button.height>=42,theme+" "+width+": library action too small");
    assert.ok(button.left>=-1&&button.right<=width+1,theme+": action outside screen");
   }
  }
  await page.locator("#lr-mobile-library-search").fill("sterne");
  await page.waitForFunction(()=>document.querySelector("#lr-mobile-library-count").textContent.startsWith("1 из"));
  assert.equal(await page.locator("#lr-library-list .lr-library-entry:visible").count(),1);
  await page.locator("#lr-mobile-library-tools .lr-mobile-clear").click();
  await page.waitForFunction(()=>document.querySelector("#lr-mobile-library-count").textContent==="3 текстов");
  const opened=page.locator("#lr-library-list .lr-library-entry").filter({hasText:"Sterne"});
  await opened.locator(".lr-library-actions button").first().click();
  assert.equal(await page.locator("#docTitle").textContent(),"Wissenschaft · Sterne");
  await go("words");await noOverflow("words");
  const wl=page.locator("#wordSearch");
  await wl.fill("himmel");
  await page.waitForFunction(()=>document.querySelector("#lr-mobile-word-count").textContent==="1 слово");
  assert.equal(await page.locator("#wordList .table-entry").count(),1);
  await page.locator("#lr-mobile-words-tools .lr-mobile-clear").click();
  await page.waitForFunction(()=>document.querySelector("#lr-mobile-word-count").textContent==="3 слов");
  const wordsGeom=await page.evaluate(()=>[...document.querySelectorAll("#wordList .table-entry")].map(x=>x.getBoundingClientRect().width));
  assert.ok(wordsGeom.every(w=>w>width*.65));
  await go("stats");await noOverflow("stats");
  const stats=await page.evaluate(()=>({
   values:[...document.querySelectorAll("#stats .stat strong")].map(x=>x.textContent),
   tiles:[...document.querySelectorAll("#stats .stat")].map(x=>({w:x.getBoundingClientRect().width,h:x.getBoundingClientRect().height})),
   accuracy:document.querySelector("#accuracy").textContent
  }));
  assert.deepEqual(stats.values,["3","2","1"]);
  assert.equal(stats.accuracy,"75% правильных ответов из 8 проверок.");
  assert.ok(stats.tiles.every(x=>x.w>70&&x.h>=95));
  await go("practice");await noOverflow("practice");
  await page.locator("#startQuiz").click();
  const options=await page.locator("#quiz .choice").evaluateAll(nodes=>nodes.map(n=>{
   const r=n.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right};
  }));
  assert.ok(options.length>=2);
  assert.ok(options.every(o=>o.height>=48&&o.width>width*.6));
  assert.ok(options.every(o=>o.right<=width+1&&o.left>=-1));
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem("langrad-v01")).results.total);
  await page.locator("#quiz .choice").first().click();
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem("langrad-v01")).results.total);
  assert.equal(after,before+1);
  await go("settings");await noOverflow("settings");
  const setup=await page.evaluate(()=>{
   const settings=document.getElementById("settings");
   const groups=[...settings.querySelectorAll(":scope > .lr-mobile-settings-group")];
   return {groups:groups.map(x=>({name:x.querySelector("summary").textContent,opened:x.open,
    rect:x.getBoundingClientRect().width})),
    backup:settings.querySelector("#backup").getBoundingClientRect().height,
    selectors:[settings.querySelectorAll("#lr-theme-select").length,settings.querySelectorAll("#lr-ai-key").length,settings.querySelectorAll("#lr-wty-install").length]
   };
  });
  assert.ok(setup.groups.length>=4);
  assert.ok(setup.groups.every(x=>x.rect<=width));
  assert.ok(setup.backup>=44);
  assert.deepEqual(setup.selectors,[1,1,1]);
  const wty=page.locator('#settings .lr-mobile-settings-group[data-section="lr-wty-settings"]');
  await wty.locator('summary').click();
  await page.locator("#lr-wty-install").waitFor({state:"visible"});
  await noOverflow("WTY settings");
  await page.locator('#settings .lr-mobile-settings-group[data-section="lr-ai-settings"] > summary').click();
  await page.locator("#lr-ai-key").waitFor({state:"visible"});
  await noOverflow("AI settings");
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem("langrad-v01")));
  assert.equal(stored.library.length,3);
  assert.equal(stored.library[0].title,longTitle);
  assert.equal(stored.library[0].text,book);
  assert.equal(stored.words.himmel.translation,"небо");
  assert.deepEqual(errors,[],theme+" "+width+" runtime errors");
  console.log("PASS",theme,width+"px",JSON.stringify({
   books:lib.list.length,words:wordsGeom.length,quiz:options.length,groups:setup.groups.length,overflow:false
  }));
  await ctx.close();
 }
 // A responsive resize should restore original settings nodes and search input.
 const ctx=await browser.newContext({viewport:{width:375,height:780}});
 await ctx.addInitScript(data=>{localStorage.setItem("langrad-theme","classic");localStorage.setItem("langrad-v01",JSON.stringify(data));},initial);
 const page=await ctx.newPage();
 await page.goto(site,{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>window.langradMobileSections&&document.documentElement.dataset.mobileSections==="true");
 await page.setViewportSize({width:1200,height:800});
 await page.waitForFunction(()=>document.documentElement.dataset.mobileSections==="false");
 assert.equal(await page.locator("#settings > #lr-wty-settings").count(),1);
 assert.equal(await page.locator("#settings > #lr-theme-settings").count(),1);
 assert.equal(await page.locator("#words > #wordSearch").count(),1);
 assert.equal(await page.locator("#settings > .lr-mobile-settings-group").count(),0);
 await page.setViewportSize({width:375,height:780});
 await page.waitForFunction(()=>document.documentElement.dataset.mobileSections==="true");
 assert.equal(await page.locator("#settings .lr-mobile-settings-group #lr-theme-select").count(),1);
 assert.equal(await page.locator("#lr-mobile-words-tools #wordSearch").count(),1);
 assert.equal(await page.locator("#settings .lr-mobile-settings-group #lr-wty-install").count(),1);
 console.log("PASS responsive phone → desktop → phone restores all live settings controls");
 await ctx.close();
 console.log("MOBILE STAGE 4 CHROMIUM: ALL PASS");
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error("FAIL",e.stack);server.close();process.exit(1)});
