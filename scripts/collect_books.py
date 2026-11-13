"""Fetch source candidates. Only the catalog builder writes public files."""
import argparse
import csv
import io
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from urllib.parse import urlencode, urlparse
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

AGENT = "LangradBooks/1.0 (https://github.com/ElzoMone/Langrad/issues)"
WIKI = {
    "de.wikipedia.org": ("Wikipedia", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/", {
        "Welterbestätte in Deutschland": "История", "Physik": "Наука",
        "Säugetiere": "Природа", "Deutsche Küche": "Еда",
        "Geschichte der Technik": "История", "Nationalpark in Deutschland": "Природа"}),
    "de.wikivoyage.org": ("Wikivoyage", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/", {
        "Deutschland": "Путешествия", "Österreich": "Путешествия"}),

}
HOSTS = {*WIKI, "de.wikisource.org", "gutendex.com", "www.gutenberg.org", "mirror.cs.odu.edu"}
PG = "https://www.gutenberg.org"
MIRROR = "https://mirror.cs.odu.edu/gutenberg-epub"
MIN_ARTICLE_WORDS = 100


def download(url, limit=2_000_000):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.netloc not in HOSTS:
        raise ValueError("Unexpected source URL")
    with urlopen(Request(url, headers={"User-Agent": AGENT}), timeout=18) as reply:
        data = reply.read(limit + 1)
    if len(data) > limit:
        raise ValueError("Source response exceeds size limit")
    return data


def wiki(host, **params):
    data = json.loads(download("https://" + host + "/w/api.php?" + urlencode({
        "action": "query", "format": "json", "formatversion": 2, **params
    }), 3_500_000))
    if "error" in data:
        raise ValueError(data["error"].get("code", "MediaWiki error"))
    return data


def licensed_article(host, page, topic):
    source, license_name, license_url, _ = WIKI[host]
    title = page["title"]
    text = page.get("extract", "").strip()
    # exchars can terminate mid-sentence. Keep only complete sentences.
    if text.endswith("…"):
        terminal = max(text.rfind(". "), text.rfind("! "), text.rfind("? "),
                       text.rfind(".\n"), text.rfind("!\n"), text.rfind("?\n"))
        text = text[:terminal + 1] if terminal >= 0 else ""
    if (page.get("ns") != 0 or page.get("pagelanguage") != "de" or page.get("redirect")
            or "disambiguation" in page.get("pageprops", {})
            or re.search(r"^(?:liste|kategorie|portal|hauptseite)\b|\(begriffsklärung\)$", title, re.I)
            or not page.get("lastrevid") or len(re.findall(r"[^\W\d_]+", text)) < MIN_ARTICLE_WORDS):
        return None
    return dict(id=f"{source.lower()}-{page['pageid']}", title=title,
                author=f"{source} · Mitwirkende", author_death_year=None,
                license=license_name, license_url=license_url, source=source,
                source_url=f"https://{host}/w/index.php?oldid={page['lastrevid']}",
                text=text, genre=topic, kind="article", excerpt=True)


def collect_category(job, batches):
    host, category, topic = job
    result = []
    continuation = {}
    for _ in range(batches):
        params = dict(generator="categorymembers", gcmtitle="Kategorie:" + category,
                      gcmnamespace=0, gcmtype="page", gcmlimit=20, prop="extracts|info|pageprops",
                      ppprop="disambiguation", explaintext=1, exlimit="max")
        params.update(exintro=1, exchars=1200)
        data = wiki(host, **params, **continuation)
        result.extend(entry for page in data.get("query", {}).get("pages", [])
                      if (entry := licensed_article(host, page, topic)))
        continuation = data.get("continue", {})
        if not continuation:
            break
        time.sleep(.35)
    return result


def gutenberg_ids(limit, seen):
    # Include unknown copyright/years in discovery so they can enter the review queue.
    url = "https://gutendex.com/books/?" + urlencode({"languages": "de"})
    ids = []
    try:
        for _ in range(3):
            data = json.loads(download(url))
            ids.extend(item["id"] for item in data["results"] if isinstance(item.get("id"), int)
                       and f"gutenberg-{item['id']}" not in seen)
            if len(ids) >= limit or not data.get("next"):
                break
            url = data["next"]
            time.sleep(.5)
    except (OSError, KeyError, ValueError) as error:
        print(f"Gutendex unavailable ({error}). Using the official machine-readable CSV.", flush=True)
        raw = download(PG + "/cache/epub/feeds/pg_catalog.csv", 32_000_000)
        rows = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
        available = [int(row["Text#"]) for row in rows
                     if row["Type"] == "Text" and row["Language"] == "de"]
        # Spread discovery over the index as its catalog changes. Include some classics first.
        ids = [2322, 2406, 2380, 2499, 2174] + available
    return [identifier for identifier in dict.fromkeys(ids) if f"gutenberg-{identifier}" not in seen][:limit]


def gutenberg_item(identifier, year, seen):
    D = "{http://purl.org/dc/terms/}"
    P = "{http://www.gutenberg.org/2009/pgterms/}"
    work_id = f"gutenberg-{identifier}"
    if work_id in seen:
        return None
    rdf = ET.fromstring(download(f"{PG}/cache/epub/{identifier}/pg{identifier}.rdf"))
    work = rdf.find(P + "ebook")
    if work is None:
        raise ValueError("Missing Gutenberg metadata")
    creators = work.findall(f"{D}creator/{P}agent")
    authors = [creator.findtext(P + "name", "") for creator in creators]
    years = [creator.findtext(P + "deathdate", "") for creator in creators]
    title = work.findtext(D + "title", "")
    source_url = f"{PG}/ebooks/{identifier}"
    item = dict(id=work_id, title=title, author="; ".join(authors), source="Project Gutenberg",
                source_url=source_url, author_death_year=None, kind="book", genre="Классика")
    if (not creators or not all(authors) or not all(re.fullmatch(r"-?\d{1,5}", y) for y in years)
            or any(field.tag.startswith("{http://id.loc.gov/vocabulary/relators/}") or
                   field.tag == D + "contributor" or
                   re.fullmatch(r"marc(?:edt|trl|ann|adp|aui|clb|ctb|com|oth)", field.tag.rsplit("}",1)[-1])
                   for field in work)):
        return {**item, "needs_review": True, "reason": "missing_author_data_or_other_contributors"}
    item["author_death_year"] = max(map(int, years))
    if item["author_death_year"] + 70 >= year:
        return {**item, "needs_review": True, "reason": "copyright_term"}
    if work.findtext(D + "rights", "").strip() != "Public domain in the USA.":
        return {**item, "needs_review": True, "reason": "unverified_edition_rights"}
    if {node.text for field in work.findall(D + "language")
        for node in field.iter() if node.tag.endswith("}value")} != {"de"}:
        return None
    try:
        raw = download(f"{MIRROR}/{identifier}/pg{identifier}.txt", 2_500_000)
    except HTTPError as error:
        if error.code != 404:
            raise
        return {**item, "needs_review": True, "reason": "no_utf8_txt"}
    text = raw.decode("utf-8-sig")
    if not (re.search(r"(?im)^\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK", text) and
            re.search(r"(?im)^\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK", text)):
        return {**item, "needs_review": True, "reason": "missing_text_boundaries"}
    # Editorial editions and modern introductions require separate clearance.
    if re.search(r"(?im)^(?:übersetzt von|herausgegeben von|mit einem vorwort von|translated by|edited by)\s", text):
        return {**item, "needs_review": True, "reason": "edition_contributors"}
    return {**item, "license":"Public domain (DE, US)", "license_url":None, "text":text}


class WikiSourceText(HTMLParser):
    void = {"br", "hr", "img", "meta", "input", "link", "source", "wbr", "col", "area"}

    def __init__(self):
        super().__init__()
        self.stack = []
        self.parts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        skip = (self.stack and self.stack[-1][1]) or tag in {"table","figure","audio","sup","script","style"} or bool(
            set(attrs.get("class","").split()) & {"ws-noexport","PageNumber","mw-editsection","reference","noprint"})
        if not skip and tag in {"p","div","h2","h3","br"}:
            self.parts.append("\n\n" if tag != "br" else "\n")
        if tag not in self.void:
            self.stack.append((tag, skip))

    def handle_endtag(self, tag):
        for index in range(len(self.stack)-1,-1,-1):
            if self.stack[index][0] == tag:
                if not self.stack[index][1] and tag in {"p","div","h2","h3"}:
                    self.parts.append("\n\n")
                del self.stack[index:]
                break

    def handle_data(self, data):
        if not self.stack or not self.stack[-1][1]:
            self.parts.append(data.replace("\n", " "))


def wikisource_item(entry, year):
    if entry["author_death_year"] + 70 >= year:
        return {**entry, "needs_review":True, "reason":"copyright_term"}
    revision = entry["revision"]
    data = wiki("de.wikisource.org", action="parse", oldid=revision, prop="text")
    parser = WikiSourceText()
    parser.feed(data["parse"]["text"])
    text = "".join(parser.parts)
    return {**entry, "source":"Wikisource", "kind":"book", "genre":"Классика",
            "license":"Public domain (DE, US)", "license_url":None,
            "source_url":f"https://de.wikisource.org/w/index.php?oldid={revision}", "text":text}


def attempt(task):
    label, action = task
    try:
        result = action()
        result = result if isinstance(result,list) else [result] if result else []
        print(f"{label}: {len(result)} candidates", flush=True)
        return result
    except (OSError, ValueError, KeyError, ET.ParseError) as error:
        print(f"{label}: {error}", flush=True)
        return []


def main():
    from datetime import datetime, timezone
    from pathlib import Path
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--existing", required=True)
    parser.add_argument("--batches", type=int, choices=range(1, 9), default=5)
    parser.add_argument("--gutenberg", type=int, choices=range(0, 31), default=12)
    args = parser.parse_args()
    year = datetime.now(timezone.utc).year
    existing = Path(args.existing)
    seen = {item["id"] for item in json.loads(existing.read_text())["books"]} if existing.exists() else set()
    jobs = [(f"{host}/{category}", lambda job=(host,category,topic): collect_category(job,args.batches))
            for host, (_,_,_,categories) in WIKI.items() for category,topic in categories.items()]
    seeds = json.loads(Path(__file__).with_name("wikisource-books.json").read_text())
    jobs += [(entry["id"], lambda entry=entry:wikisource_item(entry,year)) for entry in seeds if entry["id"] not in seen]
    if args.gutenberg:
        try:
            ids = gutenberg_ids(args.gutenberg, seen)
            jobs += [(f"Gutenberg/{identifier}", lambda identifier=identifier:gutenberg_item(identifier,year,seen))
                     for identifier in ids if f"gutenberg-{identifier}" not in seen]
        except (OSError, ValueError) as error:
            print(f"Gutenberg discovery unavailable: {error}", flush=True)
    with ThreadPoolExecutor(max_workers=4) as executor:
        candidates = [item for batch in executor.map(attempt,jobs) for item in batch]
    if not candidates:
        raise SystemExit("No candidates available from any source")
    Path(args.output).write_text(json.dumps(candidates,ensure_ascii=False),encoding="utf-8")


if __name__ == "__main__":
    main()
