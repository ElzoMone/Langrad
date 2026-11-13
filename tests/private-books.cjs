const assert = require("node:assert/strict");
const fs = require("node:fs");
const {test} = require("node:test");
const {webcrypto} = require("node:crypto");
const {JSDOM,VirtualConsole} = require("jsdom");
const {IDBFactory} = require("fake-indexeddb");
const {execFileSync} = require("node:child_process");
const html = fs.readFileSync("index.html","utf8").replace(/<script defer src="\/([^"]+)"><\/script>/g,
  (_,file) => "<script>" + fs.readFileSync(file,"utf8") + "</script>");
const frequency = fs.readFileSync("books/de-frequency.txt","utf8");
const makeBook = protectedBook => execFileSync("python3",["-c",`
import io,sys,zipfile
b=io.BytesIO()
with zipfile.ZipFile(b,"w",zipfile.ZIP_DEFLATED) as z:
 z.writestr("mimetype","application/epub+zip",zipfile.ZIP_STORED)
 z.writestr("META-INF/container.xml",'<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>')
 z.writestr("OPS/book.opf",'<package><metadata><title>Testbuch</title><creator>Testautor</creator></metadata><manifest><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>')
 z.writestr("OPS/nav.xhtml",'<html xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><a href="a.xhtml#start">Anfang</a><a href="b.xhtml">Ende</a></nav></body></html>')
 z.writestr("OPS/a.xhtml",'<html><body><section id="start">'+ '<p>Der Himmel war blau, und ich ging durch die Stadt.</p>'*95 +'</section></body></html>')
 z.writestr("OPS/b.xhtml",'<html><body><p>Dann ging ich los. Das war die letzte Seite.</p><script>FALSCH</script></body></html>')
 if ${protectedBook ? "True" : "False"}: z.writestr("META-INF/encryption.xml",'<encryption><EncryptedData><EncryptionMethod Algorithm="urn:drm"/></EncryptedData></encryption>')
sys.stdout.buffer.write(b.getvalue())
`]);
const tick = () => new Promise(resolve => setTimeout(resolve,20));
async function until(check) {
  for (let i=0;i<100;i++) { if (check()) return; await tick(); }
  assert.fail("Timed out");
}
function profile(database = new IDBFactory(), saved = {}) {
  const errors = [], console = new VirtualConsole();
  console.on("jsdomError", error => errors.push(error));
  const dom = new JSDOM(html,{url:"https://langrad.vercel.app/",runScripts:"dangerously",virtualConsole:console,pretendToBeVisual:true,beforeParse(w) {
    Object.defineProperty(w,"crypto",{value:webcrypto});
    Object.assign(w,{indexedDB:database,TextDecoder,TextEncoder,Blob,DecompressionStream,confirm:()=>true,alert:()=>{},scrollTo:()=>{}});
    w.HTMLElement.prototype.scrollIntoView = () => {};
    w.speechSynthesis = {getVoices:()=>[],cancel:()=>{},speak:()=>{}};
    w.fetch = async url => String(url).endsWith("de-frequency.txt") ? {ok:true,text:async()=>frequency} : {ok:false,status:404};
    for(const [key,value] of Object.entries(saved)) w.localStorage.setItem(key,value);
  }});
  return {dom,errors,w:dom.window,$:selector=>dom.window.document.querySelector(selector)};
}
function view(p, tab) {p.$('[data-tab="'+tab+'"]').click();}
function upload(p,name,bytes) {
  Object.defineProperty(p.$("#lr-book-file"),"files",{value:[{name,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}],configurable:true});
  p.$("#lr-book-form").dispatchEvent(new p.w.Event("submit",{cancelable:true}));
}
test("EPUB chapters, TXT upload, protected EPUB, position, profile isolation and deletion",async () => {
  const db = new IDBFactory(), p = profile(db);
  try {
    view(p,"library");
    upload(p,"protected.epub",makeBook(true));
    await until(()=>p.$("#lr-book-status").textContent.includes("DRM"));
    upload(p,"test.epub",makeBook(false));
    await until(()=>p.$("#lr-private-books article"));
    p.$("#lr-private-books button").click();
    await until(()=>p.$("#lr-book-chapters select"));
    assert.deepEqual([...p.$("#lr-book-chapters select").options].map(option=>option.text),["1. Anfang","2. Ende"]);
    assert.ok(p.$("#reader .token"));
    p.w.langradPager.goto(1);
    assert.equal(p.w.langradPager.pageNumber(),2);
    const saved = Object.fromEntries(Object.keys(p.w.localStorage).map(key=>[key,p.w.localStorage.getItem(key)]));
    assert.ok(!saved["langrad-v01"].includes("Der Himmel war blau"));
    const restored = profile(db,saved);
    const other = profile();
    try {
      await until(()=>restored.$("#lr-book-chapters select"));
      assert.equal(restored.w.langradPager.pageNumber(),2);
      const bookId = Object.keys(JSON.parse(saved["langrad-v01"]).privateBookProgress)[0];
      other.w.history.replaceState({}, "", "/?book="+bookId);
      other.w.localStorage.setItem("langrad-local-book-owner",saved["langrad-local-book-owner"]);
      view(other,"library");
      await tick();
      assert.equal(other.$("#lr-private-books").textContent,"");
      assert.ok(!other.$("#reader").textContent.includes("Der Himmel war blau"));
    } finally {restored.dom.window.close();other.dom.window.close();}
    view(p,"library");
    await until(()=>p.$("#lr-private-books button"));
    p.$("#lr-private-books button:last-child").click();
    await until(()=>!p.$("#lr-private-books article"));
    upload(p,"privat.txt",Buffer.from("Kapitel 1\n\nDer Himmel war blau.\n\nKapitel 2\n\nDie Stadt war ruhig."));
    await until(()=>p.$("#lr-private-books article"));
    assert.match(p.$("#lr-private-books").textContent,/privat/);
    assert.deepEqual(p.errors,[]);
  } finally {p.dom.window.close();}
});
