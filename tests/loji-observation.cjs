/* Loji phase 3: avatar, readability, HUD, and unchanged reading logic.
 * Run with jsdom 26.1.0: node tests/loji-observation.cjs
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {JSDOM,VirtualConsole}=require("jsdom");
const original="Er erkannte den Rauch. ".repeat(190);
const htmlBase=fs.readFileSync("index.html","utf8");
let html=htmlBase;
for(const file of ["loji-theme.css","loji-machine.css","loji-observation.css"]){
 const css=fs.readFileSync(file,"utf8").replace(/^@import[^\n]*\n/,"");
 html=html.replace('<link rel="stylesheet" href="/'+file+'">','<style>'+css+'</style>');
}
const scripts=["reader-lexicon.js","reader-pagination.js","loji-interface.js","loji-observation.js"];
const originalTags=scripts.map(x=>'<script defer src="/'+x+'"></script>').join("\n");
const inline=scripts.map(x=>'<script>'+fs.readFileSync(x,"utf8")+'</script>').join("\n");
assert.ok(html.includes(originalTags),"expected script order changed");
html=html.replace(originalTags,inline);
const logs=[],v=new VirtualConsole();v.on("jsdomError",e=>logs.push(String(e)));
const dom=new JSDOM(html,{url:"https://langrad.vercel.app/",runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:v,
 beforeParse(w){
  w.localStorage.setItem("langrad-theme","loji");
  w.localStorage.setItem("langrad-v01",JSON.stringify({
   text:original,title:"Ein Buch",activeTextId:"a",aid:"B1",
   words:{rauch:{display:"Rauch",translation:"МОЙ ПЕРЕВОД",stage:2,correct:3,wrong:0,next:0}},
   results:{total:3,correct:3},library:[{id:"a",title:"Mehrere Kapitel",text:original}]
  }));
  w.scrollTo=()=>{};w.confirm=()=>true;w.alert=()=>{};
  w.speechSynthesis={getVoices:()=>[],speak:()=>{},cancel:()=>{}};
  w.fetch=async()=>({ok:false,status:404,json:async()=>null});
 }});
const w=dom.window,$=x=>w.document.querySelector(x),sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await sleep(300);
 const avatar=$(".lr-loji-avatar"),img=avatar?.querySelector("img");
 assert.ok(avatar&&img,"avatar not inserted");
 assert.ok(img.src.endsWith("/Zheng_chan.gif"),"original GIF not linked");
 assert.equal(img.width,156);assert.equal(img.height,210);
 assert.ok($(".lr-loji-avatar-credit")?.href.includes("THE_LONG_MARCH"));
 assert.ok($(".lr-loji-eye")&&w.getComputedStyle($(".lr-loji-eye")).display!=="none","sensor eye missing");
 assert.ok($("#lr-loji-observation .lr-loji-rail-left"));
 assert.ok($("#lr-loji-observation .lr-loji-rail-right"));
 assert.ok(w.langradLojiObservation);
 $("[data-tab=library]").click();await sleep(60);
 assert.equal(w.getComputedStyle($(".lr-library-title")).color,"rgb(255, 240, 237)","archived title contrast");
 assert.equal(w.getComputedStyle($("header")).display,"grid","header not restructured");
 assert.equal(w.getComputedStyle($("header .brand")).whiteSpace,"nowrap");
 assert.equal(w.getComputedStyle($("[data-tab=read]")).display,"inline-flex");
 assert.equal(w.getComputedStyle($("#read #reader")).color,"rgb(244, 233, 230)");
 assert.ok(w.langradPager.pageCount()>1);
 assert.equal(JSON.parse(w.localStorage.getItem("langrad-v01")).words.rauch.translation,"МОЙ ПЕРЕВОД");
 const select=$("#lr-theme-select");
 select.value="classic";select.dispatchEvent(new w.Event("change",{bubbles:true}));await sleep(40);
 assert.equal(w.getComputedStyle(avatar).display,"none");
 assert.equal($("[data-tab=read]").textContent,"Читалка");
 select.value="tfr";select.dispatchEvent(new w.Event("change",{bubbles:true}));await sleep(40);
 assert.equal(w.getComputedStyle(avatar).display,"none");
 select.value="loji";select.dispatchEvent(new w.Event("change",{bubbles:true}));await sleep(40);
 assert.notEqual(w.getComputedStyle(avatar).display,"none");
 assert.equal($("[data-tab=read]").textContent,"ПОТОК");
 const data=JSON.parse(w.localStorage.getItem("langrad-v01"));
 assert.equal(data.text,original);
 assert.equal(data.library[0].text,original);
 assert.deepEqual(logs,[]);
 console.log("PASS Loji live GIF link, eye, archive contrast, header, glyph spacing, HUD and preserved data");
 w.close();
})().catch(e=>{console.error("FAIL",e.stack);w.close();process.exit(1)});
