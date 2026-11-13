(() => {
  "use strict";

  const section = document.getElementById("discover");
  const topic = document.getElementById("discover-topic");
  const levels = document.getElementById("discover-level");
  const search = document.getElementById("discover-search");
  const sort = document.getElementById("discover-sort");
  const hideRead = document.getElementById("discover-hide-read");
  const recommendation = document.getElementById("discover-recommendation");
  const resume = document.getElementById("discover-continue");
  const cefr = ["A1", "A2", "B1", "B2", "C1"];
  const segmenter = new Intl.Segmenter("de", {granularity: "sentence"});
  let selectedLevel = "";
  hideRead.checked = Boolean(state.discoverHideRead);
  const length = document.getElementById("discover-length");
  const status = document.getElementById("discover-status");
  const retry = document.getElementById("discover-retry");
  const groups = {
    series: "Серии",
    adapted: "Адаптированные тексты",
    classic: "Классика",
    journalism: "Современные статьи",
    encyclopedia: "Энциклопедия"
  };
  const list = document.getElementById("discover-list");
  const previewSize = 3;
  const published = "https://raw.githubusercontent.com/ElzoMone/Langrad/main/public/discover.json";
  const bundled = "/discover.json";
  let articles = [];
  let loading = false;
  const expanded = new Set();
  const selectedVariants = new Map();
  let works = [];

  function link(url, label) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = label;
    return anchor;
  }

  function savedArticle(article) {
    return state.library.find(item => item.discoverId === article.id || (!item.discoverId && !article.series && article.category !== "adapted" && item.sourceURL === article.sourceURL));
  }

  function read(article) {
    let item = savedArticle(article);
    if (!item) {
      item = {
        id: article.id, discoverId: article.id, title: article.title,
        text: article.text, sourceTitle: [article.author, article.source].filter(Boolean).join(" · "),
        series: article.series, chapter: article.chapter, license: article.license, licenseURL: article.licenseURL, sourceNote: article.note,
        sourceURL: article.sourceURL, addedAt: Date.now()
      };
      state.library.push(item);
    }
    state.activeTextId = item.id;
    state.title = item.title;
    state.text = item.text;
    document.getElementById("cancelEdit").click();
    persist();
    showTab("read");
  }

  function marked(article) {
    return state.discoverRead?.[article.id] === true;
  }

  function groupWorks(entries) {
    const originals = new Map(entries.filter(item => item.category !== "adapted" && !item.series && item.text)
      .map(item => [item.sourceURL, item]));
    const paired = new Set();
    const adaptations = new Map();
    for (const article of entries.filter(item => item.category === "adapted")) {
      const original = originals.get(article.sourceURL);
      if (!original) continue;
      if (!adaptations.has(original.id)) adaptations.set(original.id, [original]);
      adaptations.get(original.id).push(article);
      paired.add(article.id);
    }
    return entries.filter(article => !paired.has(article.id)).map(article => ({
      id: article.id,
      category: adaptations.has(article.id) ? "adapted" : article.category === "literature" ? "classic" : article.category,
      variants: adaptations.get(article.id) || [article]
    }));
  }

  function makeCard(work, featured = false) {
    const article = work.article;
    const card = document.createElement("article");
    card.className = "lr-discover-card";
    card.dataset.level = article.level || "";
    card.classList.toggle("lr-discover-featured", featured);
    card.dataset.work = work.id;
    card.dataset.article = article.id;
    const body = document.createElement("div");
    body.className = "lr-discover-body";
    card.append(body);
    if (featured) {
      const label = document.createElement("p");
      label.className = "lr-discover-kicker";
      label.textContent = "Текст дня";
      body.append(label);
    }
    const meta = document.createElement("div");
    meta.className = "lr-discover-meta";
    if (cefr.includes(article.level)) {
      const badge = document.createElement("strong");
      badge.className = "lr-discover-badge";
      badge.dataset.level = article.level;
      badge.title = "Примерный уровень";
      badge.textContent = article.level;
      meta.append(badge);
    } else {
      meta.append("Уровень не оценён");
    }
    if (article.words) {
      const duration = document.createElement("span");
      duration.textContent = article.words + " слов · ≈ " + Math.max(1, Math.round(article.words / 120)) + " мин";
      duration.title = "Оценка при скорости 120 слов в минуту";
      meta.append(duration);
    }
    const title = document.createElement(featured ? "h2" : "h3");
    title.lang = "de";
    title.textContent = article.title;
    body.append(meta, title);
    if (article.author) {
      const author = document.createElement("p");
      author.className = "lr-discover-author";
      author.textContent = article.author;
      body.append(author);
    }
    const tags = document.createElement("div");
    tags.className = "lr-discover-tags";
    for (const label of [article.series ? "Часть " + article.chapter + " из 3" : article.topic, article.source, article.category === "adapted" && "Адаптация",
      savedArticle(article) && "Сохранено", marked(article) && "Прочитано"].filter(Boolean)) {
      const tag = document.createElement("span");
      tag.textContent = label;
      tags.append(tag);
    }
    body.append(tags);
    if (work.variants.length > 1) {
      const variants = document.createElement("div");
      variants.className = "lr-discover-variants";
      variants.setAttribute("role", "group");
      variants.setAttribute("aria-label", "Версии текста");
      for (const variant of work.variants) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.variant = variant.id;
        button.textContent = (variant.category === "adapted" ? "Адаптация" : "Оригинал") + " " + variant.level;
        button.setAttribute("aria-pressed", String(variant.id === article.id));
        button.disabled = !work.eligible.includes(variant);
        if (button.disabled) button.title = "Версия скрыта текущими фильтрами";
        button.onclick = () => {
          selectedVariants.set(work.id, variant.id);
          const replacement = makeCard({...work, article: variant}, featured);
          card.replaceWith(replacement);
          replacement.querySelector('[data-variant="' + variant.id + '"]').focus();
        };
        variants.append(button);
      }
      body.append(variants);
    }
    if (article.summary || article.text) {
      const preview = document.createElement("p");
      preview.lang = article.summary ? "ru" : "de";
      preview.className = "lr-discover-excerpt";
      const iterator = segmenter.segment(article.text.trim())[Symbol.iterator]();
      const first = iterator.next().value?.segment || "";
      const second = first.length < 100 ? iterator.next().value?.segment || "" : "";
      preview.textContent = (article.summary || first + second).replace(/\s+/g, " ").trim();
      if (preview.textContent.length > 215) preview.textContent = preview.textContent.slice(0, 215).replace(/\s+\S*$/, "") + "…";
      body.append(preview);
    }
    const actions = document.createElement("div");
    actions.className = "lr-discover-actions";
    const open = article.text ? document.createElement("button") : link(article.sourceURL, "Открыть оригинал ↗");
    open.className = "btn primary lr-discover-action";
    if (article.text) {
      open.type = "button";
      open.textContent = "Читать";
      open.onclick = () => read(article);
    }
    const mark = document.createElement("button");
    mark.type = "button";
    mark.className = "lr-discover-mark";
    mark.textContent = "✓";
    mark.setAttribute("aria-label", "Прочитано — " + article.title);
    mark.setAttribute("aria-pressed", String(marked(article)));
    mark.title = marked(article) ? "Снять отметку" : "Отметить прочитанным";
    mark.onclick = () => {
      state.discoverRead ||= {};
      if (marked(article)) delete state.discoverRead[article.id];
      else state.discoverRead[article.id] = true;
      persist();
      const region = card.closest("#discover-recommendation") || list;
      render();
      (region.querySelector('[data-article="' + article.id + '"] .lr-discover-mark') ||
        list.querySelector(".lr-discover-mark") || search).focus();
    };
    actions.append(open);
    body.append(mark);
    body.append(actions);
    return card;
  }

  let resumeVersion = 0;
  async function renderResume() {
    const version = ++resumeVersion;
    resume.replaceChildren();
    const page = window.langradPager?.pageNumber();
    const total = window.langradPager?.pageCount();
    const active = String(state.activeTextId || "");
    const publicBook = () => window.langradPublicBookResume?.();
    const privateBook = () => window.langradPrivateBookResume?.();
    const book = active.startsWith("private-chapter-") || (!active.startsWith("public-chapter-") && state.lastReadingBookKind !== "public")
      ? await privateBook() || await publicBook()
      : await publicBook() || await privateBook();
    if (version !== resumeVersion) return;
    if (book || (total > 1 && state.title)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lr-discover-resume";
      button.textContent = "Продолжить чтение · " + (book ? book.title + " · " + book.detail : state.title + " · " + page + " из " + total);
      button.onclick = book?.open || (() => showTab("read"));
      const bar = document.createElement("progress");
      bar.max = book?.totalPages ?? total;
      bar.value = book?.position ?? page;
      bar.setAttribute("aria-label", "Позиция в тексте");
      const message = document.createElement("span");
      message.id = "discover-continue-status";
      message.setAttribute("role","status");
      resume.append(button, bar, message);
    }
  }

  function render() {
    const terms = normal(search.value.trim()).split(/\s+/).filter(Boolean);
    const eligible = article => (!topic.value || article.topic === topic.value) &&
      (!selectedLevel || article.level === selectedLevel) &&
      (!hideRead.checked || !marked(article)) &&
      (!length.value || (article.words > 0 && (length.value === "short" ? article.words <= 150 : article.words > 150))) &&
      terms.every(term => normal([article.title, article.author, article.topic, article.summary, article.text].join(" ")).includes(term));
    const matches = works.flatMap(work => {
      const variants = work.variants.filter(eligible);
      if (!variants.length) return [];
      const article = variants.find(item => item.id === selectedVariants.get(work.id)) ||
        variants.find(item => item.category === "adapted") || variants[0];
      return [{...work, article, eligible: variants}];
    });
    const rank = level => cefr.includes(level) ? cefr.indexOf(level) : cefr.length;
    matches.sort((a, b) => {
      if (sort.value === "level") return rank(a.article.level) - rank(b.article.level);
      if (sort.value === "length") return (a.article.words || Infinity) - (b.article.words || Infinity);
      return (b.article.added || "").localeCompare(a.article.added || "");
    });
    recommendation.replaceChildren();
    if (!terms.length && !selectedLevel && !topic.value && !length.value) {
      const target = rank(state.aid || "B1");
      const distance = article => Math.abs(rank(article.level) - target);
      const suitable = matches.flatMap(work => {
        const options = work.eligible.filter(article => article.text && article.summary && !marked(article));
        options.sort((a, b) => distance(a) - distance(b));
        const article = options.find(item => item.id === selectedVariants.get(work.id)) || options[0];
        return article ? [{...work, article}] : [];
      }).sort((a, b) => distance(a.article) - distance(b.article) ||
        (b.article.added || "").localeCompare(a.article.added || "") || a.id.localeCompare(b.id));
      if (suitable.length) {
        const bestDistance = distance(suitable[0].article);
        const pool = suitable.filter(work => distance(work.article) === bestDistance);
        const now = new Date();
        const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
        const featured = pool[day % pool.length];
        recommendation.append(makeCard(featured, true));
        const recommended = [];
        const usedTopics = new Set([featured.article.topic]);
        const rest = suitable.filter(work => work !== featured);
        for (const work of rest) {
          if (usedTopics.has(work.article.topic)) continue;
          recommended.push(work);
          usedTopics.add(work.article.topic);
          if (recommended.length === 3) break;
        }
        for (const work of rest) {
          if (recommended.length === 3) break;
          if (!recommended.includes(work)) recommended.push(work);
        }
        if (recommended.length) {
          const heading = document.createElement("h2");
          heading.textContent = "Для твоего уровня";
          const grid = document.createElement("div");
          grid.className = "lr-discover-grid";
          grid.append(...recommended.map(work => makeCard(work)));
          recommendation.append(heading, grid);
        }
      }
    }
    list.replaceChildren();
    const seriesNames = [...new Map(matches.filter(work => work.article.series)
      .map(work => [work.article.series, work.article.seriesTitle]))];
    const shelves = Object.entries(groups).flatMap(([category, label]) =>
      category === "series" ? seriesNames.map(([id, title]) => [category, title, id]) : [[category, label]]);
    for (const [category, label, series] of shelves) {
      const shelf = series || category;
      const entries = matches.filter(work => work.category === category &&
        (category !== "series" || work.article.series === series));
      if (series) entries.sort((a, b) => a.article.chapter - b.article.chapter);

      if (!entries.length) continue;
      const block = document.createElement("section");
      block.className = "lr-discover-group";
      const heading = document.createElement("h2");
      heading.textContent = label;
      heading.id = "discover-group-" + shelf;
      block.setAttribute("aria-labelledby", heading.id);
      block.dataset.category = category;
      const isExpanded = Boolean(series) || expanded.has(shelf);
      const row = document.createElement("div");
      row.className = "lr-discover-shelf-heading";
      row.append(heading);
      const grid = document.createElement("div");
      grid.className = "lr-discover-grid";
      grid.id = "discover-shelf-" + shelf;
      block.classList.toggle("is-expanded", isExpanded);
      grid.append(...entries.slice(0, isExpanded ? entries.length : previewSize).map(work => makeCard(work)));
      if (!series && entries.length > 2) {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "lr-discover-toggle";
        if (entries.length === previewSize) toggle.classList.add("lr-discover-toggle-mobile");
        toggle.textContent = isExpanded ? "Свернуть" : "Все →";
        toggle.setAttribute("aria-label", (isExpanded ? "Свернуть — " : "Все тексты — ") + label);
        toggle.setAttribute("aria-controls", grid.id);
        toggle.setAttribute("aria-expanded", String(isExpanded));
        toggle.onclick = () => {
          if (isExpanded) expanded.delete(shelf);
          else expanded.add(shelf);
          render();
          document.getElementById(heading.id).parentElement.querySelector("button")?.focus();
        };
        row.append(toggle);
      }
      block.append(row, grid);
      list.append(block);
    }
    status.textContent = matches.length ? "Найдено: " + matches.length : "По этим фильтрам ничего не найдено.";
  }

  async function getFeed(url) {
    const response = await fetch(url, {signal: AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error("Catalog HTTP " + response.status);
    const feed = await response.json();
    const valid = feed.articles.flatMap(item => {
      if (!item || typeof item.title !== "string" || typeof item.topic !== "string" ||
          !Number.isInteger(item.words) || !/^[a-z0-9-]+$/.test(item.id)) return [];
      if (/^dewiki-\d+$/.test(item.id) &&
          /^https:\/\/de\.wikipedia\.org\/w\/index\.php\?oldid=\d+$/.test(item.sourceURL) &&
          typeof item.text === "string") {
        return [{...item, category: "encyclopedia", source: "Википедия",
          note: "Вводный фрагмент", license: "CC BY-SA 4.0",
          licenseURL: "https://creativecommons.org/licenses/by-sa/4.0/"}];
      }
      if (!(Object.hasOwn(groups, item.category) || item.category === "literature") ||
          !/^https:\/\/(?:de\.wikisource\.org|netzpolitik\.org)\//.test(item.sourceURL) ||
          typeof item.source !== "string" || typeof item.text !== "string" ||
          (item.text && typeof item.license !== "string") ||
          (item.licenseURL && !/^https:\/\/creativecommons\.org\//.test(item.licenseURL))) return [];
      return [item];
    });
    if (!valid.length) throw new Error("Empty catalog");
    return valid;
  }

  let chapterRequest;
  function loadChapters() {
    return chapterRequest ||= getFeed("/discover-series.json")
      .catch(() => getFeed("/public/discover-series.json"))
      .catch(() => {
        chapterRequest = undefined;
        return [];
      });
  }

  document.getElementById("lr-reading-summary").addEventListener("langrad:reading-finished", async event => {
    const {id} = event.detail;
    if (!state.library?.find(item => item.id === id)?.series) return;
    const summary = event.currentTarget;
    const chapters = await loadChapters();
    if (state.activeTextId !== id || summary.querySelector("[data-next-chapter]")) return;
    const article = chapters.find(item => item.id === id);
    const next = chapters.find(item => article?.series && item.series === article.series && item.chapter === article.chapter + 1);
    if (!next) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn";
    button.textContent = "Следующая часть";
    button.dataset.nextChapter = next.id;
    button.onclick = () => read(next);
    summary.append(button);
  });

  async function load() {
    renderResume();
    if (loading) return;
    if (articles.length) {
      render();
      return;
    }
    loading = true;
    status.textContent = "Загружаю ленту…";
    retry.hidden = true;
    try {
      if (location.hostname === "langrad.vercel.app") {
        const [live, local] = await Promise.allSettled([getFeed(published), getFeed(bundled)]);
        const featured = (local.value || []).filter(article => article.summary);
        articles = [...new Map([...(live.value || local.value || []), ...featured]
          .map(article => [article.id, article])).values()];
        if (!articles.length) throw new Error("Empty catalog");
      } else {
        articles = await getFeed(bundled).catch(() => getFeed("/public/discover.json"));
      }
      const chapters = await loadChapters();
      articles = [...chapters, ...articles];
      works = groupWorks(articles);
      const topics = [...new Set(articles.map(article => article.topic))].sort((a, b) => a.localeCompare(b, "ru"));
      for (const name of topics) topic.add(new Option(name, name));
      render();
    } catch {
      status.textContent = "Лента временно недоступна.";
      retry.hidden = false;
    } finally {
      loading = false;
    }
  }

  function refreshFilters() {
    if (!articles.length) return;
    expanded.clear();
    render();
  }

  for (const select of [topic, length, sort]) select.addEventListener("change", refreshFilters);
  search.addEventListener("input", refreshFilters);
  levels.addEventListener("click", event => {
    const button = event.target.closest("button[data-level]");
    if (!button) return;
    selectedLevel = button.dataset.level;
    for (const chip of levels.querySelectorAll("button")) {
      chip.setAttribute("aria-pressed", String(chip === button));
    }
    refreshFilters();
  });
  hideRead.addEventListener("change", () => {
    state.discoverHideRead = hideRead.checked;
    persist();
    refreshFilters();
  });
  retry.onclick = load;
  new MutationObserver(() => {
    if (!section.classList.contains("hidden")) load();
  }).observe(section, {attributes: true, attributeFilter: ["class"]});
})();
