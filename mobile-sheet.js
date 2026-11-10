/* Langrad Mobile / Stage 3 — one real word detail, two presentations.
 * Reuse the existing .details aside and #detail subtree in a bottom sheet.
 * No duplicate dictionary lookup, word controls, storage or translation logic.
 */
(()=>{
"use strict";
const mq=window.matchMedia?.("(max-width: 790px)");
const root=document.documentElement;
const aside=document.querySelector(".layout > aside.details");
const reader=document.getElementById("reader");
const detail=document.getElementById("detail");
const topNav=document.querySelector("header > nav.topnav");
if(!aside||!reader||!detail||!topNav)return;

const mobile=()=>mq?mq.matches:innerWidth<=790;
const marker=document.createComment("langrad-mobile-word-panel-original-position");
aside.before(marker);
aside.id="lr-mobile-word-sheet";
const previousLabel=aside.getAttribute("aria-label");
const previousRole=aside.getAttribute("role");

const backdrop=document.createElement("div");
backdrop.id="lr-mobile-sheet-backdrop";
backdrop.setAttribute("aria-hidden","true");
backdrop.hidden=true;
document.body.append(backdrop);

const header=document.createElement("div");
header.id="lr-mobile-sheet-header";
header.innerHTML='<div class="lr-mobile-sheet-handle" aria-hidden="true"></div>';
const row=document.createElement("div");
row.className="lr-mobile-sheet-heading";
const heading=document.createElement("h2");
heading.id="lr-mobile-sheet-title";
heading.textContent="Слово";
const closeButton=document.createElement("button");
closeButton.type="button";
closeButton.id="lr-mobile-sheet-close";
closeButton.setAttribute("aria-label","Закрыть карточку слова");
closeButton.textContent="×";
row.append(heading,closeButton);
header.append(row);
aside.prepend(header);

const state={open:false,mounted:false,selected:null,scrollY:0};
function updateHeading(){
 const term=detail.querySelector(".term")?.textContent?.trim()||"";
 if(term&&heading.textContent!==term)heading.textContent=term;
}
new MutationObserver(updateHeading).observe(detail,{childList:true,subtree:true,characterData:true});
function accessibility(){
 const accessible=mobile();
 if(accessible){
  aside.setAttribute("role","dialog");
  aside.setAttribute("aria-modal","true");
  aside.setAttribute("aria-label","Информация о слове");
  aside.setAttribute("aria-labelledby","lr-mobile-sheet-title");
  aside.setAttribute("aria-hidden",state.open?"false":"true");
  aside.inert=!state.open;
 }else{
  if(previousRole===null)aside.removeAttribute("role");
  else aside.setAttribute("role",previousRole);
  if(previousLabel===null)aside.removeAttribute("aria-label");
  else aside.setAttribute("aria-label",previousLabel);
  aside.removeAttribute("aria-modal");
  aside.removeAttribute("aria-labelledby");
  aside.removeAttribute("aria-hidden");
  aside.inert=false;
 }
}
function open(token){
 if(!mobile())return;
 if(token?.isConnected)state.selected=token;
 state.scrollY=window.scrollY||0;
 state.open=true;
 root.dataset.mobileSheetOpen="true";
 backdrop.hidden=false;
 accessibility();
 updateHeading();
 // Keep the scroll position and avoid a focus-induced jump.
 try{closeButton.focus({preventScroll:true})}catch(_){closeButton.focus()}
 detail.scrollTop=0;
}
function close({restoreFocus=true}={}){
 if(!state.open)return;
 state.open=false;
 delete root.dataset.mobileSheetOpen;
 backdrop.hidden=true;
 accessibility();
 if(restoreFocus&&state.selected?.isConnected){
  try{state.selected.focus({preventScroll:true})}catch(_){state.selected.focus()}
 }
 if(mobile()&&Math.abs((window.scrollY||0)-state.scrollY)>2)window.scrollTo(0,state.scrollY);
 state.selected=null;
}
function apply(){
 if(mobile()){
  if(!state.mounted){
   document.body.append(aside);
   state.mounted=true;
  }
 }else{
  close({restoreFocus:false});
  if(state.mounted&&marker.parentNode)marker.after(aside);
  state.mounted=false;
 }
 accessibility();
}
function onToken(event){
 if(!mobile())return;
 const node=event.target.closest?.("#reader .token");
 if(!node)return;
 // The original selectWord handler has already filled the detail card.
 open(node);
}
reader.addEventListener("click",onToken);
reader.addEventListener("keydown",event=>{
 if(event.key!=="Enter"&&event.key!==" ")return;
 const node=event.target.closest?.("#reader .token");
 if(!node||!mobile())return;
 // Original word keydown handler processes the word synchronously.
 open(node);
});
closeButton.addEventListener("click",()=>close());
backdrop.addEventListener("click",()=>close());
document.addEventListener("keydown",event=>{
 if(!state.open)return;
 if(event.key==="Escape"){
  event.preventDefault();close();return;
 }
 if(event.key!=="Tab")return;
 const focusable=[...aside.querySelectorAll("button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])")]
   .filter(n=>n.getClientRects().length&&!n.closest("[hidden]")&&!n.closest("[inert]"));
 if(!focusable.length)return;
 const first=focusable[0],last=focusable[focusable.length-1];
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
});
let gesture=null;
function startSwipe(event){
 if(!state.open||event.touches?.length!==1)return;
 const t=event.touches[0];
 const inHeader=header.contains(event.target);
 const inContent=detail.contains(event.target);
 if(!inHeader&&!(inContent&&detail.scrollTop<=0))return;
 gesture={x:t.clientX,y:t.clientY,header:inHeader,time:Date.now()};
}
function finishSwipe(event){
 if(!gesture||event.changedTouches?.length!==1){gesture=null;return}
 const start=gesture;gesture=null;
 const end=event.changedTouches[0];
 const dy=end.clientY-start.y,dx=end.clientX-start.x;
 const threshold=start.header?65:115;
 if(dy>threshold&&dy>Math.abs(dx)*1.35&&Date.now()-start.time<1400&&detail.scrollTop<=1)close();
}
aside.addEventListener("touchstart",startSwipe,{passive:true});
aside.addEventListener("touchend",finishSwipe,{passive:true});
aside.addEventListener("touchcancel",()=>{gesture=null},{passive:true});

// Clicking another tab or changing a page should never leave a stale word
// sheet covering another section. These are the ORIGINAL navigation buttons.
topNav.addEventListener("click",event=>{
 if(event.target.closest?.("button[data-tab]"))close({restoreFocus:false});
});
for(const nav of ["lr-page-nav-top","lr-page-nav-bottom"]){
 document.getElementById(nav)?.addEventListener("click",event=>{
  if(event.target.closest?.("button"))close({restoreFocus:false});
 });
}
const readerSettings=document.getElementById("lr-mobile-reader-settings");
readerSettings?.addEventListener("toggle",()=>{
 if(readerSettings.open)close({restoreFocus:false});
});
const changeObserver=new MutationObserver(()=>{
 if(state.open&&(!reader.isConnected||document.getElementById("read")?.classList.contains("hidden")))close({restoreFocus:false});
});
changeObserver.observe(document.querySelector(".layout > main"),{childList:true,subtree:false,attributes:true});
if(mq?.addEventListener)mq.addEventListener("change",apply);
else window.addEventListener("resize",apply);
apply();
window.langradMobileSheet={
 open,close,apply,isOpen:()=>state.open,isMounted:()=>state.mounted,
 getHeading:()=>heading.textContent
};
})();
