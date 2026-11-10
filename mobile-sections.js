/* Langrad Mobile / Stage 4 — library, vocabulary, practice, progress & settings.
 * Touch-friendly presentation without reimplementing stored words or any
 * library/quiz/settings actions. Desktop DOM restores to its original layout.
 */
(()=>{
"use strict";
const mq=window.matchMedia?.("(max-width: 790px)");
const mobile=()=>mq?mq.matches:window.innerWidth<=790;
const $=id=>document.getElementById(id);
const library=$("library"),libraryList=$("lr-library-list"),words=$("words"),wordList=$("wordList"),
 searchWords=$("wordSearch"),settings=$("settings");
if(!library||!libraryList||!words||!wordList||!searchWords||!settings)return;
const root=document.documentElement;

// Live library searching: filter only rendered cards; do not rewrite titles,
// alter state.library, or interfere with original Open/Rename/Delete callbacks.
const libraryTools=document.createElement("div");
libraryTools.id="lr-mobile-library-tools";
libraryTools.className="lr-mobile-list-tools";
const librarySearch=document.createElement("input");
librarySearch.type="search";librarySearch.id="lr-mobile-library-search";
librarySearch.className="input";
librarySearch.placeholder="Найти текст по названию или содержанию";
librarySearch.setAttribute("aria-label","Поиск по библиотеке");
librarySearch.setAttribute("autocomplete","off");
const clearLibrary=document.createElement("button");
clearLibrary.type="button";clearLibrary.className="btn sm lr-mobile-clear";
clearLibrary.textContent="Очистить";
clearLibrary.setAttribute("aria-label","Очистить поиск текстов");
const libraryCount=document.createElement("output");
libraryCount.id="lr-mobile-library-count";libraryCount.className="lr-mobile-list-count";
libraryCount.setAttribute("aria-live","polite");
libraryTools.append(librarySearch,clearLibrary,libraryCount);
libraryList.before(libraryTools);
const emptyLibrary=document.createElement("p");
emptyLibrary.id="lr-mobile-library-no-results";
emptyLibrary.textContent="Нет текстов по этому запросу.";
emptyLibrary.hidden=true;
libraryList.after(emptyLibrary);
function normalized(text){
 return String(text||"").toLocaleLowerCase("de-DE").normalize("NFKC").trim();
}
let libraryUpdatePending=false;
function updateLibrary(){
 if(libraryUpdatePending)return;
 libraryUpdatePending=true;
 queueMicrotask(()=>{
  libraryUpdatePending=false;
  const cards=[...libraryList.querySelectorAll(".lr-library-entry")];
  const term=normalized(librarySearch.value);
  let visible=0;
  for(const card of cards){
   const title=normalized(card.querySelector(".lr-library-title")?.textContent);
   const preview=normalized(card.querySelector(".lr-library-preview")?.textContent);
   const show=!term||title.includes(term)||preview.includes(term);
   card.hidden=!show;
   if(show)visible++;
  }
  libraryCount.textContent=term?visible+" из "+cards.length+" текстов":cards.length+" текстов";
  emptyLibrary.hidden=!(term&&cards.length>0&&visible===0);
  clearLibrary.disabled=!librarySearch.value;
 });
}
librarySearch.addEventListener("input",updateLibrary);
clearLibrary.addEventListener("click",()=>{
 librarySearch.value="";updateLibrary();librarySearch.focus();
});
new MutationObserver(updateLibrary).observe(libraryList,{childList:true});
updateLibrary();

// Existing wordSearch runs renderWords. Add only a clear button and count.
// No separate filters or writes to the vocabulary.
const wordTools=document.createElement("div");
wordTools.id="lr-mobile-words-tools";
wordTools.className="lr-mobile-list-tools";
const searchAnchor=document.createComment("langrad-mobile-word-search-origin");
searchWords.before(searchAnchor);
const clearWords=document.createElement("button");
clearWords.type="button";clearWords.className="btn sm lr-mobile-clear";
clearWords.textContent="Очистить";
clearWords.setAttribute("aria-label","Очистить поиск слов");
const wordCount=document.createElement("output");
wordCount.id="lr-mobile-word-count";
wordCount.className="lr-mobile-list-count";
wordCount.setAttribute("aria-live","polite");
wordTools.append(searchWords,clearWords,wordCount);
const wordExport=words.querySelector("#exportCsv")?.closest(".row");
if(wordExport)wordExport.before(wordTools);
else words.insertBefore(wordTools,wordList);
let wordUpdatePending=false;
function updateWordCount(){
 if(wordUpdatePending)return;
 wordUpdatePending=true;
 queueMicrotask(()=>{
  wordUpdatePending=false;
  const count=wordList.querySelectorAll(".table-entry").length;
  wordCount.textContent=count+(count===1?" слово":" слов");
  clearWords.disabled=!searchWords.value;
 });
}
searchWords.addEventListener("input",updateWordCount);
clearWords.addEventListener("click",()=>{
 searchWords.value="";
 searchWords.dispatchEvent(new Event("input",{bubbles:true}));
 searchWords.focus();
});
new MutationObserver(updateWordCount).observe(wordList,{childList:true});
updateWordCount();

// Existing dynamically created settings blocks get native collapsible sections
// on phones. Preserve the actual node + event handlers and reverse on desktop.
const blocks=[
 ["lr-theme-settings","Тема оформления",true],
 ["lr-ai-settings","Нейросеть и адаптация",false],
 ["lr-wty-settings","Расширенный словарь WTY",false],
 ["lr-video-settings","Видео и субтитры",false],
 ["lr-classic-app-info","О приложении",false],
 ["lr-project-brief","Паспорт проекта",false]
];
const wrappers=new Map();
function setupWrappers(){
 for(const [id,label,opened] of blocks){
  const node=$(id);
  if(!node||wrappers.has(id))continue;
  const marker=document.createComment("langrad-mobile-settings-"+id);
  node.before(marker);
  const detail=document.createElement("details");
  detail.className="lr-mobile-settings-group";
  detail.dataset.section=id;
  detail.open=opened;
  const summary=document.createElement("summary");
  summary.textContent=label;
  summary.setAttribute("aria-label","Раздел настроек: "+label);
  detail.append(summary);
  wrappers.set(id,{node,marker,detail});
 }
}
function apply(){
 setupWrappers();
 const on=mobile();
 root.dataset.mobileSections=on?"true":"false";
 for(const {node,marker,detail} of wrappers.values()){
  if(on){
   if(node.parentNode!==detail){
    if(marker.parentNode)marker.after(detail);
    detail.append(node);
   }
  }else{
   if(node.parentNode===detail&&marker.parentNode)marker.after(node);
   detail.remove();
  }
 }
 // Restore the original word-search location on desktop. A stylesheet alone
 // cannot preserve that placement, so move the SAME input back and forth.
 if(on){
  if(searchWords.parentNode!==wordTools)wordTools.prepend(searchWords);
 }else{
  if(searchAnchor.parentNode)searchAnchor.after(searchWords);
 }
}
if(mq?.addEventListener)mq.addEventListener("change",apply);
else window.addEventListener("resize",apply);
apply();
window.langradMobileSections={
 apply,updateLibrary,updateWordCount,
 get librarySearch(){return librarySearch},
 get libraryCount(){return libraryCount.textContent},
 get wordCount(){return wordCount.textContent}
};
})();
