"""Refresh the reviewed LibriVox recordings matched to Langrad chapter IDs."""
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
RECORDINGS = [
    (2689, "https://librivox.org/die-verwandlung-von-franz-kafka/", "Markus Wachenheim",
     "Franz Kafka", 1924, "verwandlung_mw_0811_librivox", [
         ("Abschnitt 1", ["kafka-verwandlung-1", "public-chapter-gutenberg-22367-2"]),
         ("Abschnitt 2", ["kafka-verwandlung-2", "public-chapter-gutenberg-22367-3"]),
         ("Abschnitt 3", ["kafka-verwandlung-3", "public-chapter-gutenberg-22367-4"]),
     ]),
    (172, "https://librivox.org/der-kleine-haewelmann-by-theodor-storm/", "Franzi",
     "Theodor Storm", 1888, "haewelmann_librivox", [
         ("", ["public-chapter-wikisource-der-kleine-haewelmann-1"]),
     ]),
]


def build(read_feed):
    result = {}
    for project, source, reader, author, death, collection, chapters in RECORDINGS:
        feed = f"https://librivox.org/rss/{project}"
        channel = ElementTree.fromstring(read_feed(feed)).find("channel")
        if author not in channel.findtext("title", "") or channel.findtext("language") not in ("de", "ger"):
            raise ValueError(f"Unexpected book or language in {feed}")
        items = channel.findall("item")
        if len(items) != len(chapters):
            raise ValueError(f"Unexpected number of tracks in {feed}")
        for item, (expected, ids) in zip(items, chapters):
            enclosure = item.find("enclosure")
            audio = urlsplit(enclosure.attrib["url"])
            if ((item.findtext("title") or "").strip() != expected or
                    enclosure.get("type") != "audio/mpeg" or audio.scheme != "https" or
                    audio.netloc not in ("archive.org", "www.archive.org") or
                    not re.fullmatch(rf"/download/{collection}/[A-Za-z0-9_.-]+\.mp3", audio.path) or
                    audio.query or audio.fragment):
                raise ValueError(f"Unexpected track in {feed}: {expected}")
            for chapter_id in ids:
                result[chapter_id] = dict(url=audio.geturl(), source=source, feed=feed, reader=reader,
                                         author_death_year=death, title=expected or "Der kleine Häwelmann")
    return result


def download(url):
    request = Request(url, headers={"User-Agent": "Langrad/1.0 (https://github.com/ElzoMone/Langrad/issues)"})
    with urlopen(request, timeout=15) as response:
        body = response.read(128_001)
    if len(body) > 128_000:
        raise ValueError("Unexpectedly large RSS feed")
    return body


if __name__ == "__main__":
    output = ROOT / "books" / "chapter-audio.json"
    data = build(download)
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
