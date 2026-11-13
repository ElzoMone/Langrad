(() => {
  "use strict";

  const get = id => document.getElementById(id);
  const pager = window.langradPager;
  const finish = get("lr-finish-reading");
  const summary = get("lr-reading-summary");
  const goal = get("lr-reading-goal");
  const dateKey = date => [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map(value => String(value).padStart(2, "0")).join("-");
  let snapshot;
  let reviewing = false;
  let initialStudy = new Set();
  let initialKnowledge = new Set();
  let lastState;
  let lastPage;
  let summaryScope;

  const root = document.documentElement;
  const tone = get("lr-reading-tone");
  const size = get("lr-reading-size");
  const width = get("lr-reading-width");
  const viewKey = "langrad-reading-view-v1";
  let view = {};
  try { view = JSON.parse(localStorage.getItem(viewKey) || "{}") || {}; } catch {}
  size.replaceChildren(new Option("По умолчанию",""), ...Array.from({length:11},(_,i) =>
    new Option((i+18) + " px", String(i+18))));
  function applyView() {
    tone.value = ["light","sepia","dark"].includes(view.tone) ? view.tone : "theme";
    const fontSize = Number(view.size);
    size.value = Number.isInteger(fontSize) && fontSize >= 18 && fontSize <= 28 ? String(fontSize) : "";
    width.value = ["narrow","medium","wide"].includes(view.width) ? view.width : "theme";
    root.dataset.lrReadingTone = tone.value;
    root.dataset.lrReadingWidth = width.value;
    root.style.setProperty("--lr-reading-size",size.value ? size.value + "px" : "");
    root.toggleAttribute("data-lr-reading-size",Boolean(size.value));
  }
  function saveView() {
    view = {tone:tone.value,size:size.value,width:width.value};
    try { localStorage.setItem(viewKey,JSON.stringify(view)); } catch {}
    applyView();
  }
  applyView();
  for (const control of [tone,width,size]) control.onchange = saveView;
  size.onchange = () => {
    saveView();
    if (size.value && window.langradMobileReader?.getPreferences().size !== Number(size.value)) {
      window.langradMobileReader?.setFontSize(Number(size.value));
    }
  };
  document.addEventListener("langrad:reader-font",event => {
    size.value = String(event.detail);
    saveView();
  });

  function trackContext() {
    const {doc, signature, index} = pager.currentContext();
    const key = doc + "|" + signature;
    if (key !== snapshot || lastState !== state) {
      lastState = state;
      snapshot = key;
      initialStudy = new Set(Object.keys(state.words).filter(word => wordRecord(word)?.stage >= 1));
      initialKnowledge = new Set(Object.keys(state.words).filter(word => isKnown(wordRecord(word))));
      summary.hidden = true;
      summaryScope = undefined;
      summary.replaceChildren();
    }
    if (lastPage !== index && summaryScope === "page") {
      summary.hidden = true;
      summaryScope = undefined;
    }
    lastPage = index;
    if (get("read").classList.contains("hidden")) return;
    finish.hidden = pager.pageNumber() < pager.pageCount() || !words(state.text).length;
    get("lr-log-page").hidden = !finish.hidden;
    get("lr-page-summary").hidden = !finish.hidden;
  }

  function wordRecord(word) {
    const record = state.words[word];
    return state.words[record?.aliasOf] || record;
  }

  function progress() {
    const data = state.readingActivity;
    const target = data?.goal || 500;
    const today = new Date();
    const key = dateKey(today);
    const count = data?.days?.[key] || 0;
    get("lr-reading-today").textContent = count + " / " + target + " слов сегодня";
    get("lr-reading-progress").max = target;
    get("lr-reading-progress").value = count;
    goal.value = target;
    let streak = 0;
    const day = new Date(today);
    if (!count) day.setDate(day.getDate() - 1);
    while (data?.days?.[dateKey(day)] > 0) {
      streak++;
      day.setDate(day.getDate() - 1);
    }
    get("lr-reading-streak").textContent = streak ? "Дней подряд: " + streak : "Серия начнётся после первой прочитанной страницы.";
    const week = Array.from({length: 7}, (_, index) => {
      const date = new Date(today);
      date.setDate(date.getDate() + index - 6);
      return [date, data?.days?.[dateKey(date)] || 0];
    });
    const max = Math.max(1, ...week.map(([, count]) => count));
    get("lr-reading-week").replaceChildren(...week.map(([date, count]) => {
      const cell = document.createElement("li");
      const bar = document.createElement("meter");
      bar.max = max;
      bar.value = count;
      bar.setAttribute("aria-label", count + " слов");
      cell.append(date.toLocaleDateString("ru", {weekday: "short"}), bar, String(count));
      return cell;
    }));
  }

  function logPage({doc, signature, index}, text) {
    const count = words(text).length;
    if (!count) return;
    const data = state.readingActivity ||= {goal: 500, days: {}, pages: {}};
    const day = dateKey(new Date());
    if (data.loggedDate !== day) {
      data.pages = {};
      data.loggedDate = day;
    }
    const key = [doc, signature, index].join("|");
    if (Object.hasOwn(data.pages, key)) return;
    data.pages[key] = true;
    data.days[day] = (data.days[day] || 0) + count;
    persist();
  }

  function finishReading(scope) {
    summaryScope = scope;
    logPage(pager.currentContext(), pager.originalPage());
    const active = state.library?.find(item => item.id === state.activeTextId);
    if (scope === "chapter" && active?.discoverId) {
      state.discoverRead ||= {};
      state.discoverRead[active.discoverId] = true;
      persist();
    }
    const mode = pager.getMode();
    const text = scope === "page" ? pager.displayPageText() : pager.chapterReadingText(mode);
    const documentWords = words(text).map(normal);
    const distinct = [...new Set(documentWords)];
    const knownWords = distinct.filter(word => initialKnowledge.has(word));
    const knownCount = documentWords.filter(word => initialKnowledge.has(word)).length;
    const percentage = Math.round(knownCount * 100 / Math.max(1, documentWords.length));
    const review = new Set();
    for (const word of distinct) {
      if (initialKnowledge.has(word)) continue;
      const key = typeof state.words[word]?.aliasOf === "string" ? state.words[word].aliasOf : word;
      const entry = state.words[key];
      if (entry?.stage >= 1 && (entry.translation || lex[key]?.[1])) review.add(key);
    }
    const added = [...review].filter(word => !initialStudy.has(word)).length;
    const title = document.createElement("h2");
    title.textContent = scope === "page" ? "Итог страницы" :
      /^(?:public|private)-chapter-/.test(state.activeTextId || "") ? "Итог главы" : "Итог чтения";
    const numbers = document.createElement("p");
    numbers.textContent = "Новых слов в изучении: " + added + " · Уже знакомых словоформ: " + knownWords.length +
      " · ≈ " + percentage + "% слов текста отмечены знакомыми";
    const note = document.createElement("p");
    note.className = "tiny";
    note.textContent = "Доля знакомых слов помогает оценить сложность. Понимание смысла текста Langrad не измеряет.";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn primary";
    button.textContent = "Повторить эти слова";
    button.disabled = !review.size;
    if (!review.size) {
      note.textContent += " Чтобы повторить слова, выбери «Учить» в карточке слова.";
    }
    button.onclick = () => {
      showTab("practice");
      reviewing = true;
      queue = shuffle([...review]);
      index = 0;
      get("quizCount").textContent = queue.length + " слов из текста";
      get("startQuiz").classList.add("hidden");
      question();
    };
    summary.replaceChildren(title, numbers, note, button);
    if (scope === "chapter") summary.dispatchEvent(new CustomEvent("langrad:reading-finished", {
      detail: {id: state.activeTextId}
    }));
    summary.hidden = false;
    summary.focus();
  }

  get("lr-log-page").onclick = () => {
    logPage(pager.currentContext(), pager.originalPage());
    get("lr-log-page").textContent = "Страница учтена";
  };
  finish.onclick = () => finishReading("chapter");
  get("lr-page-summary").onclick = () => finishReading("page");

  const oldRender = renderReader;
  renderReader = function () {
    const result = oldRender.apply(this, arguments);
    trackContext();
    const ctx = pager.currentContext();
    const data = state.readingActivity;
    const counted = data?.loggedDate === dateKey(new Date()) && data.pages?.[[ctx.doc, ctx.signature, ctx.index].join("|")];
    get("lr-log-page").textContent = counted ? "Страница учтена" : "Отметить страницу прочитанной";
    return result;
  };

  const oldStats = stats;
  stats = function () {
    oldStats();
    progress();
  };
  get("reader").addEventListener("langrad:page-read", event => logPage(event.detail, event.detail.original));

  const oldQuizHome = quizHome;
  quizHome = function () {
    reviewing = false;
    oldQuizHome();
  };
  get("startQuiz").addEventListener("click", () => { reviewing = false; }, {capture: true});
  const oldQuestion = question;
  question = function () {
    oldQuestion();
    if (!reviewing || index < queue.length) return;
    reviewing = false;
    const back = document.createElement("button");
    back.type = "button";
    back.className = "btn";
    back.textContent = "Вернуться к тексту";
    back.onclick = () => showTab("read");
    get("quiz").append(back);
  };
  get("lr-reading-goal-form").onsubmit = event => {
    event.preventDefault();
    const data = state.readingActivity ||= {goal: 500, days: {}, pages: {}};
    if (!goal.checkValidity() || !Number.isInteger(goal.valueAsNumber)) return;
    data.goal = goal.valueAsNumber;
    persist();
    progress();
  };
  trackContext();
})();
