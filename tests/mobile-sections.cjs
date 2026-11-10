/* Langrad Mobile Stage 4: functional sections without changing stored data.
 * npm i --no-save jsdom@26.1.0 && node tests/mobile-sections.cjs
 */
const fs=require("node:fs"),assert=require("node:assert/strict"),{JSDOM,VirtualConsole}=require("jsdom");
let html=fs.readFileSync("index.html","utf8");
const scripts=["reader-lexicon.js","reader-pagination.js","loji-interface.js","loji-observation.js","word-status.js","classic-refresh.js","classic-details.js","mobile-shell.js","mobile-reader.js","mobile-sheet.js","mobile-sections.js"];
const tag=scripts.map(x=>'<script defer src="/'+x+'"></script>').join("\n");
assert.ok(html.includes(tag),"Expected module order missing");
html=html.replace(tag,scripts.map(x=>'<script>'+fs.readFileSync(x,"utf8")+'</script>').join("\n"));
const title="Erich Maria Remarque\\Drei Kameraden\\Kapitel 1\\";
const book=("Der Himmel war gelb wie Messing. Er erkannte seinen Freund.\n\n").repeat(65);
const initial={title,text:book,activeTextId:"a",aid:"B1",
 library:[{id:"a",title,text:book},
  {id:"b",title:"Wissenschaft · Kosmos",text:"Die Sterne und die Astronauten."},
  {id:"c",title:"Geschichte · Berlin",text:"Berlin hat eine lange Geschichte."}],
 words:{
  himmel:{display:"Himmel",stage:2,reported:false,translation:"небо",correct:1,wrong:0,next:0},
  rauch:{display:"Rauch",stage:1,reported:false,translation:"дым",correct:0,wrong:0,next:0},
  messing:{display:"Messing",stage:3,reported:true,translation:"латунь",correct:3,wrong:1,next:0}},
 results:{total:8,correct:6}};
const sleep=n=>new Promise(r=>setTimeout(r,n));
function start(theme="classic"){
 const errors=[],vconsole=new VirtualConsole();vconsole.on("jsdomError",e=>errors.push(String(e)));
 const subs=new Set(),mq={matches:true,addEventListener(type,fn){if(type==="change")subs.add(fn)}};
 const dom=new JSDOM(html,{url:"https://langrad.vercel.app/",runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vconsole,
  beforeParse(w){
   w.matchMedia=()=>mq;
   w.requestAnimationFrame=fn=>fn();
   w.localStorage.setItem("langrad-theme",theme);
   w.localStorage.setItem("langrad-v01",JSON.stringify(initial));
   w.alert=()=>{};w.prompt=()=>null;w.confirm=()=>true;w.scrollTo=()=>{};
   w.speechSynthesis={getVoices:()=>[],cancel:()=>{},speak:()=>{}};
   w.fetch=async()=>({ok:false,status:404,json:async()=>null});
  }});
 return {dom,w:dom.window,errors,mq,notify(){for(const fn of subs)fn()}};
}
(async()=>{
 for(const theme of ["classic","tfr","loji"]){
  const t=start(theme),w=t.w,$=sel=>w.document.querySelector(sel);
  await sleep(220);
  assert.ok(w.langradMobileSections);
  assert.equal(w.document.documentElement.dataset.mobileSections,"true");
  const nav=$("header nav");
  assert.equal(nav.querySelectorAll("button[data-tab]").length,6);
  nav.querySelector('[data-tab="library"]').click();
  await sleep(50);
  const cards=()=>[...w.document.querySelectorAll("#lr-library-list .lr-library-entry")];
  assert.equal(cards().length,3);
  assert.equal($("#lr-mobile-library-count").textContent,"3 текстов");
  const search=$("#lr-mobile-library-search");
  search.value="kosmos";search.dispatchEvent(new w.Event("input",{bubbles:true}));
  await sleep(30);
  assert.equal(cards().filter(x=>!x.hidden).length,1);
  assert.ok(cards().find(x=>!x.hidden).textContent.includes("Kosmos"));
  assert.equal($("#lr-mobile-library-count").textContent,"1 из 3 текстов");
  search.value="nichtvorhanden";search.dispatchEvent(new w.Event("input",{bubbles:true}));
  await sleep(30);
  assert.equal(cards().filter(x=>!x.hidden).length,0);
  assert.equal($("#lr-mobile-library-no-results").hidden,false);
  $("#lr-mobile-library-tools .lr-mobile-clear").click();
  await sleep(30);
  assert.equal(cards().filter(x=>!x.hidden).length,3);
  assert.equal($("#lr-mobile-library-no-results").hidden,true);
  assert.equal(search.value,"");
  const button=cards()[0].querySelector(".lr-library-actions button");
  assert.ok(button?.textContent.includes("Открыть"));
  button.click();
  assert.equal($("#read").classList.contains("hidden"),false);
  assert.ok($("#docTitle").textContent.includes("Berlin"));
  console.log("PASS",theme,"library search, empty state, clear and real open action");

  nav.querySelector('[data-tab="words"]').click();
  await sleep(50);
  assert.equal($("#lr-mobile-word-count").textContent,"3 слов");
  const words=$("#wordSearch");
  assert.equal(words.parentElement.id,"lr-mobile-words-tools");
  words.value="himmel";words.dispatchEvent(new w.Event("input",{bubbles:true}));
  await sleep(40);
  assert.equal($("#wordList").querySelectorAll(".table-entry").length,1);
  assert.equal($("#lr-mobile-word-count").textContent,"1 слово");
  $("#lr-mobile-words-tools .lr-mobile-clear").click();
  await sleep(40);
  assert.equal($("#wordList").querySelectorAll(".table-entry").length,3);
  assert.equal(words.value,"");
  assert.equal($("#lr-mobile-word-count").textContent,"3 слов");
  console.log("PASS",theme,"vocabulary search and clear");

  nav.querySelector('[data-tab="stats"]').click();
  await sleep(35);
  assert.equal($("#seenNumber").textContent,"3");
  assert.equal($("#studyNumber").textContent,"2");
  assert.equal($("#knownNumber").textContent,"1");
  assert.equal($("#accuracy").textContent,"75% правильных ответов из 8 проверок.");
  nav.querySelector('[data-tab="practice"]').click();
  await sleep(35);
  assert.equal($("#startQuiz").disabled,false);
  $("#startQuiz").click();
  await sleep(25);
  assert.ok($("#quiz .choice"));
  const before=JSON.parse(w.localStorage.getItem("langrad-v01")).results.total;
  $("#quiz .choice").click();
  await sleep(40);
  assert.equal(JSON.parse(w.localStorage.getItem("langrad-v01")).results.total,before+1);
  assert.ok($("#nextQuestion")&&!$("#nextQuestion").classList.contains("hidden"));
  console.log("PASS",theme,"stats and original review scoring");

  nav.querySelector('[data-tab="settings"]').click();
  await sleep(60);
  const settings=$("#settings");
  const wraps=[...settings.querySelectorAll(":scope > .lr-mobile-settings-group")];
  assert.ok(wraps.length>=4,"Settings groups not created");
  assert.equal($("#lr-theme-select").closest("details").className,"lr-mobile-settings-group");
  assert.equal($("#lr-ai-key").closest("details").className,"lr-mobile-settings-group");
  assert.equal($("#lr-wty-install").closest("details").className,"lr-mobile-settings-group");
  assert.ok($("#backup")&&$("#restore"));
  assert.equal(settings.querySelectorAll("#lr-theme-select").length,1);
  assert.equal(settings.querySelectorAll("#lr-ai-key").length,1);
  assert.equal(settings.querySelectorAll("#lr-wty-install").length,1);
  const originalBackup=$("#backup"),originalWty=$("#lr-wty-settings"),originalAi=$("#lr-ai-settings");
  assert.equal(originalWty.closest("details").open,false);
  originalWty.closest("details").open=true;
  assert.equal($("#lr-wty-install").isConnected,true);
  console.log("PASS",theme,"real settings controls, collapsible sections");

  // Mobile -> desktop -> mobile should not duplicate controls or mutate user data.
  t.mq.matches=false;t.notify();w.langradMobileSections.apply();
  assert.equal(w.document.documentElement.dataset.mobileSections,"false");
  assert.equal($("#lr-wty-settings").parentElement,settings);
  assert.equal($("#lr-theme-settings").parentElement,settings);
  assert.equal($("#wordSearch").parentElement,$("#words"));
  assert.ok(!$("#settings > .lr-mobile-settings-group"));
  t.mq.matches=true;t.notify();w.langradMobileSections.apply();
  assert.equal($("#lr-wty-settings").closest("details").className,"lr-mobile-settings-group");
  assert.equal($("#lr-mobile-library-search").isConnected,true);
  assert.equal(originalBackup,$("#backup"));
  assert.equal(originalWty,$("#lr-wty-settings"));
  assert.equal(originalAi,$("#lr-ai-settings"));
  assert.equal($("#docTitle").textContent,"Geschichte · Berlin"); // opened book
  const data=JSON.parse(w.localStorage.getItem("langrad-v01"));
  assert.equal(data.library.length,3);
  assert.equal(data.library[0].title,title);
  assert.equal(data.library[0].text,book);
  assert.equal(data.words.himmel.translation,"небо");
  assert.deepEqual(t.errors,[],theme+" runtime errors");
  console.log("PASS",theme,"phone/desktop restoration and preserved user records");
 }
 console.log("MOBILE STAGE 4 DOM: ALL PASS");
 process.exit(0);
})().catch(e=>{console.error("FAIL",e.stack);process.exit(1)});
