const fs=require("node:fs");
const assert=require("node:assert/strict");
const {test}=require("node:test");
const {JSDOM,VirtualConsole}=require("jsdom");
const html=fs.readFileSync("index.html","utf8").replace(/<script defer src="\/([^"]+)"><\/script>/g,
 (_,file)=>"<script>"+fs.readFileSync(file,"utf8")+"</script>");
const catalog=JSON.parse(fs.readFileSync("public/books/catalog.json","utf8"));
const kafka=catalog.books.find(book=>book.id==="gutenberg-22367");
const wait=async check=>{
 for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,15));}
 assert.fail("Expected browser state");
};
test("catalog filters, private separation and reading resume",async()=>{
 const errors=[], requests=[], console=new VirtualConsole();
 console.on("jsdomError",error=>errors.push(error));
 const dom=new JSDOM(html,{url:"https://langrad.vercel.app/",runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:console,beforeParse(w){
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.scrollTo=()=>{};
  w.TextDecoder=TextDecoder;
  w.speechSynthesis={getVoices:()=>[],cancel:()=>{}};
  w.fetch=async raw=>{
   const url=new URL(raw,w.location.href);
   requests.push(url.pathname);
   if(url.pathname.endsWith("/catalog.json"))return {ok:true,json:async()=>({books:[{...kafka,id:"private-fake",title:"SECRET",visibility:"private"},...catalog.books]})};
   if(url.pathname.endsWith("/"+kafka.content))return {ok:true,json:async()=>JSON.parse(fs.readFileSync("public/books/"+kafka.content))};
   if(url.pathname.startsWith("/books/")&&fs.existsSync("."+url.pathname))return {ok:true,json:async()=>JSON.parse(fs.readFileSync("."+url.pathname))};
   return {ok:false,status:404};
  };
 }});
 const w=dom.window,$=s=>w.document.querySelector(s);
 try {
  $('[data-tab="discover"]').click();
  $("#lr-catalog-books").click();
  await wait(()=>$("#lr-public-results article"));
  assert.equal(w.document.querySelectorAll("#lr-public-recommended article").length,4);
  assert.equal(requests.some(url=>url.endsWith(kafka.content)),false);
  const field=$("#lr-public-search");
  field.value="SECRET";field.dispatchEvent(new w.Event("input"));
  assert.equal($("#lr-public-results article"),null);
  field.value="Kafka Verwandlung";field.dispatchEvent(new w.Event("input"));
  assert.equal(w.document.querySelectorAll("#lr-public-results article").length,1);
  $("#lr-public-source").value="Wikisource";$("#lr-public-source").dispatchEvent(new w.Event("change"));
  assert.equal($("#lr-public-results article"),null);
  $("#lr-public-source").value="Project Gutenberg";$("#lr-public-source").dispatchEvent(new w.Event("change"));
  $("#lr-public-results button").click();
  await wait(()=>$("#lr-public-chapters select"));
  assert.equal($("#lr-public-chapters a").href,kafka.source_url);
  const select=$("#lr-public-chapters select");
  select.value="1";select.dispatchEvent(new w.Event("change"));
  assert.equal($("#lr-public-chapters select").value,"1");
  w.langradPager.goto(1);
  const saved=JSON.parse(w.localStorage.getItem("langrad-v01"));
  assert.equal(saved.publicBookProgress[kafka.id].chapter,1);
  assert.equal(saved.publicBookActive,true);
  assert.ok($("#reader .token"));
  assert.ok(!saved.activeTextId.startsWith("public-chapter-"));
  $('[data-tab="discover"]').click();
  await wait(()=>$("#lr-public-results button")?.textContent==="Продолжить");
  $("#lr-public-results button").click();
  await wait(()=>!$("#read").classList.contains("hidden"));
  assert.equal(w.langradPager.pageNumber(),2);
  assert.deepEqual(errors,[]);
  await new Promise(resolve=>setTimeout(resolve,30));
 } finally {dom.window.close();}
});
