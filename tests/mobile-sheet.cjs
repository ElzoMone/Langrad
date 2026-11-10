/* Mobile stage 3 — bottom sheet DOM/integration regression.
 * npm i --no-save jsdom@26.1.0; node tests/mobile-sheet.cjs
 */
const fs=require("node:fs"),assert=require("node:assert/strict"),{JSDOM,VirtualConsole}=require("jsdom");
let html=fs.readFileSync("index.html","utf8");
const parts=["reader-lexicon.js","reader-pagination.js","loji-interface.js","loji-observation.js","word-status.js","classic-refresh.js","classic-details.js","mobile-shell.js","mobile-reader.js","mobile-sheet.js"];
const original=parts.map(p=>'<script defer src="/'+p+'"></script>').join("\n");
assert.ok(html.includes(original),"expected reader script order");
html=html.replace(original,parts.map(p=>'<script>'+fs.readFileSync(p,"utf8")+'</script>').join("\n"));
const userTitle="Erich Maria Remarque\\Drei Kameraden\\Kapitel 1\\";
const book=("Der Himmel war gelb wie Messing. Er erkannte seinen Freund. \n\n").repeat(85);
const initial={title:userTitle,text:book,aid:"B1",activeTextId:"book",
 library:[{id:"book",title:userTitle,text:book}],
 words:{himmel:{display:"Himmel",stage:0,reported:false,translation:"небо",correct:0,wrong:0,next:0}},
 results:{total:0,correct:0}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function setup(theme="classic"){
 const errors=[],vc=new VirtualConsole();vc.on("jsdomError",e=>errors.push(String(e)));
 const listeners=new Set(),mq={matches:true,addEventListener(type,fn){if(type==="change")listeners.add(fn)}};
 const dom=new JSDOM(html,{url:"https://langrad.vercel.app/",runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){
   w.matchMedia=()=>mq;
   w.requestAnimationFrame=fn=>fn();
   w.localStorage.setItem("langrad-v01",JSON.stringify(initial));
   w.localStorage.setItem("langrad-theme",theme);
   w.alert=()=>{};w.confirm=()=>true;w.scrollTo=()=>{};
   w.speechSynthesis={getVoices:()=>[],cancel:()=>{},speak:()=>{}};
   w.fetch=async()=>({ok:false,status:404,json:async()=>null});
  }});
 return {dom,w:dom.window,errors,mq,notify:()=>{for(const fn of listeners)fn({matches:mq.matches})}};
}
const token=(w,word)=>[...w.document.querySelectorAll("#reader .token")].find(x=>x.textContent===word);
const gesture=(w,element,start,end)=>{
 const a=new w.Event("touchstart",{bubbles:true});
 Object.defineProperty(a,"touches",{value:[{clientX:start[0],clientY:start[1]}]});element.dispatchEvent(a);
 const b=new w.Event("touchend",{bubbles:true});
 Object.defineProperty(b,"changedTouches",{value:[{clientX:end[0],clientY:end[1]}]});element.dispatchEvent(b);
};
(async()=>{
 for(const theme of ["classic","tfr","loji"]){
  const ctx=setup(theme),w=ctx.w,$=q=>w.document.querySelector(q);
  await sleep(160);
  const sheet=w.langradMobileSheet;
  assert.ok(sheet,"mobile module absent");
  assert.equal(sheet.isMounted(),true);
  const aside=$("#lr-mobile-word-sheet");
  assert.ok(aside);
  assert.equal(aside.parentElement,w.document.body);
  assert.equal(aside.getAttribute("role"),"dialog");
  assert.equal(aside.getAttribute("aria-hidden"),"true");
  assert.equal(aside.inert,true);
  assert.equal(sheet.isOpen(),false);
  assert.equal($("#lr-mobile-sheet-backdrop").hidden,true);
  const first=token(w,"Himmel");assert.ok(first);
  const originalPage=w.langradPager.pageNumber();
  first.click();
  await sleep(60);
  assert.equal(sheet.isOpen(),true);
  assert.equal(aside.getAttribute("aria-modal"),"true");
  assert.equal(aside.getAttribute("aria-hidden"),"false");
  assert.equal(aside.inert,false);
  assert.equal($("#lr-mobile-sheet-backdrop").hidden,false);
  assert.equal(w.document.documentElement.dataset.mobileSheetOpen,"true");
  assert.equal(sheet.getHeading(),"Himmel");
  assert.equal($("#detail .translation").textContent,"небо");
  assert.ok($("#study")&&$("#report")&&$("#manual"));
  assert.equal(w.langradPager.pageNumber(),originalPage);
  assert.equal($("#docTitle").textContent,userTitle);
  // Original word actions work despite being physically moved outside .layout.
  $("#study").click();await sleep(35);
  assert.equal(JSON.parse(w.localStorage.getItem("langrad-v01")).words.himmel.stage,1);
  assert.equal(sheet.isOpen(),true);
  $("#report").click();await sleep(35);
  assert.equal(JSON.parse(w.localStorage.getItem("langrad-v01")).words.himmel.reported,true);
  assert.equal(sheet.isOpen(),true);
  // Gesture must not close on horizontal or short vertical movement.
  gesture(w,$("#lr-mobile-sheet-header"),[150,100],[250,105]);
  assert.equal(sheet.isOpen(),true);
  gesture(w,$("#lr-mobile-sheet-header"),[150,100],[150,135]);
  assert.equal(sheet.isOpen(),true);
  gesture(w,$("#lr-mobile-sheet-header"),[150,100],[150,205]);
  assert.equal(sheet.isOpen(),false);
  assert.equal($("#lr-mobile-sheet-backdrop").hidden,true);
  assert.ok(!w.document.documentElement.dataset.mobileSheetOpen);
  assert.equal(aside.inert,true);
  // Close via backdrop and via Escape.
  token(w,"Messing").click();assert.equal(sheet.isOpen(),true);
  $("#lr-mobile-sheet-backdrop").click();assert.equal(sheet.isOpen(),false);
  token(w,"Rauch")?.click();
  if(sheet.isOpen()){
   w.document.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
   assert.equal(sheet.isOpen(),false);
  }
  // Reopen and navigate elsewhere: no stale overlay should remain.
  token(w,"Der").click();
  assert.equal(sheet.isOpen(),true);
  let tab=$('header nav [data-tab="words"]');tab.click();
  assert.equal(sheet.isOpen(),false);
  assert.equal($("#lr-mobile-sheet-backdrop").hidden,true);
  tab=$('header nav [data-tab="read"]');tab.click();
  token(w,"Der").click();assert.equal(sheet.isOpen(),true);
  // Move to desktop: reuse the SAME aside, no cloned #detail or double handlers.
  ctx.mq.matches=false;ctx.notify();sheet.apply();
  assert.equal(sheet.isMounted(),false);
  assert.equal(sheet.isOpen(),false);
  assert.equal(aside.parentElement,$(".layout"));
  assert.equal(aside.getAttribute("aria-modal"),null);
  assert.equal(aside.hasAttribute("aria-hidden"),false);
  assert.equal(aside.inert,false);
  assert.equal(w.document.querySelectorAll("#detail").length,1);
  assert.equal($("#docTitle").textContent,userTitle);
  const saved=JSON.parse(w.localStorage.getItem("langrad-v01"));
  assert.equal(saved.library[0].title,userTitle);
  assert.equal(saved.library[0].text,book);
  assert.equal(saved.words.himmel.reported,true);
  assert.deepEqual(ctx.errors,[],theme+" JS errors");
  console.log("PASS",theme,"sheet open/action/gesture/backdrop/Escape/tabs/desktop/user data");
  // Avoid timer callbacks from Loji firing after JSDOM is closed.
 }
 console.log("MOBILE SHEET DOM: ALL PASS");
 process.exit(0);
})().catch(e=>{console.error("FAIL",e.stack);process.exit(1)});
