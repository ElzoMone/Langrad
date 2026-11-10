/* Mobile reader stage 2: real controls, safe preferences and swipe navigation.
 * npm i --no-save jsdom@26.1.0; node tests/mobile-reader.cjs
 */
const fs=require("node:fs"),assert=require("node:assert/strict"),{JSDOM,VirtualConsole}=require("jsdom");
let html=fs.readFileSync("index.html","utf8");
const scripts=["reader-lexicon.js","reader-pagination.js","loji-interface.js","loji-observation.js","word-status.js","classic-refresh.js","classic-details.js","mobile-shell.js","mobile-reader.js"];
const tags=scripts.map(f=>'<script defer src="/'+f+'"></script>').join("\n");
assert.ok(html.includes(tags),"expected script sequence missing");
html=html.replace(tags,scripts.map(f=>'<script>'+fs.readFileSync(f,"utf8")+'</script>').join("\n"));
const title="Erich Maria Remarque\\Drei Kameraden\\Kapitel 1\\";
const source=("Der Himmel war gelb wie Messing. Er erkannte den Weg. \n\n").repeat(110);
const original={title,text:source,aid:"B1",activeTextId:"book",words:{himmel:{display:"Himmel",stage:1,translation:"небо",correct:0,wrong:0,next:0}},library:[{id:"book",title,text:source}],results:{total:0,correct:0}};
const sleep=n=>new Promise(resolve=>setTimeout(resolve,n));
function create(pref){
 const errs=[],vc=new VirtualConsole();vc.on("jsdomError",e=>errs.push(String(e)));
 const listeners=new Set();
 const mq={matches:true,addEventListener(type,fn){if(type==="change")listeners.add(fn)}};
 const dom=new JSDOM(html,{url:"https://langrad.vercel.app/",runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){
   w.matchMedia=()=>mq;
   w.requestAnimationFrame=fn=>fn();
   w.localStorage.setItem("langrad-v01",JSON.stringify(original));
   w.localStorage.setItem("langrad-theme","classic");
   if(pref)w.localStorage.setItem("langrad-mobile-reading-v1",JSON.stringify(pref));
   w.alert=()=>{};w.confirm=()=>true;w.scrollTo=()=>{};
   w.speechSynthesis={getVoices:()=>[],cancel:()=>{},speak:()=>{}};
   w.fetch=async()=>({ok:false,status:404,json:async()=>null});
  }});
 return {dom,w:dom.window,errs,mq,notify:()=>{for(const fn of listeners)fn({matches:mq.matches})}};
}
const checkValue=(w)=>w.document.getElementById("lr-mobile-pages").textContent;
function touch(w,id,coords){
 const e=new w.Event(id,{bubbles:true});
 Object.defineProperty(e,id==="touchstart"?"touches":"changedTouches",{value:[coords]});
 w.document.querySelector("#reader").dispatchEvent(e);
}
(async()=>{
 const ctx=create(),w=ctx.w,$=q=>w.document.querySelector(q);
 await sleep(200);
 assert.ok(w.langradMobileReader);
 const bar=$("#lr-mobile-reader-controls"),settings=$("#lr-mobile-reader-settings"),actions=$("#lr-mobile-reader-actions");
 assert.ok(bar && bar.parentElement===$("#read"));
 assert.equal($("#lr-page-nav-top").parentElement.id,"lr-mobile-navline");
 assert.equal($("#lr-level-panel").parentElement.id,"lr-mobile-reader-settings");
 assert.equal($("#read .row:has(#addText)").parentElement.id,"lr-mobile-reader-actions");
 assert.ok(settings.contains($("#aid")),"existing CEFR selector not moved");
 assert.ok(settings.contains($("#lr-level-local"))&&settings.contains($("#lr-level-original")));
 assert.ok(settings.contains($("#lr-classic-markup")));
 assert.ok(settings.contains($("#lr-classic-legend-help")));
 assert.equal(settings.open,false);
 assert.equal(actions.open,false);
 assert.equal(w.document.documentElement.dataset.mobileReaderReady,"true");
 assert.equal(checkValue(w),"Стр. 1 / "+w.langradPager.pageCount());
 assert.equal($("#docTitle").textContent,title);
 console.log("PASS controls mounted once, real CEFR/paging and collapsed settings");

 const versionBefore=w.localStorage.getItem("langrad-v01");
 $("#lr-mobile-font-up").click();
 $("#lr-mobile-font-up").click();
 assert.equal(w.langradMobileReader.getPreferences().size,22);
 assert.equal(w.document.documentElement.style.getPropertyValue("--lr-mobile-reader-size"),"22px");
 $("#lr-mobile-font-down").click();
 assert.equal(w.langradMobileReader.getPreferences().size,21);
 const line=$("#lr-mobile-line-height");line.value="2.05";line.dispatchEvent(new w.Event("change",{bubbles:true}));
 assert.equal(w.langradMobileReader.getPreferences().leading,2.05);
 assert.ok(w.localStorage.getItem("langrad-mobile-reading-v1").includes('"size":21'));
 assert.equal(w.localStorage.getItem("langrad-v01"),versionBefore,"font settings corrupted stored words or text");
 console.log("PASS persistent font size and line height without touching reader state");

 const n=w.langradPager.pageCount();assert.ok(n>=5);
 $("#lr-page-nav-top button:last-child").click();
 await sleep(20);
 assert.equal(w.langradPager.pageNumber(),2);
 assert.equal(checkValue(w),"Стр. 2 / "+n);
 assert.ok(JSON.parse(w.localStorage.getItem("langrad-v01")).readingPages.book.index===1);
 touch(w,"touchstart",{clientX:250,clientY:220});
 touch(w,"touchend",{clientX:80,clientY:235});
 assert.equal(w.langradPager.pageNumber(),3,"swipe left must go next page");
 touch(w,"touchstart",{clientX:120,clientY:200});
 touch(w,"touchend",{clientX:270,clientY:206});
 assert.equal(w.langradPager.pageNumber(),2,"swipe right must go back");
 touch(w,"touchstart",{clientX:140,clientY:200});
 touch(w,"touchend",{clientX:155,clientY:360});
 assert.equal(w.langradPager.pageNumber(),2,"vertical scroll must not change pages");
 console.log("PASS pager buttons, swipe in both directions and no vertical-swipe paging");

 const theme=$("#lr-theme-select");
 for(const name of ["tfr","loji","classic"]){
  theme.value=name;theme.dispatchEvent(new w.Event("change",{bubbles:true}));
  await sleep(35);
  w.langradMobileReader.apply();
  assert.equal(w.document.documentElement.dataset.theme,name);
  assert.equal($("#lr-level-panel").parentElement,settings,"adaptation controls lost on "+name);
  assert.equal($("#lr-page-nav-top").parentElement.id,"lr-mobile-navline");
  assert.ok(actions.contains($("#addText")));
  assert.equal($("#docTitle").textContent,title);
 }
 assert.ok(settings.contains($("#lr-classic-markup")));
 assert.ok(settings.contains($("#lr-classic-legend-help")));
 console.log("PASS Classic / TFR / Loji retains one mobile toolbar and book title");

 ctx.mq.matches=false;ctx.notify();w.langradMobileReader.apply();
 assert.equal(bar.hidden,true);
 assert.ok(!w.document.documentElement.dataset.mobileReaderReady);
 assert.equal($("#lr-page-nav-top").parentElement.id,"lr-classic-reader-tools");
 assert.equal($("#lr-level-panel").parentElement.id,"lr-classic-reader-tools");
 assert.equal($("#addText").parentElement.parentElement.id,"read");
 assert.equal($("#lr-classic-markup").parentElement.id,"lr-classic-reader-tools");
 assert.equal($("#lr-classic-legend-help").parentElement.id,"lr-classic-reader-tools");
 const stored=JSON.parse(w.localStorage.getItem("langrad-v01"));
 assert.equal(stored.title,title);
 assert.equal(stored.library[0].text,source);
 assert.equal(stored.words.himmel.translation,"небо");
 assert.deepEqual(ctx.errs,[]);
 console.log("PASS desktop restoration and all user data preserved");

 const reload=create({size:21,leading:2.05});await sleep(180);
 assert.equal(reload.w.langradMobileReader.getPreferences().size,21);
 assert.equal(reload.w.langradMobileReader.getPreferences().leading,2.05);
 assert.deepEqual(reload.errs,[]);
 console.log("PASS reader preferences restored after reload");
 process.exit(0);
})().catch(error=>{console.error("FAIL",error.stack);process.exit(1)});
