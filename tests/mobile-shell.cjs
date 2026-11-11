/* Mobile stage 1: original navigation and responsive scaffold, no state edits.
 * npm i --no-save jsdom@26.1.0
 * node tests/mobile-shell.cjs
 */
const fs=require("node:fs"),assert=require("node:assert/strict"),{JSDOM,VirtualConsole}=require("jsdom");
let html=fs.readFileSync("index.html","utf8");
const scripts=["reader-lexicon.js","reader-pagination.js","loji-interface.js","loji-observation.js","word-status.js","classic-refresh.js","classic-details.js","mobile-shell.js"];
const original=scripts.map(f=>'<script defer src="/'+f+'"></script>').join("\n");
assert.ok(html.includes(original),"Expected script order changed");
html=html.replace(original,scripts.map(f=>'<script>'+fs.readFileSync(f,"utf8")+'</script>').join("\n"));
const css=fs.readFileSync("mobile-shell.css","utf8");
assert.match(css,/@media\s*\(max-width:\s*790px\)/);
assert.match(css,/position:fixed!important/);
assert.match(css,/env\(safe-area-inset-bottom,0px\)/);
for(const tab of ["read","library","discover","words","practice","stats","settings"])
 assert.ok(css.includes('button[data-tab="'+tab+'"]::before'),"Missing icon for "+tab);
const title="Erich Maria Remarque\\Drei Kameraden\\Kapitel 1\\";
const book=("Der Himmel war gelb wie Messing. Er erkannte seinen Freund. \n\n").repeat(85);
const initial={title,text:book,activeTextId:"a",aid:"B1",results:{total:2,correct:1},
 words:{himmel:{display:"Himmel",stage:1,translation:"небо",next:0,correct:1,wrong:0}},
 library:[{id:"a",title,text:book}]};
const errors=[],vc=new VirtualConsole();vc.on("jsdomError",e=>errors.push(String(e)));
const dom=new JSDOM(html,{url:"https://langrad.vercel.app/",runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,
 beforeParse(w){
  w.localStorage.setItem("langrad-v01",JSON.stringify(initial));
  w.localStorage.setItem("langrad-theme","classic");
  w.scrollTo=()=>{};w.alert=()=>{};w.confirm=()=>true;
  w.speechSynthesis={getVoices:()=>[],cancel:()=>{},speak:()=>{}};
  w.fetch=async()=>({ok:false,status:404,json:async()=>null});
 }});
const w=dom.window,$=s=>w.document.querySelector(s);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const names={read:"Читать",library:"Тексты",discover:"Найти",words:"Слова",practice:"Учить",stats:"Итоги",settings:"Настр."};
(async()=>{
 await sleep(220);
 assert.ok(w.langradMobileShell);
 const nav=$("header > nav.topnav");
 assert.ok(nav);
 assert.equal(w.document.querySelectorAll("header nav.topnav").length,1,"Duplicate navigation");
 assert.equal(w.document.documentElement.dataset.mobileNavReady,"true");
 const tabs=[...nav.querySelectorAll("button[data-tab]")];
 assert.equal(tabs.length,7,"All seven tabs must stay available");
 for(const [type,short] of Object.entries(names)){
  const b=nav.querySelector('[data-tab="'+type+'"]');
  assert.ok(b,type+" missing");
  assert.equal(b.dataset.mobileLabel,short);
 }
 assert.equal(nav.querySelectorAll('button[aria-current="page"]').length,1);
 assert.equal(nav.querySelector('[aria-current="page"]').dataset.tab,"read");
 assert.ok(w.langradPager.pageCount()>1);
 console.log("PASS seven navigation buttons, short labels and page state");

 for(const tab of ["library","discover","words","practice","stats","settings","read"]){
  const button=nav.querySelector('[data-tab="'+tab+'"]');
  button.click();
  await sleep(35);
  assert.equal(button.classList.contains("active"),true,"Navigation failed "+tab);
  assert.equal(button.getAttribute("aria-current"),"page","Accessibility state wrong "+tab);
  assert.equal(nav.querySelectorAll('button[aria-current="page"]').length,1,"Multiple current nav buttons");
  assert.equal($("#"+tab).classList.contains("hidden"),false,"Section not opened "+tab);
 }
 console.log("PASS all seven tabs navigate to the real sections with aria-current");

 // New buttons inserted by future modules also receive a mobile label
 // without replacing any existing button/event handler.
 const extra=w.document.createElement("button");
 extra.dataset.tab="library";extra.textContent="Тексты";
 nav.append(extra);await sleep(35);
 assert.equal(extra.dataset.mobileLabel,"Тексты");
 extra.remove();
 await sleep(15);

 const picker=$("#lr-theme-select");
 for(const theme of ["tfr","loji","classic"]){
  picker.value=theme;picker.dispatchEvent(new w.Event("change",{bubbles:true}));
  await sleep(55);
  assert.equal(w.document.documentElement.dataset.theme,theme);
  assert.equal(nav.querySelectorAll('button[data-tab]').length,7);
  assert.ok(nav.querySelector('[data-tab="library"]'));
  assert.equal(nav.querySelector('[data-tab="read"]').dataset.mobileLabel,"Читать");
 }
 assert.equal($("#docTitle").textContent,title,"User title modified");
 const saved=JSON.parse(w.localStorage.getItem("langrad-v01"));
 assert.equal(saved.library[0].title,title);
 assert.equal(saved.library[0].text,book);
 assert.equal(saved.words.himmel.translation,"небо");
 assert.deepEqual(errors,[]);
 console.log("PASS themes, library/word preservation, unchanged original titles and no runtime errors");
 w.close();
})().catch(error=>{console.error("FAIL",error.stack);w.close();process.exit(1)});
