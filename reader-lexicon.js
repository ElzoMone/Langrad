/* Langrad stage 3 — lazy offline Wiktionary form → lemma → DE-RU translation. */
(()=>{
"use strict";
const formCache=new Map(), translationCache=new Map(), foldedCache=new WeakMap();
let revision=0;
const clean=w=>String(w||"").trim().normalize("NFC").toLocaleLowerCase("de-DE");
const formKey=w=>clean(w).replace(/ß/g,"ss");
const fold=w=>formKey(w).replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue");
const shard=w=>{const v=fold(w).replace(/^[^a-z]+/,"");return /^[a-z]{2}/.test(v)?v.slice(0,2):"other"};
const grammar={
 "first-person":"1-е лицо","second-person":"2-е лицо","third-person":"3-е лицо",
 singular:"ед. ч.",plural:"мн. ч.",masculine:"муж. род",feminine:"жен. род",neuter:"ср. род",
 nominative:"Nominativ",accusative:"Akkusativ",dative:"Dativ",genitive:"Genitiv",
 present:"Präsens",past:"прошедшее время",preterite:"Präteritum",
 perfect:"Perfekt",pluperfect:"Plusquamperfekt",future:"Futur",
 participle:"Partizip",imperative:"Imperativ",indicative:"Indikativ",
 subjunctive:"Konjunktiv",comparative:"Komparativ",superlative:"Superlativ",
 strong:"сильное склонение",weak:"слабое склонение",mixed:"смешанное склонение",
 infinitive:"Infinitiv",passive:"Passiv",active:"Aktiv"
};
const posLabel={verb:"глагол",noun:"существительное",adj:"прилагательное",adv:"наречие",
 pron:"местоимение",det:"определитель",num:"числительное",n:"существительное",
 v:"глагол",prep:"предлог"};
function load(kind,prefix){
 const cache=kind==="forms"?formCache:translationCache;
 if(!cache.has(prefix)){
  const url="/"+kind+"/"+encodeURIComponent(prefix)+".json";
  const promise=fetch(url,{cache:"force-cache"}).then(r=>{
   if(r.status===404)return null;
   if(!r.ok)throw Error("HTTP "+r.status+" ("+url+")");
   return r.json();
  }).then(json=>json&&typeof json==="object"&&!Array.isArray(json)?json:null)
   .catch(err=>{cache.delete(prefix);throw err});
  cache.set(prefix,promise);
 }
 return cache.get(prefix);
}
function getValue(dictionary,term,kind){
 if(!dictionary)return null;
 const original=clean(term),normalized=formKey(term);
 const direct=dictionary[original]??dictionary[normalized];
 if(direct!==undefined)return direct;
 // Approximate orthographic matching is a last resort, never a new lemma.
 // Needed for WikDict headwords like "Straße" when user enters "Strasse".
 let map=foldedCache.get(dictionary);
 if(!map){
  map=new Map();
  for(const key of Object.keys(dictionary)){
   const f=fold(key);
   if(!map.has(f))map.set(f,dictionary[key]);
  }
  foldedCache.set(dictionary,map);
 }
 return map.get(fold(term))??null;
}
async function dictionaryEntry(term){
 const doc=await load("dict",shard(term));
 const entry=getValue(doc,term,"dict");
 if(!Array.isArray(entry)||!Array.isArray(entry[0])||!entry[0].length)return null;
 return {entry,lemma:String(entry[3]||term),translation:entry[0].filter(x=>typeof x==="string").slice(0,7).join("; ")};
}
function getFormAnalyses(data,word){
 const values=getValue(data,word,"forms");
 if(!Array.isArray(values))return [];
 const unique=new Map();
 for(const item of values){
  if(!Array.isArray(item)||typeof item[0]!=="string"||!item[0].trim())continue;
  const [lemma,pos,tags,source]=item;
  const id=[lemma,pos,source].join("\u0000");
  if(!unique.has(id))unique.set(id,{lemma,pos,tags:[],source});
  const target=unique.get(id);
  const text=Array.isArray(tags)?tags.filter(x=>typeof x==="string"):[];
  if(text.length && !target.tags.some(t=>t.join("|")===text.join("|")))target.tags.push(text);
 }
 return [...unique.values()];
}
function nounTitle(data,lemma){
 const pos=String(data?.[1]||"").toLowerCase();
 if(!(/^(n|noun)$/.test(pos)||pos.includes("существ")))return lemma;
 const gender=String(data?.[2]||"").toLowerCase();
 const art=gender==="fem"||gender==="f"?"die":gender==="masc"||gender==="m"?"der":gender==="neut"||gender==="n"?"das":"";
 const word=String(data?.[3]||lemma);
 return art?art+" "+word:word;
}
function grammarText(analysis){
 if(!analysis)return "";
 const tagSets=analysis.tags.filter(x=>x.length);
 if(!tagSets.length)return "";
 const labels=tagSets.slice(0,4).map(t=>t.map(x=>grammar[x]||x).join(", "));
 return [...new Set(labels)].join(" / ")+(tagSets.length>4?" (и другие варианты)":"");
}
function el(tag,cl,text){
 const node=document.createElement(tag);
 if(cl)node.className=cl;
 if(text!==undefined)node.textContent=text;
 return node;
}
function reportCard(pane,word,choice,alternatives,fromDirect,isManual){
 const block=pane.querySelector("#lr-offline-search");if(!block)return;
 block.replaceChildren();
 block.append(el("div","lr-offline-caption","Wiktionary · морфология / FreeDict · перевод"));
 if(!choice){
  block.append(el("div","lr-offline-small","В офлайн-индексе нет подтверждённого разбора. Можно указать свой перевод или открыть Wiktionary."));
  return;
 }
 const morph=choice.analysis;
 const entry=choice.translation?.entry;
 const lemma=choice.translation?.lemma||morph?.lemma||word;
 const pos=entry?.[1] ? (posLabel[String(entry[1]).toLowerCase()]||String(entry[1])) :
   (posLabel[morph?.pos]||morph?.pos||"");
 const display=entry?nounTitle(entry,lemma):lemma;
 const first=el("div","lr-offline-head",display);
 block.append(first);
 const g=grammarText(morph);
 if(g)block.append(el("div","lr-offline-grammar",g));
 if(pos)block.append(el("div","lr-offline-small",pos));
 if(morph?.source==="s")block.append(el("div","lr-offline-small","Начальная форма: Simplemma. Грамматические признаки в источнике отсутствуют."));
 if(choice.translation?.translation){
  block.append(el("div","lr-offline-result",choice.translation.translation));
 }else{
  block.append(el("div","lr-offline-small","Для этой начальной формы нет русского перевода в FreeDict/WikDict. Существующий перевод, если он есть, сохранён."));
 }
 const possible=[...new Set(alternatives.map(a=>a.lemma))];
 if(possible.length>1){
  const examples=possible.slice(0,7).join(", ");
  block.append(el("div","lr-offline-small","Другие возможные начальные формы: "+examples+(possible.length>7?" …":"")));
 }
 const sourceText=(morph?(morph.source==="s"?"Simplemma (MIT)":"Wiktionary (CC BY-SA 4.0)"):"")+
  (choice.translation?" · FreeDict/WikDict (CC BY-SA 3.0)":"");
 block.append(el("div","lr-offline-source",sourceText));
 // Never overwrite a user's saved translation or learning status.
 if(choice.translation?.translation&&!isManual){
  const target=pane.querySelector(".translation");
  if(target)target.textContent=choice.translation.translation;
 }
 const label=[...pane.querySelectorAll(".label")].find(x=>x.textContent==="Начальная форма");
 if(label?.nextElementSibling)label.nextElementSibling.textContent=display;
 const grammarNode=pane.querySelector(".gram");
 if(grammarNode&&g)grammarNode.textContent=g;
 const tag=pane.querySelector(".tag");
 if(tag&&pos)tag.textContent=pos;
 // Remove earlier heuristic guesses only when backed by the real dictionary.
 const obsolete=pane.querySelector("#freedict-result");
 if(obsolete&&choice.translation)obsolete.remove();
}
async function resolve(word,pane,ticket){
 const same=()=>ticket===revision&&document.getElementById("detail")===pane&&
   pane.querySelector(".term")?.textContent===word;
 const manual=Boolean(window.state?.words?.[clean(word)]?.translation);
 const status=pane.querySelector("#lr-offline-search");
 try{
  // Order: exact dictionary entry → verified form index → lemma → translation.
  const exact=await dictionaryEntry(word);
  if(!same())return;
  const formIndex=await load("forms",shard(word));
  if(!same())return;
  const analyses=getFormAnalyses(formIndex,word);
  const lookupLemmas=[...new Set(analyses.map(a=>a.lemma))].slice(0,14);
  const translations=await Promise.all(lookupLemmas.map(async l=>{
   try{return await dictionaryEntry(l)}catch(e){return null}
  }));
  if(!same())return;
  let best=null;
  if(exact)best={analysis:analyses.find(a=>formKey(a.lemma)===formKey(exact.lemma))||null,translation:exact};
  if(!best){
   const found=translations.findIndex(v=>v&&v.translation);
   if(found>=0)best={analysis:analyses[found],translation:translations[found]};
   else if(analyses.length)best={analysis:analyses[0],translation:null};
  }
  // The real source may use several analyses for one lemma; retain all in detail.
  reportCard(pane,word,best,analyses,Boolean(exact),manual);
 }catch(err){
  if(!same())return;
  if(status){
   status.replaceChildren();
   status.append(el("div","lr-offline-caption","Офлайн-словарь"));
   status.append(el("div","lr-offline-small","Не удалось загрузить индекс: "+(err?.message||"ошибка сети")+". Сохранённые слова и ручной перевод доступны."));
  }
 }
}
if(typeof selectWord!=="function")return;
const previousSelect=selectWord;
selectWord=function(word,element){
 const ticket=++revision;
 const result=previousSelect(word,element);
 const pane=document.getElementById("detail");
 if(!pane)return result;
 let region=pane.querySelector("#lr-offline-search");
 if(!region){
  region=el("section","lr-offline-panel");
  region.id="lr-offline-search";
  const insertBefore=pane.querySelector("#freedict-result")||pane.querySelector("#lr-wty-result")||null;
  pane.insertBefore(region,insertBefore);
 }
 region.replaceChildren(el("div","lr-offline-small","Проверяю словоформу в офлайн-словаре…"));
 void resolve(word,pane,ticket);
 return result;
};
const style=document.createElement("style");
style.textContent=".lr-offline-panel{border:1px solid var(--line,#3a475e);border-radius:10px;padding:12px;margin:13px 0;background:rgba(132,134,202,.06)}"+
".lr-offline-caption{font-size:11px;color:var(--muted,#9aa);margin-bottom:6px}"+
".lr-offline-head{font-size:17px;font-weight:750;margin:5px 0}"+
".lr-offline-result{font-size:15px;font-weight:650;margin:7px 0}"+
".lr-offline-grammar{font-size:13px;line-height:1.5}"+
".lr-offline-small,.lr-offline-source{font-size:12px;line-height:1.5;color:var(--muted,#9aa);margin-top:5px}"+
"html[data-theme=tfr] .lr-offline-panel{border-color:#a657a4;background:#21132b}";
document.head.append(style);
window.langradOfflineLexicon={normalize:formKey,shard,load,lookup:dictionaryEntry};
})();
