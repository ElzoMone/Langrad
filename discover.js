(() => {
  "use strict";

  const section = document.getElementById("discover");
  const topic = document.getElementById("discover-topic");
  const level = document.getElementById("discover-level");
  const length = document.getElementById("discover-length");
  const status = document.getElementById("discover-status");
  const retry = document.getElementById("discover-retry");
  const groups = {
    adapted: "Адаптированные тексты",
    classic: "Классическая проза",
    literature: "Малоизвестная проза",
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

  function link(url, label) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = label;
    return anchor;
  }

  function savedArticle(article) {
    return state.library.find(item => item.discoverId === article.id || (!item.discoverId && article.category !== "adapted" && item.sourceURL === article.sourceURL));
  }

  function read(article) {
    let item = savedArticle(article);
    if (!item) {
      item = {
        id: article.id, discoverId: article.id, title: article.title,
        text: article.text, sourceTitle: [article.author, article.source].filter(Boolean).join(" · "),
        license: article.license, licenseURL: article.licenseURL, sourceNote: article.note,
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

  function makeCard(article) {
    const card = document.createElement("article");
    card.className = "lr-discover-card";
    card.dataset.article = article.id;
    const cover = document.createElement("div");
    cover.className = "lr-discover-cover";
    const body = document.createElement("div");
    body.className = "lr-discover-body";
    card.append(cover, body);
    const title = document.createElement("h3");
    title.textContent = article.title;
    title.lang = "de";
    const meta = document.createElement("p");
    meta.className = "lr-discover-meta";
    meta.textContent = [article.level && "≈ " + article.level, article.words && article.words + " слов"]
      .filter(Boolean).join(" · ") || article.topic;
    body.append(meta, title);
    if (article.author) {
      const author = document.createElement("p");
      author.className = "lr-discover-author";
      author.textContent = article.author;
      body.append(author);
    }
    const preview = document.createElement("p");
    preview.lang = "de";
    preview.className = "lr-discover-excerpt";
    const plain = (article.text || "").replace(/\s+/g, " ");
    preview.textContent = plain.length > 230 ? plain.slice(0, 230).replace(/\s+\S*$/, "") + "…" : plain;
    const source = document.createElement("p");
    source.className = "lr-discover-source tiny";
    source.append(link(article.sourceURL, article.source));
    if (article.note) source.append(" · ", article.note);
    if (article.license) {
      source.append(" · ", article.licenseURL ? link(article.licenseURL, article.license) : article.license);
    }
    if (!article.text) {
      const original = link(article.sourceURL, "Открыть оригинал");
      original.className = "btn ghost lr-discover-action";
      body.append(source, original);
      return card;
    }
    const open = document.createElement("button");
    open.type = "button";
    open.className = "btn primary lr-discover-action";
    open.textContent = savedArticle(article) ? "Читать" : "Сохранить и читать";
    open.onclick = () => read(article);
    body.append(preview, source, open);
    return card;
  }

  function render() {
    const matches = articles.filter(article =>
      (!topic.value || article.topic === topic.value) &&
      (!level.value || article.level === level.value) &&
      (!length.value || (article.words > 0 && (length.value === "short" ? article.words <= 150 : article.words > 150)))
    );
    list.replaceChildren();
    for (const [category, label] of Object.entries(groups)) {
      const entries = matches.filter(article => article.category === category);
      if (!entries.length) continue;
      const block = document.createElement("section");
      block.className = "lr-discover-group";
      const heading = document.createElement("h2");
      heading.textContent = label;
      heading.id = "discover-group-" + category;
      block.setAttribute("aria-labelledby", heading.id);
      block.dataset.category = category;
      const isExpanded = expanded.has(category);
      const row = document.createElement("div");
      row.className = "lr-discover-shelf-heading";
      row.append(heading);
      const grid = document.createElement("div");
      grid.className = "lr-discover-grid";
      grid.id = "discover-shelf-" + category;
      block.classList.toggle("is-expanded", isExpanded);
      grid.append(...entries.slice(0, isExpanded ? entries.length : previewSize).map(makeCard));
      if (entries.length > 2) {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "lr-discover-toggle";
        if (entries.length === previewSize) toggle.classList.add("lr-discover-toggle-mobile");
        toggle.textContent = isExpanded ? "Свернуть" : "Все →";
        toggle.setAttribute("aria-label", (isExpanded ? "Свернуть — " : "Все тексты — ") + label);
        toggle.setAttribute("aria-controls", grid.id);
        toggle.setAttribute("aria-expanded", String(isExpanded));
        toggle.onclick = () => {
          if (isExpanded) expanded.delete(category);
          else expanded.add(category);
          render();
          document.getElementById(heading.id).nextElementSibling?.focus();
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
      if (!Object.hasOwn(groups, item.category) ||
          !/^https:\/\/(?:de\.wikisource\.org|netzpolitik\.org)\//.test(item.sourceURL) ||
          typeof item.source !== "string" || typeof item.text !== "string" ||
          (item.text && typeof item.license !== "string") ||
          (item.licenseURL && !/^https:\/\/creativecommons\.org\//.test(item.licenseURL))) return [];
      return [item];
    });
    if (!valid.length) throw new Error("Empty catalog");
    return valid;
  }

  async function load() {
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
        articles = await getFeed(published).then(feed => {
          if (!feed.some(article => article.category !== "encyclopedia")) throw new Error("Legacy catalog");
          return feed;
        }).catch(() => getFeed(bundled));
      } else {
        articles = await getFeed(bundled).catch(() => getFeed("/public/discover.json"));
      }
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

  for (const select of [topic, level, length]) {
    select.addEventListener("change", () => {
      if (!articles.length) return;
      expanded.clear();
      render();
    });
  }
  retry.onclick = load;
  new MutationObserver(() => {
    if (!section.classList.contains("hidden")) load();
  }).observe(section, {attributes: true, attributeFilter: ["class"]});
})();
