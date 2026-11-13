const fs = require("node:fs");
const path = require("node:path");
const {processText} = require("../books/text-pipeline.js");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "public", "books");
const commonWords = new Set(fs.readFileSync(path.join(root,"books/de-frequency.txt"), "utf8").trim().split(/\s+/));
const sources = new Map([
  ["Project Gutenberg", ["www.gutenberg.org", "Public domain (DE, US)", null]],
  ["Wikisource", ["de.wikisource.org", "Public domain (DE, US)", null]],
  ["Wikipedia", ["de.wikipedia.org", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"]],
  ["Wikivoyage", ["de.wikivoyage.org", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"]],
]);
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

function clearance(item, year) {
  if (item.visibility && item.visibility !== "public") return "not_public";
  if (item.needs_review) return item.reason || "source_review";
  const policy = sources.get(item.source);
  if (!policy || item.license !== policy[1] || (item.license_url ?? null) !== policy[2]) return "license";
  let url;
  try { url = new URL(item.source_url); } catch { return "source_url"; }
  if (url.origin !== "https://" + policy[0] || url.username || url.password || !item.author?.trim()) return "source_url_or_author";
  if (policy[2] === null && !Number.isInteger(item.author_death_year)) return "missing_author_death_year";
  if (item.author_death_year != null &&
      (!Number.isInteger(item.author_death_year) || item.author_death_year + 70 >= year)) return "copyright_term";
  return null;
}

function writeJson(file, data) {
  const json = JSON.stringify(data) + "\n";
  if (fs.existsSync(file) && fs.readFileSync(file,"utf8") === json) return;
  fs.writeFileSync(file + ".tmp", json);
  fs.renameSync(file + ".tmp", file);
}

async function build(input, destination = output, year = new Date().getUTCFullYear(), maxBookWords = 180000) {
  const index = path.join(destination,"catalog.json");
  const previous = fs.existsSync(index) ? JSON.parse(fs.readFileSync(index,"utf8")).books : [];
  const books = new Map(previous.map(book => [book.id,book]));
  const hashes = new Map(previous.map(book => [book.dedup_key,book.id]));
  const pending = [];
  const updated = [];
  for (const item of input) {
    if (!idPattern.test(item.id || "")) continue;
    const problem = clearance(item,year);
    if (problem) {
      if (problem !== "not_public") pending.push({id:item.id,source:item.source,title:item.title,reason:problem,needs_review:true});
      continue;
    }
    const current = books.get(item.id);
    if (current?.source_url === item.source_url) continue;
    const book = await processText(item.text,{title:item.title,author:item.author,commonWords}).catch(error => {
      console.warn(item.id + ": " + error.message);
      return null;
    });
    if (!book || book.language !== "de" || book.word_count < (item.kind === "article" ? 100 : 60)) continue;
    if (item.kind === "book" && book.word_count > maxBookWords) continue;
    if (hashes.has(book.dedup_key) && hashes.get(book.dedup_key) !== item.id) continue;
    const {chapters,...metadata} = book;
    const row = {
      ...metadata, id:item.id, visibility:"public", owner_id:null,
      author_death_year:item.author_death_year ?? null,
      source:item.source, source_url:item.source_url, license:item.license, license_url:item.license_url,
      genre:item.genre, kind:item.kind, excerpt:Boolean(item.excerpt),
      chapter_count:chapters.length, content:item.id + ".json",
    };
    books.set(row.id,row);
    hashes.set(row.dedup_key,row.id);
    updated.push({row, chapters:chapters.map(({pages,...chapter})=>({
      ...chapter,id:row.id + "-" + (chapter.index + 1),book_id:row.id
    }))});
  }
  fs.mkdirSync(destination,{recursive:true});
  for (const {row,chapters} of updated) {
    writeJson(path.join(destination,row.content), {
      ...row, chapters, attribution: row.license_url ? "Извлечение и форматирование текста для Langrad." : null
    });
  }
  writeJson(index, {schema_version:1,books:[...books.values()].sort((a,b)=>a.id.localeCompare(b.id,"en"))});
  return {count:books.size,updated:updated.length,pending};
}

if (require.main === module) {
  const [file, review, max] = process.argv.slice(2);
  if (!file) throw new Error("Usage: node scripts/build_book_catalog.cjs candidates.json [review.json] [maxBookWords]");
  const input = JSON.parse(fs.readFileSync(file,"utf8"));
  build(input,output,undefined,max === undefined ? undefined : Number(max)).then(result => {
    if (review) writeJson(review,result.pending);
    console.log(JSON.stringify(result));
  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
module.exports = {clearance,build};
