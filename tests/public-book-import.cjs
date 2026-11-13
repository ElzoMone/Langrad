const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {test} = require("node:test");
const {build, clearance} = require("../scripts/build_book_catalog.cjs");
const wiki = {
  id:"wikipedia-1", source:"Wikipedia", kind:"article", title:"Eine Reise", author:"Wikipedia · Mitwirkende",
  license:"CC BY-SA 4.0", license_url:"https://creativecommons.org/licenses/by-sa/4.0/",
  source_url:"https://de.wikipedia.org/w/index.php?oldid=1", genre:"Reisen",
  text:"Der Himmel ist blau und die Luft ist warm. Wir gehen heute durch die Stadt. ".repeat(16),
};
const literary = {
  ...wiki, id:"gutenberg-11", source:"Project Gutenberg", kind:"book", author:"Beispiel",
  license:"Public domain (DE, US)", license_url:null, source_url:"https://www.gutenberg.org/ebooks/11",
};
test("only licensed content is accepted and the German term ends at the end of the year", () => {
  assert.equal(clearance({...literary,author_death_year:1956},2026),"copyright_term");
  assert.equal(clearance({...literary,author_death_year:1955},2026),null);
  assert.equal(clearance(literary,2026),"missing_author_death_year");
  assert.equal(clearance({...wiki,visibility:"private"},2026),"not_public");
  assert.equal(clearance({...wiki,source_url:"https://example.org/article"},2026),"source_url_or_author");
  assert.equal(clearance({...wiki,license:"all rights reserved"},2026),"license");
});
test("split content, preserve provenance, merge duplicates and never publish review or private text", async () => {
  const dest=fs.mkdtempSync(path.join(os.tmpdir(),"langrad-books-"));
  try {
    const input=[wiki,{...wiki,id:"wikipedia-2",title:"  EINE REISE! "},
      {...wiki,id:"private-1",visibility:"private",text:"PRIVATE"}, literary];
    const first=await build(input,dest,2026);
    assert.deepEqual(first.pending.map(x=>x.reason),["missing_author_death_year"]);
    assert.equal(first.count,1);
    const files=fs.readdirSync(dest).sort();
    assert.deepEqual(files,["catalog.json","wikipedia-1.json"]);
    const before=files.map(file=>fs.readFileSync(path.join(dest,file),"utf8"));
    const second=await build(input,dest,2026);
    assert.equal(second.updated,0);
    assert.deepEqual(files.map(file=>fs.readFileSync(path.join(dest,file),"utf8")),before);
    const book=JSON.parse(before[1]);
    assert.equal(book.license,wiki.license);
    assert.equal(book.source_url,wiki.source_url);
    assert.equal(book.chapters[0].book_id,wiki.id);
    assert.ok(book.word_count>=100);
  } finally {fs.rmSync(dest,{recursive:true,force:true});}
});
