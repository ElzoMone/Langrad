/* Langrad Classic refresh / phase 1.
 * Compact reader controls by MOVING their real DOM nodes; never clone/remove
 * their event handlers, touch the book title, the reader or localStorage.
 * Restore the original layout when switching to TFR or Loji.
 */
(()=>{
"use strict";
const root=document.documentElement;
const read=document.getElementById("read");
const level=document.getElementById("lr-level-panel");
const page=document.getElementById("lr-page-nav-top");
const legend=document.getElementById("lr-word-legend");
const docTitle=document.getElementById("docTitle");
if(!read||!level||!page||!legend||!docTitle)return;
const originals=new Map();
for(const node of [level,page,legend]){
 const marker=document.createComment("langrad-classic-original-"+node.id);
 node.before(marker);
 originals.set(node,marker);
}
const tools=document.createElement("div");
tools.id="lr-classic-reader-tools";
tools.setAttribute("aria-label","Управление страницей");
const help=document.createElement("details");
help.id="lr-classic-legend-help";
const toggle=document.createElement("summary");
toggle.title="Обозначения слов в тексте";
toggle.setAttribute("aria-label","Обозначения слов");
toggle.textContent="?";
help.append(toggle);
tools.append(help);
// Markup is a display preference, NOT a learning status. Never modify state.words.
const markupKey="langrad-classic-markup";
const allowed=new Set(["calm","study","clean","all"]);
function loadMarkup(){
 try{const value=localStorage.getItem(markupKey);return allowed.has(value)?value:"calm"}catch(_){return "calm"}
}
const markupControl=document.createElement("label");
markupControl.id="lr-classic-markup";
markupControl.title="Оформление слов. Не изменяет словарь или прогресс.";
const markupText=document.createElement("span");
markupText.textContent="Слова";
const markupSelect=document.createElement("select");
markupSelect.id="lr-classic-markup-select";
markupSelect.setAttribute("aria-label","Разметка слов");
for(const [value,label] of [
 ["calm","Сдержанно"],["study","Только изучаемые"],
 ["clean","Чистый текст"],["all","Все статусы"]
]){
 const option=document.createElement("option");
 option.value=value;option.textContent=label;markupSelect.append(option);
}
function setMarkup(value,save){
 const mode=allowed.has(value)?value:"calm";
 root.dataset.classicMarkup=mode;
 markupSelect.value=mode;
 if(save)try{localStorage.setItem(markupKey,mode)}catch(_){}
}
setMarkup(loadMarkup(),false);
markupControl.append(markupText,markupSelect);
tools.insertBefore(markupControl,help);
markupSelect.addEventListener("change",()=>setMarkup(markupSelect.value,true));
window.addEventListener("storage",e=>{
 if(e.key===markupKey)setMarkup(loadMarkup(),false);
});
const legendExplanation=document.createElement("p");
legendExplanation.className="lr-classic-legend-note";
legendExplanation.textContent="Обозначения видны полностью в режиме «Все статусы». Режимы меняют только отображение — слова и прогресс остаются прежними.";
legend.prepend(legendExplanation);
let installed=false;
function apply(){
 const classic=root.dataset.theme==="classic";
 if(classic){
  if(!installed){
   const titleRow=docTitle.closest(".spread");
   if(titleRow)titleRow.after(tools);
   else read.insertBefore(tools,document.getElementById("reader"));
   tools.insertBefore(level,help);
   tools.insertBefore(page,help);
   help.append(legend);
   installed=true;
  }
 }else if(installed){
  help.open=false;
  for(const [node,marker] of originals){
   marker.after(node);
  }
  tools.remove();
  installed=false;
 }
}
const observe=new MutationObserver(apply);
observe.observe(root,{attributes:true,attributeFilter:["data-theme"]});
apply();
window.langradClassicRefresh={update:apply};
})();
