/* Langrad paginated reader smoke/regression test.
 * Install jsdom@26.1.0 for Node, run: node tests/reader-pagination.cjs
 */
const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
const root=process.cwd();
const html=fs.readFileSync(root+'/index.html','utf8')
 .replace('<script defer src="/reader-lexicon.js"></script>\n<script defer src="/reader-pagination.js"></script>',
 '<script>'+fs.readFileSync(root+'/reader-lexicon.js','utf8')+'</script>'+
 '<script>'+fs.readFileSync(root+'/reader-pagination.js','utf8')+'</script>');
const sentence="Der Himmel war gelb wie Messing und der Wind war stark. ";
const full=(sentence+"\n\n").repeat(100);
const original={title:"Eine lange Geschichte",text:full,aid:"A2",words:{himmel:{display:"Himmel",stage:2,correct:2,wrong:1,next:0,translation:"моё значение"}},
 results:{total:3,correct:2},library:[{id:"doc1",title:"Eine lange Geschichte",text:full}],activeTextId:"doc1"};
const apiCalls=[],errs=[];
const consoleOut=new VirtualConsole();consoleOut.on('jsdomError',e=>errs.push(String(e)));
const dom=new JSDOM(html,{url:'https://langrad.vercel.app/',runScripts:'dangerously',virtualConsole:consoleOut,pretendToBeVisual:true,beforeParse(w){
 w.localStorage.setItem('langrad-v01',JSON.stringify(original));w.localStorage.setItem('langrad-theme','tfr');
 w.scrollTo=()=>{};w.speechSynthesis={getVoices:()=>[],cancel:()=>{},speak:()=>{}};
 w.fetch=async (url,opts={})=>{
  if(String(url).includes('generativelanguage.googleapis.com')){
   apiCalls.push(JSON.parse(opts.body).contents[0].parts[0].text);
   return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:"Das ist ein kurzer Text für Menschen, die Deutsch lernen. ".repeat(30)}]}}]})};
  }
  return {ok:false,status:404,json:async()=>null};
 };
}});
const w=dom.window;
const delay=n=>new Promise(resolve=>setTimeout(resolve,n));
const get=()=>JSON.parse(w.localStorage.getItem('langrad-v01'));
async function run(){
 await delay(200);
 const pager=w.langradPager;
 assert.ok(pager);assert.ok(pager.pageCount()>3);
 const sizes=pager.splitText(full).map(p=>p.words);
 assert.ok(sizes.slice(0,-1).every(n=>n>=180&&n<=300),JSON.stringify(sizes));
 assert.equal(get().text,full);assert.equal(get().library[0].text,full);
 assert.equal(w.document.documentElement.dataset.theme,'tfr');
 assert.equal(w.document.querySelector('.layout>.details').tabIndex,0);
 assert.equal(w.document.querySelectorAll('#lr-page-nav-top select option').length,pager.pageCount());
 pager.goto(2);assert.equal(pager.pageNumber(),3);assert.equal(get().readingPages.doc1.index,2);
 pager.goto(0);
 const first=pager.originalPage();
 w.document.getElementById('lr-ai-key').value='only-a-test-key';
 w.document.getElementById('lr-ai-key').dispatchEvent(new w.Event('input'));
 w.document.getElementById('lr-level-run').click();
 for(let i=0;i<100;i++){await delay(80);if(Object.keys(get().pageAdaptations||{}).length)break}
 assert.equal(apiCalls.length,1,'Gemini called once');
 assert.ok(apiCalls[0].includes('Original:\n'+first));
 assert.ok(!apiCalls[0].includes(full),'Gemini was sent the entire book!');
 assert.equal(get().text,full);assert.equal(get().library[0].text,full);
 assert.ok(w.document.getElementById('reader').textContent.includes('kurzer Text'));
 pager.goto(1);assert.ok(!w.document.getElementById('reader').textContent.includes('kurzer Text'));
 pager.goto(0);assert.ok(w.document.getElementById('reader').textContent.includes('kurzer Text'));
 w.document.getElementById('lr-level-original').click();
 assert.ok(!w.document.getElementById('reader').textContent.includes('kurzer Text'));
 assert.equal(get().words.himmel.translation,'моё значение');
 assert.equal(get().words.himmel.stage,2);
 assert.equal(get().library[0].text,full);
 assert.deepEqual(errs,[]);
 console.log('PASS '+sizes.length+' pages; Gemini sent one page; CEFR restore, saved words and TFR preserved');
 w.close();
}
run().then(()=>process.exit(0)).catch(e=>{console.error(e);w.close();process.exit(1)});
