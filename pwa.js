/* Langrad PWA installation and connection indicators.
 * No reading state, user data, Gemini credentials or dictionary data is copied.
 */
(()=>{
"use strict";
const settings=document.getElementById("settings");
if(!settings)return;
const root=document.documentElement;
const block=document.createElement("section");
block.id="lr-pwa-settings";
block.className="lr-pwa-settings";
block.innerHTML=[
 '<div class="eyebrow">Приложение на телефоне</div>',
 '<h2>Langrad на главном экране</h2>',
 '<p class="tiny">Установи Langrad как приложение: отдельная иконка, полноэкранное окно и чтение уже сохранённых текстов без сети.</p>',
 '<div class="lr-pwa-status" id="lr-pwa-status" role="status" aria-live="polite">Проверяю офлайн-режим…</div>',
 '<div class="lr-pwa-actions"><button type="button" id="lr-pwa-install" class="btn primary" hidden>Установить Langrad</button>',
 '<button type="button" id="lr-pwa-update" class="btn">Проверить обновления</button></div>',
 '<p class="tiny" id="lr-pwa-help"></p>',
 '<p class="tiny lr-pwa-note">Книги, изучаемые слова и настройки остаются только в этом браузере. Установка приложения не синхронизирует их между телефонами или компьютером. Gemini и интернет-источники требуют соединения.</p>'
].join("");
// Before mobile-sections.js so the SAME settings block becomes a disclosure.
const settingsTheme=document.getElementById("lr-theme-settings");
if(settingsTheme)settingsTheme.before(block);
else settings.append(block);
// The PWA section is injected after mobile-sections.js has initialized.
// Re-apply the existing settings wrapper to this new live control.
window.langradMobileSections?.apply?.();
const status=block.querySelector("#lr-pwa-status");
const install=block.querySelector("#lr-pwa-install");
const help=block.querySelector("#lr-pwa-help");
const update=block.querySelector("#lr-pwa-update");
const installed=()=>window.matchMedia?.("(display-mode: standalone)")?.matches===true||navigator.standalone===true;
const appleDevice=()=>/iPad|iPhone|iPod/i.test(navigator.userAgent);
let deferred=null;
let registration=null;
let offlineReady=false;
let cachedShards=0;
const setMessage=message=>{if(status.textContent!==message)status.textContent=message};
function hint(){
 if(installed()){
  install.hidden=true;
  help.textContent="Langrad открыт как установленное приложение.";
 }else if(appleDevice()){
  install.hidden=true;
  help.textContent="iPhone/iPad: открой сайт в Safari → Поделиться → «На экран Домой» → «Открыть как веб-приложение» → Добавить.";
 }else if(deferred){
  install.hidden=false;
  help.textContent="Нажми «Установить Langrad» или используй установку в меню браузера.";
 }else{
  install.hidden=true;
  help.textContent="В Chrome или Edge установка может быть доступна в меню браузера. На Android ищи «Установить приложение» или «Добавить на главный экран».";
 }
}
function paintTheme(){
 const colors={classic:"#f4f8fa",tfr:"#171022",loji:"#10080c"};
 const meta=document.querySelector('meta[name="theme-color"]');
 if(meta)meta.setAttribute("content",colors[root.dataset.theme]||colors.classic);
}
paintTheme();
new MutationObserver(paintTheme).observe(root,{attributes:true,attributeFilter:["data-theme"]});
window.addEventListener("beforeinstallprompt",event=>{
 event.preventDefault();
 deferred=event;
 hint();
});
window.addEventListener("appinstalled",()=>{
 deferred=null;
 setMessage("Langrad установлен на устройство.");
 hint();
});
window.matchMedia?.("(display-mode: standalone)")?.addEventListener?.("change",hint);
install.addEventListener("click",()=>{
 if(!deferred)return;
 const prompt=deferred;
 deferred=null;
 install.hidden=true;
 try{
  // Must be invoked directly from the user's click, without awaiting first.
  const result=prompt.prompt();
  Promise.resolve(result).then(()=>prompt.userChoice).then(choice=>{
   if(choice?.outcome==="dismissed")setMessage("Установка отменена. Можно воспользоваться меню браузера.");
   hint();
  }).catch(()=>hint());
 }catch(_){hint()}
});
function renderStatus(){
 const connection=navigator.onLine===false?"Нет сети. ":"";
 if(installed()&&offlineReady){
  setMessage(connection+"Установлено. Офлайн-интерфейс готов; словарных разделов в кеше: "+cachedShards+".");
 }else if(offlineReady){
  setMessage(connection+"Офлайн-интерфейс готов. Сохранённые на устройстве тексты доступны без сети.");
 }else if(!("serviceWorker" in navigator)){
  setMessage("Этот браузер не поддерживает офлайн-режим Langrad.");
 }else if(navigator.onLine===false){
  setMessage("Нет сети. Для первого офлайн-запуска открой Langrad при подключении к интернету.");
 }else{
  setMessage("Подготавливаю офлайн-интерфейс…");
 }
}
function askStatus(){
 const controller=navigator.serviceWorker?.controller;
 if(!controller||typeof MessageChannel==="undefined")return;
 const channel=new MessageChannel();
 channel.port1.onmessage=event=>{
  const data=event.data;
  if(data?.type!=="LANGRAD_PWA_STATUS")return;
  offlineReady=Boolean(data.shellReady);
  cachedShards=Number(data.cachedShards)||0;
  renderStatus();
  channel.port1.close();
 };
 controller.postMessage({type:"LANGRAD_PWA_STATUS"},[channel.port2]);
}
update.addEventListener("click",async()=>{
 if(!registration){
  setMessage("Проверка обновлений пока недоступна.");
  return;
 }
 update.disabled=true;
 setMessage("Проверяю обновления…");
 try{
  await registration.update();
  setMessage("Проверка завершена. Чтобы увидеть новую версию, обнови страницу.");
  askStatus();
 }catch(_){
  setMessage("Не удалось проверить обновления. Попробуй при подключении к интернету.");
 }finally{update.disabled=false}
});
window.addEventListener("online",()=>{renderStatus();askStatus()});
window.addEventListener("offline",renderStatus);
hint();
if("serviceWorker" in navigator && window.isSecureContext){
 navigator.serviceWorker.addEventListener("controllerchange",()=>{
  offlineReady=true;
  askStatus();
  renderStatus();
 });
 navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"}).then(async reg=>{
  registration=reg;
  await navigator.serviceWorker.ready;
  offlineReady=true;
  renderStatus();
  askStatus();
 }).catch(()=>{
  setMessage("Не удалось включить офлайн-режим. Проверь соединение и настройки браузера.");
 });
}else{
 update.disabled=true;
 setMessage("Офлайн-режим требует HTTPS и браузер с поддержкой Service Worker.");
}
window.langradPwa={getRegistration:()=>registration,isOfflineReady:()=>offlineReady,refresh:askStatus};
})();
