/* Classic phase 3 — cleaner glossary and settings provenance.
 * npm i --no-save jsdom@26.1.0 && node tests/classic-details.cjs
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {JSDOM,VirtualConsole}=require("jsdom");
let html=fs.readFileSync("index.html","utf8");
for(const name of ["classic-refresh.css","classic-details.css"]){
 html=html.replace('<link rel="stylesheet" href="/'+name+'">','<style>'+fs.readFileSync(name,"utf8")+'</style>');
}
const files=["reader-lexicon.js","reader-pagination.js","loji-interface.js","loji-observation.js","word-status.js","classic-refresh.js","classic-details.js"];
const tags=files.map(x=>'<script defer src="/'+x+'"></script>').join("\n");
assert.ok(html.includes(tags));
html=html.replace(tags,files.map(x=>'<script>'+fs.readFileSync(x,"utf8")+'</script>').join("\n"));
const title="Erich Maria Remarque\\Drei Kameraden\\Kapitel 1\\";
const book=("Der Himmel war gelb wie Messing. Rauch stieg auf. "+"\n\n").repeat(80);
const initial={title,text:book,aid:"B1",activeTextId:"doc",library:[{id:"doc",title,text:book}],
 words:{himmel:{display:"Himmel",stage:2,reported:false,translation:"небо",correct:1,wrong:0,next:0}},
 results:{total:1,correct:1}};
const problems=[],vc=new VirtualConsole();vc.on("jsdomError",e=>problems.push(String(e)));
const dom=new JSDOM(html,{url:"https://langrad.vercel.app/",runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,
 beforeParse(w){
  w.localStorage.setItem("langrad-theme","classic");
  w.localStorage.setItem("langrad-v01",JSON.stringify(initial));
  w.alert=()=>{};w.confirm=()=>true;w.scrollTo=()=>{};
  w.speechSynthesis={getVoices:()=>[],cancel:()=>{},speak:()=>{}};
  w.fetch=async()=>({ok:false,status:404,json:async()=>null});
 }});
const w=dom.window,$=q=>w.document.querySelector(q);
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
(async()=>{
 await sleep(260);
 assert.ok(w.langradClassicDetails);
 assert.ok($("#lr-classic-app-info"));
 assert.ok($("#lr-classic-app-info .pills"),"header badges not moved to settings");
 assert.equal($("header .pills"),null);
 assert.equal(w.getComputedStyle($("#lr-classic-app-info")).display,"block");
 assert.ok($("#lr-classic-app-info").textContent.includes("FreeDict/WikDict"));
 const pills=$("#lr-classic-app-info .pills");
 const originalBadges=pills.querySelectorAll(".pill").length;
 const status=[...pills.querySelectorAll(".pill")].find(x=>x.textContent.includes("Словарь"));
 assert.ok(status);
 status.textContent="Словарь: 26 301 слов";
 assert.ok(pills.textContent.includes("26 301"),"actual base count did not stay attached");
 const wty=$("#lr-wty-status");
 assert.ok(wty,"WTY settings status missing");
 wty.textContent="Подключено: 104 002 словарных написаний. Источник: WTY.";
 await sleep(40);
 assert.ok($("#lr-classic-wty-count").textContent.includes("104 002"));
 assert.ok($("#lr-classic-wty-count").textContent.includes("WTY"));
 console.log("PASS settings-only header metadata, live base/WTY figures");

 w.eval('selectWord("Himmel")');
 await sleep(45);
 assert.ok($("#detail .translation").textContent.trim().length);
 assert.equal($("#detail .translation").textContent.trim(),"небо");
 const manualToggle=$("#lr-classic-manual-toggle");
 assert.ok(manualToggle);
 assert.equal(manualToggle.textContent,"Изменить перевод");
 assert.equal(w.getComputedStyle($("#manual")).display,"none");
 manualToggle.click();
 assert.notEqual(w.getComputedStyle($("#manual")).display,"none");
 $("#manual").value="небо; небосвод";
 $("#saveManual").click();
 await sleep(70);
 assert.equal(JSON.parse(w.localStorage.getItem("langrad-v01")).words.himmel.translation,"небо; небосвод");
 assert.equal($("#docTitle").textContent,title);
 console.log("PASS known translation collapses custom field but preserves edit/save");

 w.eval('selectWord("Unbekanntwort")');
 await sleep(50);
 const parts=$("#lr-morphology");
 assert.ok(parts);
 if(!parts.querySelector(".lr-parts")&&!parts.querySelector(".lr-nounhint")){
  assert.equal(w.getComputedStyle(parts).display,"none","placeholder morphology block still visible");
 }
 assert.equal($("#lr-classic-manual-toggle").hidden,true,"manual button should not be duplicated for missing translation");
 assert.notEqual(w.getComputedStyle($("#manual")).display,"none","unknown translation input is hidden");
 assert.ok($("#detail .gram").hidden||!$("#detail .gram").textContent.includes("Встроенный словарь"));
 console.log("PASS missing morphology/translation is compact; custom field available");

 const gram=$("#detail .gram");
 gram.textContent="Род: der. Значение зависит от контекста.";
 await sleep(40);
 assert.equal(gram.textContent,"Род: der.","empty generic context sentence not removed");
 const select=$("#lr-theme-select");
 select.value="tfr";select.dispatchEvent(new w.Event("change",{bubbles:true}));
 await sleep(70);
 assert.ok($("header .pills")===pills,"TFR badges not restored to header");
 assert.equal(w.getComputedStyle($("#lr-classic-app-info")).display,"none");
 assert.equal(gram.textContent,"Род: der. Значение зависит от контекста.");
 select.value="loji";select.dispatchEvent(new w.Event("change",{bubbles:true}));
 await sleep(55);
 assert.ok($("header .pills")===pills,"Loji badges not restored");
 select.value="classic";select.dispatchEvent(new w.Event("change",{bubbles:true}));
 await sleep(60);
 assert.ok($("#lr-classic-app-info .pills")===pills,"Classic badges not returned to settings");
 assert.equal(gram.textContent,"Род: der.");
 assert.equal($("#docTitle").textContent,title);
 assert.equal(JSON.parse(w.localStorage.getItem("langrad-v01")).library[0].title,title);
 assert.equal(JSON.parse(w.localStorage.getItem("langrad-v01")).words.himmel.translation,"небо; небосвод");
 assert.deepEqual(problems,[]);
 console.log("PASS theme restoration, generic grammar cleanup, original book title and saved words");
 w.close();
})().catch(e=>{console.error("FAIL",e.stack);w.close();process.exit(1)});
