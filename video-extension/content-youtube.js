/* Langrad Video / YouTube captions: clickable original German subtitles.
 * The native captions are only hidden while the accessible Langrad overlay is
 * active; no audio, video or full transcript is collected or uploaded.
 */
(()=>{
"use strict";
if(!location.hostname.endsWith("youtube.com"))return;
const WORD=/[\p{L}]+(?:['’-][\p{L}]+)*|[^\p{L}]+/gu;
const norm=w=>String(w||"").toLocaleLowerCase("de-DE").normalize("NFC");
let player=null,root=null,caption=null,card=null,legend=null;
let lastLine="",lastVideo="",words={},theme="classic",lastResult={},rankByWord={};
let speed=1,ruEnabled=false,ruCache=new Map(),frame=0;
function message(payload){return chrome.runtime.sendMessage(payload).catch(e=>({ok:false,error:String(e)}))}
function stateOf(w){
 const rec=words[norm(w)];
 return !rec?"neutral":rec.reported||rec.stage>=3?"known":rec.stage>=1?"learning":"unknown";
}
function pageTheme(){
 root.dataset.theme=["classic","tfr","loji"].includes(theme)?theme:"classic";
}
function makeEl(tag,cls,content){
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(content!==undefined)node.textContent=content;
 return node;
}
function video(){return player?.querySelector("video")||document.querySelector("video.html5-main-video")}
function setSpeed(v){
 const speedValue=Math.max(.5,Math.min(1.5,Number(v)||1));
 const target=video();if(target)target.playbackRate=speedValue;
 speed=speedValue;
 if(root)root.querySelector(".lr-v-speed").textContent=speed+"×";
 message({type:"SET_SETTING",key:"videoSpeed",value:speed}).catch(()=>{});
}
function ensure(){
 const current=document.querySelector(".html5-video-player");
 if(!current){
  root?.remove();root=null;player=null;return false
 }
 if(current===player&&root?.isConnected)return true;
 root?.remove();player=current;
 root=makeEl("section","lr-v-root");
 root.setAttribute("aria-label","Langrad Video — немецкие субтитры");
 root.dataset.theme=theme;
 root.innerHTML='<div class="lr-v-toolbar"><span class="lr-v-mark">LANGRAD / VIDEO</span>'+
 '<button type="button" class="lr-v-back" title="Повторить последние 4 секунды">↶ 4с</button>'+
 '<button type="button" class="lr-v-slow">−</button>'+
 '<span class="lr-v-speed">1×</span>'+
 '<button type="button" class="lr-v-fast">+</button>'+
 '<button type="button" class="lr-v-ru" title="Включить перевод строки через MyMemory. Субтитры будут переданы этому сервису только после включения.">RU: выкл</button></div>'+
 '<div class="lr-v-captions" role="group" aria-label="Кликабельные субтитры"></div>'+
 '<div class="lr-v-subru" hidden></div>'+
 '<div class="lr-v-card" hidden></div>'+
 '<div class="lr-v-note" aria-hidden="true">— обычное · · неизвестное · – изучается · ─ известно</div>';
 caption=root.querySelector(".lr-v-captions");card=root.querySelector(".lr-v-card");
 root.querySelector(".lr-v-back").addEventListener("click",e=>{
  e.stopPropagation();
  const v=video();if(v)v.currentTime=Math.max(0,v.currentTime-4);
 });
 root.querySelector(".lr-v-slow").addEventListener("click",e=>{e.stopPropagation();setSpeed(speed-.25)});
 root.querySelector(".lr-v-fast").addEventListener("click",e=>{e.stopPropagation();setSpeed(speed+.25)});
 root.querySelector(".lr-v-ru").addEventListener("click",async e=>{
  e.stopPropagation();ruEnabled=!ruEnabled;
  root.querySelector(".lr-v-ru").textContent="RU: "+(ruEnabled?"вкл":"выкл");
  await message({type:"SET_SETTING",key:"russianSubtitles",value:ruEnabled});
  updateRU();
 });
 player.append(root);
 pageTheme();setSpeed(speed);
 return true;
}
async function lookup(w){
 const key=norm(w);
 if(lastResult[key])return lastResult[key];
 const res=await message({type:"LOOKUP",word:w});
 if(res?.ok&&res.result){lastResult[key]=res.result;rankByWord[key]=res.rank||null;return res.result}
 return {word:w,lemma:w,translation:"",missing:true,source:"",forms:[]};
}
function renderLine(text){
 if(!root)return;
 const string=String(text||"").trim();
 if(string===lastLine)return;
 lastLine=string;
 caption.replaceChildren();
 card.hidden=true;
 const tooltip=[];
 for(const piece of string.match(WORD)||[]){
  if(!/[\p{L}]/u.test(piece)){caption.append(document.createTextNode(piece));continue}
  const token=makeEl("button","lr-v-token "+stateOf(piece),piece);
  token.type="button";
  token.title="Открыть перевод и грамматику";
  token.addEventListener("click",async e=>{
   e.preventDefault();e.stopPropagation();
   await showCard(piece,token);
  });
  token.addEventListener("mouseenter",async()=>{
   if(token.dataset.label)return;
   const result=await lookup(piece);
   if(!token.isConnected)return;
   const tip=result.translation?result.translation.split(";")[0]:"Открыть словарь";
   token.title=tip+(rankByWord[norm(piece)]?" · частота #"+rankByWord[norm(piece)]:"");
   token.dataset.label="1";
  },{once:true});
  caption.append(token);
 }
 updateRU();
}
function updateStatus(){
 if(!root)return;
 for(const token of caption.querySelectorAll(".lr-v-token")){
  token.className="lr-v-token "+stateOf(token.textContent);
 }
}
function selectedCard(text){
 const item=makeEl("p","lr-v-card-status",text);card.append(item);
}
async function showCard(word,anchor){
 if(!card)return;
 const k=norm(word);
 if(!words[k]){
  words[k]={stage:0,reported:false,translation:""};
  await chrome.storage.local.set({wordStatuses:words});
  updateStatus();
 }
 card.hidden=false;
 card.replaceChildren();
 card.append(makeEl("div","lr-v-word",word),makeEl("p","lr-v-loading","Ищу словоформу и перевод…"));
 const requestId=++frame;
 const info=await lookup(word);
 if(!card||requestId!==frame||!card.isConnected)return;
 card.replaceChildren();
 const close=makeEl("button","lr-v-close","×");close.type="button";
 close.setAttribute("aria-label","Закрыть карточку");
 close.addEventListener("click",e=>{e.stopPropagation();card.hidden=true});
 const header=makeEl("div","lr-v-card-head");
 header.append(makeEl("strong","",word),close);
 const source=makeEl("div","lr-v-source",(info.source||"Wiktionary")+" · "+(info.license||"CC BY-SA"));
 const lemma=makeEl("div","lr-v-lemma","Начальная форма: "+(info.lemma||word));
 const part=makeEl("div","lr-v-part",info.part||"");
 const translation=makeEl("p","lr-v-translation",info.translation||"Перевод пока не найден. Можно добавить слово в Langrad и указать свой перевод.");
 const grammar=makeEl("p","lr-v-grammar",info.grammar||"");
 const rank=rankByWord[norm(word)];
 const freq=makeEl("small","lr-v-frequency",rank?"Частотность OpenSubtitles: #"+rank+" (не CEFR)":"");
 const status=makeEl("p","lr-v-card-status","Статус: "+({neutral:"обычное",unknown:"неизвестное",learning:"изучается",known:"известно"}[stateOf(word)]||""));
 const learn=makeEl("button","lr-v-learn","＋ Учить");learn.type="button";
 learn.addEventListener("click",async e=>{
  e.stopPropagation();learn.disabled=true;learn.textContent="Сохраняю…";
  const res=await message({type:"LEARN",word,translation:info.translation||""});
  if(res?.ok){
   words[norm(word)]={...(words[norm(word)]||{}),stage:1,reported:false,translation:info.translation};
   await chrome.storage.local.set({wordStatuses:words});
   updateStatus();status.textContent="Добавлено в реестр изучаемых";
   learn.textContent="✓ Добавлено";
  }else{learn.disabled=false;learn.textContent="Ошибка: "+(res?.error||"неизвестная")}
 });
 const open=document.createElement("a");open.className="lr-v-wiki";open.target="_blank";open.rel="noopener noreferrer";
 open.href="https://de.wiktionary.org/wiki/"+encodeURIComponent(word);open.textContent="Wiktionary ↗";
 const actions=makeEl("div","lr-v-actions");actions.append(learn,open);
 card.append(header,lemma,part,translation,grammar,freq,status,actions,source);
}
async function updateRU(){
 const node=root?.querySelector(".lr-v-subru");
 if(!node)return;
 node.hidden=!ruEnabled||!lastLine;
 if(!ruEnabled||!lastLine)return;
 if(ruCache.has(lastLine)){node.textContent=ruCache.get(lastLine);return}
 node.textContent="Перевожу строку…";
 const text=lastLine;
 const res=await message({type:"TRANSLATE_LINE",text});
 if(!root?.isConnected||text!==lastLine||!ruEnabled)return;
 node.textContent=res?.ok?res.text||"":"Перевод строки недоступен";
 if(res?.ok)ruCache.set(text,node.textContent);
}
function update(){
 if(!ensure())return;
 const videoId=new URL(location.href).searchParams.get("v")||"";
 if(videoId!==lastVideo){lastVideo=videoId;lastLine="";lastResult={};rankByWord={};card.hidden=true}
 // YouTube can render one or more caption windows; join only visible text.
 const container=player.querySelector(".ytp-caption-window-container");
 if(!container){renderLine("");return}
 const segments=[...container.querySelectorAll(".ytp-caption-segment")];
 const text=segments.filter(n=>n.getClientRects().length||n.textContent).map(n=>n.textContent).join(" ").replace(/\s+/g," ").trim();
 renderLine(text);
 root.classList.toggle("lr-v-has-text",Boolean(text));
 if(text&&!container.classList.contains("lr-v-native-hidden"))container.classList.add("lr-v-native-hidden");
 if(!text)container.classList.remove("lr-v-native-hidden");
}
async function loadSettings(){
 const r=await message({type:"GET_SETTINGS"});
 if(!r?.ok)return;
 words=r.data.wordStatuses||{};
 theme=r.data.langradTheme||"classic";
 speed=r.data.videoSpeed||1;ruEnabled=!!r.data.russianSubtitles;
 if(root){pageTheme();root.querySelector(".lr-v-ru").textContent="RU: "+(ruEnabled?"вкл":"выкл")}
 updateStatus();
}
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area!=="local")return;
 if(changes.wordStatuses){words=changes.wordStatuses.newValue||{};updateStatus()}
 if(changes.langradTheme){theme=changes.langradTheme.newValue||"classic";if(root)pageTheme()}
 if(changes.videoSpeed){speed=changes.videoSpeed.newValue||1;if(root)root.querySelector(".lr-v-speed").textContent=speed+"×"}
 if(changes.russianSubtitles){ruEnabled=!!changes.russianSubtitles.newValue;updateRU()}
});
chrome.runtime.onMessage.addListener(msg=>{
 if(msg?.type==="CONTROL"){
  if(msg.action==="replay"){const v=video();if(v)v.currentTime=Math.max(0,v.currentTime-4)}
  if(msg.action==="speed")setSpeed(msg.value);
 }
});
loadSettings();setInterval(update,550);
})();
