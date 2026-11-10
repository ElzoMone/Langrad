const $=id=>document.getElementById(id);
let speed=1;
const send=message=>chrome.runtime.sendMessage(message).catch(()=>({ok:false}));
async function onVideo(action,value){
 const tabs=await chrome.tabs.query({active:true,currentWindow:true});
 const tab=tabs[0];
 if(tab?.id&&/^https:\/\/www\.youtube\.com\//.test(tab.url||""))
  await chrome.tabs.sendMessage(tab.id,{type:"CONTROL",action,value}).catch(()=>{});
}
send({type:"GET_SETTINGS"}).then(r=>{
 speed=Number(r?.data?.videoSpeed)||1;
 $("ru").checked=!!r?.data?.russianSubtitles;
 $("status").textContent="Скорость: "+speed+"× · ожидающих слов: "+(r?.data?.videoQueue?.length||0);
});
$("ru").addEventListener("change",async()=>{
 await send({type:"SET_SETTING",key:"russianSubtitles",value:$("ru").checked});
 $("status").textContent=$("ru").checked?"RU включён — строки передаются MyMemory":"RU выключен";
});
$("slow").onclick=()=>{speed=Math.max(.5,speed-.25);onVideo("speed",speed);$("status").textContent="Скорость: "+speed+"×"};
$("fast").onclick=()=>{speed=Math.min(1.5,speed+.25);onVideo("speed",speed);$("status").textContent="Скорость: "+speed+"×"};
$("replay").onclick=()=>onVideo("replay");
