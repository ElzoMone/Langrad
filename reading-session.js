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

  function trackContext() {
    const {doc, signature} = pager.currentContext();
    const key = doc + "|" + signature;
    if (key !== snapshot || lastState !== state) {
      lastState = state;
      snapshot = key;
      initialStudy = new Set(Object.keys(state.words).filter(word => wordRecord(word)?.stage >= 1));
      initialKnowledge = new Set(Object.keys(state.words).filter(word => isKnown(wordRecord(word))));
      summary.hidden = true;
      summary.replaceChildren();
    }
    if (get("read").classList.contains("hidden")) return;
    finish.hidden = pager.pageNumber() < pager.pageCount() || !words(state.text).length;
    get("lr-log-page").hidden = !finish.hidden;
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

  function finishReading() {
    logPage(pager.currentContext(), pager.originalPage());
    const active = state.library?.find(item => item.id === state.activeTextId);
    if (active?.discoverId) {
      state.discoverRead ||= {};
      state.discoverRead[active.discoverId] = true;
      persist();
    }
    const documentWords = words(state.text).map(normal);
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
    title.textContent = "Итог чтения";
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
    summary.dispatchEvent(new CustomEvent("langrad:reading-finished", {
      detail: {id: state.activeTextId}
    }));
    summary.hidden = false;
    summary.focus();
  }

  get("lr-log-page").onclick = () => {
    logPage(pager.currentContext(), pager.originalPage());
    get("lr-log-page").textContent = "Страница учтена";
  };
  finish.onclick = finishReading;

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
