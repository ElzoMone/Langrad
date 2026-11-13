const fs = require("node:fs");
const books = require("../public/books/catalog.json").books;
const normalize = value => value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu,"").replace(/[^a-z0-9]+/g," ").trim();
async function main() {
  const output = "books/public-covers.json";
  const covers = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output)) : {};
  const used = new Set(Object.values(covers));
  for (const book of books.filter(book => book.kind === "book" && !covers[book.id])) {
    const title = book.title.split(/[:\n]/)[0].trim();
    const author = book.author.split(",").slice(0,2).reverse().join(" ").trim();
    const query = new URLSearchParams({title,author,fields:"title,author_name,cover_i",limit:"5"});
    try {
      const response = await fetch("https://openlibrary.org/search.json?" + query,{
        headers:{"User-Agent":"Langrad (https://github.com/ElzoMone/Langrad/issues)"},
        signal:AbortSignal.timeout(7000)
      });
      if (!response.ok) continue;
      const match = (await response.json()).docs.find(item => Number.isSafeInteger(item.cover_i) &&
        !used.has(item.cover_i) && normalize(item.title) === normalize(title) &&
        item.author_name?.some(name => normalize(name) === normalize(author)));
      if (match) {
        covers[book.id] = match.cover_i;
        used.add(match.cover_i);
      }
    } catch (error) {
      console.warn(book.id, error.message);
    } finally {
      await new Promise(resolve => setTimeout(resolve,1100));
    }
  }
  fs.writeFileSync(output,JSON.stringify(covers,null,2)+"\n");
}
main().catch(error => {console.error(error);process.exitCode=1;});
