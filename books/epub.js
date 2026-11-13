(() => {
  "use strict";
  const invalid = () => new Error("EPUB повреждён или использует неподдерживаемый формат.");
  const drm = () => new Error("EPUB с DRM не поддерживается. Выбери файл без защиты.");
  const decoder = new TextDecoder();
  const root = "https://epub.invalid/";
  const elements = (node, name) => [...node.getElementsByTagNameNS("*", name)];

  function reference(base, href) {
    if (!href) throw invalid();
    const url = new URL(href, root + base);
    if (url.origin + "/" !== root) throw invalid();
    return {path: decodeURIComponent(url.pathname.slice(1)), fragment: decodeURIComponent(url.hash.slice(1))};
  }

  function archive(bytes) {
    const view = new DataView(bytes);
    const u16 = index => view.getUint16(index, true);
    const u32 = index => view.getUint32(index, true);
    let end = view.byteLength - 22;
    const min = Math.max(0, end - 65535);
    while (end >= min && (u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== view.byteLength)) end--;
    if (end < min || u16(end + 4) || u16(end + 6)) throw invalid();
    const count = u16(end + 10);
    const entries = new Map();
    let offset = u32(end + 16);
    if (count > 6000 || offset + u32(end + 12) !== end) throw invalid();
    for (let index = 0; index < count; index++) {
      if (offset + 46 > end || u32(offset) !== 0x02014b50) throw invalid();
      const nameLength = u16(offset + 28);
      const name = decoder.decode(new Uint8Array(bytes, offset + 46, nameLength));
      if (entries.has(name)) throw invalid();
      entries.set(name, {flags:u16(offset+8), method:u16(offset+10), length:u32(offset+20),
        size:u32(offset+24), start:u32(offset+42)});
      offset += 46 + nameLength + u16(offset + 30) + u16(offset + 32);
    }
    if (offset !== end) throw invalid();
    const limit = 16 * 1024 * 1024;
    let total = 0;
    return {has: name => entries.has(name), async read(name) {
      const entry = entries.get(name);
      if (!entry || entry.start + 30 > end || u32(entry.start) !== 0x04034b50) throw invalid();
      if (entry.flags & 1) throw drm();
      const start = entry.start + 30 + u16(entry.start + 26) + u16(entry.start + 28);
      total += entry.size;
      if (total > limit) throw new Error("После распаковки EPUB содержит слишком много текста.");
      if (start + entry.length > end) throw invalid();
      const data = new Uint8Array(bytes, start, entry.length);
      if (entry.method === 0 && entry.length === entry.size) return decoder.decode(data);
      if (entry.method !== 8) throw invalid();
      let stream;
      try {
        stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
      } catch {
        throw new Error("Этот браузер не умеет распаковывать EPUB. Попробуй обновить его или загрузить TXT.");
      }
      const chunks = [];
      let size = 0;
      try {
        for (;;) {
          const {done, value} = await stream.read();
          if (done) break;
          size += value.length;
          if (size > entry.size) throw invalid();
          chunks.push(value);
        }
      } finally {
        await stream.cancel().catch(() => {});
      }
      if (size !== entry.size) throw invalid();
      return decoder.decode(await new Blob(chunks).arrayBuffer());
    }};
  }

  function xml(raw) {
    const doc = new DOMParser().parseFromString(raw, "application/xml");
    if (elements(doc, "parsererror").length) throw invalid();
    return doc;
  }

  function extract(body, markers) {
    const sections = [{title:"", text:""}];
    const skip = new Set(["script","style","svg","math","iframe","object","nav","img","video","audio","rt"]);
    const block = new Set(["p","div","section","article","blockquote","h1","h2","h3","h4","h5","h6","li","br","hr","tr","pre"]);
    function walk(node) {
      if (node.nodeType === 3 || node.nodeType === 4) {
        sections.at(-1).text += node.nodeValue.replace(/\s+/gu, " ");
        return;
      }
      if (node.nodeType !== 1 || skip.has(node.localName)) return;
      const title = markers.get(node.getAttribute("id"));
      if (title) sections.push({title,text:""});
      const separator = node.localName === "br" ? "\n" : block.has(node.localName) ? "\n\n" : "";
      sections.at(-1).text += separator;
      for (const child of node.childNodes) walk(child);
      sections.at(-1).text += separator;
    }
    walk(body);
    return sections.filter(section => /\p{L}/u.test(section.text));
  }

  async function readEpub(bytes) {
    const zip = archive(bytes);
    if (await zip.read("mimetype") !== "application/epub+zip") throw invalid();
    if (zip.has("META-INF/rights.xml")) throw drm();
    if (zip.has("META-INF/encryption.xml")) {
      const protection = xml(await zip.read("META-INF/encryption.xml"));
      for (const item of elements(protection, "EncryptedData")) {
        const method = elements(item, "EncryptionMethod")[0]?.getAttribute("Algorithm");
        const file = elements(item, "CipherReference")[0]?.getAttribute("URI") || "";
        if (!["http://www.idpf.org/2008/embedding","http://ns.adobe.com/pdf/enc#RC"].includes(method) ||
            !/\.(?:otf|ttf|woff2?)$/i.test(file)) throw drm();
      }
    }
    const container = xml(await zip.read("META-INF/container.xml"));
    const path = reference("", elements(container, "rootfile")[0]?.getAttribute("full-path")).path;
    const pkg = xml(await zip.read(path));
    const manifest = new Map(elements(pkg, "item").map(item => [item.getAttribute("id"), item]));
    const spine = elements(pkg, "spine")[0];
    if (!spine) throw invalid();
    const nav = [...manifest.values()].find(item => item.getAttribute("properties")?.split(/\s+/).includes("nav"));
    const ncx = manifest.get(spine.getAttribute("toc"));
    const labels = new Map();
    if (nav || ncx) {
      const location = reference(path, (nav || ncx).getAttribute("href")).path;
      const contents = xml(await zip.read(location));
      const toc = elements(contents,"nav").find(item =>
        item.getAttributeNS("http://www.idpf.org/2007/ops","type")?.split(/\s+/).includes("toc")) || contents;
      const links = nav ? elements(toc,"a").map(item => [item.getAttribute("href"),item.textContent]) :
        elements(contents,"navPoint").map(item => [
          elements(item,"content")[0]?.getAttribute("src"),elements(item,"navLabel")[0]?.textContent]);
      for (const [href,label] of links) {
        if (!href || !label?.trim() || /^[a-z]+:|^\/\//i.test(href)) continue;
        const ref = reference(location, href);
        if (!labels.has(ref.path)) labels.set(ref.path,new Map());
        labels.get(ref.path).set(ref.fragment || null,label.trim());
      }
    }
    const chapters = [];
    for (const ref of elements(spine,"itemref")) {
      if (ref.getAttribute("linear") === "no") continue;
      const item = manifest.get(ref.getAttribute("idref"));
      if (!item) throw invalid();
      if (!["application/xhtml+xml","text/html"].includes(item.getAttribute("media-type"))) continue;
      if (item === nav) continue;
      const file = reference(path,item.getAttribute("href")).path;
      const doc = xml(await zip.read(file));
      const body = elements(doc,"body")[0];
      if (!body) continue;
      const markers = labels.get(file) || new Map();
      const parts = extract(body,markers);
      for (const [index, part] of parts.entries()) {
        const candidates = elements(doc,"h1").concat(elements(doc,"h2"));
        chapters.push({...part,title:part.title || (index === 0 && (markers.get(null) || candidates[0]?.textContent.trim())) ||
          "Часть " + (chapters.length + 1)});
      }
    }
    if (!chapters.length) throw new Error("В EPUB нет доступного текста.");
    return {title:elements(pkg,"title")[0]?.textContent.trim(),author:elements(pkg,"creator")[0]?.textContent.trim(),chapters};
  }

  window.langradReadEpub = async bytes => {
    try { return await readEpub(bytes); }
    catch (error) { if (error instanceof RangeError || error instanceof TypeError) throw invalid(); throw error; }
  };
})();
