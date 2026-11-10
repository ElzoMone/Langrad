/* Langrad mobile stage 1: one navigation, two layouts.
 * Never clone/rebind navigation buttons or touch saved application state.
 * All six tabs remain the original working controls.
 */
(()=>{
"use strict";
const nav=document.querySelector("header > nav.topnav");
if(!nav)return;
const labels={
 read:"Читать",library:"Тексты",words:"Слова",
 practice:"Учить",stats:"Итоги",settings:"Настр."
};
function refresh(){
 let count=0;
 for(const button of nav.querySelectorAll("button[data-tab]")){
  const text=labels[button.dataset.tab];
  if(!text)continue;
  count++;
  if(button.dataset.mobileLabel!==text)button.dataset.mobileLabel=text;
  if(button.classList.contains("active")){
   if(button.getAttribute("aria-current")!=="page")button.setAttribute("aria-current","page");
  }else if(button.hasAttribute("aria-current"))button.removeAttribute("aria-current");
 }
 if(count)document.documentElement.dataset.mobileNavReady="true";
}
const observer=new MutationObserver(refresh);
// Library gets inserted dynamically by the existing Langrad module.
// Ignore our own data-mobile-label and aria-current writes.
observer.observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
refresh();
window.langradMobileShell={refresh};
})();
