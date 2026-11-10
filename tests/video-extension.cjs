/* Langrad Video 0.5 smoke test with mock YouTube DOM and extension messaging.
 * npm i --no-save jsdom@26.1.0 && node tests/video-extension.cjs
 */
const fs=require("node:fs"),assert=require("node:assert/strict"),vm=require("node:vm");
const {JSDOM,VirtualConsole}=require("jsdom");
const manifest=JSON.parse(fs.readFileSync("video-extension/manifest.json","utf8"));
assert.equal(manifest.manifest_version,3);
assert.ok(manifest.content_scripts.some(x=>x.matches.includes("https://www.youtube.com/*")));
const text=fs.readFileSync("video-extension/content-youtube.js","utf8");
const mock={
 wordStatuses:{erkannte:{stage:2,reported:true,translation:"узнавать"},zigaretten:{stage:1,reported:false,translation:"сигареты"}},
 langradTheme:"tfr",videoSpeed:1,russianSubtitles:false
};
const writes=[],listeners=[];
const vconsole=new VirtualConsole(),errors=[];vconsole.on("jsdomError",e=>errors.push(String(e)));
const dom=new JSDOM('<!doctype html><html><body>'+
'<div class="html5-video-player"><video class="html5-main-video"></video>'+
'<div class="ytp-caption-window-container"><span class="ytp-caption-segment">Er erkannte die Zigaretten.</span></div></div>'+
'</body></html>',{url:"https://www.youtube.com/watch?v=test",runScripts:"outside-only",pretendToBeVisual:true,virtualConsole:vconsole});
const w=dom.window;
const messages=[];
w.chrome={
 runtime:{
  onMessage:{addListener:fn=>listeners.push(fn)},
  sendMessage:async msg=>{
   messages.push(msg);
   if(msg.type==="GET_SETTINGS")return {ok:true,data:{...mock,videoQueue:[]}};
   if(msg.type==="LOOKUP")return {ok:true,result:{word:msg.word,lemma:msg.word==="erkannte"?"erkennen":"die Zigarette",
    translation:msg.word==="erkannte"?"узнавать; распознавать":"сигарета",part:"глагол",grammar:"Präteritum",source:"FreeDict/WikDict",license:"CC BY-SA 3.0"},rank:123};
   if(msg.type==="LEARN")return {ok:true};
   if(msg.type==="SET_SETTING"){mock[msg.key]=msg.value;return {ok:true}}
   return {ok:false};
  }
 },
 storage:{
  local:{
   get:async()=>({...mock}),
   set:async values=>{Object.assign(mock,values);writes.push(values);for(const fn of listeners){}},
  },
  onChanged:{addListener:fn=>listeners.push(fn)}
 }
};
w.eval(text);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await sleep(730);
 const $=sel=>w.document.querySelector(sel);
 assert.ok($(".lr-v-root"),"YouTube caption overlay not inserted");
 assert.equal($(".lr-v-root").dataset.theme,"tfr");
 assert.equal(w.document.querySelectorAll(".lr-v-token").length,4);
 assert.ok($(".lr-v-token.known"),"reported/known status missing");
 assert.ok($(".lr-v-token.learning"),"learning status missing");
 assert.ok($(".lr-v-native-hidden"),"native caption not hidden");
 const tokens=[...w.document.querySelectorAll(".lr-v-token")];
 tokens[1].click();
 for(let i=0;i<20&&!$(".lr-v-translation");i++)await sleep(45);
 assert.ok($(".lr-v-translation")?.textContent.includes("узнавать"));
 assert.ok($(".lr-v-lemma")?.textContent.includes("erkennen"));
 assert.ok($(".lr-v-source")?.textContent.includes("CC BY-SA"));
 $(".lr-v-learn").click();
 await sleep(100);
 assert.ok(messages.some(x=>x.type==="LEARN"));
 assert.ok($(".lr-v-card-status").textContent.includes("Добавлено"));
 $(".lr-v-slow").click();
 await sleep(30);
 assert.equal($("video").playbackRate,.75);
 $(".lr-v-back").click();
 assert.equal($("video").currentTime,0);
 assert.ok(messages.filter(x=>x.type==="LOOKUP").length>=1);
 assert.deepEqual(errors,[]);
 console.log("PASS YouTube captions, four status types, morphology, attribution, study and playback");
 w.close();
 process.exit(0);
})().catch(e=>{console.error("FAIL",e.stack);w.close();process.exit(1)});
