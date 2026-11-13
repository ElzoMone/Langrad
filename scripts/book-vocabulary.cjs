const fs = require("node:fs");
const {wordPattern} = require("../reader-pagination.js");
const {books} = require("../public/books/catalog.json");
const result = {};
for (const book of books.filter(book => book.kind === "book")) {
  const {chapters} = JSON.parse(fs.readFileSync("public/books/" + book.content,"utf8"));
  const types = [...new Set(chapters.flatMap(chapter => (chapter.text.toLowerCase().match(wordPattern) || [])))];
  const size = Math.min(200,types.length);
  const sample = Array.from({length:size},(_,i) => types[Math.floor((i+.5)*types.length/size)]);
  result[book.id] = {count:types.length,sample};
}
fs.writeFileSync("books/public-vocabulary.json",JSON.stringify(result)+"\n");
