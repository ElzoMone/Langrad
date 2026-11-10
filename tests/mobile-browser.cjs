/* Langrad mobile layout smoke test with real Chromium.
 * npm i --no-save playwright@1.56.1 && npx playwright install chromium
 * node tests/mobile-browser.cjs
 * Tests real CSS bounding boxes at phone/tablet/desktop widths.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const http=require("node:http");
const {chromium}=require("playwright");
const root=process.cwd();
const mime={".html":"text/html;charset=utf-8",".js":"text/javascript;charset=utf-8",
 ".css":"text/css;charset=utf-8",".json":"application/json;charset=utf-8",
 ".txt":"text/plain;charset=utf-8",".zip":"application/zip"};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,"http://localhost");
 let file=path.resolve(root,"."+decodeURIComponent(url.pathname==="/"?"/index.html":url.pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("Not Found");return;
 }
 res.setHeader("Content-Type",mime[path.extname(file)]||"application/octet-stream");
 fs.createReadStream(file).pipe(res);
});
const sampleTitle="Erich Maria Remarque\\Drei Kameraden\\Kapitel 1\\";
const sample={
 title:sampleTitle,
 text:("Der Himmel war gelb wie Messing. Er erkannte seinen Freund.\n\n").repeat(70),
 activeTextId:"a",aid:"B1",library:[],words:{},results:{total:0,correct:0}
};
sample.library=[{id:"a",title:sample.title,text:sample.text}];
const themes=["classic","tfr","loji"];
const widths=[320,375,430,768];
(async()=>{
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const port=server.address().port;
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const theme of themes)for(const width of widths){
   const ctx=await browser.newContext({viewport:{width,height:740},isMobile:true,hasTouch:true,deviceScaleFactor:1});
   await ctx.addInitScript(({theme,sample})=>{
    localStorage.setItem("langrad-theme",theme);
    localStorage.setItem("langrad-v01",JSON.stringify(sample));
   },{theme,sample});
   const page=await ctx.newPage();
   const errors=[];page.on("pageerror",e=>errors.push(String(e)));
   await page.goto("http://127.0.0.1:"+port+"/",{waitUntil:"domcontentloaded"});
   await page.waitForFunction(()=>!!window.langradMobileShell && !!document.querySelector('[data-tab="library"]'),null,{timeout:10000});
   const info=await page.evaluate(()=>{
    const rect=x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};
    const nav=document.querySelector("header > nav.topnav");
    const head=document.querySelector("body > header");
    const main=document.querySelector(".layout > main");
    const btns=[...nav.querySelectorAll("button[data-tab]")];
    return {vw:innerWidth,screenWidth:document.documentElement.scrollWidth,
      header:rect(head),nav:rect(nav),main:rect(main),
      position:getComputedStyle(nav).position,buttons:btns.map(b=>({label:b.dataset.mobileLabel,rect:rect(b)})),
      documentTitle:document.querySelector("#docTitle")?.textContent,
      active:btns.filter(b=>b.classList.contains("active")).map(b=>b.dataset.tab)};
   });
   assert.ok(info.header.height<=67,theme+" "+width+": header too tall: "+info.header.height);
   assert.equal(info.position,"fixed",theme+" "+width+": nav is not fixed");
   assert.ok(Math.abs(info.nav.bottom-740)<2,theme+" "+width+": tab bar isn't at viewport bottom");
   assert.ok(info.nav.height>=65&&info.nav.height<120,theme+" "+width+": bad tabbar size");
   assert.equal(info.buttons.length,6,theme+" "+width+": missing navigation");
   assert.ok(info.buttons.every(b=>b.rect.width>=44),theme+" "+width+": too-small touch targets");
   assert.equal(info.screenWidth,width,theme+" "+width+": horizontal page overflow "+info.screenWidth);
   assert.equal(info.documentTitle,sampleTitle,theme+" "+width+": book title changed");
   assert.deepEqual(info.active,["read"]);
   const lib=page.locator('header nav [data-tab="library"]');
   await lib.click();
   await page.waitForFunction(()=>!document.querySelector("#library").classList.contains("hidden"));
   const curr=await page.locator('header nav [data-tab="library"]').getAttribute("aria-current");
   assert.equal(curr,"page",theme+" "+width+": active nav accessibility lost");
   // At the actual scroll bottom, the fixed bar must not cover the footer.
   await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
   const bottom=await page.evaluate(()=>{
    const nav=document.querySelector("header > nav.topnav").getBoundingClientRect();
    const foot=document.querySelector(".foot")?.getBoundingClientRect();
    return {barTop:nav.top,footerBottom:foot?.bottom,bodyPadding:getComputedStyle(document.body).paddingBottom};
   });
   assert.ok(parseFloat(bottom.bodyPadding)>=78,theme+" "+width+": no bottom safe padding");
   assert.deepEqual(errors,[],theme+" "+width+": runtime error");
   console.log("PASS",theme,width+"px",JSON.stringify({
    headerHeight:info.header.height,navHeight:info.nav.height,
    minButton:Math.round(Math.min(...info.buttons.map(x=>x.rect.width))),
    scrollWidth:info.screenWidth
   }));
   await ctx.close();
  }
  for(const width of [1024,1440]){
   const ctx=await browser.newContext({viewport:{width,height:850}});
   const page=await ctx.newPage();
   await page.goto("http://127.0.0.1:"+port+"/",{waitUntil:"domcontentloaded"});
   await page.waitForFunction(()=>!!window.langradMobileShell);
   const info=await page.evaluate(()=>{
    const nav=document.querySelector("header > nav.topnav");
    return {position:getComputedStyle(nav).position,width:document.documentElement.scrollWidth,
      count:nav.querySelectorAll("button[data-tab]").length,
      docNav:nav.closest("header")!==null};
   });
   assert.notEqual(info.position,"fixed","desktop navigation became fixed");
   assert.equal(info.width,width,"desktop overflow");
   assert.equal(info.count,6);
   console.log("PASS desktop",width+"px",JSON.stringify(info));
   await ctx.close();
  }
  console.log("MOBILE BROWSER TESTS: ALL PASS");
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error("FAIL",e.stack);server.close();process.exit(1)});
