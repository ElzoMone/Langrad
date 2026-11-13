const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const {test} = require("node:test");
const {processText, dedupKey, clean} = require("../books/text-pipeline.js");
const {paginate} = require("../reader-pagination.js");

const root = join(__dirname, "..");
const commonWords = new Set(readFileSync(join(root, "books/de-frequency.txt"), "utf8").trim().split(/\s+/u));
const series = JSON.parse(readFileSync(join(root, "public/discover-series.json"), "utf8")).articles;
const catalog = JSON.parse(readFileSync(join(root, "public/discover.json"), "utf8")).articles;

test("Kafka: original parts keep their content and use reader pagination", async () => {
  assert.equal(commonWords.size, 5000);
  const originals = series.filter(entry => entry.series === "kafka-verwandlung");
  assert.equal(originals.length, 3);
  const input = originals.map((entry, i) => ["I.", "II.", "III."][i] + "\n\n" + entry.text).join("\n\n");
  const book = await processText(input, {title: "Die Verwandlung", author: "Franz Kafka", commonWords});
  assert.equal(book.language, "de");
  assert.match(book.level_estimate, /^(A[12]|B[12]|C[12])$/);
  assert.deepEqual(book.chapters.map(chapter => chapter.word_count), originals.map(entry => entry.words));
  assert.deepEqual(book.chapters.map(chapter => chapter.index), [0,1,2]);
  for (const [i, chapter] of book.chapters.entries()) {
    assert.equal(chapter.text, originals[i].text);
    assert.deepEqual(chapter.pages, paginate(chapter.text));
    assert.equal(chapter.pages.reduce((sum, page) => sum + page.words, 0), chapter.word_count);
  }
});

test("Hebel: cleanup removes wrappers and keeps the real chapter", async () => {
  const item = catalog.find(entry => entry.id === "hebel-kannitverstan");
  const input = [
    "Catalog metadata", "*** START OF THE PROJECT GUTENBERG EBOOK TEST ***",
    "Inhaltsverzeichnis", "Erstes Kapitel ........ 1", "Zweites Kapitel ........ 9", "",
    "Erstes Kapitel", "", item.text.replace("Der Mensch", "Der  Mensch[1]"), "", "[1] Anmerkung",
    "Seite 14", "", "*** END OF THE PROJECT GUTENBERG EBOOK TEST ***", "License",
  ].join("\r\n");
  const book = await processText(Buffer.from("\uFEFF" + input), {title: item.title, author: item.author, commonWords});
  assert.equal(book.chapters.length, 1);
  assert.equal(book.chapters[0].title, "Erstes Kapitel");
  assert.equal(book.chapters[0].text, item.text);
});

test("encoding, language, deduplication and header cleanup", async () => {
  assert.equal(clean(Uint8Array.from([0x47, 0x72, 0xfc, 0xdf, 0x65])), "Grüße");
  assert.equal(clean(Buffer.concat([Buffer.from([255,254]), Buffer.from("Grüße", "utf16le")])), "Grüße");
  assert.equal(clean("KOPF\nEine Zeile.\n1\fKOPF\nAndere Zeile.\n2\fKOPF\nLetzte Zeile.\n3"), "Eine Zeile.\n\nAndere Zeile.\n\nLetzte Zeile.");
  assert.equal(await dedupKey("  DIE — Verwandlung! ", "FRANZ   KAFKA"), await dedupKey("Die Verwandlung", "Franz Kafka"));
  assert.notEqual(await dedupKey("Die Verwandlung", "A"), await dedupKey("Die Verwandlung", "B"));
  const book = await processText("This is an English story. She was going to the shop and they were in the hall.", {title:"Test",commonWords});
  assert.equal(book.language, "en");
  assert.equal(book.level_estimate, null);
  await assert.rejects(processText("123", {title:"Test",commonWords}), /No readable words/);
});

test("without headings, output stays bounded and configurable", async () => {
  const paragraph = "Das ist eine Geschichte und wir lesen sie hier. ".repeat(110).trim();
  const book = await processText(Array(5).fill(paragraph).join("\n\n"), {title:"Test",commonWords,pageWords:90});
  assert.equal(book.word_count, 4950);
  assert.ok(book.chapters.length > 1);
  assert.ok(book.chapters.every(chapter => chapter.word_count <= 2500));
  assert.ok(book.chapters[0].pages.every(page => page.words <= 131));
});
