/* Langrad Mobile / Stage 2 — reader controls, typography, swipe paging.
 * Move the REAL pagination, CEFR and adaptation buttons rather than cloning
 * functionality. No changes to state.words, library, adaptations or state.text.
 */
(()=>{
"use strict";
const mq=window.matchMedia?.("(max-width: 790px)");
const read=document.getElementById("read");
const reader=document.getElementById("reader");
const title=document.getElementById("docTitle");
const pager=document.getElementById("lr-page-nav-top");
const level=document.getElementById("lr-level-panel");
let classicMarkup=document.getElementById("lr-classic-markup");
let classicLegend=document.getElementById("lr-classic-legend-help");
if(!read||!reader||!title||!pager||!level||!window.langradPager)return;
const actions=[...read.children].find(x=>x.classList?.contains("row")&&x.querySelector("#addText"));
if(!actions)return;
const isMobile=()=>mq?mq.matches:innerWidth<=790;
const isClassic=()=>document.documentElement.dataset.theme==="classic";
const root=document.documentElement;
const defaults={size:20,leading:1.8};
const key="langrad-mobile-reading-v1";
let prefs={...defaults};
try{
 const stored=JSON.parse(localStorage.getItem(key)||"null");
 if(stored&&typeof stored==="object"){
  if(Number.isFinite(stored.size))prefs.size=Math.max(18,Math.min(28,Math.round(stored.size)));
  if([1.55,1.8,2.05].includes(stored.leading))prefs.leading=stored.leading;
 }
}catch(_){}
const shell=document.createElement("section");
shell.id="lr-mobile-reader-controls";shell.setAttribute("aria-label","Мобильное управление чтением");
const navLine=document.createElement("div");navLine.id="lr-mobile-navline";
const pageCounter=document.createElement("span");pageCounter.id="lr-mobile-pages";
pageCounter.setAttribute("aria-live","polite");
const zoom=document.createElement("div");zoom.id="lr-mobile-textsize";
zoom.setAttribute("role","group");zoom.setAttribute("aria-label","Размер текста");
const smaller=document.createElement("button");smaller.type="button";smaller.id="lr-mobile-font-down";
smaller.textContent="A−";smaller.setAttribute("aria-label","Уменьшить шрифт");
const fontDisplay=document.createElement("output");fontDisplay.id="lr-mobile-font-value";
fontDisplay.setAttribute("aria-label","Размер шрифта");
const larger=document.createElement("button");larger.type="button";larger.id="lr-mobile-font-up";
larger.textContent="A+";larger.setAttribute("aria-label","Увеличить шрифт");
zoom.append(smaller,fontDisplay,larger);
const settings=document.createElement("details");
settings.id="lr-mobile-reader-settings";
settings.innerHTML='<summary aria-label="Уровень, адаптация и настройки чтения">Настройки</summary>';
const preferences=document.createElement("div");preferences.id="lr-mobile-reader-preferences";
const lineLabel=document.createElement("label");lineLabel.textContent="Межстрочный интервал";
lineLabel.htmlFor="lr-mobile-line-height";
const lineSelect=document.createElement("select");lineSelect.id="lr-mobile-line-height";
for(const [value,label] of [["1.55","Компактный"],["1.8","Обычный"],["2.05","Свободный"]]){
 const item=document.createElement("option");item.value=value;item.textContent=label;lineSelect.append(item);
}
const gestureHint=document.createElement("p");gestureHint.className="lr-mobile-gesture-hint";
gestureHint.textContent="Листай страницы влево и вправо. Вертикальная прокрутка остаётся обычной.";
preferences.append(lineLabel,lineSelect,gestureHint);
settings.append(preferences);
const extras=document.createElement("details");extras.id="lr-mobile-reader-actions";
extras.innerHTML='<summary aria-label="Добавить текст и озвучивание">Текст и звук</summary>';
shell.append(navLine,settings,extras);
const titleRow=title.closest(".spread");
(titleRow||read).after(shell);
const markers=new Map();
let mounted=false;
function move(node,location){
 if(!node||!location||node.parentElement===location)return;
 let marker=markers.get(node);
 if(!marker){marker=document.createComment("lr-mobile-reader-origin-"+(node.id||"actions"));markers.set(node,marker)}
 // Desktop layout and Classic refresh can move the real control on theme changes.
 // Record its CURRENT, theme-appropriate origin before bringing it back to mobile.
 if(node.parentElement && node.parentElement!==location){
  node.before(marker);
 }
 location.append(node);
}
function restore(node){
 const marker=markers.get(node);
 if(!marker||!marker.parentNode)return;
 marker.after(node);
}
const nextButton=pager.querySelector("button:last-child");
if(nextButton){nextButton.before(pageCounter)}
function syncPage(){
 const p=window.langradPager;
 const number=Number(p.pageNumber?.()||1),count=Number(p.pageCount?.()||1);
 const text="Стр. "+number+" / "+count;
 if(pageCounter.textContent!==text)pageCounter.textContent=text;
}
const pageLabel=pager.querySelector(".lr-page-label");
if(pageLabel){
 const observer=new MutationObserver(syncPage);
 observer.observe(pageLabel,{characterData:true,childList:true,subtree:true});
}
function updateTypography(){
 root.style.setProperty("--lr-mobile-reader-size",prefs.size+"px");
 root.style.setProperty("--lr-mobile-reader-leading",String(prefs.leading));
 fontDisplay.textContent=prefs.size+" px";
 lineSelect.value=String(prefs.leading);
 smaller.disabled=prefs.size<=18;
 larger.disabled=prefs.size>=28;
}
function persistPrefs(){
 try{localStorage.setItem(key,JSON.stringify(prefs))}catch(_){}
 updateTypography();
}
smaller.addEventListener("click",()=>{prefs.size=Math.max(18,prefs.size-1);persistPrefs()});
larger.addEventListener("click",()=>{prefs.size=Math.min(28,prefs.size+1);persistPrefs()});
lineSelect.addEventListener("change",()=>{
 const value=Number(lineSelect.value);
 if([1.55,1.8,2.05].includes(value)){prefs.leading=value;persistPrefs()}
});
updateTypography();
function apply(){
 if(isMobile()){
  if(!mounted){
   mounted=true;
   move(pager,navLine);
   navLine.append(zoom);
   move(level,settings);
   settings.insertBefore(level,preferences);
   move(actions,extras);
  }else{
   // Classic refresh sometimes moves both level and pager on theme change.
   move(pager,navLine);move(level,settings);move(actions,extras);
   settings.insertBefore(level,preferences);
  }
  if(isClassic()){
   // On a direct TFR/Loji launch, Classic controls exist in a detached bar.
   // Resolve them lazily after switching to Classic.
   classicMarkup ||= document.getElementById("lr-classic-markup");
   classicLegend ||= document.getElementById("lr-classic-legend-help");
   move(classicMarkup,preferences);
   move(classicLegend,preferences);
  }else{
   restore(classicMarkup);
   restore(classicLegend);
  }
  shell.hidden=false;
  root.dataset.mobileReaderReady="true";
  syncPage();
 }else if(mounted){
  for(const node of [...markers.keys()].reverse())restore(node);
  mounted=false;
  shell.hidden=true;
  delete root.dataset.mobileReaderReady;
  settings.open=false;extras.open=false;
 }
}
let rafPending=false;
function schedule(){
 if(rafPending)return;
 rafPending=true;
 requestAnimationFrame(()=>{rafPending=false;apply()});
}
if(mq?.addEventListener)mq.addEventListener("change",schedule);
else window.addEventListener("resize",schedule);
new MutationObserver(schedule).observe(root,{attributes:true,attributeFilter:["data-theme"]});
let start=null;
reader.addEventListener("touchstart",event=>{
 if(!isMobile()||event.touches.length!==1||settings.open||extras.open){start=null;return}
 const touch=event.touches[0];
 const el=event.target;
 if(el.closest?.("a,button,input,select,textarea,[contenteditable='true']")){start=null;return}
 start={x:touch.clientX,y:touch.clientY,time:Date.now()};
},{passive:true});
reader.addEventListener("touchcancel",()=>{start=null},{passive:true});
reader.addEventListener("touchend",event=>{
 if(!start||!isMobile()||event.changedTouches.length!==1){start=null;return}
 const old=start;start=null;
 const touch=event.changedTouches[0];
 const dx=touch.clientX-old.x,dy=touch.clientY-old.y;
 if(Math.abs(dx)<68||Math.abs(dx)<Math.abs(dy)*1.65||Date.now()-old.time>1200)return;
 if(String(window.getSelection?.()||"").trim())return;
 const p=window.langradPager;
 const number=p.pageNumber?.()||1,count=p.pageCount?.()||1;
 const target=dx<0?number+1:number-1;
 if(target<1||target>count)return;
 p.goto(target-1);
 syncPage();
},{passive:true});
apply();
window.langradMobileReader={
 apply,syncPage,getPreferences:()=>({...prefs}),isMobile,
 get pageText(){return pageCounter.textContent}
};
})();
