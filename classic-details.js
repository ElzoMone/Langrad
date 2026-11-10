/* Langrad Classic / Stage 3: quieter lexical panel and settings provenance.
 * A presentation layer only: original dictionaries, translations, saved words
 * and reader events remain owned by Langrad.
 */
(()=>{
"use strict";
const root=document.documentElement;
const detail=document.getElementById("detail");
const settings=document.getElementById("settings");
const headerPills=document.querySelector("header .pills");
if(!root||!detail||!settings||!headerPills)return;
const classic=()=>root.dataset.theme==="classic";
const pillMarker=document.createComment("langrad-classic-pills-original");
headerPills.before(pillMarker);
const card=document.createElement("section");
card.id="lr-classic-app-info";
card.setAttribute("aria-label","Информация о словарях и хранении");
const heading=document.createElement("h2");heading.textContent="О приложении";
const source=document.createElement("p");
source.className="lr-classic-source-caption";
source.textContent="Базовый словарь · FreeDict/WikDict (CC BY-SA 3.0)";
const wty=document.createElement("p");wty.id="lr-classic-wty-count";wty.className="lr-classic-source-caption";
const explanation=document.createElement("p");explanation.className="lr-classic-source-note";
explanation.textContent="Базовый и расширенный словари учитываются отдельно. Расширенный WTY можно установить и проверить в разделе ниже.";
card.append(heading,source,explanation,wty);
settings.append(card);
let pillsMoved=false;
let wtyState="";
function updateWty(){
 const status=document.getElementById("lr-wty-status");
 const text=status?.textContent||"";
 const found=/Подключено:\s*([\d\s\u00a0\u202f]+)\s+словарных написаний/i.exec(text);
 const next=found?"Расширенный WTY · "+found[1].trim()+" словарных написаний (Wiktionary, CC BY-SA 4.0)":"";
 if(next!==wtyState){wtyState=next;wty.textContent=next;wty.hidden=!next;}
}
const grammarRaw=new WeakMap();
function gramClean(raw){
 const text=String(raw||"").trim();
 if(!text)return "";
 if(/^(?:встроенный словарь пока не знает|нет данных|не определено|значение зависит от контекста\.?$)/i.test(text))return "";
 return text.replace(/\s*Значение зависит от контекста\.\s*$/i,"").trim();
}
function textIsTranslation(text){
 const val=String(text||"").trim();
 return Boolean(val&&!/^(?:нет офлайн-перевода|нет перевода|нет русского перевода|перевод пока не найден|нет данных|перевод отсутствует|неизвестное слово)(?:[.!\s]|$)/i.test(val));
}
function setHidden(node,value){
 if(node&&node.hidden!==value)node.hidden=value;
}
function detailUpdate(){
 const term=detail.querySelector(".term");
 if(!term)return;
 const word=term.textContent||"";
 if(detail.dataset.classicLastWord!==word){
  detail.dataset.classicLastWord=word;
  delete detail.dataset.classicManualOpen;
 }
 const isClassic=classic();
 const morphology=detail.querySelector("#lr-morphology");
 if(morphology){
  const parts=morphology.querySelector(".lr-parts");
  const note=morphology.querySelector(".lr-partnote");
  const heading=morphology.querySelector(".label");
  const valid=Boolean(parts&&parts.children.length);
  const noun=Boolean(morphology.querySelector(".lr-nounhint"));
  setHidden(morphology,isClassic&&!valid&&!noun);
  if(note)setHidden(note,isClassic&&!valid);
  if(heading)setHidden(heading,isClassic&&!valid);
 }
 const tag=detail.querySelector(".tag");
 if(tag)setHidden(tag,isClassic&&/^(?:нет разбора|часть речи не определена)\s*$/i.test(tag.textContent.trim()));
 const gram=detail.querySelector(".gram");
 if(gram){
  if(!grammarRaw.has(gram))grammarRaw.set(gram,{raw:gram.textContent,display:gram.textContent});
  const data=grammarRaw.get(gram);
  if(isClassic){
   if(gram.textContent!==data.display){data.raw=gram.textContent}
   const next=gramClean(data.raw);
   if(gram.textContent!==next)gram.textContent=next;
   data.display=next;
   setHidden(gram,!next);
  }else{
   if(gram.textContent!==data.display&&gram.textContent!==data.raw)data.raw=gram.textContent;
   if(gram.textContent!==data.raw)gram.textContent=data.raw;
   data.display=data.raw;
   setHidden(gram,false);
  }
  const label=[...detail.querySelectorAll(".label")].find(x=>x.textContent.trim()==="Грамматика");
  if(label)setHidden(label,isClassic&&gram.hidden);
 }
 const lemmaLabel=[...detail.querySelectorAll(".label")].find(x=>x.textContent.trim()==="Начальная форма");
 const lemma=lemmaLabel?.nextElementSibling;
 if(lemmaLabel&&lemma){
  const absent=/^(?:не определена|не определено)\s*$/i.test(lemma.textContent.trim());
  setHidden(lemmaLabel,isClassic&&absent);setHidden(lemma,isClassic&&absent);
 }
 const manual=detail.querySelector("#manual");
 const save=detail.querySelector("#saveManual");
 const label=detail.querySelector('label[for="manual"]');
 if(manual&&save&&label){
  let toggle=detail.querySelector("#lr-classic-manual-toggle");
  if(!toggle&&isClassic){
   toggle=document.createElement("button");toggle.id="lr-classic-manual-toggle";
   toggle.className="btn sm lr-classic-manual-toggle";
   toggle.type="button";toggle.textContent="Изменить перевод";
   toggle.addEventListener("click",()=>{
    const open=detail.dataset.classicManualOpen!=="1";
    detail.dataset.classicManualOpen=open?"1":"0";
    detail.classList.toggle("lr-classic-manual-open",open);
    toggle.setAttribute("aria-expanded",String(open));
    if(open)manual.focus();
   });
   label.before(toggle);
  }
  const translated=textIsTranslation(detail.querySelector(".translation")?.textContent)
   ||textIsTranslation(detail.querySelector("#lr-wty-result .lr-wty-translations")?.textContent);
  detail.classList.toggle("lr-classic-translation-found",isClassic&&translated);
  detail.classList.toggle("lr-classic-manual-open",isClassic&&detail.dataset.classicManualOpen==="1");
  if(toggle){
   const labelText=translated?"Изменить перевод":"Свой перевод";
   if(toggle.textContent!==labelText)toggle.textContent=labelText;
   const expanded=String(!translated||detail.dataset.classicManualOpen==="1");
   if(toggle.getAttribute("aria-expanded")!==expanded)toggle.setAttribute("aria-expanded",expanded);
   setHidden(toggle,!isClassic||!translated);
  }
 }
}
function update(){
 const on=classic();
 if(on&&!pillsMoved){card.insertBefore(headerPills,explanation);pillsMoved=true;}
 if(!on&&pillsMoved){pillMarker.after(headerPills);pillsMoved=false;}
 updateWty();
 detailUpdate();
}
let pending=false;
function schedule(){
 if(pending)return;
 pending=true;
 queueMicrotask(()=>{pending=false;update()});
}
const detailWatcher=new MutationObserver(schedule);
detailWatcher.observe(detail,{subtree:true,childList:true,characterData:true});
const themeWatcher=new MutationObserver(schedule);
themeWatcher.observe(root,{attributes:true,attributeFilter:["data-theme"]});
const settingsWatcher=new MutationObserver(schedule);
settingsWatcher.observe(settings,{subtree:true,childList:true,characterData:true});
update();
window.langradClassicDetails={refresh:update};
})();
