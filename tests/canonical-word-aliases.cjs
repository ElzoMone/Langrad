/* Langrad — Canonical noun aliases are not distinct learned words.
 * npm i --no-save jsdom@26.1.0 && node tests/canonical-word-aliases.cjs
 */
const assert=require("node:assert/strict"),fs=require("node:fs");
const {JSDOM,VirtualConsole}=require("jsdom");
let html=fs.readFileSync("index.html","utf8");
const modules=["reader-lexicon.js","reader-pagination.js","loji-interface.js","loji-observation.js","word-status.js","classic-refresh.js","classic-details.js","mobile-shell.js","mobile-reader.js","mobile-sheet.js","mobile-sections.js"];
const scripts=modules.map(x=>'<script defer src="/'+x+'"></script>').join("\n");
assert.ok(html.includes(scripts));
html=html.replace(scripts,modules.map(x=>'<script>'+fs.readFileSync(x,"utf8")+'</script>').join("\n"));
const book=("Der Himmel war gelb. Rauch stieg auf. \n\n").repeat(55);
const stored={title:"Beispiel\\Kapitel 1\\",text:book,activeTextId:"one",aid:"B1",
 library:[{id:"one",title:"Beispiel\\Kapitel 1\\",text:book}],
 words:{
   himmel:{display:"Himmel",stage:0,reported:true,aliasOf:"der himmel",translation:"небо",correct:2,wrong:1,next:0},
   "der himmel":{display:"der Himmel",stage:0,reported:false,translation:"небо",correct:0,wrong:0,next:0},
   rauch:{display:"Rauch",stage:1,reported:false,aliasOf:"der rauch",translation:"дым",correct:1,wrong:0,next:0},
   "der rauch":{display:"der Rauch",stage:1,reported:false,translation:"дым",correct:1,wrong:0,next:0}
 },
 results:{total:4,correct:3}};
const errors=[],vc=new VirtualConsole();vc.on("jsdomError",e=>errors.push(String(e)));
const dom=new JSDOM(html,{url:"https://langrad.vercel.app",runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,
 beforeParse(w){
  w.localStorage.setItem("langrad-v01",JSON.stringify(stored));
  w.localStorage.setItem("langrad-theme","classic");
  const mq={matches:true,addEventListener(){}};
  w.matchMedia=()=>mq;
  w.requestAnimationFrame=fn=>fn();
  w.scrollTo=()=>{};w.alert=()=>{};w.confirm=()=>true;
  w.speechSynthesis={getVoices:()=>[],cancel:()=>{},speak:()=>{}};
  w.fetch=async(url)=>{
   if(String(url).includes("dictionary.json"))return {ok:true,json:async()=>({})};
   return {ok:false,status:404,json:async()=>null};
  };
 }});
const w=dom.window,$=sel=>w.document.querySelector(sel);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await sleep(260);
 const saved=JSON.parse(w.localStorage.getItem("langrad-v01"));
 assert.equal(saved.words["der himmel"].reported,true,"canonical must inherit known flag from alias");
 assert.equal(saved.words["der himmel"].correct,2);
 assert.equal(saved.words["der himmel"].wrong,1);
 assert.equal(saved.words.himmel.aliasOf,"der himmel","original alias must remain to protect previous data");
 const nav=$("header nav.topnav");
 nav.querySelector('[data-tab="words"]').click();
 await sleep(30);
 assert.equal($("#wordList").querySelectorAll(".table-entry").length,2);
 assert.equal($("#lr-mobile-word-count").textContent,"2 слов");
 assert.ok($("#wordList").textContent.includes("der Himmel"));
 assert.ok(!$("#wordList").textContent.includes("Himmel</strong>"));
 nav.querySelector('[data-tab="stats"]').click();
 await sleep(30);
 assert.equal($("#seenNumber").textContent,"2","aliases double-counted as seen");
 assert.equal($("#studyNumber").textContent,"1");
 assert.equal($("#knownNumber").textContent,"1","canonical known flag missing");
 assert.equal($("#accuracy").textContent,"75% правильных ответов из 4 проверок.");
 nav.querySelector('[data-tab="practice"]').click();
 await sleep(30);
 assert.equal($("#quizCount").textContent,"1 слов к повторению");
 assert.equal(JSON.parse(w.localStorage.getItem("langrad-v01")).library[0].title,"Beispiel\\Kapitel 1\\");
 assert.deepEqual(errors,[]);
 console.log("PASS canonical aliases, preserved known self-assessment, no duplicate cards, quiz or stats");
 process.exit(0);
})().catch(e=>{console.error("FAIL",e.stack);process.exit(1)});
