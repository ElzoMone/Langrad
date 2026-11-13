(() => {
  "use strict";
  const get = id => document.getElementById(id);
  const pane = get("lr-public-catalog");
  const search = get("lr-public-search");
  const level = get("lr-public-level");
  const genre = get("lr-public-genre");
  const length = get("lr-public-length");
  const source = get("lr-public-source");
  const results = get("lr-public-results");
  const recommended = get("lr-public-recommended");
  const status = get("lr-public-status");
  const navigation = get("lr-public-chapters");
  const retry = get("lr-public-retry");
  const more = get("lr-public-more");
  const remote = "https://raw.githubusercontent.com/ElzoMone/Langrad/main/public/books/";
  const levels = ["A1","A2","B1","B2","C1","C2"];
  const hosts = {"Project Gutenberg":"www.gutenberg.org",Wikisource:"de.wikisource.org",
    Wikipedia:"de.wikipedia.org",Wikivoyage:"de.wikivoyage.org"};
  const normalize = value => String(value || "").toLowerCase().normalize("NFKD")
    .replace(/\p{M}/gu,"").replace(/ß/g,"ss").replace(/[^\p{L}\p{N}]+/gu," ").trim();
  const started = () => state.publicBookProgress || {};
  let books = [];
  let covers = {};
  let vocabulary = {};
  let catalog;
  let selection = 0;
  let active;
  let limit = 24;
  const loaded = new Map();

  function publicEntry(book) {
    if (!book || book.visibility !== "public" || book.owner_id !== null || book.language !== "de" ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(book.id) || book.content !== book.id + ".json" ||
        !Object.hasOwn(hosts,book.source) || typeof book.title !== "string" ||
        typeof book.author !== "string" || typeof book.license !== "string" ||
        !Number.isSafeInteger(book.chapter_count) || book.chapter_count < 1 ||
        !Number.isSafeInteger(book.word_count) || book.word_count < 1) return false;
    try {
      return new URL(book.source_url).origin === "https://" + hosts[book.source];
    } catch { return false; }
  }

  async function json(url) {
    const response = await fetch(url,{credentials:"omit",signal:AbortSignal.timeout(6500)});
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  }

  async function catalogFile(file, validate) {
    const paths = location.hostname === "langrad.vercel.app"
      ? [remote + file, "/books/" + file] : ["/books/" + file, "/public/books/" + file, remote + file];
    for (const path of paths) {
      try {
        const value = await json(path);
        if (validate(value)) return value;
      } catch { /* Try the bundled copy. */ }
    }
    throw new Error("Каталог книг временно недоступен.");
  }

  function choices(select, placeholder, values) {
    select.replaceChildren(new Option(placeholder,""),...values.map(value => new Option(value,value)));
  }

  async function loadCatalog() {
    if (!catalog) {
      catalog = Promise.all([
        catalogFile("catalog.json",data => Array.isArray(data?.books) && data.books.some(publicEntry)),
        json("/books/public-covers.json").catch(() => ({})),
        json("/books/public-vocabulary.json").catch(() => ({}))
      ]).then(([data, artwork, samples]) => {
        books = data.books.filter(publicEntry);
        covers = artwork;
        vocabulary = samples;
        choices(level,"Все уровни",levels);
        choices(genre,"Все жанры и темы",[...new Set(books.map(item => item.genre).filter(Boolean))].sort());
        choices(source,"Все источники",[...new Set(books.map(item => item.source))].sort());
      }).catch(error => { catalog = undefined; throw error; });
    }
    return catalog;
  }

  function button(label, callback, primary = false) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "btn sm" + (primary ? " primary" : "");
    el.textContent = label;
    el.onclick = callback;
    return el;
  }

  function node(tag,text,cls) {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  }

  function card(book) {
    const tile = node("article",null,"lr-public-card");
    tile.dataset.bookId = book.id;
    const band = levels.includes(book.level_estimate) ? book.level_estimate : "";
    const cover = node("div",band || "DE","lr-public-cover");
    cover.dataset.band = band[0] || "";
    cover.setAttribute("aria-hidden","true");
    const coverId = covers[book.id];
    if (Number.isSafeInteger(coverId)) {
      const image = document.createElement("img");
      image.src = "https://covers.openlibrary.org/b/id/" + coverId + "-M.jpg?default=false";
      image.referrerPolicy = "no-referrer";
      image.alt = "";
      image.loading = "lazy";
      image.onerror = () => image.remove();
      cover.append(image);
    }
    const body = node("div");
    const badge = node("strong",band ? "≈ " + band : "Уровень не оценён","lr-discover-badge");
    badge.dataset.level = band;
    const author = book.kind === "book" ? book.author + " · " : "";
    const estimate = Math.max(1,Math.ceil(book.word_count / 120));
    body.append(badge,node("h3",book.title),node("p",author + book.genre + " · " + book.source,"tiny"),
      node("p",book.chapter_count + " гл. · ≈ " + estimate + " мин","tiny"));
    const sample = vocabulary[book.id];
    const known = word => {
      const record = state.words[word];
      return isKnown(state.words[record?.aliasOf] || record);
    };
    if (sample?.sample.length && Object.values(state.words).some(isKnown)) {
      const unfamiliar = Math.round(sample.count * (1 - sample.sample.filter(known).length / sample.sample.length));
      const estimate = node("p","≈ " + unfamiliar.toLocaleString("ru") + " новых словоформ","tiny");
      estimate.title = "Оценка по выборке. Учитывает слова, отмеченные знакомыми в Langrad.";
      body.append(estimate);
    }
    const action = button(Object.hasOwn(started(),book.id) ? "Продолжить" : "Читать", async () => {
      const ticket = ++selection;
      action.disabled = true;
      status.textContent = "Загружаю книгу…";
      try {
        const details = await loadBook(book);
        if (ticket !== selection || pane.classList.contains("hidden") || get("discover").classList.contains("hidden")) return;
        const index = Math.max(0,Math.min(details.chapters.length - 1,started()[book.id]?.chapter || 0));
        openChapter(details,index);
      } catch {
        if (ticket === selection) status.textContent = "Не удалось открыть книгу. Попробуй ещё раз.";
      } finally { action.disabled = false; }
    },true);
    body.append(action);
    tile.append(cover,body);
    return tile;
  }

  function matchesFilters(book, terms) {
    const size = book.word_count;
    const lengths = !length.value || (length.value === "short" && size <= 2000) ||
      (length.value === "medium" && size > 2000 && size <= 10000) ||
      (length.value === "long" && size > 10000);
    return lengths && (!level.value || book.level_estimate === level.value) &&
      (!genre.value || book.genre === genre.value) && (!source.value || book.source === source.value) &&
      terms.every(term => normalize(book.title + " " + book.author).includes(term));
  }

  function render() {
    const query = normalize(search.value);
    const terms = query ? query.split(" ") : [];
    const matches = books.filter(book => matchesFilters(book,terms));
    recommended.replaceChildren();
    if (!query && !level.value && !genre.value && !length.value && !source.value) {
      const target = Math.max(0,levels.indexOf(state.aid || "B1"));
      const distance = book => levels.includes(book.level_estimate) ? Math.abs(target - levels.indexOf(book.level_estimate)) : 7;
      const unread = books.filter(book => book.kind === "book" && !Object.hasOwn(started(),book.id));
      const picks = (unread.length >= 4 ? unread : books.filter(book => book.kind === "book"))
        .sort((a,b) => distance(a) - distance(b) || a.word_count - b.word_count).slice(0,4);
      if (picks.length) {
        const grid = node("div",null,"lr-public-grid");
        grid.append(...picks.map(card));
        recommended.append(node("h2","Книги для твоего уровня"),grid,node("h2","Весь каталог"));
      }
    }
    results.replaceChildren(...matches.slice(0,limit).map(card));
    more.classList.toggle("hidden",matches.length <= limit);
    status.textContent = matches.length ? "Найдено: " + matches.length : "По этим фильтрам ничего не найдено.";
  }

  async function loadBook(book) {
    if (loaded.has(book.id)) return loaded.get(book.id);
    const data = await catalogFile(book.content,item => publicEntry(item) && item.id === book.id &&
      item.source_url === book.source_url && item.license === book.license &&
      Array.isArray(item.chapters) && item.chapters.length === book.chapter_count &&
      item.chapters.every((chapter,i) => chapter?.book_id === book.id && chapter.index === i &&
        typeof chapter.title === "string" && typeof chapter.text === "string" && chapter.text.trim()));
    if (loaded.size >= 4) loaded.delete(loaded.keys().next().value);
    loaded.set(book.id,data);
    if (!vocabulary[book.id]) {
      const types = [...new Set(data.chapters.flatMap(chapter =>
        chapter.text.toLowerCase().match(window.langradPager.wordPattern) || []))];
      const size = Math.min(200,types.length);
      vocabulary[book.id] = {count:types.length,sample:Array.from({length:size},(_,i) =>
        types[Math.floor((i+.5)*types.length/size)])};
    }
    return data;
  }

  function openChapter(book,index,{restore = false} = {}) {
    const chapter = book.chapters[index];
    if (!chapter) return;
    active = {book,index};
    state.publicBookProgress ||= {};
    state.publicBookProgress[book.id] = {chapter:index};
    state.lastPublicBook = book.id;
    state.lastReadingBookKind = "public";
    state.activeTextId = "public-chapter-" + chapter.id;
    state.title = book.title + " · " + chapter.title;
    state.text = chapter.text;
    get("cancelEdit").click();
    persist();
    if (restore) renderReader();
    else {
      showTab("read");
      get("docTitle").scrollIntoView?.({block:"nearest"});
    }
  }

  const priorRender = renderReader;
  renderReader = function () {
    navigation.replaceChildren();
    if (active && state.activeTextId === "public-chapter-" + active.book.chapters[active.index].id) {
      const {book,index} = active;
      const picker = document.createElement("select");
      picker.setAttribute("aria-label","Глава книги из каталога");
      book.chapters.forEach((chapter,i) => picker.add(new Option((i+1) + ". " + chapter.title,String(i))));
      picker.value = String(index);
      picker.onchange = () => openChapter(book,Number(picker.value));
      const previous = button("Предыдущая глава",() => openChapter(book,index-1));
      const next = button("Следующая глава",() => openChapter(book,index+1));
      previous.disabled = index === 0;
      next.disabled = index === book.chapters.length - 1;
      const link = node("a",book.source + " · " + book.license);
      link.href = book.source_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      navigation.append(picker,previous,next,link);
      if (book.license_url === "https://creativecommons.org/licenses/by-sa/4.0/") {
        const license = node("a","Условия лицензии");
        license.href = book.license_url;
        license.target = "_blank";
        license.rel = "noopener noreferrer";
        navigation.append(license);
      }
    }
    return priorRender.apply(this,arguments);
  };

  get("lr-reading-summary").addEventListener("langrad:reading-finished",event => {
    if (!active || event.detail.id !== "public-chapter-" + active.book.chapters[active.index].id ||
        active.index >= active.book.chapters.length-1) return;
    const {book,index} = active;
    event.currentTarget.append(button("Следующая глава",() => openChapter(book,index+1)));
  });

  async function showBooks() {
    retry.classList.add("hidden");
    status.textContent = "Загружаю каталог…";
    try { await loadCatalog(); render(); }
    catch (error) { status.textContent = error.message; retry.classList.remove("hidden"); }
  }

  function switchPane(visible) {
    ++selection;
    pane.classList.toggle("hidden",!visible);
    get("lr-discover-texts").classList.toggle("hidden",visible);
    get("lr-catalog-books").setAttribute("aria-pressed",String(visible));
    get("lr-catalog-texts").setAttribute("aria-pressed",String(!visible));
    if (visible) showBooks();
  }

  get("lr-catalog-texts").onclick = () => switchPane(false);
  get("lr-catalog-books").onclick = () => switchPane(true);
  retry.onclick = showBooks;
  more.onclick = () => {
    const position = limit;
    limit += 24;
    render();
    results.children[position]?.querySelector("button")?.focus();
  };
  for (const control of [search,level,genre,length,source]) {
    control.addEventListener(control === search ? "input" : "change",() => {limit = 24; if (books.length) render();});
  }
  const discover = get("discover");
  new MutationObserver(() => {
    if (discover.classList.contains("hidden")) ++selection;
    else if (!pane.classList.contains("hidden")) showBooks();
  }).observe(discover,{attributes:true,attributeFilter:["class"]});

  window.langradPublicBookResume = async () => {
    const id = state.lastPublicBook;
    if (!id) return null;
    try {
      await loadCatalog();
      const row = books.find(book => book.id === id);
      if (!row) return null;
      const chapter = Math.min(row.chapter_count - 1, Math.max(0, Math.trunc(started()[id]?.chapter || 0)));
      const position = (state.readingPages?.["public-chapter-" + id + "-" + (chapter + 1)]?.index || 0) + 1;
      return {title:row.title,detail:"Глава " + (chapter+1) + " из " + row.chapter_count +
        " · страница " + position,totalPages:row.chapter_count,position:chapter+1,open:async () => {
          const ticket = ++selection;
          const status = get("discover-continue-status");
          try {
            const book = await loadBook(row);
            if (ticket === selection && !discover.classList.contains("hidden")) openChapter(book,chapter);
          } catch {
            if (ticket === selection && status) status.textContent = "Не удалось открыть книгу. Попробуй ещё раз.";
          }
        }};
    } catch { return null; }
  };

  const startup = state.publicBookActive;
  state.publicBookActive = false;
  if (startup && state.lastPublicBook) {
    const ticket = ++selection;
    loadCatalog().then(async () => {
      const row = books.find(book => book.id === state.lastPublicBook);
      if (!row) return;
      const book = await loadBook(row);
      if (ticket === selection && !get("read").classList.contains("hidden")) {
        const chapter = Math.min(book.chapters.length-1,Math.max(0,Math.trunc(started()[book.id]?.chapter || 0)));
        openChapter(book,chapter,{restore:true});
      }
    }).catch(() => {});
  }
})();
