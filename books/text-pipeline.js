/* Shared text ingestion. The caller supplies the frequency list and source metadata. */
(function () {
  "use strict";

  const node = typeof module === "object" && module.exports;
  const pager = node ? require("../reader-pagination.js") : null;
  const pattern = node ? pager.wordPattern : window.langradPager.wordPattern;
  const fold = value => value.normalize("NFC").toLowerCase();
  const namedHeading = /^(?:(?:kapitel|buch|teil|abschnitt|gesang)\s+(?:\d+|[IVXLCDM]+)(?=$|[\s.:—–-])|(?:erste[rs]?|zweite[rs]?|dritte[rs]?|vierte[rs]?|fünfte[rs]?|sechste[rs]?|siebte[rs]?|achte[rs]?|neunte[rs]?|zehnte[rs]?|elfte[rs]?|zwölfte[rs]?|\d+\.)\s+(?:kapitel|buch|teil|abschnitt|gesang)\b|(?:prolog|epilog|vorwort|nachwort)(?=$|[\s.:—–-]))/iu;
  const isHeading = line => namedHeading.test(line) || /^(?=[IVXLCDM])M{0,4}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})\.?$/.test(line);
  const tocLine = /(?:\.{2,}|…|\s{2,})\s*\d{1,4}\s*$/u;
  const stopwords = {
    de: "der die das den dem des ein eine einer einen einem und ist sind war ich du nicht auch sich auf mit für von aus zum zur dass daß wie noch aber oder",
    en: "the a an and is are was were you they not with for from that this to of in be has have but as would could she he his her",
    fr: "le la les un une des du et est sont ne pas avec pour que qui dans aux ces nous vous elle mais il sur ce en",
    nl: "de het een en zijn heeft van voor met dat dit niet ook zich maar aan bij naar over zij wij hij hebben uit was",
    es: "el la los las una unos unas que con para por del está son pero como también sus este esta no se han más",
    it: "il lo gli una uno che con per non sono della delle dello nel nella questi anche come più hanno questo questa",
  };
  const languageWords = Object.entries(stopwords).map(([lang, list]) => [lang, new Set(list.split(" "))]);

  function decode(input) {
    if (typeof input === "string") return input;
    if (!(input instanceof ArrayBuffer) && !ArrayBuffer.isView(input)) throw new TypeError("Expected text or bytes");
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) :
      new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    if (bytes[0] === 255 && bytes[1] === 254) return new TextDecoder("utf-16le").decode(bytes);
    if (bytes[0] === 254 && bytes[1] === 255) return new TextDecoder("utf-16be").decode(bytes);
    try {
      return new TextDecoder("utf-8", {fatal: true}).decode(bytes);
    } catch (error) {
      // A UTF-8 BOM explicitly identifies the encoding, so report corruption.
      if (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) throw error;
      return new TextDecoder("windows-1252").decode(bytes);
    }
  }

  function clean(input) {
    let text = decode(input).replace(/^\uFEFF/, "").normalize("NFC")
      .replace(/\r\n?|\u2028|\u2029/g, "\n").replace(/[\u00a0\t]/g, " ")
      .replace(/[\u00ad\u200b\u2060]/g, "");
    if (/[\u0000-\u0008\u000e-\u001f]/.test(text)) throw new Error("Invalid control characters in text");
    const start = /^\s*\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*{3}[ \t]*$/imu;
    const end = /^\s*(?:\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*{3}|End of (?:the )?Project Gutenberg(?:['’]s)?\s+EBook\b[^\n]*)[ \t]*$/imu;
    const startMarker = start.exec(text);
    if (startMarker) text = text.slice(startMarker.index + startMarker[0].length);
    const endMarker = end.exec(text);
    if (endMarker) text = text.slice(0, endMarker.index);
    // Remove repeated short headers only at explicit page breaks.
    const pages = text.split("\f").map(page => page.trim().split("\n"));
    const edgeCounts = new Map();
    for (const page of pages) {
      const edges = new Set([page[0]?.trim(), page.at(-1)?.trim()]);
      for (const edge of edges) {
        if (edge && edge.length <= 70 && !isHeading(edge)) edgeCounts.set(edge, (edgeCounts.get(edge) || 0) + 1);
      }
    }
    text = pages.map(page => page.filter((line, index) =>
      !((index === 0 || index === page.length - 1) && edgeCounts.get(line.trim()) >= 3)
    ).join("\n")).join("\n\n");
    const lines = text.split("\n");
    const cleaned = [];
    let lastContentsEntry = -1;
    for (const [index, raw] of lines.entries()) {
      const line = raw.trim();
      if (index <= lastContentsEntry) continue;
      if (/^(?:inhaltsverzeichnis|inhalt|table of contents)\s*:?$/iu.test(line)) {
        let entries = 0;
        let last = index;
        let previousEntry = -1;
        for (let offset = index + 1; offset < lines.length; offset++) {
          const entry = lines[offset].trim();
          if (!entry) continue;
          if (!tocLine.test(entry) && !isHeading(entry)) break;
          entries++;
          if (previousEntry >= 0) last = previousEntry;
          previousEntry = offset;
        }
        if (previousEntry >= 0 && tocLine.test(lines[previousEntry].trim())) last = previousEntry;
        if (entries >= 2 && last > index) {
          lastContentsEntry = last;
          continue;
        }
      }
      if (/^(?:(?:seite|page)\s+)?[-–—]?\s*\d{1,4}\s*[-–—]?$/iu.test(line) ||
          /^\[(?:seite\s+)?\d{1,4}\]$/iu.test(line) ||
          /^(?:\[(?:fußnote|fussnote|footnote)\s+[^\]]*\]|(?:fußnote|fussnote|footnote)\s+\d+\s*[:.)].*|\[\d+\]\s+.+)$/iu.test(line) ||
          /^(?:[|¦�]\s*){2,}$/u.test(line)) continue;
      cleaned.push(line.replace(/[ \t]{2,}/g, " ").replace(/(?<=\p{L}|[.!?,;»“])\[\d{1,4}\]/gu, ""));
    }
    return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function splitChapters(text) {
    const chapters = [];
    let title = null, lines = [];
    function flush() {
      const body = lines.join("\n").trim();
      if (body) chapters.push({title, text: body});
      lines = [];
    }
    for (const line of text.split("\n")) {
      if (line.length <= 100 && isHeading(line) && !tocLine.test(line)) {
        flush();
        title = line;
      } else {
        lines.push(line);
      }
    }
    flush();
    if (chapters.some(chapter => chapter.title)) {
      return chapters.map((chapter, index) => ({...chapter, title: chapter.title || (index === 0 ? "Вступление" : "Часть " + (index + 1))}));
    }
    // Keep chapters balanced, preferring an existing paragraph boundary.
    const matches = [...text.matchAll(pattern)];
    const result = [];
    let index = 0, offset = 0;
    while (index < matches.length) {
      const remaining = matches.length - index;
      let end = matches.length;
      if (remaining > 2500) {
        const target = Math.round(remaining / Math.ceil(remaining / 2250));
        const min = index + Math.min(target, 1500);
        const max = index + Math.min(2500, remaining - Math.min(target, 1500));
        end = index + target;
        let best = Infinity;
        for (let candidate = min; candidate <= max; candidate++) {
          const distance = Math.abs(candidate - index - target);
          if (distance >= best) continue;
          const previous = matches[candidate - 1];
          if (/\n\s*\n/.test(text.slice(previous.index + previous[0].length, matches[candidate].index))) {
            end = candidate;
            best = distance;
          }
        }
      }
      const boundary = end < matches.length ? matches[end].index : text.length;
      result.push({title: "Часть " + (result.length + 1), text: text.slice(offset, boundary).trim()});
      offset = boundary;
      index = end;
    }
    return result;
  }

  function detectLanguage(tokens) {
    if (tokens.length < 5) return "und";
    const sample = tokens.slice(0, 8000);
    for (const [language, script] of [["und-Cyrl", /\p{Script=Cyrillic}/u], ["und-Hani", /\p{Script=Han}/u], ["und-Arab", /\p{Script=Arabic}/u]]) {
      if (sample.filter(word => script.test(word)).length > sample.length * .6) {
        // A script alone does not distinguish Russian from other Cyrillic languages.
        return language;
      }
    }
    const scores = languageWords.map(([language, common]) =>
      [language, sample.filter(word => common.has(word)).length]).sort((a,b) => b[1] - a[1]);
    return scores[0][1] >= Math.max(3, sample.length * .08) &&
      scores[0][1] >= scores[1][1] * 1.35 ? scores[0][0] : "und";
  }

  function level(text, tokens, common, language) {
    if (language !== "de" || tokens.length < 8) return null;
    const rareShare = tokens.filter(word => !common.has(word)).length / tokens.length;
    const sentences = text.match(/[.!?]+(?=[\s»“”"')\]]|$)/gu)?.length || 1;
    const score = rareShare * 55 + Math.min(35, tokens.length / sentences);
    return ["A1", "A2", "B1", "B2", "C1", "C2"][[12, 19, 28, 39, 53, Infinity].findIndex(limit => score < limit)];
  }

  function identityPart(value) {
    return fold(value.normalize("NFKC")).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }

  async function dedupKey(title, author = "") {
    const normalized = identityPart(title) + "\n" + identityPart(author);
    const crypto = node ? require("node:crypto").webcrypto : globalThis.crypto;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  async function processText(input, {title, author = "", commonWords, pageWords = 245} = {}) {
    if (typeof title !== "string" || !identityPart(title) || typeof author !== "string") throw new TypeError("Expected book title and author");
    if (!(commonWords instanceof Set) || !commonWords.size) throw new TypeError("Expected a German frequency word set");
    const text = clean(input);
    const tokenize = value => [...value.matchAll(pattern)].map(word => fold(word[0]));
    const tokens = tokenize(text);
    if (!tokens.length) throw new Error("No readable words in input");
    const language = detectLanguage(tokens);
    const paginate = node ? pager.paginate : window.langradPager?.splitText;
    if (!paginate) throw new Error("Langrad pagination is unavailable");
    const chapters = splitChapters(text).map((chapter, index) => {
      const chapterTokens = tokenize(chapter.text);
      return {
        ...chapter, index,
        word_count: chapterTokens.length,
        level_estimate: level(chapter.text, chapterTokens, commonWords, chapterTokens.length < 30 ? language : detectLanguage(chapterTokens)),
        pages: paginate(chapter.text, pageWords),
      };
    });
    const body = chapters.map(chapter => chapter.text).join("\n\n");
    return {
      title: title.trim(), author: author.trim(), language,
      level_estimate: level(body, tokenize(body), commonWords, language),
      level_is_approximate: true,
      word_count: chapters.reduce((sum, chapter) => sum + chapter.word_count, 0),
      dedup_key: await dedupKey(title, author),
      chapters,
    };
  }

  const api = {processText, dedupKey, clean};
  if (node) module.exports = api;
  else window.langradTextPipeline = api;
})();
