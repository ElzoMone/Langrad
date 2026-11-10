/* Langrad / LOJI: phase 2 interface language and command layer.
 * Absolutely never modifies reader text, lexical translations, user titles,
 * grammar data, form input values, storage, or other themes.
 */
(()=>{
"use strict";
const root=document.documentElement;
const isLoji=()=>root.dataset.theme==="loji";
const original=new WeakMap();
const lines=[
 ["header .subbrand","LOJI // THE LONG MARCH"],
 ['header .topnav [data-tab="read"]',"ПОТОК"],
 ['header .topnav [data-tab="library"]',"АРХИВ"],
 ['header .topnav [data-tab="words"]',"РЕЕСТР"],
 ['header .topnav [data-tab="practice"]',"ПАМЯТЬ"],
 ['header .topnav [data-tab="stats"]',"МОНИТОР"],
 ['header .topnav [data-tab="settings"]',"ПАРАМЕТРЫ"],
 ['header .pills .pill:nth-child(1)',"DE → RU / LEXICON"],
 ['header .pills .pill:nth-child(2)',"USER DATA / LOCAL"],
 ['header .pills .pill:nth-child(3)',"AI / OPTIONAL"],
 ['#read > .spread:first-child .eyebrow',"ПРОТОКОЛ / ЧТЕНИЕ"],
 ['#read > .spread:first-child h1',"Анализ текста"],
 ['#read > p',"Выберите фрагмент. Система определит доступные словоформы, сохранит помеченные единицы и подготовит их к повторению."],
 ["#words > .eyebrow","ЛЕКСИЧЕСКИЙ РЕЕСТР"],
 ["#words > h1","Индекс слов"],
 ["#words > p","Слова из прочитанных текстов. Просмотр значения не означает, что единица усвоена."],
 ["#practice > .eyebrow","ПРОТОКОЛ / ПАМЯТЬ"],
 ["#practice > h1","Контроль памяти"],
 ["#practice > p","Проверка извлечения значения из памяти. Подтверждённые единицы переходят на более длинные интервалы."],
 ["#stats > .eyebrow","СОСТОЯНИЕ / МОНИТОРИНГ"],
 ["#stats > h1","Панель состояния"],
 ["#stats .statgrid .stat:nth-child(1) span","Обнаружено"],
 ["#stats .statgrid .stat:nth-child(2) span","На изучении"],
 ["#stats .statgrid .stat:nth-child(3) span","Подтверждено"],
 ["#settings > .eyebrow","КОНФИГУРАЦИЯ / УЗЕЛ"],
 ["#settings > h1","Параметры системы"],
 ["#library .lr-library-top .eyebrow","АРХИВ / ТЕКСТЫ"],
 ["#library .lr-library-top h1","Архив документов"],
 [".layout > .details > .eyebrow","РАСПОЗНАВАНИЕ / ДАННЫЕ"],
 ["#read .levelbox label","Уровень:"],
 ["#lr-theme-settings > .eyebrow","ВНЕШНИЙ ВИД / ПРОТОКОЛ"],
 ["#lr-theme-settings > h2","Конфигурация интерфейса"],
 ["#lr-ai-settings > .eyebrow","СИНТЕЗ / ЯЗЫКОВАЯ МОДЕЛЬ"],
 ["#addText","＋ Загрузить документ"],
 ["#example","Демо-передача"],
 ["#speak","Прослушать текст"],
 ["#saveText","Сохранить документ"],
 ["#startQuiz","Начать проверку"],
 ["#exportCsv","Экспортировать индекс CSV"],
 ["#backup","Экспортировать память"],
 ["#lr-add-text","Новый документ"],
 ["#study","＋ Изучать"],
 ["#report","✓ Опознано"],
 ["#saveManual","Зафиксировать значение"],
 ["#context","Разобрать контекст"]
];
const marks={
  'header .topnav button[data-tab="read"]':"读",
  'header .topnav button[data-tab="library"]':"档",
  'header .topnav button[data-tab="words"]':"词",
  'header .topnav button[data-tab="practice"]':"习",
  'header .topnav button[data-tab="stats"]':"统",
  'header .topnav button[data-tab="settings"]':"设",
  "#addText":"文",
  "#startQuiz":"检",
  "#lr-level-run":"调",
  "#lr-add-text":"文",
  "#study":"学",
  "#report":"识",
  "#backup":"备",
  "#saveText":"存"
};
function paint(node,label){
 if(!node)return;
 let record=original.get(node);
 if(!record){record={source:node.textContent,target:label};original.set(node,record)}
 else if(node.textContent!==record.target&&node.textContent!==record.source){
  // Another Langrad subsystem has re-rendered this node: track its real text.
  record.source=node.textContent;
 }
 record.target=label;
 const text=isLoji()?label:record.source;
 if(node.textContent!==text)node.textContent=text;
}
function ensureSystem(){
 const container=document.querySelector("header > div:first-child");
 if(!container)return;
 if(container.querySelector(".lr-loji-sysline"))return;
 const p=document.createElement("div");
 p.className="lr-loji-sysline";
 p.setAttribute("aria-hidden","true");
 p.innerHTML='<span class="lr-loji-activity"></span><span>NODE: LOJI-01</span><span class="lr-loji-sys-sep">/</span><span>OBSERVATION INTERFACE</span><span class="lr-loji-sys-tail"> // ONLINE</span>';
 container.append(p);
}
function apply(){
 ensureSystem();
 for(const [selector,value] of lines){
  document.querySelectorAll(selector).forEach(n=>paint(n,value));
 }
 for(const [selector,glyph] of Object.entries(marks)){
  document.querySelectorAll(selector).forEach(node=>{
   if(node.dataset.lojiGlyph!==glyph)node.dataset.lojiGlyph=glyph;
   if(!node.classList.contains("lr-loji-command"))node.classList.add("lr-loji-command");
  });
 }
 // This is explicitly a UI layer: original text and all application state
 // remain owned by Langrad. Avoid modifying reader and dictionary content.
}
let queued=false;
function schedule(){
 if(queued)return;
 queued=true;
 // Use microtask to coalesce large DOM mutations during long reader renders.
 Promise.resolve().then(()=>{queued=false;apply()});
}
const themeWatcher=new MutationObserver(schedule);
themeWatcher.observe(root,{attributes:true,attributeFilter:["data-theme"]});
// Observe only UI shells: not the article's word tokens.
for(const selector of ["header",".layout > main",".layout > aside"]){
 const node=document.querySelector(selector);
 if(node)themeWatcher.observe(node,{subtree:true,childList:true,characterData:true});
}
apply();
window.langradLojiUI={refresh:schedule};
})();
