(() => {
  "use strict";

  const section = document.getElementById("discover");
  const topic = document.getElementById("discover-topic");
  const level = document.getElementById("discover-level");
  const length = document.getElementById("discover-length");
  const status = document.getElementById("discover-status");
  const retry = document.getElementById("discover-retry");
  const more = document.getElementById("discover-more");
  const list = document.getElementById("discover-list");
  const pageSize = 12;
  const published = "https://raw.githubusercontent.com/ElzoMone/Langrad/main/public/discover.json";
  const bundled = "/discover.json";
  let articles = [];
  let loading = false;
  let visibleCount = pageSize;

  function link(url, label) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = label;
    return anchor;
  }

  function savedArticle(article) {
    return state.library.find(item => item.discoverId === article.id || item.sourceURL === article.sourceURL);
  }

  function read(article) {
    let item = savedArticle(article);
    if (!item) {
      item = {
        id: article.id, discoverId: article.id, title: article.title,
        text: article.text, sourceTitle: article.title + " — Википедия",
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
    const title = document.createElement("h2");
    title.textContent = article.title;
    title.lang = "de";
    const meta = document.createElement("p");
    meta.className = "tiny";
    meta.textContent = [article.topic, "≈ " + article.level, article.words + " слов"].join(" · ");
    const preview = document.createElement("p");
    preview.lang = "de";
    const plain = article.text.replace(/\s+/g, " ");
    preview.textContent = plain.length > 230 ? plain.slice(0, 230).replace(/\s+\S*$/, "") + "…" : plain;
    const source = document.createElement("p");
    source.className = "tiny";
    source.append(link(article.sourceURL, "Википедия"), " · Вводный фрагмент · ",
      link("https://creativecommons.org/licenses/by-sa/4.0/", "CC BY-SA 4.0"));
    const open = document.createElement("button");
    open.type = "button";
    open.className = "btn primary sm";
    open.textContent = savedArticle(article) ? "Читать" : "Сохранить и читать";
    open.onclick = () => read(article);
    card.append(title, meta, preview, source, open);
    return card;
  }

  function render() {
    const matches = articles.filter(article =>
      (!topic.value || article.topic === topic.value) &&
      (!level.value || article.level === level.value) &&
      (!length.value || (length.value === "short" ? article.words <= 150 : article.words > 150))
    );
    list.replaceChildren(...matches.slice(0, visibleCount).map(makeCard));
    more.hidden = matches.length <= visibleCount;
    status.textContent = matches.length ? "Найдено: " + matches.length : "По этим фильтрам ничего не найдено.";
  }

  async function getFeed(url) {
    const response = await fetch(url, {signal: AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error("Catalog HTTP " + response.status);
    const feed = await response.json();
    const valid = feed.articles.filter(item =>
      item && /^dewiki-\d+$/.test(item.id) &&
      /^https:\/\/de\.wikipedia\.org\/w\/index\.php\?oldid=\d+$/.test(item.sourceURL) &&
      typeof item.title === "string" && typeof item.text === "string" &&
      typeof item.topic === "string" && ["B1", "B2", "C1"].includes(item.level) &&
      Number.isInteger(item.words)
    );
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
        articles = await getFeed(published).catch(() => getFeed(bundled));
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
      visibleCount = pageSize;
      render();
    });
  }
  retry.onclick = load;
  more.onclick = () => {
    const firstNew = visibleCount;
    visibleCount += pageSize;
    render();
    list.children[firstNew]?.querySelector("button").focus();
  };
  new MutationObserver(() => {
    if (!section.classList.contains("hidden")) load();
  }).observe(section, {attributes: true, attributeFilter: ["class"]});
})();
