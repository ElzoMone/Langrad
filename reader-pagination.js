/* Langrad — reading pagination and per-page learning adaptations.
 * The source text stays intact in state.text and state.library.
 * Generated CEFR page variants live only in state.pageAdaptations.
 */
(()=>{
"use strict";
const MIN_WORDS=210,TARGET_WORDS=245,MAX_WORDS=300;
const read=document.getElementById("read"),reader=document.getElementById("reader");
if(!read||!reader||typeof renderReader!=="function")return;
const originalRender=renderReader;
let currentSource=null,currentDoc=null,currentSignature=null,pages=[],page=0;
const wordPattern=/[\p{L}]+(?:['’-][\p{L}]+)*/gu;
const words=s=>(String(s||"").match(wordPattern)||[]).length;
const keyOf=()=>String(state.activeTextId||"current-text");
function signature(s){
 let h=2166136261;
 // FNV-1a over the entire source; prevents a stale page variant being
 // displayed after edits even when the text has the same length.
 for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
 return (h>>>0).toString(36)+"-"+s.length;
}
function paginate(text){
 const matches=[...text.matchAll(wordPattern)];
 if(!matches.length)return [{text:text.trim(),start:0,end:text.length,words:0}];
 const all=[],n=matches.length;
 let start=0,startWord=0;
 while(startWord<n){
  let endWord=Math.min(startWord+TARGET_WORDS,n);
  if(endWord<n){
   const lower=Math.min(startWord+MIN_WORDS,n-1);
   const upper=Math.min(startWord+MAX_WORDS,n-1);
   let sentence=null,paragraph=null;
   for(let k=lower;k<=upper;k++){
    const before=matches[k-1],after=matches[k];
    if(!after)break;
    const gap=text.slice(before.index+before[0].length,after.index);
    if(/\n\s*\n/.test(gap))paragraph=k;
    if(/[.!?…][\s"'”»)\]]*$/.test(gap)||/[.!?…]["'”»)\]]*\s+/.test(gap))sentence=k;
    if(paragraph!==null && k>=startWord+TARGET_WORDS-15)break;
   }
   endWord=paragraph??sentence??Math.min(startWord+TARGET_WORDS,n);
   if(endWord<=startWord)endWord=Math.min(startWord+TARGET_WORDS,n);
  }
  const end=endWord<n?matches[endWord].index:text.length;
  all.push({text:text.slice(start,end).trim(),start,end,words:endWord-startWord});
  start=end;startWord=endWord;
 }
 // Avoid a nearly empty last page when it can be combined safely.
 if(all.length>1&&all[all.length-1].words<80&&
    all[all.length-2].words+all[all.length-1].words<=355){
  const last=all.pop(),prev=all[all.length-1];
  prev.text=text.slice(prev.start,last.end).trim();
  prev.end=last.end;prev.words+=last.words;
 }
 return all;
}
function ensure(){
 const text=String(state.text||""),doc=keyOf(),sig=signature(text);
 if(text===currentSource&&doc===currentDoc&&sig===currentSignature)return;
 currentSource=text;currentDoc=doc;currentSignature=sig;pages=paginate(text);
 const saved=state.readingPages?.[doc];
 page=saved?.signature===sig?Math.min(Math.max(0,saved.index||0),pages.length-1):0;
}
function storageKey(p=page,level=state.aid||"B1"){
 return keyOf()+"|"+currentSignature+"|"+p+"|"+level;
}
function saved(p=page,level=state.aid||"B1"){
 const variant=state.pageAdaptations?.[storageKey(p,level)];
 return variant&&typeof variant.variant==="string"?variant:null;
}
function displayed(){
 ensure();
 const current=pages[page]?.text||"";
 return saved()?.variant||current;
}
function pageOriginal(){ensure();return pages[page]?.text||""}
function context(){
 ensure();return {doc:keyOf(),signature:currentSignature,index:page,original:pageOriginal()};
}
function isContext(ctx){
 ensure();return Boolean(ctx&&ctx.doc===keyOf()&&ctx.signature===currentSignature&&ctx.index===page);
}
function save(ctx,{variant,level,method}){
 ensure();
 if(!ctx||ctx.doc!==keyOf()||ctx.signature!==currentSignature||!Number.isInteger(ctx.index)||ctx.index<0||ctx.index>=pages.length)return false;
 const original=pages[ctx.index].text;
 const value=String(variant||"").trim();
 if(!value)return false;
 state.pageAdaptations??={};
 const target=ctx.doc+"|"+ctx.signature+"|"+ctx.index+"|"+level;
 state.pageAdaptations[target]={sourceId:ctx.doc,original,variant:value,level,method};
 persist();
 if(isContext(ctx)&&state.aid===level)renderReader();
 return true;
}
function clear(){
 ensure();
 const target=storageKey();
 if(state.pageAdaptations?.[target])delete state.pageAdaptations[target];
 persist();renderReader();
}
function goto(next){
 ensure();
 const index=Math.max(0,Math.min(pages.length-1,Number(next)||0));
 if(index===page)return;
 page=index;
 state.readingPages??={};
 state.readingPages[keyOf()]={signature:currentSignature,index:page};
 persist();renderReader();
 // Ensure jumping between pages doesn't leave the reader at the very bottom.
 document.getElementById("lr-page-nav-top")?.scrollIntoView?.({block:"start",behavior:"auto"});
}
function createNavigation(id){
 const nav=document.createElement("nav");
 nav.id=id;nav.className="lr-page-nav";nav.setAttribute("aria-label","Страницы текста");
 const prev=document.createElement("button");
 prev.type="button";prev.className="btn sm";prev.textContent="← Назад";
 const label=document.createElement("span");label.className="lr-page-label";label.setAttribute("aria-live","polite");
 const next=document.createElement("button");
 next.type="button";next.className="btn sm";next.textContent="Вперёд →";
 const picker=document.createElement("select");picker.className="lr-page-select";
 picker.setAttribute("aria-label","Перейти к странице");
 prev.addEventListener("click",()=>goto(page-1));next.addEventListener("click",()=>goto(page+1));
 picker.addEventListener("change",()=>goto(Number(picker.value)));
 nav.append(prev,label,picker,next);
 return {nav,prev,next,label,picker};
}
const top=createNavigation("lr-page-nav-top");
const bottom=createNavigation("lr-page-nav-bottom");
reader.before(top.nav);
reader.after(bottom.nav);
function update(){
 ensure();
 for(const item of [top,bottom]){
  const n=pages.length;
  item.nav.hidden=n<=1;
  item.prev.disabled=page===0;
  item.next.disabled=page>=n-1;
  item.label.textContent="Страница "+(page+1)+" из "+n+" · "+(pages[page]?.words||0)+" слов";
  if(item.picker.options.length!==n){
   item.picker.replaceChildren();
   for(let i=0;i<n;i++){const option=document.createElement("option");option.value=i;option.textContent=String(i+1);item.picker.append(option)}
  }
  item.picker.value=String(page);
 }
 const a=saved();
 const info=read.querySelector("#lr-page-adapt-indicator");
 if(info){
  info.textContent=a?"Эта страница: версия "+a.level+" ("+a.method+"). Оригинал сохранён отдельно.":"Показан оригинал этой страницы. Gemini адаптирует только открытую страницу.";
 }
}
const indicator=document.createElement("p");
indicator.id="lr-page-adapt-indicator";indicator.className="lr-page-note";
bottom.nav.after(indicator);
// Pre-pagination Gemini versions used to replace the whole state.text.
// Keep them accessible: the source can be restored without losing words.
const restoreLegacy=document.createElement("button");
restoreLegacy.type="button";
restoreLegacy.className="btn sm lr-page-legacy";
restoreLegacy.textContent="Вернуть исходный текст целиком (старая версия)";
restoreLegacy.hidden=true;
indicator.after(restoreLegacy);
function hasLegacy(){
 const a=state.adaptation;
 return !!(a&&typeof a.original==="string"&&a.original&&
           a.variant===state.text&&a.sourceId===state.activeTextId);
}
restoreLegacy.addEventListener("click",()=>{
 if(!hasLegacy()||!confirm("Вернуть исходный текст целиком? Старая полная адаптация останется только в резервной копии, если она была сделана."))return;
 state.text=state.adaptation.original;
 state.adaptation=null;
 persist();renderReader();
});
renderReader=function(){
 ensure();
 const result=originalRender.apply(this,arguments);
 update();
 restoreLegacy.hidden=!hasLegacy();
 return result;
};
// For the preexisting renderer and Gemini/local adaptation IIFE.
window.langradPager={
 displayPageText:displayed,originalPage:pageOriginal,
 currentContext:context,isContext,saveForContext:save,
 getCurrentAdaptation:saved,clearCurrentAdaptation:clear,
 pageCount:()=>{ensure();return pages.length},
 pageNumber:()=>{ensure();return page+1},
 goto,splitText:paginate
};
const detail=document.querySelector(".layout>.details");
if(detail){detail.tabIndex=0;detail.setAttribute("aria-label","Карточка слова. Прокручивается отдельно от текста.");}
renderReader();
})();