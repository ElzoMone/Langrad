(() => {
  "use strict";
  const get = id => document.getElementById(id);
  const shelf = get("lr-private-books");
  const form = get("lr-book-form");
  const status = get("lr-book-status");
  const navigation = get("lr-book-chapters");
  const bookLimit = 50;
  const byteLimit = 10 * 1024 * 1024;
  const chapterPrefix = "private-chapter-";
  let active;
  let epoch = 0;
  let frequency;
  let db;
  let shelfVersion = 0;

  function database() {
    if (db) return db;
    db = new Promise((resolve, reject) => {
      const request = indexedDB.open("langrad-private-books", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("books", {keyPath:"id"});
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => { db = undefined; throw error; });
    return db;
  }

  async function operation(mode, perform) {
    const connection = await database();
    return new Promise((resolve, reject) => {
      const transaction = connection.transaction("books", mode);
      let result;
      const request = perform(transaction.objectStore("books"));
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error || new Error("Хранилище недоступно."));
    });
  }

  async function insert(book) {
    const connection = await database();
    return new Promise((resolve,reject) => {
      const transaction = connection.transaction("books","readwrite");
      const store = transaction.objectStore("books");
      let reason;
      const check = store.count();
      check.onsuccess = () => {
        if (check.result >= bookLimit) {
          reason = new Error("Достигнут лимит в 50 книг.");
          transaction.abort();
        } else {
          const request = store.add(book);
          request.onerror = () => {
            if (request.error?.name === "ConstraintError") reason = new Error("Книга с таким названием и автором уже есть.");
          };
        }
      };
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(reason || transaction.error);
    });
  }

  function button(label, action, primary = false) {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "btn sm" + (primary ? " primary" : "");
    node.textContent = label;
    node.onclick = action;
    return node;
  }

  function owned(book) {
    const owner = localStorage.getItem("langrad-local-book-owner");
    return Boolean(owner && book?.visibility === "private" && book.owner_id === owner);
  }

  function locationOf(book) {
    const saved = state.privateBookProgress?.[book.id];
    return Math.min(book.chapters.length - 1, Math.max(0, Number(saved?.chapter) || 0));
  }

  function showChapter(book, index, {restore = false} = {}) {
    const chapter = book.chapters[index];
    if (!chapter || !owned(book)) return;
    active = {book, index};
    state.privateBookProgress ||= {};
    state.privateBookProgress[book.id] = {chapter:index};
    state.lastPrivateBook = book.id;
    state.lastReadingBookKind = "private";
    state.activeTextId = chapterPrefix + book.id + "-" + index;
    state.title = book.title + " · " + chapter.title;
    state.text = chapter.text;
    get("cancelEdit").click();
    persist();
    if (restore) renderReader();
    else showTab("read");
  }

  function progressText(book, index) {
    const chapter = book.chapters[index];
    const page = (state.readingPages?.[chapterPrefix + book.id + "-" + index]?.index || 0) + 1;
    return "Глава " + (index + 1) + " из " + book.chapters.length + " · страница " + page + " из " + chapter.pageCount;
  }

  async function openStoredBook(id) {
    const ticket = ++epoch;
    try {
      const book = await operation("readonly", store => store.get(id));
      if (ticket !== epoch) return;
      if (!owned(book)) throw new Error("Книга недоступна в этом браузере.");
      showChapter(book, locationOf(book));
    } catch (error) {
      if (ticket === epoch) status.textContent = error.message || "Не удалось открыть книгу.";
    }
  }

  async function renderShelf() {
    const version = ++shelfVersion;
    try {
      const books = await operation("readonly", store => store.getAll());
      if (version !== shelfVersion) return;
      shelf.replaceChildren();
      for (const book of books.filter(owned).sort((a,b) => b.created_at - a.created_at).reverse()) {
        const card = document.createElement("article");
        card.className = "lr-library-entry";
        const details = document.createElement("div");
        const name = document.createElement("strong");
        name.className = "lr-library-title";
        name.textContent = book.title;
        const info = document.createElement("p");
        info.className = "tiny";
        info.textContent = [book.author, book.language === "de" ? (book.level_estimate ? "≈ " + book.level_estimate : "Немецкий") :
          "Язык: " + book.language, book.word_count + " слов", progressText(book,locationOf(book))].filter(Boolean).join(" · ");
        details.append(name,info);
        const actions = document.createElement("div");
        actions.className = "lr-book-actions";
        actions.append(button(state.privateBookProgress?.[book.id] ? "Продолжить" : "Открыть", () => openStoredBook(book.id),true),
          button("Удалить", async () => {
            if (!confirm("Удалить книгу «" + book.title + "» с этого устройства?")) return;
            try {
              if (!owned(book)) return;
              await operation("readwrite", store => store.delete(book.id));
              ++epoch;
              delete state.privateBookProgress?.[book.id];
              for (const key of Object.keys(state.readingPages || {})) {
                if (key.startsWith(chapterPrefix + book.id + "-")) delete state.readingPages[key];
              }
              if (state.lastPrivateBook === book.id) delete state.lastPrivateBook;
              if (active?.book.id === book.id) {
                active = undefined;
                const fallback = state.library[0];
                state.activeTextId = fallback?.id || "";
                state.text = fallback?.text || "";
                state.title = fallback?.title || "";
              }
              persist();
              await renderShelf();
            } catch {
              status.textContent = "Не удалось удалить книгу.";
            }
          }));
        card.append(details,actions);
        shelf.append(card);
      }
    } catch {
      if (version === shelfVersion) status.textContent = "Локальное хранилище книг недоступно.";
    }
  }

  const originalShow = showTab;
  showTab = function(name) {
    ++epoch;
    const result = originalShow.apply(this, arguments);
    if (name === "library") renderShelf();
    return result;
  };

  function renderNavigation() {
    navigation.replaceChildren();
    if (!active || state.activeTextId !== chapterPrefix + active.book.id + "-" + active.index) return;
    const {book,index} = active;
    if (!owned(book)) return;
    const label = document.createElement("label");
    label.textContent = "Глава ";
    const picker = document.createElement("select");
    picker.setAttribute("aria-label","Глава книги");
    book.chapters.forEach((chapter,i) => picker.add(new Option((i+1) + ". " + chapter.title,String(i))));
    picker.value = String(index);
    picker.onchange = () => showChapter(book,Number(picker.value));
    label.append(picker);
    const next = button("Следующая глава", () => showChapter(book,index+1));
    next.disabled = index >= book.chapters.length-1;
    const prev = button("Предыдущая глава", () => showChapter(book,index-1));
    prev.disabled = index === 0;
    navigation.append(label,prev,next);
    if (book.source_url) {
      const source = document.createElement("a");
      source.href = book.source_url;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.textContent = "Википедия · " + book.license;
      navigation.append(source);
    }
  }
  const addText = get("addText");
  const edit = addText.onclick;
  addText.onclick = function() {
    edit.apply(this,arguments);
    if (String(state.activeTextId || "").startsWith(chapterPrefix)) {
      get("title").value = "";
      get("textInput").value = "";
    }
  };
  const originalRender = renderReader;
  renderReader = function() {
    renderNavigation();
    return originalRender.apply(this,arguments);
  };

  window.langradPrivateBookResume = async () => {
    const id = state.lastPrivateBook;
    if (!id) return null;
    try {
      const book = await operation("readonly", store => store.get(id));
      if (!owned(book)) return null;
      const index = locationOf(book);
      const page = (state.readingPages?.[chapterPrefix + book.id + "-" + index]?.index || 0) + 1;
      const totalPages = book.chapters.reduce((sum, chapter) => sum + chapter.pageCount, 0);
      const position = book.chapters.slice(0,index).reduce((sum, chapter) => sum + chapter.pageCount, page);
      return {title:book.title, detail:progressText(book,index), position,totalPages,open:() => openStoredBook(id)};
    } catch { return null; }
  };

  get("lr-add-book").onclick = () => {
    form.hidden = !form.hidden;
    if (!form.hidden) get("lr-book-file").focus();
  };
  async function importWikipedia(raw) {
    const source = new URL(raw);
    if (source.origin !== "https://de.wikipedia.org" || !source.pathname.startsWith("/wiki/")) {
      throw new Error("Поддерживаются ссылки на статьи немецкой Википедии.");
    }
    const title = decodeURIComponent(source.pathname.slice(6)).replace(/_/g," ");
    if (!title.trim() || title.length > 250 || title.includes(":")) throw new Error("Укажи ссылку на статью.");
    const query = new URLSearchParams({action:"query",format:"json",formatversion:"2",origin:"*",
      prop:"extracts",explaintext:"1",exsectionformat:"plain",redirects:"1",titles:title});
    const response = await fetch("https://de.wikipedia.org/w/api.php?" + query, {signal:AbortSignal.timeout(15000),credentials:"omit"});
    if (!response.ok) throw new Error("Не удалось загрузить статью.");
    const page = (await response.json()).query?.pages?.[0];
    if (page?.ns !== 0 || !page.extract) throw new Error("Статья с текстом не найдена.");
    if (new TextEncoder().encode(page.extract).length > byteLimit) throw new Error("Текст статьи превышает 10 МБ.");
    return {title:page.title,text:page.extract,url:"https://de.wikipedia.org/?curid=" + page.pageid};
  }

  form.onsubmit = async event => {
    event.preventDefault();
    const file = get("lr-book-file").files[0];
    const url = get("lr-book-url").value.trim();
    if ((!file && !url) || (file && url)) {
      status.textContent = "Выбери один файл или введи ссылку.";
      return;
    }
    const fileType = file ? file.name.split(".").at(-1).toLowerCase() : "wiki";
    if (!["txt","epub","wiki"].includes(fileType)) { status.textContent = "Выбери файл TXT или EPUB."; return; }
    if (file?.size > byteLimit) { status.textContent = "Максимальный размер файла — 10 МБ."; return; }
    const submit = form.querySelector('button[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;
    status.textContent = "Обрабатываю книгу…";
    try {
      const article = url ? await importWikipedia(url) : null;
      const bytes = file ? await file.arrayBuffer() : null;
      const archive = fileType === "epub" ? await window.langradReadEpub(bytes) : null;
      frequency ||= fetch("/books/de-frequency.txt").then(response => {
        if (!response.ok) throw new Error("Частотный словарь недоступен. Попробуй ещё раз.");
        return response.text();
      }).then(list => new Set(list.trim().split(/\s+/))).catch(error => {
        frequency = undefined;
        throw error;
      });
      const book = await window.langradTextPipeline.processText(archive?.chapters || article?.text || bytes, {
        title:get("lr-book-title").value.trim() || archive?.title || article?.title || file.name.replace(/\.[^.]+$/, ""),
        author:get("lr-book-author").value.trim() || archive?.author || "",
        commonWords:await frequency
      });
      if (book.title.length > 300 || book.author.length > 200) throw new Error("Слишком длинное название или имя автора.");
      let owner = localStorage.getItem("langrad-local-book-owner");
      if (!owner) {
        owner = crypto.randomUUID();
        localStorage.setItem("langrad-local-book-owner",owner);
      }
      await insert({...book,id:book.dedup_key,owner_id:owner,visibility:"private",source:fileType,
        license:article ? "CC BY-SA 4.0" : null,source_url:article?.url || null,created_at:Date.now(),
        chapters:book.chapters.map(({pages,...chapter}) => ({...chapter,pageCount:pages.length}))});
      form.reset();
      form.hidden = true;
      status.textContent = "Книга добавлена.";
      await renderShelf();
    } catch (error) {
      const message = error?.message || "";
      status.textContent = /[А-Яа-я]/u.test(message) ? message : "Не удалось добавить книгу. Проверь файл и свободное место в браузере.";
    } finally {
      submit.disabled = false;
    }
  };

  const startup = state.privateBookActive;
  state.privateBookActive = false;
  if (startup && state.lastPrivateBook) {
    const ticket = ++epoch;
    operation("readonly", store => store.get(state.lastPrivateBook)).then(book => {
      if (ticket === epoch && owned(book) && get("read").classList.contains("hidden") === false) {
        showChapter(book,locationOf(book),{restore:true});
      }
    }).catch(() => {});
  }
})();
