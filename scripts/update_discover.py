"""Collect CC BY-SA introductions from German Wikipedia for Langrad."""
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

FEED = Path(__file__).resolve().parents[1] / "public" / "discover.json"
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


def main():
    old = json.loads(FEED.read_text(encoding="utf-8"))["articles"] if FEED.exists() else []
    known = {entry["id"] for entry in old}
    date = datetime.now(timezone.utc).date().isoformat()
    new = []
    for _ in range(3):
        for page in fetch_pages():
            entry = article(page, date)
            if entry and entry["id"] not in known:
                new.append(entry)
                known.add(entry["id"])
        if len(new) >= 12:
            break
    if not new:
        print("No new eligible articles")
        return
    feed = {"articles": (new[:12] + old)[:120]}
    FEED.parent.mkdir(parents=True, exist_ok=True)
    FEED.write_text(json.dumps(feed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Added {min(len(new), 12)} articles")


if __name__ == "__main__":
    main()
