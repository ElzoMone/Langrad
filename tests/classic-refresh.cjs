/* Classic compact reader phase 1 — structural and regression checks.
 * npm i --no-save jsdom@26.1.0; node tests/classic-refresh.cjs
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {JSDOM,VirtualConsole}=require("jsdom");
let html=fs.readFileSync("index.html","utf8");
const css=fs.readFileSync("classic-refresh.css","utf8");
html=html.replace('<link rel="stylesheet" href="/classic-refresh.css">','<style id="classic-css">'+css+'</style>');
const files=["reader-lexicon.js","reader-pagination.js","loji-interface.js","loji-observation.js","word-status.js","classic-refresh.js"];
const tags=files.map(f=>'<script defer src="/'+f+'"></script>').join("\n");
assert.ok(html.includes(tags),"missing expected page scripts");
html=html.replace(tags,files.map(f=>'<script>'+fs.readFileSync(f,"utf8")+'</script>').join("\n"));
const specialTitle="Erich Maria Remarque\\Drei Kameraden\\Kapitel 1\\";
const story=("Der Himmel war gelb wie Messing. Ich erkannte ihn. "+"\n\n").repeat(95);
const initial={title:specialTitle,text:story,activeTextId:"doc",aid:"B1",
 words:{himmel:{display:"Himmel",stage:2,translation:"небо",reported:false,correct:1,wrong:0,next:0}},
 results:{total:1,correct:1},library:[{id:"doc",title:specialTitle,text:story}]};
const errors=[],vc=new VirtualConsole();vc.on("jsdomError",e=>errors.push(String(e)));
const dom=new JSDOM(html,{url:"https://langrad.vercel.app/",runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,
 beforeParse(w){
  w.localStorage.setItem("langrad-theme","classic");
  w.localStorage.setItem("langrad-v01",JSON.stringify(initial));
  w.scrollTo=()=>{};w.alert=()=>{};w.confirm=()=>true;
  w.speechSynthesis={getVoices:()=>[],cancel:()=>{},speak:()=>{}};
  w.fetch=async()=>({ok:false,status:404,json:async()=>null});
 }});
const w=dom.window,$=s=>w.document.querySelector(s),sleep=ms=>new Promise(r=>setTimeout(r,ms));
function checkLevel(){assert.equal(w.document.querySelectorAll("select#aid").length,1);return $("#aid")}
(async()=>{
 await sleep(240);
 const tool=$("#lr-classic-reader-tools");
 assert.ok(tool&&tool.parentElement===$("#read"),"compact classic toolbar not inserted");
 assert.ok(tool.contains($("#lr-level-panel")),"adaptation panel absent from compact controls");
 assert.ok(tool.contains($("#lr-page-nav-top")),"pagination missing from compact controls");
 assert.ok(tool.contains($("#lr-word-legend")),"word legend did not fold into help");
 assert.equal($("#lr-classic-legend-help").open,false);
 assert.equal($("#lr-classic-legend-help summary").textContent,"?");
 assert.equal(w.getComputedStyle($(".lr-tfr-globe")).display,"none","pink globe remains in Classic");
 assert.equal(w.getComputedStyle($("header .pills")).display,"none","header badges not hidden");
 assert.equal(w.getComputedStyle($("#lr-level-choice")).display,"none","duplicated B1 still visible");
 assert.equal(w.getComputedStyle($("header")).backgroundColor,"rgb(255, 255, 255)");
 assert.equal(w.getComputedStyle($("#read>.spread:first-child .eyebrow")).display,"none");
 assert.equal(w.getComputedStyle($("#read>p:first-of-type")).display,"none");
 assert.equal(w.getComputedStyle($("#read #reader")).boxShadow,"none");
 assert.equal($("#docTitle").textContent,specialTitle,"user title changed; backslashes must stay");
 assert.equal(JSON.parse(w.localStorage.getItem("langrad-v01")).title,specialTitle);
 assert.equal(JSON.parse(w.localStorage.getItem("langrad-v01")).library[0].title,specialTitle);
 assert.ok(w.langradPager.pageCount()>1);
 console.log("PASS classic cool header, hidden globe, compact controls, exact user title");

 const aid=checkLevel();
 aid.value="A2";aid.dispatchEvent(new w.Event("change",{bubbles:true}));
 await sleep(30);
 assert.equal($("#lr-level-choice").value,"A2","hidden CEFR selector not synchronized");
 assert.equal(JSON.parse(w.localStorage.getItem("langrad-v01")).aid,"A2");
 assert.equal($("#lr-classic-reader-tools #lr-page-nav-top select").value,"0");
 $("#lr-classic-reader-tools #lr-page-nav-top button:last-child").click();
 await sleep(25);
 assert.equal(w.langradPager.pageNumber(),2);
 console.log("PASS single visible level and functioning page controls");

 const picker=$("#lr-theme-select");
 picker.value="tfr";picker.dispatchEvent(new w.Event("change",{bubbles:true}));
 await sleep(55);
 assert.equal(w.document.documentElement.dataset.theme,"tfr");
 assert.equal(tool.isConnected,false,"compact toolbar leaking into TFR");
 assert.equal($("#lr-level-panel").parentElement?.id==="lr-classic-reader-tools",false);
 assert.equal($("#lr-page-nav-top").parentElement?.id==="lr-classic-reader-tools",false);
 assert.ok(!$("#lr-classic-legend-help")?.isConnected);
 assert.notEqual(w.getComputedStyle($(".lr-tfr-globe")).display,"none","TFR globe lost");
 assert.notEqual(w.getComputedStyle($("#lr-level-choice")).display,"none","second level is required in old theme");
 console.log("PASS TFR restored without reader DOM corruption");

 picker.value="loji";picker.dispatchEvent(new w.Event("change",{bubbles:true}));
 await sleep(50);
 assert.equal(w.document.documentElement.dataset.theme,"loji");
 assert.ok($("#lr-loji-observation"));
 picker.value="classic";picker.dispatchEvent(new w.Event("change",{bubbles:true}));
 await sleep(50);
 assert.ok(tool.isConnected);
 assert.ok(tool.contains($("#lr-level-panel")));
 assert.ok(tool.contains($("#lr-page-nav-top")));
 assert.equal($("#docTitle").textContent,specialTitle);
 assert.equal(JSON.parse(w.localStorage.getItem("langrad-v01")).text,story);
 assert.deepEqual(errors,[]);
 console.log("PASS Classic → TFR → Loji → Classic and complete user data preservation");
 w.close();
})().catch(e=>{console.error("FAIL",e.stack);w.close();process.exit(1)});
