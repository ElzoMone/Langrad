/* Loji / phase 3: original animated avatar, noninteractive observation HUD.
   No generated language content, saved words, text or glossary is modified. */
(()=>{
"use strict";
const sel=document.documentElement;
const gif="https://static.wikitide.net/thefireriseswikiwiki/a/af/Zheng_chan.gif";
const source="https://thefireriseswiki.miraheze.org/wiki/THE_LONG_MARCH#/media/File:Zheng_chan.gif";
const brand=document.querySelector("header > div:first-child");
const layout=document.querySelector(".layout");
if(!brand||!layout||brand.querySelector(".lr-loji-avatar"))return;
const avatar=document.createElement("div");
avatar.className="lr-loji-avatar";
avatar.setAttribute("aria-label","Лоджи — анимированный аватар с оригинальными помехами");
const image=document.createElement("img");
image.src=gif;image.alt="Лоджи — аватар с помехами";
image.width=156;image.height=210;image.loading="eager";image.decoding="async";
image.referrerPolicy="no-referrer";
image.onerror=()=>avatar.classList.add("lr-loji-avatar-error");
const badge=document.createElement("span");
badge.className="lr-loji-avatar-badge";badge.textContent="LOJI / LIVE";
const fallback=document.createElement("span");
fallback.className="lr-loji-avatar-fallback";fallback.textContent="◉";
avatar.append(image,badge,fallback);
brand.append(avatar);
// Original GIF is externally hosted. Preserve provenance link unobtrusively.
const railParent=document.createElement("div");
railParent.id="lr-loji-observation";railParent.setAttribute("aria-hidden","true");
function createRail(side){
 const node=document.createElement("div");
 node.className="lr-loji-rail lr-loji-rail-"+side;
 if(side==="left"){
  node.innerHTML='<div class="lr-loji-rail-heading">LOJI / <span>识别</span></div>'+
  '<div class="lr-loji-rail-rule"></div>'+
  '<div class="lr-loji-rail-data">OBSERVATION<br>CONTROL</div>'+
  '<div class="lr-loji-rail-bars" aria-hidden="true">'+
  Array.from({length:14},(_,i)=>'<i style="--n:'+i+'"></i>').join("")+'</div>'+
  '<div class="lr-loji-rail-vertical">LONG MARCH / NODE 01</div>'+
  '<div class="lr-loji-rail-foot">/// 010110</div>';
 }else{
  node.innerHTML='<div class="lr-loji-rail-heading">SYSTEM <span>监控</span></div>'+
  '<div class="lr-loji-rail-rule"></div>'+
  '<div class="lr-loji-rail-ring" aria-hidden="true"><i></i></div>'+
  '<div class="lr-loji-rail-data">MEMORY<br>INTERFACE</div>'+
  '<div class="lr-loji-rail-trace"><i></i><i></i><i></i><i></i><i></i></div>'+
  '<div class="lr-loji-rail-foot">PROCESS / ACTIVE</div>';
 }
 railParent.append(node);
 return node;
}
const left=createRail("left"),right=createRail("right");
document.body.append(railParent);
const anchor=document.createElement("a");
anchor.className="lr-loji-avatar-credit";
anchor.href=source;
anchor.target="_blank";anchor.rel="noopener noreferrer";
anchor.textContent="ANIMATION SOURCE";
anchor.title="Оригинальная анимация Лоджи";
brand.append(anchor);
let resizeQueued=false;
function layoutRails(){
 resizeQueued=false;
 const rect=layout.getBoundingClientRect();
 const viewport=document.documentElement.clientWidth;
 const loji=sel.dataset.theme==="loji";
 for(const [node,side] of [[left,"left"],[right,"right"]]){
  const gap=side==="left"?rect.left:viewport-rect.right;
  const width=Math.min(144,Math.max(0,gap-28));
  const visible=loji && viewport>=1260 && width>=86;
  node.classList.toggle("lr-loji-rail-hidden",!visible);
  if(visible){
   node.style.width=width+"px";
   node.style.left=(side==="left"?Math.max(10,rect.left-width-16):Math.min(viewport-width-10,rect.right+16))+"px";
  }
 }
}
function queueLayout(){
 if(resizeQueued)return;
 resizeQueued=true;
 requestAnimationFrame(layoutRails);
}
window.addEventListener("resize",queueLayout,{passive:true});
const watcher=new MutationObserver(queueLayout);
watcher.observe(sel,{attributes:true,attributeFilter:["data-theme"]});
queueLayout();
window.langradLojiObservation={layout:queueLayout};
})();
