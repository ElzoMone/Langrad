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
tools.append(level,page,help);
let installed=false;
function apply(){
 const classic=root.dataset.theme==="classic";
 if(classic){
  if(!installed){
   const titleRow=docTitle.closest(".spread");
   if(titleRow)titleRow.after(tools);
   else read.insertBefore(tools,document.getElementById("reader"));
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
