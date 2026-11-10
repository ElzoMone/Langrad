/* Integration: word-state categories, correct known counts, non-destructive
 * page adaptation modes and video status sharing. npm i jsdom@26.1.0
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {JSDOM,VirtualConsole}=require("jsdom");
let html=fs.readFileSync("index.html","utf8");
const scripts=["reader-lexicon.js","reader-pagination.js","loji-interface.js","loji-observation.js","word-status.js"];
const tags=scripts.map(f=>'<script defer src="/'+f+'"></script>').join("\n");
assert.ok(html.includes(tags),"missing new scripts");
html=html.replace(tags,scripts.map(f=>'<script>'+fs.readFileSync(f,"utf8")+'</script>').join("\n"));
const sentence="Der Himmel war gelb wie Messing und noch nicht verqualmt vom Rauch. ";
const story=(sentence+"\n\n").repeat(75);
const base={title:"Mein Buch",text:story,aid:"B1",words:{
 himmel:{display:"Himmel",stage:1,correct:0,wrong:0,next:0,translation:"небо"},
 rauch:{display:"Rauch",stage:0,correct:0,wrong:0,next:0,translation:"дым"},
 messing:{display:"Messing",stage:2,reported:true,correct:0,wrong:0,next:0,translation:"латунь"}
},library:[{id:"book",title:"Mein Buch",text:story}],activeTextId:"book",results:{total:0,correct:0}};
const build=(saved,theme="loji",counters={calls:0})=>{
 const vc=new VirtualConsole(),errors=[];
 vc.on("jsdomError",e=>errors.push(String(e)));
 const dom=new JSDOM(html,{url:"https://langrad.vercel.app/",runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,
 beforeParse(w){
  w.localStorage.setItem("langrad-v01",saved);
  w.localStorage.setItem("langrad-theme",theme);
  w.confirm=()=>true;w.alert=()=>{};w.scrollTo=()=>{};
  w.speechSynthesis={getVoices:()=>[],cancel:()=>{},speak:()=>{}};
  w.fetch=async (url,opts={})=>{
   if(String(url).includes("generativelanguage.googleapis.com")){
    counters.calls++;
    return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:"Der Mann war froh und der Tag war sehr schön. ".repeat(35)}]}}]})};
   }
   return {ok:false,status:404,json:async()=>null};
  };
 }});
 return {dom,w:dom.window,errors,counters};
};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const word=(w,key)=>[...w.document.querySelectorAll("#reader .token")].find(x=>x.textContent.toLowerCase()===key.toLowerCase());
(async()=>{
 const started=build(JSON.stringify(base)),w=started.w;
 await delay(250);
 assert.ok(w.langradPager.pageCount()>=2);
 assert.ok(w.document.getElementById("lr-word-legend"));
 assert.ok(w.document.getElementById("lr-level-panel").querySelector("#aid"),"CEFR select not inside adaptation");
 assert.ok(!w.document.querySelector("#docTitle")?.parentElement?.querySelector("#aid"),"duplicate CEFR control");
 assert.ok(word(w,"Der")?.classList.contains("neutral"));
 assert.ok(word(w,"Himmel")?.classList.contains("learning"));
 assert.ok(word(w,"Messing")?.classList.contains("known"));
 assert.ok(word(w,"Rauch")?.classList.contains("unknown"));
 assert.match(w.document.getElementById("score").textContent,/^1 из \d+ известных слов$/);
 w.document.querySelector('[data-tab="stats"]').click();
 assert.equal(w.document.getElementById("knownNumber").textContent,"1");
 assert.equal(w.document.getElementById("studyNumber").textContent,"1");
 w.document.querySelector('[data-tab="read"]').click();
 console.log("PASS four reader states, known count with Я знаю, single level selector");

 const statuses=[];
 w.addEventListener("message",e=>{if(e.data?.type==="LR_VIDEO_STATUS")statuses.push(e.data)});
 w.postMessage({type:"LR_VIDEO_STATUS_REQUEST"},w.location.origin);
 await delay(60);
 assert.ok(statuses.length>0);
 assert.equal(statuses[0].theme,"loji");
 assert.equal(statuses[0].words.find(r=>r.word==="messing").reported,true);
 console.log("PASS same-origin video status and theme sharing");

 const key=w.document.getElementById("lr-ai-key");
 key.value="simulated-local-test-key";
 key.dispatchEvent(new w.Event("input",{bubbles:true}));
 const pager=w.langradPager;
 const run=w.document.getElementById("lr-level-run"),orig=w.document.getElementById("lr-level-original");
 run.click();
 for(let i=0;i<100;i++){await delay(60);if(pager.getCachedVersion("gemini"))break}
 assert.equal(started.counters.calls,1);
 assert.ok(pager.getCachedVersion("gemini"));
 assert.equal(pager.getMode(),"gemini");
 const changedText=w.document.getElementById("reader").textContent;
 assert.ok(changedText.includes("Mann war froh"));
 orig.click();await delay(40);
 assert.equal(pager.getMode(),"original");
 assert.ok(!w.document.getElementById("reader").textContent.includes("Mann war froh"));
 assert.ok(pager.getCachedVersion("gemini"));
 run.click();await delay(60);
 assert.equal(started.counters.calls,1,"Gemini called again despite cached version");
 assert.equal(pager.getMode(),"gemini");
 assert.ok(w.document.getElementById("reader").textContent.includes("Mann war froh"));
 console.log("PASS mode switching without regeneration");

 const output=w.localStorage.getItem("langrad-v01");
 assert.equal(JSON.parse(output).text,story);
 assert.ok(Object.keys(JSON.parse(output).pageAdaptationVersions).length);
 w.close();
 const resumed=build(output,"tfr");
 const w2=resumed.w;await delay(180);
 assert.equal(w2.langradPager.getMode(),"gemini");
 assert.ok(w2.document.getElementById("reader").textContent.includes("Mann war froh"));
 const oldCalls=resumed.counters.calls;
 w2.document.getElementById("lr-level-run").click();await delay(50);
 assert.equal(resumed.counters.calls,oldCalls,"new load regenerated stored page");
 w2.document.getElementById("lr-level-original").click();await delay(30);
 assert.ok(w2.langradPager.getCachedVersion("gemini"),"cache lost on mode switch");
 assert.equal(w2.document.documentElement.dataset.theme,"tfr");
 assert.equal(JSON.parse(w2.localStorage.getItem("langrad-v01")).words.messing.reported,true);
 console.log("PASS persisted adaptation after reload, mode restored and TFR");
 assert.deepEqual(started.errors,[]);
 assert.deepEqual(resumed.errors,[]);
 console.log("RESULT all new reader regressions PASS");
 w2.close();
})().catch(e=>{console.error("FAIL",e.stack);process.exit(1)});
