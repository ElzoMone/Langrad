/* Langrad word-state legend and optional same-origin video companion bridge.
 * No user data leaves the local page unless the installed Langrad Video
 * extension explicitly requests it via this page's window messaging.
 */
(()=>{
"use strict";
const reader=document.getElementById("reader");
if(reader&&!document.getElementById("lr-word-legend")){
 const legend=document.createElement("div");
 legend.id="lr-word-legend";
 legend.setAttribute("role","note");
 legend.setAttribute("aria-label","Обозначения слов");
 const entries=[
  ["neutral","Обычное"],
  ["unknown","Неизвестное"],
  ["learning","Изучается"],
  ["known","Известно"]
 ];
 for(const [kind,label] of entries){
  const item=document.createElement("span");item.className="lr-legend-item";
  const sample=document.createElement("i");sample.className="lr-legend-sample "+kind;
  sample.setAttribute("aria-hidden","true");
  const caption=document.createElement("span");caption.textContent=label;
  item.append(sample,caption);legend.append(item);
 }
 const pageNav=document.getElementById("lr-page-nav-top");
 (pageNav||reader).before(legend);
}
// The companion YouTube extension is installed separately and only requests
// vocabulary status while langrad.vercel.app is open in the same Chrome profile.
// This is a same-origin, explicit opt-in browser-extension bridge.
window.addEventListener("message",event=>{
 if(event.source!==window||event.origin!==location.origin)return;
 if(event.data?.type!=="LR_VIDEO_STATUS_REQUEST")return;
 const vocabulary=Object.entries(state.words||{}).slice(0,12000).map(([key,r])=>({
  word:String(key).slice(0,70),
  stage:Math.max(0,Math.min(4,Number(r.stage)||0)),
  reported:!!r.reported,
  translation:typeof r.translation==="string"?r.translation.slice(0,220):""
 }));
 window.postMessage({type:"LR_VIDEO_STATUS",words:vocabulary,theme:document.documentElement.dataset.theme||"classic"},location.origin);
});
})();
