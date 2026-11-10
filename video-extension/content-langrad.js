/* Companion bridge, only on langrad.vercel.app.
 * The site owns the actual words. The extension stores a local snapshot
 * and transfers additions through the existing acknowledged protocol.
 */
(()=>{
"use strict";
if(location.origin!=="https://langrad.vercel.app")return;
let currentIds=[];
function askStatuses(){window.postMessage({type:"LR_VIDEO_STATUS_REQUEST"},location.origin)}
async function sendQueue(){
 const {videoQueue=[]}=await chrome.storage.local.get("videoQueue");
 const queue=Array.isArray(videoQueue)?videoQueue.filter(x=>x&&typeof x.id==="string").slice(0,250):[];
 if(!queue.length){askStatuses();return}
 currentIds=queue.map(x=>x.id);
 window.postMessage({type:"LR_VIDEO_VOCAB",words:queue},location.origin);
}
window.addEventListener("message",async event=>{
 if(event.source!==window||event.origin!==location.origin)return;
 if(event.data?.type==="LR_VIDEO_VOCAB_ACK"){
  const ids=new Set(Array.isArray(event.data.ids)?event.data.ids:[]);
  const {videoQueue=[]}=await chrome.storage.local.get("videoQueue");
  await chrome.storage.local.set({videoQueue:(Array.isArray(videoQueue)?videoQueue:[]).filter(x=>!ids.has(x?.id))});
  currentIds=[];askStatuses();
 }else if(event.data?.type==="LR_VIDEO_STATUS"){
  const words=Array.isArray(event.data.words)?event.data.words:[];
  const map={};
  for(const r of words){
   const key=String(r.word||"").toLocaleLowerCase("de-DE");
   if(key.length<1||key.length>70)continue;
   map[key]={stage:Number(r.stage)||0,reported:!!r.reported,translation:String(r.translation||"").slice(0,220)};
  }
  await chrome.storage.local.set({wordStatuses:map,langradTheme:String(event.data.theme||"classic")});
 }
});
chrome.runtime.onMessage.addListener(msg=>{if(msg?.type==="SYNC_NOW")sendQueue()});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==="local"&&changes.videoQueue)sendQueue()});
window.addEventListener("focus",()=>{sendQueue();askStatuses()});
window.addEventListener("pageshow",()=>{sendQueue();askStatuses()});
setTimeout(()=>{sendQueue();askStatuses()},600);
})();
