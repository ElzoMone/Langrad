/* Langrad Video 0.5 — dictionary worker.
 * Sources: Wiktionary/Kaikki CC BY-SA 4.0 forms, FreeDict/WikDict
 * CC BY-SA 3.0 translations, optional Russian Wiktionary CC BY-SA 4.0.
 * No generated/made-up translations; user content is local.
 */
const BASE="https://langrad.vercel.app";
const cache=new Map(),pending=new Map();
const lower=x=>String(x||"").trim().normalize("NFC").toLocaleLowerCase("de-DE");
const formKey=x=>lower(x).replace(/ß/g,"ss");
const fold=x=>formKey(x).replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue");
const prefix=x=>{const v=fold(x).replace(/^[^a-z]+/,"");return /^[a-z]{2}/.test(v)?v.slice(0,2):"other"};
const nounArt=x=>({masc:"der",m:"der",fem:"die",f:"die",neut:"das",n:"das"}[String(x||"").toLowerCase()]||"");
const grammarMap={
 "first-person":"1-е лицо","second-person":"2-е лицо","third-person":"3-е лицо",
 singular:"ед. ч.",plural:"мн. ч.",masculine:"муж. род",feminine:"жен. род",neuter:"ср. род",
 nominative:"Nominativ",accusative:"Akkusativ",dative:"Dativ",genitive:"Genitiv",
 present:"Präsens",past:"прошедшее",preterite:"Präteritum",perfect:"Perfekt",
 participle:"Partizip",indicative:"Indikativ",subjunctive:"Konjunktiv",
 strong:"сильное склонение",weak:"слабое склонение"
};
const posMap={noun:"существительное",n:"существительное",verb:"глагол",v:"глагол",adj:"прилагательное",adv:"наречие",pron:"местоимение",det:"определитель"};
async function fetchJSON(path){
 if(!cache.has(path)){
  const request=fetch(BASE+path,{cache:"force-cache"}).then(async r=>{
   if(r.status===404)return null;
   if(!r.ok)throw Error("HTTP "+r.status+" "+path);
   return r.json();
  }).catch(e=>{cache.delete(path);throw e});
  cache.set(path,request);
 }
 return cache.get(path);
}
function getValue(obj,word){
 if(!obj||typeof obj!=="object")return null;
 let v=obj[lower(word)]??obj[formKey(word)];
 if(v!==undefined)return v;
 const sought=fold(word);
 const matching=Object.keys(obj).find(k=>fold(k)===sought);
 return matching?obj[matching]:null;
}
async function entry(word){
 const dict=await fetchJSON("/dict/"+prefix(word)+".json");
 const record=getValue(dict,word);
 if(!Array.isArray(record)||!Array.isArray(record[0])||!record[0].length)return null;
 const lemma=String(record[3]||word);
 const translations=record[0].filter(x=>typeof x==="string").slice(0,8);
 const part=String(record[1]||"");
 const article=nounArt(record[2]);
 return {lemma:article?article+" "+lemma:lemma,head:lemma,part:posMap[part]||part,
  translation:translations.join("; "),source:"FreeDict/WikDict",license:"CC BY-SA 3.0"};
}
function analyse(forms,word){
 const raw=getValue(forms,word);
 if(!Array.isArray(raw))return [];
 const unique=new Map();
 for(const item of raw){
  if(!Array.isArray(item)||typeof item[0]!=="string")continue;
  const [lemma,pos,tags]=item;
  const id=lemma+"|"+pos;
  if(!unique.has(id))unique.set(id,{lemma,pos,tags:[]});
  const r=unique.get(id);
  const group=(Array.isArray(tags)?tags:[]).filter(x=>typeof x==="string");
  if(group.length&&!r.tags.some(g=>g.join("|")===group.join("|")))r.tags.push(group);
 }
 return [...unique.values()];
}
function grammar(analysis){
 if(!analysis)return"";
 return analysis.tags.slice(0,3).map(set=>set.map(x=>grammarMap[x]||x).join(", ")).join(" / ");
}
function cleanWiki(input){
 let text=String(input||"").split(/\{\{пример(?:\||\}\})/i)[0];
 text=text.replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi,"").replace(/<[^>]+>/g,"");
 for(let i=0;i<3;i++)text=text.replace(/\{\{[^{}]*\}\}/g,"");
 text=text.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g,"$1").replace(/\[\[([^\]]+)\]\]/g,"$1");
 text=text.replace(/'{2,5}/g,"").replace(/\s+/g," ").trim();
 return /[а-яё]/i.test(text)?text.slice(0,220):"";
}
async function ruWiki(word){
 if(!word||word.length>65)return null;
 const params=new URLSearchParams({action:"query",prop:"revisions",rvprop:"content",rvslots:"main",titles:word,redirects:"1",format:"json",formatversion:"2",origin:"*"});
 const response=await fetch("https://ru.wiktionary.org/w/api.php?"+params);
 if(!response.ok)return null;
 const page=(await response.json())?.query?.pages?.[0],raw=page?.revisions?.[0]?.slots?.main?.content||"";
 const start=/^=+\s*\{\{\s*-de-(?:\|[^}]*)?\}\}\s*=+\s*$/im.exec(raw);
 if(!start)return null;
 const rest=raw.slice(start.index+start[0].length);
 const finish=/^=+\s*\{\{\s*-[a-z]{2,4}-(?:\|[^}]*)?\}\}\s*=+\s*$/im.exec(rest);
 const lines=(finish?rest.slice(0,finish.index):rest).split(/\r?\n/);
 let inDefinitions=false;
 const output=[];
 for(const line of lines){
  if(/^={2,}\s*(?:Значени(?:е|я)|\{\{значени[^}]*\}\})\s*={2,}/i.test(line.trim())){inDefinitions=true;continue}
  if(inDefinitions&&/^={2,}/.test(line.trim())){inDefinitions=false;continue}
  if(inDefinitions&&/^#(?![:*#])\s*/.test(line)){
   const definition=cleanWiki(line.slice(1));
   if(definition)output.push(definition);
  }
  if(output.length>=3)break;
 }
 return output.length?{lemma:page.title||word,translation:output.join("; "),source:"Русский Викисловарь",license:"CC BY-SA 4.0"}:null;
}
async function lookup(word){
 const w=lower(word);
 if(!w||w.length>65||!/^[\p{L}'’-]+$/u.test(w))return null;
 if(pending.has(w))return pending.get(w);
 const work=(async()=>{
  let direct=null,formData=null;
  try{[direct,formData]=await Promise.all([entry(w),fetchJSON("/forms/"+prefix(w)+".json")])}
  catch(_){/* network failure is not a linguistic conclusion */}
  const analyses=analyse(formData,w);
  let best=direct,selected=analyses[0]||null;
  if(!best){
   const options=analyses.slice(0,16);
   const translations=await Promise.all(options.map(async x=>{try{return await entry(x.lemma)}catch(_){return null}}));
   let i=translations.findIndex(Boolean);
   if(i>=0){best=translations[i];selected=options[i]}
  }
  if(!best){
   // Participle -> inflected adjective -> verb can take two form links.
   for(const a of analyses.slice(0,8)){
    try{
     const next=analyse(await fetchJSON("/forms/"+prefix(a.lemma)+".json"),a.lemma);
     for(const b of next.slice(0,8)){
      const e=await entry(b.lemma);
      if(e){best=e;selected=a;break}
     }
    }catch(_){}
    if(best)break;
   }
  }
  if(!best){
   for(const candidate of [...new Set([selected?.lemma,w])]){
    try{best=await ruWiki(candidate)}catch(_){}
    if(best)break;
   }
  }
  return {word,lemma:best?.lemma||selected?.lemma||word,
   translation:best?.translation||"",part:best?.part||posMap[selected?.pos]||"",
   grammar:grammar(selected),source:best?.source||"Wiktionary (морфология)",license:best?.license||"CC BY-SA 4.0",
   forms:analyses.slice(0,3).map(x=>({lemma:x.lemma,part:posMap[x.pos]||x.pos,grammar:grammar(x)})),
   missing:!best?.translation};
 })().finally(()=>pending.delete(w));
 pending.set(w,work);return work;
}
let frequencyPromise;
async function frequency(word){
 if(!frequencyPromise){
  frequencyPromise=fetch("https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/de/de_50k.txt").then(async r=>{
   if(!r.ok)throw Error("Frequency source unavailable");
   const data=await r.text();
   const map=new Map();
   data.split(/\r?\n/).forEach((line,i)=>{const match=/^(\S+)\s+\d+/.exec(line);if(match)map.set(lower(match[1]),i+1)});
   return map;
  }).catch(()=>null);
 }
 return (await frequencyPromise)?.get(lower(word))||null;
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 (async()=>{
  if(msg?.type==="LOOKUP"){
   let result=await lookup(String(msg.word||""));
   // If Langrad is open with the larger 102k-entry WTY dictionary installed,
   // prefer its direct translation, while keeping morphology from our shards.
   try{
    const tabs=await chrome.tabs.query({url:BASE+"/*"});
    for(const tab of tabs.slice(0,2)){
     if(!tab.id)continue;
     const response=await Promise.race([
      chrome.tabs.sendMessage(tab.id,{type:"WTY_LOOKUP",word:String(msg.word||"")}),
      new Promise(resolve=>setTimeout(()=>resolve(null),1300))
     ]);
     if(response?.ok&&response.data?.translation){
      result={...result,...response.data,word:String(msg.word||""),
       grammar:result?.grammar||"",forms:result?.forms||[],missing:false};
      break;
     }
    }
   }catch(_){/* no Langrad tab or WTY not installed: local shard lookup stays */}
   const rank=await frequency(String(msg.word||""));
   reply({ok:true,result,rank});return;
  }
  if(msg?.type==="LEARN"){
   const word=String(msg.word||"").trim();
   if(!/^[\p{L}][\p{L}'’-]{0,65}$/u.test(word))throw Error("Неверная словоформа");
   const storage=await chrome.storage.local.get(["videoQueue"]);
   const queue=Array.isArray(storage.videoQueue)?storage.videoQueue:[];
   queue.push({id:"lv-"+Date.now()+"-"+Math.random().toString(36).slice(2),word,translation:String(msg.translation||"").slice(0,180)});
   await chrome.storage.local.set({videoQueue:queue.slice(-500)});
   const tabs=await chrome.tabs.query({url:BASE+"/*"});
   if(!tabs.length)await chrome.tabs.create({url:BASE+"/",active:false});
   else for(const tab of tabs)if(tab.id)chrome.tabs.sendMessage(tab.id,{type:"SYNC_NOW"}).catch(()=>{});
   reply({ok:true});return;
  }
  if(msg?.type==="TRANSLATE_LINE"){
   const sentence=String(msg.text||"").trim().slice(0,450);
   if(!sentence){reply({ok:false,error:"Пустая строка"});return}
   const {russianSubtitles}=await chrome.storage.local.get("russianSubtitles");
   if(!russianSubtitles)throw Error("Russian subtitle translation is not enabled");
   const params=new URLSearchParams({q:sentence,langpair:"de|ru"});
   const res=await fetch("https://api.mymemory.translated.net/get?"+params);
   if(!res.ok)throw Error("MyMemory HTTP "+res.status);
   const response=await res.json();
   const text=String(response?.responseData?.translatedText||"").slice(0,900);
   if(!text)throw Error("MyMemory translation not available");
   reply({ok:true,text,source:"MyMemory"});return;
  }
  if(msg?.type==="GET_SETTINGS"){
   reply({ok:true,data:await chrome.storage.local.get(["wordStatuses","langradTheme","videoQueue","videoSpeed","russianSubtitles"])});return;
  }
  if(msg?.type==="SET_SETTING"){
   if(!["videoSpeed","russianSubtitles"].includes(msg.key))throw Error("Unsupported option");
   await chrome.storage.local.set({[msg.key]:msg.value});reply({ok:true});return;
  }
  reply({ok:false,error:"Unknown operation"});
 })().catch(err=>reply({ok:false,error:String(err.message||err)}));
 return true;
});
