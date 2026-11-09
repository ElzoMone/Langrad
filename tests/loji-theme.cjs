/* Langrad: Loji theme regression. Run with jsdom@26.1.0:
 * node tests/loji-theme.cjs
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {JSDOM,VirtualConsole}=require("jsdom");
const index=fs.readFileSync("index.html","utf8");
const styles=fs.readFileSync("loji-theme.css","utf8").replace(/^@import[^;]+;/,"");
const html=index.replace('<link rel="stylesheet" href="/loji-theme.css">','<style>'+styles+'</style>')
 .replace('<script defer src="/reader-lexicon.js"></script>\n<script defer src="/reader-pagination.js"></script>',
 '<script>'+fs.readFileSync("reader-lexicon.js","utf8")+'</script><script>'+fs.readFileSync("reader-pagination.js","utf8")+'</script>');
const txt="Das ist ein einfacher deutscher Text. ".repeat(90);
const vc=new VirtualConsole(),errors=[];vc.on("jsdomError",e=>errors.push(String(e)));
const dom=new JSDOM(html,{url:"https://langrad.vercel.app/",runScripts:"dangerously",virtualConsole:vc,pretendToBeVisual:true,
 beforeParse(w){
  w.localStorage.setItem("langrad-theme","loji");
  w.localStorage.setItem("langrad-v01",JSON.stringify({text:txt,title:"Test",aid:"B1",words:{buch:{display:"Buch",stage:2,translation:"Мой перевод",next:0}},results:{total:0},library:[{id:"book",title:"Test",text:txt}],activeTextId:"book"}));
  w.fetch=async()=>({ok:false,status:404,json:async()=>({})});
  w.speechSynthesis={getVoices:()=>[],cancel:()=>{},speak:()=>{}};w.scrollTo=()=>{};
 }});
const w=dom.window;
(async()=>{
 await new Promise(r=>setTimeout(r,180));
 const select=w.document.querySelector("#lr-theme-select");
 const eye=w.document.querySelector("header .lr-loji-eye");
 const globe=w.document.querySelector("header .lr-tfr-globe");
 assert.equal(w.document.documentElement.dataset.theme,"loji");
 assert.deepEqual([...select.options].map(x=>x.value),["classic","tfr","loji"]);
 assert.ok(eye.querySelector("svg"));
 assert.equal(w.getComputedStyle(eye).display,"grid");
 assert.equal(w.getComputedStyle(globe).display,"none");
 const modal=w.document.createElement("dialog");modal.className="lr-modal";w.document.body.append(modal);
 assert.equal(w.getComputedStyle(modal).backgroundColor,"rgb(33, 18, 23)");
 assert.ok(w.langradPager.pageCount()>1);
 for(const name of ["tfr","classic","loji"]){
  select.value=name;select.dispatchEvent(new w.Event("change",{bubbles:true}));
  assert.equal(w.document.documentElement.dataset.theme,name);
  assert.equal(w.localStorage.getItem("langrad-theme"),name);
  assert.equal(w.getComputedStyle(eye).display,name==="loji"?"grid":"none");
  if(name==="tfr")assert.notEqual(w.getComputedStyle(globe).display,"none");
 }
 const state=JSON.parse(w.localStorage.getItem("langrad-v01"));
 assert.equal(state.words.buch.translation,"Мой перевод");
 assert.equal(state.words.buch.stage,2);
 assert.equal(state.library[0].text,txt);
 assert.deepEqual(errors,[]);
 console.log("PASS Loji eye, theme switching, readability, pagination and local data");
 w.close();
})().catch(e=>{console.error(e);w.close();process.exit(1)});
