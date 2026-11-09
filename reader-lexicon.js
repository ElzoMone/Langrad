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
 pron:"местоимение",det:"определитель",num:"числительное",demonstrativepronoun:"указательное местоимение",n:"существительное",
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

// Stage 4: separable verb particles are accepted only at clause end AND only
// when the combined infinitive has a real entry in the offline DE–RU dictionary.
const separableParticles=new Set(["ab","an","auf","aus","bei","ein","fest","fort","her","hin","los","mit","nach","vor","weg","weiter","zu","zurück","zusammen"]);
function phraseTailParticle(element){
 if(!element||!element.classList?.contains("token")||element.parentElement?.id!=="reader")return null;
 let current=element.nextSibling,tail=null,wordsSeen=0;
 while(current&&wordsSeen<=22){
  if(current.nodeType===3 && /[.!?;:,\n\r]/.test(current.textContent))break;
  if(current.nodeType===1&&current.classList?.contains("token")){
   tail=clean(current.textContent);
   wordsSeen++;
  }
  current=current.nextSibling;
 }
 return wordsSeen&&separableParticles.has(tail)?tail:null;
}

// MediaWiki Action API: public unauthenticated CORS requires origin=*.
// Wikitext is parsed as data, never injected as HTML.
const wikiCacheKey="langrad-wiktionary-ru-v1";
const wikiMaxEntries=100;
const wikiPending=new Map();
const wikiGoodTtl=14*24*3600*1000,wikiMissingTtl=24*3600*1000;
function getWikiCache(){
 try{
  const o=JSON.parse(localStorage.getItem(wikiCacheKey)||"{}");
  return o&&typeof o==="object"&&!Array.isArray(o)?o:{};
 }catch(_){return {}}
}
function wikiCacheGet(key){
 const record=getWikiCache()[key];
 return record&&Date.now()-record.ts<(record.value?wikiGoodTtl:wikiMissingTtl)?record.value:undefined;
}
function wikiCachePut(key,value){
 try{
  const all=getWikiCache(),now=Date.now();
  all[key]={ts:now,value};
  const keys=Object.keys(all).sort((a,b)=>(all[b].ts||0)-(all[a].ts||0));
  for(const old of keys.slice(wikiMaxEntries))delete all[old];
  localStorage.setItem(wikiCacheKey,JSON.stringify(all));
 }catch(_){/* cache quotas/private mode never block a lookup */}
}
function plainWikitext(input){
 // Keep Russian definition lines only; discard examples, media and markup.
 let t=String(input||"").split(/\{\{пример(?:\||\}\})/i)[0];
 t=t.replace(/<ref\b[^>]*>[\s\S]*?<\/ref\s*>/gi,"").replace(/<[^>]+>/g,"");
 for(let i=0;i<3;i++)t=t.replace(/\{\{[^{}]*\}\}/g,"");
 t=t.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g,"$2").replace(/\[\[([^\]]+)\]\]/g,"$1");
 t=t.replace(/\[https?:\/\/[^\s\]]+(?:\s+([^\]]+))?\]/g,(_m,x)=>x||"");
 t=t.replace(/'{2,5}/g,"").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
 return t.length>2&&/[а-яё]/i.test(t)?t.slice(0,230):null;
}
function russianWiktionaryGlosses(wikitext){
 const raw=String(wikitext||"").slice(0,180000);
 const start=/^=+\s*\{\{\s*-de-(?:\|[^}]*)?\}\}\s*=+\s*$/im.exec(raw);
 if(!start)return [];
 const rest=raw.slice(start.index+start[0].length);
 const end=/^=+\s*\{\{\s*-[a-z]{2,4}-(?:\|[^}]*)?\}\}\s*=+\s*$/im.exec(rest);
 const lines=(end?rest.slice(0,end.index):rest).split(/\r?\n/);
 let inMeanings=false;
 const glosses=[];
 for(const line of lines){
  if(/^={2,}\s*(?:Значени(?:е|я)|\{\{значени[^}]*\}\})\s*={2,}/i.test(line.trim())){inMeanings=true;continue}
  if(inMeanings&&/^={2,}/.test(line.trim())){inMeanings=false;continue}
  if(!inMeanings||!/^#(?![:*#])\s*/.test(line))continue;
  const text=plainWikitext(line.replace(/^#\s*/,""));
  if(text&&!glosses.includes(text))glosses.push(text);
  if(glosses.length>=3)break;
 }
 return glosses;
}
async function getRussianWiki(term){
 const word=String(term||"").trim().normalize("NFC");
 if(!word||word.length>65||!/^[\p{L}-]+$/u.test(word))return null;
 const key=clean(word);
 const cached=wikiCacheGet(key);
 if(cached!==undefined)return cached;
 if(wikiPending.has(key))return wikiPending.get(key);
 const work=(async()=>{
  const q=new URLSearchParams({
   action:"query",prop:"revisions",rvprop:"content",rvslots:"main",
   redirects:"1",titles:word,format:"json",formatversion:"2",origin:"*"
  });
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),9000);
  try{
   const res=await fetch("https://ru.wiktionary.org/w/api.php?"+q.toString(),
     {mode:"cors",credentials:"omit",signal:controller.signal});
   if(!res.ok)throw Error("Wiktionary HTTP "+res.status);
   const result=await res.json();
   const page=result?.query?.pages?.[0];
   if(result?.error)throw Error("Wiktionary API error");
   const raw=page?.revisions?.[0]?.slots?.main?.content;
   const glosses=typeof raw==="string"?russianWiktionaryGlosses(raw):[];
   const value=glosses.length?{title:String(page.title||word),glosses}:null;
   wikiCachePut(key,value);
   return value;
  }finally{clearTimeout(timer)}
 })().finally(()=>wikiPending.delete(key));
 wikiPending.set(key,work);
 return work;
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
 const lemma=choice.translation?.lemma||choice.online?.title||morph?.lemma||word;
 const pos=entry?.[1] ? (posLabel[String(entry[1]).toLowerCase()]||String(entry[1])) :
   (posLabel[morph?.pos]||morph?.pos||"");
 const display=entry?nounTitle(entry,lemma):lemma;
 const first=el("div","lr-offline-head",display);
 block.append(first);
 const g=grammarText(morph);
 if(g)block.append(el("div","lr-offline-grammar",g));
 if(choice.separable)block.append(el("div","lr-offline-small","Отделяемый глагол: "+choice.separable.surface+" … "+choice.separable.particle+" → "+choice.separable.infinitive+" (подтверждено словарём)."));
 if(choice.path?.length>2){
  block.append(el("div","lr-offline-small","Цепочка исходных форм: "+choice.path.join(" → ")));
  const intermediateGrammar=grammarText(choice.derivedAnalysis);
  if(intermediateGrammar)block.append(el("div","lr-offline-grammar","Промежуточная форма: "+intermediateGrammar));
 }
 if(pos)block.append(el("div","lr-offline-small",pos));
 if(morph?.source==="s")block.append(el("div","lr-offline-small","Начальная форма: Simplemma. Грамматические признаки в источнике отсутствуют."));
 if(choice.translation?.translation){
  if(choice.path?.length>2)block.append(el("div","lr-offline-small","Перевод исходной формы ("+lemma+"), не готовый перевод причастия в контексте:"));
  block.append(el("div","lr-offline-result",choice.translation.translation));
 }else if(choice.online?.glosses?.length){
  block.append(el("div","lr-offline-small","Значения из русского Викисловаря (не автоматический перевод предложения):"));
  block.append(el("div","lr-offline-result",choice.online.glosses.join("; ")));
  const source=el("a","lr-offline-source","Статья Викисловаря (RU) ↗");
  source.href="https://ru.wiktionary.org/wiki/"+encodeURIComponent(choice.online.title);
  source.target="_blank";source.rel="noopener noreferrer";
  block.append(source);
 }else{
  block.append(el("div","lr-offline-small","Для этой начальной формы нет русского перевода в FreeDict/WikDict. Существующий перевод, если он есть, сохранён."));
 }
 const possible=[...new Set(alternatives.map(a=>a.lemma))];
 if(possible.length>1){
  const examples=possible.slice(0,7).join(", ");
  block.append(el("div","lr-offline-small","Другие возможные начальные формы: "+examples+(possible.length>7?" …":"")));
 }
 const sourceText=(morph?(morph.source==="s"?"Simplemma (MIT)":"Wiktionary (CC BY-SA 4.0)"):"")+
  (choice.translation?" · FreeDict/WikDict (CC BY-SA 3.0)":"")+
  (choice.online?" · Русский Викисловарь (CC BY-SA 4.0)":"");
 block.append(el("div","lr-offline-source",sourceText));
 // Never overwrite a user's saved translation or learning status.
 if((choice.translation?.translation||choice.online?.glosses?.length)&&!isManual){
  const target=pane.querySelector(".translation");
  if(target)target.textContent=choice.translation?.translation||choice.online.glosses.join("; ");
 }
 const label=[...pane.querySelectorAll(".label")].find(x=>x.textContent==="Начальная форма");
 if(label?.nextElementSibling)label.nextElementSibling.textContent=display;
 const grammarNode=pane.querySelector(".gram");
 if(grammarNode&&g)grammarNode.textContent=g;
 const tag=pane.querySelector(".tag");
 if(tag&&pos)tag.textContent=pos;
 // Remove earlier heuristic guesses only when backed by the real dictionary.
 const obsolete=pane.querySelector("#freedict-result");
 if(obsolete&&(choice.translation||choice.online))obsolete.remove();
}
async function resolve(word,pane,ticket,element){
 const same=()=>ticket===revision&&document.getElementById("detail")===pane&&
   pane.querySelector(".term")?.textContent===word;
 const manual=Boolean(pane.querySelector("#manual")?.value?.trim()||(typeof state!=="undefined"&&state.words?.[clean(word)]?.translation));
 const status=pane.querySelector("#lr-offline-search");
 try{
  // The source is a graph: declined participle → participle → infinitive.
  // Keep the original grammar at the surface, and use translation of a verified lemma.
  const exact=await dictionaryEntry(word);
  if(!same())return;
  const sourceForms=await load("forms",shard(word));
  if(!same())return;
  const analyses=getFormAnalyses(sourceForms,word);
  const particle=phraseTailParticle(element);
  const primary=[...new Map(analyses.map(a=>[formKey(a.lemma),a])).values()].slice(0,16);
  const primaryEntries=await Promise.all(primary.map(async a=>{
   try{return await dictionaryEntry(a.lemma)}catch(_){return null}
  }));
  if(!same())return;
  let best=exact?{analysis:analyses.find(a=>formKey(a.lemma)===formKey(exact.lemma))||null,
                     translation:exact,path:[word,exact.lemma]}:null;
  if(!best){
   const found=primaryEntries.findIndex(x=>x?.translation);
   if(found>=0)best={analysis:primary[found],translation:primaryEntries[found],
                     path:[word,primary[found].lemma]};
  }

  // Prefer an attested separable verb for "kam ... an", "rief ... an", etc.
  // The surface form has to be supported by Wiktionary and the combined
  // infinitive must exist in the dictionary, not just look plausible.
  if(particle){
   for(const a of primary.filter(x=>x.pos==="verb").slice(0,8)){
    const combined=particle+a.lemma.toLocaleLowerCase("de-DE");
    let entry=null;
    try{entry=await dictionaryEntry(combined)}catch(_){/* no matching entry */}
    if(!same())return;
    if(entry?.translation){
     best={analysis:a,translation:entry,separable:{surface:word,particle,infinitive:combined},path:[word,combined]};
     break;
    }
   }
  }

  // Limit to two morphological links: word → adjective/participle → verb/noun.
  // This is evidence-based, not invented suffix stripping.
  if(!best){
   const second=[];
   const seen=new Set([formKey(word),...primary.map(a=>formKey(a.lemma))]);
   for(const first of primary.slice(0,12)){
    let sub;
    try{sub=await load("forms",shard(first.lemma))}catch(_){continue}
    if(!same())return;
    const deeper=getFormAnalyses(sub,first.lemma);
    for(const nested of deeper.slice(0,16)){
     const key=formKey(nested.lemma);
     if(seen.has(key))continue;
     seen.add(key);
     second.push({analysis:first,derivedAnalysis:nested,lemma:nested.lemma,
                  path:[word,first.lemma,nested.lemma]});
     if(second.length>=24)break;
    }
    if(second.length>=24)break;
   }
   const secondaryEntries=await Promise.all(second.map(async a=>{
    try{return await dictionaryEntry(a.lemma)}catch(_){return null}
   }));
   if(!same())return;
   const found=secondaryEntries.findIndex(x=>x?.translation);
   if(found>=0)best={...second[found],translation:secondaryEntries[found]};
  }
  if(!best && primary.length)best={analysis:primary[0],translation:null,path:[word,primary[0].lemma]};
  // Only when the offline translation truly is missing, ask Wikimedia.
  // Preserve existing saved user translations and allow external failure.
  if(!best?.translation?.translation && !manual){
   const terms=[...new Set([best?.lemma,best?.analysis?.lemma,...primary.map(a=>a.lemma),word].filter(Boolean))].slice(0,3);
   for(const term of terms){
    try{
     const found=await getRussianWiki(term);
     if(!same())return;
     if(found){
      best={...(best||{analysis:null,translation:null}),online:found};
      break;
     }
    }catch(_){/* no network: keep manual entry and external links */}
   }
  }
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
 void resolve(word,pane,ticket,element);
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
