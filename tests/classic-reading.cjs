/* Classic phase 2 — calm, study, clean and full word-state presentation.
 * node tests/classic-reading.cjs (requires jsdom@26.1.0)
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {JSDOM,VirtualConsole}=require("jsdom");
let page=fs.readFileSync("index.html","utf8");
for(const css of ["word-status.css","classic-refresh.css"]){
 const style=fs.readFileSync(css,"utf8");
 page=page.replace('<link rel="stylesheet" href="/'+css+'">','<style>'+style+'</style>');
}
const scripts=["reader-lexicon.js","reader-pagination.js","loji-interface.js","loji-observation.js","word-status.js","classic-refresh.js"];
const originalScripts=scripts.map(x=>'<script defer src="/'+x+'"></script>').join("\n");
assert.ok(page.includes(originalScripts),"expected inline script order");
page=page.replace(originalScripts,scripts.map(x=>'<script>'+fs.readFileSync(x,"utf8")+'</script>').join("\n"));
const title="Erich Maria Remarque\\Drei Kameraden\\Kapitel 1\\";
const source=("Der Himmel war gelb wie Messing und Rauch. "+"\n\n").repeat(60);
const initial={
 title,text:source,activeTextId:"one",aid:"B1",
 library:[{id:"one",title,text:source}],
 words:{
  himmel:{display:"Himmel",stage:0,reported:false,correct:0,wrong:0,next:0,translation:"небо"},
  messing:{display:"Messing",stage:1,reported:false,correct:0,wrong:0,next:0,translation:"латунь"},
  rauch:{display:"Rauch",stage:2,reported:true,correct:0,wrong:0,next:0,translation:"дым"}
 },
 results:{total:0,correct:0}
};
function launch(mode){
 const vc=new VirtualConsole(),errors=[];vc.on("jsdomError",e=>errors.push(String(e)));
 const dom=new JSDOM(page,{
  url:"https://langrad.vercel.app/",runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){
   w.localStorage.setItem("langrad-theme","classic");
   w.localStorage.setItem("langrad-v01",JSON.stringify(initial));
   if(mode)w.localStorage.setItem("langrad-classic-markup",mode);
   w.scrollTo=()=>{};w.confirm=()=>true;w.alert=()=>{};
   w.speechSynthesis={getVoices:()=>[],cancel:()=>{},speak:()=>{}};
   w.fetch=async()=>({ok:false,status:404,json:async()=>null});
  }
 });
 return {dom,w:dom.window,errors};
}
const sleep=n=>new Promise(done=>setTimeout(done,n));
function token(w,word){
 const x=[...w.document.querySelectorAll("#reader .token")].find(t=>t.textContent.toLowerCase()===word.toLowerCase());
 assert.ok(x,"Token not rendered: "+word);
 return x;
}
function border(w,word){
 const t=token(w,word);
 return {style:w.getComputedStyle(t).borderBottomStyle,color:w.getComputedStyle(t).borderBottomColor,width:w.getComputedStyle(t).borderBottomWidth};
}
(async()=>{
 const context=launch();
 const {w,errors}=context;
 await sleep(260);
 const $=s=>w.document.querySelector(s);
 const picker=$("#lr-classic-markup-select");
 assert.ok(picker,"markup selector is missing");
 assert.equal(picker.parentElement.id,"lr-classic-markup");
 assert.equal(picker.getAttribute("aria-label"),"Разметка слов");
 assert.deepEqual([...picker.options].map(o=>o.value),["calm","study","clean","all"]);
 assert.equal(picker.value,"calm");
 assert.equal(w.document.documentElement.dataset.classicMarkup,"calm");
 assert.equal(token(w,"Himmel").classList.contains("unknown"),true);
 assert.equal(token(w,"Messing").classList.contains("learning"),true);
 assert.equal(token(w,"Rauch").classList.contains("known"),true);
 assert.equal(token(w,"gelb").classList.contains("neutral"),true);
 assert.equal(border(w,"Himmel").color,"rgba(0, 0, 0, 0)");
 assert.equal(border(w,"gelb").color,"rgba(0, 0, 0, 0)");
 assert.equal(border(w,"Messing").style,"dashed");
 assert.equal(border(w,"Rauch").style,"solid");
 assert.ok($("#lr-classic-legend-help")&&!$("#lr-classic-legend-help").open);
 console.log("PASS default calm: unknown unmarked, learning dashed, known subtle, legend hidden");

 const originalData=JSON.stringify(JSON.parse(w.localStorage.getItem("langrad-v01")));
 function change(mode){
  picker.value=mode;picker.dispatchEvent(new w.Event("change",{bubbles:true}));
  assert.equal(w.document.documentElement.dataset.classicMarkup,mode);
  assert.equal(w.localStorage.getItem("langrad-classic-markup"),mode);
  assert.equal(w.localStorage.getItem("langrad-v01"),originalData,"markup mutated user data");
 }
 change("study");
 assert.equal(border(w,"Messing").style,"dashed");
 assert.equal(border(w,"Rauch").color,"rgba(0, 0, 0, 0)");
 change("clean");
 for(const word of ["Der","Himmel","Messing","Rauch","gelb"]){
  assert.equal(border(w,word).color,"rgba(0, 0, 0, 0)",word+" was marked in clean mode");
 }
 change("all");
 assert.equal(border(w,"Himmel").style,"dotted");
 assert.equal(border(w,"Messing").style,"dashed");
 assert.equal(border(w,"Rauch").style,"solid");
 console.log("PASS all four modes and unchanged stored dictionary");

 change("clean");
 const tab=$("#lr-theme-select");
 tab.value="tfr";tab.dispatchEvent(new w.Event("change",{bubbles:true}));
 await sleep(55);
 assert.equal($("#lr-classic-reader-tools").isConnected,false);
 assert.equal(border(w,"Himmel").style,"dotted","TFR unknown styling should be unchanged");
 tab.value="loji";tab.dispatchEvent(new w.Event("change",{bubbles:true}));
 await sleep(55);
 assert.equal(border(w,"Himmel").style,"dotted","Loji unknown styling should be unchanged");
 tab.value="classic";tab.dispatchEvent(new w.Event("change",{bubbles:true}));
 await sleep(55);
 assert.equal(picker.value,"clean");
 assert.equal($("#lr-classic-reader-tools").contains(picker),true);
 assert.equal(border(w,"Himmel").color,"rgba(0, 0, 0, 0)");
 assert.equal($("#docTitle").textContent,title);
 console.log("PASS Classic → TFR → Loji → Classic retains selection and exact book title");

 const persisted=w.localStorage.getItem("langrad-classic-markup");
 assert.equal(persisted,"clean");
 assert.deepEqual(errors,[]);
 w.close();

 const reload=launch(persisted);
 await sleep(225);
 const fresh=reload.w;
 assert.equal(fresh.document.querySelector("#lr-classic-markup-select").value,"clean");
 assert.equal(fresh.document.documentElement.dataset.classicMarkup,"clean");
 assert.equal(border(fresh,"Himmel").color,"rgba(0, 0, 0, 0)");
 assert.equal(JSON.parse(fresh.localStorage.getItem("langrad-v01")).title,title);
 assert.deepEqual(reload.errors,[]);
 console.log("PASS clean mode restored after reload without modifying words or texts");
 fresh.close();
})().catch(e=>{console.error("FAIL",e.stack);process.exit(1)});
