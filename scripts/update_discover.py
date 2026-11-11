"""Refresh the German reading catalog for Langrad Discover."""
import json
import re
from hashlib import sha256
from xml.etree import ElementTree
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.error import URLError
from urllib.request import Request, urlopen

FEED = Path(__file__).resolve().parents[1] / "public" / "discover.json"
READING = Path(__file__).with_name("discover_reading.json")
NEWS_RSS = "https://netzpolitik.org/feed/"
API = "https://de.wikipedia.org/w/api.php"
USER_AGENT = "LangradDiscover/1.0 (https://github.com/ElzoMone/Langrad)"
TOPICS = {
    "Природа": r"\b(?:arten|gattung|pflanze\w*|vogel\w*|tier\w*|wald|vorkommen)\b",
    "География": r"\b(?:stadt|gemeinde|ortsteil|fluss|berg|insel|landkreis|region)\b",
    "Культура": r"\b(?:film|musik\w*|roman|schauspiel\w*|album|kunst\w*|theater)\b",
    "Наука и техника": r"\b(?:technik|physik\w*|chemie|software|maschine\w*|verfahren|forschung)\b",
    "История": r"\b(?:jahrhundert|krieg\w*|könig\w*|kaiser\w*|mittelalter|historisch\w*)\b",
    "Спорт": r"\b(?:fußball\w*|liga|meisterschaft\w*|sport\w*|olymp\w*)\b",
}


def article(page, date):
    if page.get("ns") != 0 or "disambiguation" in page.get("pageprops", {}):
        return None
    text = re.sub(r"\n{3,}", "\n\n", page.get("extract", "").replace("\xa0", " ")).strip()
    words = re.findall(r"[^\W\d_]+(?:[-’'][^\W\d_]+)*", text)
    if not 65 <= len(words) <= 500 or not page.get("lastrevid"):
        return None
    topic = max(TOPICS, key=lambda name: len(re.findall(TOPICS[name], text.lower())))
    if not re.search(TOPICS[topic], text.lower()):
        topic = "Разное"
    sentences = max(1, len(re.findall(r"[.!?](?:\s|$)", text)))
    complexity = len(words) / sentences + 22 * sum(len(word) >= 9 for word in words) / len(words)
    level = "B1" if complexity < 20 else "B2" if complexity < 31 else "C1"
    return {
        "id": "dewiki-" + str(page["pageid"]),
        "title": page["title"],
        "text": text,
        "words": len(words),
        "topic": topic,
        "level": level,
        "added": date,
        "sourceURL": "https://de.wikipedia.org/w/index.php?oldid=" + str(page["lastrevid"]),
    }


def fetch_pages():
    params = {
        "action": "query", "format": "json", "formatversion": 2,
        "generator": "random", "grnnamespace": 0, "grnlimit": 20,
        "prop": "extracts|info|pageprops", "ppprop": "disambiguation",
        "exintro": 1, "explaintext": 1, "exlimit": "max", "maxlag": 5,
    }
    req = Request(API + "?" + urlencode(params), headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=25) as response:
        data = json.load(response)
    if "error" in data:
        raise RuntimeError(data["error"].get("info", "MediaWiki error"))
    return data["query"]["pages"]


def wikipedia(date):
    topics = {"Природа", "Наука и техника", "История", "Культура", "География"}
    for page in fetch_pages():
        entry = article(page, date)
        if not entry or entry["words"] < 100 or entry["topic"] not in topics:
            continue
        if re.search(r"^(?:Liste|Kategorie)\b|^\(\d+\)|Amtsbezirk|Landgemeinde|Olympische Sommerspiele",
                     entry["title"], re.IGNORECASE):
            continue
        if re.search(r"\(\s*\*[^)]{0,150}\b(?:19|20)\d{2}", entry["text"][:230]):
            continue
        yield entry


def journalism(date):
    req = Request(NEWS_RSS, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=20) as response:
        feed = ElementTree.fromstring(response.read(5_000_000))
    for item in feed.findall("./channel/item"):
        url = item.findtext("link", "").strip()
        title = item.findtext("title", "").strip()
        tags = {tag.text.lower() for tag in item.findall("category") if tag.text}
        if not title or not re.fullmatch(r"https://netzpolitik\.org/\d{4}/[^/?#]+/?", url):
            continue
        if tags & {"english", "in english", "english version", "englisch"}:
            continue
        yield {
            "id": "netzpolitik-" + sha256(url.rstrip("/").encode()).hexdigest()[:24],
            "category": "journalism",
            "title": title,
            "author": item.findtext("{http://purl.org/dc/elements/1.1/}creator", ""),
            "source": "netzpolitik.org",
            "sourceURL": url,
            "topic": "Общество и технологии",
            "text": "",
            "words": 0,
            "added": date,
        }


def merge(new, old, limit):
    entries = {entry["id"]: entry for entry in new}
    for entry in old:
        entries.setdefault(entry["id"], entry)
    return list(entries.values())[:limit]


def main():
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true", help="Load reviewed reading texts without fetching feeds")
    args = parser.parse_args()
    old = json.loads(FEED.read_text(encoding="utf-8"))["articles"] if FEED.exists() else []
    date = datetime.now(timezone.utc).date().isoformat()
    curated = json.loads(READING.read_text(encoding="utf-8"))
    for entry in curated:
        entry["words"] = len(re.findall(r"[^\W\d_]+(?:[-’'][^\W\d_]+)*", entry["text"]))
    entries = list(curated)
    curated_ids = {entry["id"] for entry in curated}
    errors = 0
    for name, predicate, collect, limit in (
        ("netzpolitik.org", lambda entry: entry.get("category") == "journalism", journalism, 48),
        ("German Wikipedia", lambda entry: entry["id"].startswith("dewiki-"), wikipedia, 120),
    ):
        previous = [entry for entry in old if predicate(entry) and entry["id"] not in curated_ids]
        try:
            new = [] if args.offline else [entry for entry in collect(date) if entry["id"] not in curated_ids][:12]
        except (URLError, TimeoutError, ValueError, RuntimeError, KeyError, ElementTree.ParseError) as exc:
            errors += 1
            print(f"{name}: {exc}")
            new = []
        entries.extend(merge(new, previous, limit))
    if entries != old:
        FEED.parent.mkdir(parents=True, exist_ok=True)
        FEED.write_text(json.dumps({"articles": entries}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Catalog has {len(entries)} entries")
    if errors == 2:
        raise SystemExit("Both feeds unavailable")


if __name__ == "__main__":
    main()
