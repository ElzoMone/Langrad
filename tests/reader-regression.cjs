/* Langrad final regression (stage 5).
   npm install --no-save jsdom@26.1.0
   node regression.cjs
   Tests existing UI, dictionary, morphology, separable verbs, cache and storage.
*/
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {JSDOM,VirtualConsole}=require("jsdom");
const BASE=process.env.LANGRAD_BASE||"https://langrad.vercel.app";
const html=fs.readFileSync("index.html","utf8").replace(
  '<script defer src="/reader-lexicon.js"></script>',
  '<script>'+fs.readFileSync("reader-lexicon.js","utf8")+'</script>'
);
const initial={
 title:"Мой старый текст",text:"Er kam spät an.",
 words:{alt:{display:"alt",stage:2,correct:3,wrong:1,next:0,lastDay:"2026-11-08",reported:false,translation:"МОЙ СОХРАНЁННЫЙ ПЕРЕВОД"}},
 results:{total:4,correct:3},aid:"B1",
 library:[{id:"test-original",title:"Мой старый текст",text:"Er kam spät an.",addedAt:1720000000000}],
 activeTextId:"test-original"
};
const network={},jsErrors=[];
const vconsole=new VirtualConsole();
vconsole.on("jsdomError",e=>jsErrors.push(e.message||String(e)));
const dom=new JSDOM(html,{url:BASE+"/",runScripts:"dangerously",virtualConsole:vconsole,pretendToBeVisual:true,
 beforeParse(w){
  w.localStorage.setItem("langrad-v01",JSON.stringify(initial));
  w.localStorage.setItem("langrad-theme","tfr");
  w.confirm=()=>true;w.alert=()=>{};
  w.scrollTo=()=>{};
  w.speechSynthesis={getVoices:()=>[],cancel:()=>{},speak:()=>{}};
  w.fetch=async input=>{
   const target=new URL(String(input),w.location.href);
   const key=target.hostname+target.pathname;
   network[key]=(network[key]||0)+1;
   if(target.hostname===new URL(BASE).hostname &&
      (/^\/(forms|dict)\//.test(target.pathname)||target.pathname==="/dictionary.json")){
     const r=await fetch(target.href);
     return {ok:r.ok,status:r.status,json:()=>r.json(),text:()=>r.text(),headers:r.headers};
   }
   if(target.hostname==="ru.wiktionary.org"){
     const r=await fetch(target.href);
     return {ok:r.ok,status:r.status,json:()=>r.json()};
   }
   return {ok:false,status:404,json:async()=>null};
  };
 }
});
const w=dom.window;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const check=(cond,msg)=>assert.ok(cond,msg);
async function http(path){
 const r=await fetch(BASE+path);
 assert.equal(r.status,200,path+" HTTP "+r.status);
 console.log("HTTP 200",path);
 return r;
}
function startReader(text){
 w.eval("state.text="+JSON.stringify(text)+";state.title='Регрессионный текст';persist();renderReader()");
}
function token(word){
 const node=[...w.document.querySelectorAll("#reader .token")]
   .find(n=>n.textContent.toLocaleLowerCase("de-DE")===word.toLocaleLowerCase("de-DE"));
 assert.ok(node,"missing reader token "+word);return node;
}
async function select(word,need,{omit=[]}={}){
 token(word).click();
 for(let i=0;i<130;i++){
  await sleep(140);
  const part=w.document.querySelector("#lr-offline-search");
  const value=part?.textContent||"";
  if(need.every(x=>value.includes(x)) && omit.every(x=>!value.includes(x)) &&
      !value.includes("Проверяю словоформу")){
   console.log("PASS",word,"⇒",value.replace(/\s+/g," ").slice(0,205));
   return value;
  }
 }
 throw Error("Unexpected card for "+word+" : "+w.document.querySelector("#lr-offline-search")?.textContent?.slice(0,630));
}
(async()=>{
 await sleep(400);
 // License attribution and theme.
 const footer=w.document.querySelector("footer#lr-sources-footer");
 check(footer,"attribution footer is missing");
 for(const l of ["FreeDict / WikDict","Wiktionary / Kaikki","Simplemma","Русский Викисловарь"])
  check(footer.textContent.includes(l),"missing footer source "+l);
 check(footer.querySelector('a[href="/dictionary-license.txt"]'),"FreeDict credits link");
 check(footer.querySelector('a[href="/forms/SOURCES.txt"]'),"Wiktionary credits link");
 check(footer.querySelector('a[href*="simplemma"]'),"Simplemma credits link");
 assert.equal(w.document.documentElement.dataset.theme,"tfr","saved TFR theme lost");
 console.log("PASS footer, licensing and restored TFR theme");

 // Persisted data, saved texts and learning state.
 let old=w.JSON.parse(w.localStorage.getItem("langrad-v01"));
 check(old.library.some(x=>x.id==="test-original"),"saved library item lost on initialization");
 assert.equal(old.words.alt.translation,"МОЙ СОХРАНЁННЫЙ ПЕРЕВОД");
 assert.equal(old.words.alt.stage,2);
 const libNav=w.document.querySelector('[data-tab="library"]');
 check(libNav,"texts library tab missing"); libNav.click();
 check(w.document.querySelector("#lr-library-list")?.textContent?.includes("Мой старый текст"),"library text not rendered");
 const selectTheme=w.document.querySelector("#lr-theme-select");
 check(selectTheme,"TFR settings selector missing");
 selectTheme.value="classic";selectTheme.dispatchEvent(new w.Event("change",{bubbles:true}));
 assert.equal(w.document.documentElement.dataset.theme,"classic");
 selectTheme.value="tfr";selectTheme.dispatchEvent(new w.Event("change",{bubbles:true}));
 assert.equal(w.localStorage.getItem("langrad-theme"),"tfr");
 console.log("PASS user dictionary, texts library and switching TFR/classic themes");

 startReader("Er erkannte die Zigaretten. Danach ist er gegangen. Die Stadt wurde eingenommen. Ich sehe diesen Mann. Er ist vorgestellter Professor.");
 await select("erkannte",["erkennen","узнавать"]);
 await select("Zigaretten",["die Zigarette","сигарета"]);
 await select("gegangen",["gehen","Partizip"]);
 await select("eingenommen",["einnehmen","Partizip"]);
 await select("diesen",["dieser","Другие возможные начальные формы"]);
 await select("vorgestellter",["vorgestellter → vorgestellt → vorstellen","представлять"]);
 console.log("PASS 6 offline wordform lookups");

 startReader("Er kam gestern spät an.");
 await select("kam",["ankommen","Отделяемый глагол","прибывать"]);
 startReader("Er kam an den Bahnhof.");
 await select("kam",["kommen"],{omit:["Отделяемый глагол"]});
 startReader("Sie rief den Freund an.");
 await select("rief",["anrufen","Отделяемый глагол"]);
 console.log("PASS separable verbs and negative preposition case");

 startReader("Das Tier war unbändig.");
 await select("unbändig",["Русский Викисловарь","необузданный"]);
 const wikiRequests=network["ru.wiktionary.org/w/api.php"]||0;
 startReader("Er war wirklich unbändig.");
 await select("unbändig",["Русский Викисловарь","необузданный"]);
 assert.equal(network["ru.wiktionary.org/w/api.php"]||0,wikiRequests,"Wiktionary result not cached");
 check(Object.keys(w.JSON.parse(w.localStorage.getItem("langrad-wiktionary-ru-v1"))).includes("unbändig"),"Wiktionary localStorage cache missing");
 console.log("PASS live Wiktionary API and repeat lookup cached");

 startReader("Er erkannte die Zigaretten. Sie ging. Er ist gegangen.");
 w.eval("record('erkannte').translation='МОЙ РУЧНОЙ ПЕРЕВОД';persist();renderReader()");
 await select("erkannte",["erkennen","узнавать"]);
 assert.equal(w.document.querySelector("#detail .translation")?.textContent,"МОЙ РУЧНОЙ ПЕРЕВОД","manual translation overwritten");
 const progress=w.JSON.parse(w.localStorage.getItem("langrad-v01"));
 assert.equal(progress.words.alt.translation,"МОЙ СОХРАНЁННЫЙ ПЕРЕВОД");
 assert.equal(progress.words.erkannte.translation,"МОЙ РУЧНОЙ ПЕРЕВОД");
 check(progress.library.some(x=>x.id==="test-original"),"text library deleted by clicks");
 console.log("PASS manual translations, saved library and learning status retained");
 
 // A stale async response may never repaint the new selection.
 token("erkannte").click();token("Zigaretten").click();
 await select("Zigaretten",["Zigarette","сигарета"]);
 assert.equal(w.document.querySelector("#detail .term")?.textContent,"Zigaretten","asynchronous race changed current word");
 console.log("PASS race safety");

 for(const path of ["/","/index.html","/reader-lexicon.js","/dictionary.json","/project.html",
   "/PROJECT.md","/dictionary-license.txt","/dict/er.json","/forms/er.json","/forms/manifest.json",
   "/forms/SOURCES.txt"]){await http(path)}
 if(jsErrors.length)throw Error("JSDOM runtime errors: "+jsErrors.slice(0,4).join("; "));
 console.log("RESULT: all regressions PASS; network calls",JSON.stringify(network));
 w.close();
 process.exit(0);
})().catch(e=>{console.error("TEST FAILURE",e.stack);w.close();process.exit(1)});
