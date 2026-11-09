/* Loji Phase 2 integration: UI labels are reversible and must not affect data.
 * npm install --no-save jsdom@26.1.0 && node tests/loji-machine.cjs
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM,VirtualConsole}=require('jsdom');
let html=fs.readFileSync('index.html','utf8');
for(const file of ['loji-theme.css','loji-machine.css']){
 const css=fs.readFileSync(file,'utf8').replace(/^@import[^\n]*\n/,'');
 html=html.replace('<link rel="stylesheet" href="/'+file+'">','<style>'+css+'</style>');
}
html=html.replace(
 '<script defer src="/reader-lexicon.js"></script>\n<script defer src="/reader-pagination.js"></script>\n<script defer src="/loji-interface.js"></script>',
 '<script>'+fs.readFileSync('reader-lexicon.js','utf8')+'</script>'+
 '<script>'+fs.readFileSync('reader-pagination.js','utf8')+'</script>'+
 '<script>'+fs.readFileSync('loji-interface.js','utf8')+'</script>'
);
const text='Der Himmel war gelb wie Messing und noch nicht verqualmt. '+('Er erkannte seinen Freund. ').repeat(160);
const initial={title:'Mein Buch',text,words:{himmel:{display:'Himmel',stage:2,correct:3,wrong:1,next:0,translation:'МОЙ ПЕРЕВОД'}},
 results:{total:4,correct:3},library:[{id:'book',title:'Mein Buch',text}],activeTextId:'book',aid:'B1'};
const errors=[],v=new VirtualConsole();v.on('jsdomError',e=>errors.push(String(e)));
const dom=new JSDOM(html,{url:'https://langrad.vercel.app/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:v,
 beforeParse(w){w.localStorage.setItem('langrad-v01',JSON.stringify(initial));w.localStorage.setItem('langrad-theme','loji');
  w.confirm=()=>true;w.alert=()=>{};w.scrollTo=()=>{};
  w.speechSynthesis={getVoices:()=>[],speak:()=>{},cancel:()=>{}};
  w.fetch=async()=>({ok:false,status:404,json:async()=>null});
 }});
const w=dom.window;const $=s=>w.document.querySelector(s);
const pause=ms=>new Promise(done=>setTimeout(done,ms));
const label=s=>$(s)?.textContent.trim();
const saved=()=>JSON.parse(w.localStorage.getItem('langrad-v01'));
(async()=>{
 await pause(250);
 assert.ok(w.langradLojiUI);
 assert.equal(w.document.documentElement.dataset.theme,'loji');
 assert.equal(label('header .subbrand'),'LOJI // THE LONG MARCH');
 assert.equal(label('[data-tab="read"]'),'ПОТОК');
 assert.equal(label('[data-tab="words"]'),'РЕЕСТР');
 assert.equal(label('#read h1'),'Анализ текста');
 assert.equal(label('#addText'),'＋ Загрузить документ');
 assert.equal($('#addText').dataset.lojiGlyph,'文');
 assert.equal($('[data-tab="read"]').dataset.lojiGlyph,'读');
 assert.equal(label('.layout > .details > .eyebrow'),'РАСПОЗНАВАНИЕ / ДАННЫЕ');
 assert.equal(w.getComputedStyle($('.lr-loji-sysline')).display,'flex');
 assert.equal(saved().library[0].text,text);
 assert.equal(saved().words.himmel.translation,'МОЙ ПЕРЕВОД');
 assert.ok(w.langradPager.pageCount()>1);
 $('#addText').click();
 assert.equal($('#editor').classList.contains('hidden'),false);
 $('[data-tab="words"]').click();await pause(60);
 assert.equal($('#words').classList.contains('hidden'),false);
 const picker=$('#lr-theme-select');
 picker.value='classic';picker.dispatchEvent(new w.Event('change',{bubbles:true}));await pause(60);
 assert.equal(label('[data-tab="read"]'),'Читалка');
 assert.equal(label('[data-tab="words"]'),'Словарь');
 assert.equal(label('header .subbrand'),'THE LANGUAGE RISES');
 assert.equal(label('#addText'),'＋ Добавить текст');
 assert.equal(w.getComputedStyle($('.lr-loji-sysline')).display,'none');
 picker.value='tfr';picker.dispatchEvent(new w.Event('change',{bubbles:true}));await pause(60);
 assert.equal(label('[data-tab="read"]'),'Читалка');
 assert.notEqual(w.getComputedStyle($('header .lr-tfr-globe')).display,'none');
 picker.value='loji';picker.dispatchEvent(new w.Event('change',{bubbles:true}));await pause(60);
 assert.equal(label('[data-tab="read"]'),'ПОТОК');
 assert.equal(label('#addText'),'＋ Загрузить документ');
 assert.equal(w.localStorage.getItem('langrad-theme'),'loji');
 assert.equal(saved().library[0].text,text);
 assert.equal(saved().words.himmel.translation,'МОЙ ПЕРЕВОД');
 assert.deepEqual(errors,[]);
 console.log('PASS Loji terminal labels, Chinese glyphs, controls, TFR/classic restoration, user data and pagination');
 w.close();
})().catch(e=>{console.error(e);w.close();process.exit(1)});
