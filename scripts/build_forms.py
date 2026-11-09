#!/usr/bin/env python3
"""Build Langrad's offline German inflection index from Kaikki Wiktionary JSONL.

Primary source: German entries extracted from English Wiktionary by Wiktextract.
Fallback: pre-packaged German form -> lemma data from simplemma 1.2.0.
No download is performed by this script. Run on a build machine, never in browser.
"""
import argparse
import gzip
import hashlib
import json
import re
import sqlite3
import tempfile
import unicodedata
from collections import Counter
from pathlib import Path

MORPH_TAGS = frozenset("""
first-person second-person third-person singular plural dual nominative
accusative dative genitive vocative present past preterite perfect pluperfect
future participle imperative indicative subjunctive subjunctive-i subjunctive-ii
conditional comparative superlative masculine feminine neuter strong weak mixed
infinitive present-participle past-participle active passive predicative
positive attributive comparative-only superlative-only impersonal formal
informal polite reflexive animate inanimate non-attributive
""".split())

def normalize(term):
    return unicodedata.normalize("NFC", term.strip()).casefold()

def shard_key(form):
    value = normalize(form)
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        value = value.replace(a, b)
    value = re.sub(r"^[^a-z]+", "", value)
    return value[:2] if len(value) >= 2 and re.fullmatch("[a-z]{2}", value[:2]) else "other"

def simple_word(term):
    return bool(term and len(term) <= 64 and any(c.isalpha() for c in term)
                and all(c.isalpha() or c in "-'’" for c in term)
                and not term.startswith("-") and not term.endswith("-"))

def tags_of(entry):
    return sorted({t for t in entry.get("tags", ()) if t in MORPH_TAGS})

def add_rows(conn, rows):
    conn.executemany(
        "INSERT OR IGNORE INTO forms (prefix, form, lemma, pos, tags, source) "
        "VALUES (?, ?, ?, ?, ?, ?)", rows)

def load_wiktionary(conn, source):
    rows = []
    stats = Counter()
    opener = gzip.open if str(source).endswith(".gz") else open
    with opener(source, "rt", encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, 1):
            entry = json.loads(line)
            if entry.get("lang_code") != "de":
                continue
            stats["german_entries"] += 1
            lemma = entry.get("word")
            if not isinstance(lemma, str) or not simple_word(lemma):
                continue
            pos = (entry.get("pos") or "")[:30]
            # Inflection tables on lemma entries.
            for f in entry.get("forms") or []:
                form = f.get("form")
                tags = tags_of(f)
                if not isinstance(form, str) or not simple_word(form):
                    continue
                if any(t in f.get("tags", ()) for t in ("table-tags","inflection-template")):
                    continue
                if normalize(form) == normalize(lemma):
                    continue
                norm = normalize(form)
                rows.append((shard_key(norm), norm, lemma, pos,
                             ",".join(tags), "w"))
                stats["wiktionary_rows"] += 1
            # Inflected entries explicitly tagged form-of.
            for sense in entry.get("senses") or []:
                if not sense.get("form_of"):
                    continue
                source_tags = tags_of(sense)
                for ref in sense["form_of"]:
                    base = ref.get("word")
                    if not isinstance(base, str) or not simple_word(base):
                        continue
                    if normalize(base) == normalize(lemma):
                        continue
                    norm = normalize(lemma)
                    rows.append((shard_key(norm), norm, base, pos,
                                 ",".join(source_tags), "w"))
                    stats["form_of_rows"] += 1
            if len(rows) >= 12000:
                add_rows(conn, rows)
                rows.clear()
    if rows:
        add_rows(conn, rows)
    conn.commit()
    return stats

def add_simplemma(conn, stats):
    # This is offline data bundled with a pinned Simplemma version.
    from simplemma.strategies.dictionaries.dictionary_factory import _load_dictionary_from_disk
    language_data = _load_dictionary_from_disk("de")
    rows = []
    for form_bytes, lemma_bytes in language_data.items():
        form = form_bytes.decode("utf-8")
        lemma = lemma_bytes.decode("utf-8")
        if not simple_word(form) or not simple_word(lemma) or normalize(form) == normalize(lemma):
            continue
        norm = normalize(form)
        prefix = shard_key(norm)
        # Wiktionary wins. Simplemma lacks grammatical analysis; don't make one up.
        found = conn.execute(
            "SELECT 1 FROM forms WHERE prefix=? AND form=? LIMIT 1",
            (prefix, norm)).fetchone()
        if found:
            continue
        rows.append((prefix, norm, lemma, "", "", "s"))
        stats["simplemma_rows"] += 1
        if len(rows) >= 12000:
            add_rows(conn, rows)
            rows.clear()
    if rows:
        add_rows(conn, rows)
    conn.commit()

def emit(conn, directory, stats):
    directory.mkdir(parents=True, exist_ok=True)
    shard_stats = {}
    last_prefix = None
    last_form = None
    current_form_items = []
    output = None
    comma = False
    count_forms = 0
    count_analyses = 0

    def flush_form():
        nonlocal last_form, current_form_items, comma, count_forms, count_analyses
        if last_form is None:
            return
        if comma:
            output.write(",")
        output.write(json.dumps(last_form, ensure_ascii=False, separators=(",", ":")))
        output.write(":")
        # Source data is a list of [lemma, part_of_speech, grammar_tags, origin].
        output.write(json.dumps(current_form_items, ensure_ascii=False, separators=(",", ":")))
        comma = True
        count_forms += 1
        count_analyses += len(current_form_items)
        current_form_items = []

    for prefix, form, lemma, pos, tags, source in conn.execute(
        "SELECT prefix,form,lemma,pos,tags,source FROM forms ORDER BY prefix,form,lemma,pos,tags,source"
    ):
        if prefix != last_prefix:
            if output is not None:
                flush_form()
                output.write("}\n")
                output.close()
                shard_stats[last_prefix] = {
                    "forms": count_forms,
                    "bytes": (directory / (last_prefix+".json")).stat().st_size
                }
            output = (directory / (prefix + ".json")).open("w", encoding="utf-8")
            output.write("{")
            last_prefix = prefix
            last_form = None
            comma = False
            count_forms = 0
        if form != last_form:
            flush_form()
            last_form = form
        current_form_items.append([lemma, pos, tags.split(",") if tags else [], source])
    if output:
        flush_form()
        output.write("}\n")
        output.close()
        shard_stats[last_prefix] = {
            "forms": count_forms,
            "bytes": (directory / (last_prefix+".json")).stat().st_size
        }
    manifest = {
        "version": 1,
        "kind": "inflection-to-possible-lemmas",
        "source_wiktionary": "kaikki.org/dictionary/German/kaikki.org-dictionary-German.jsonl.gz",
        "source_simplemma": "simplemma==1.2.0 (bundled de dictionary)",
        "source_codes": {"w": "Wiktionary via Wiktextract", "s": "Simplemma fallback; no grammar asserted"},
        "entry_shape": "[lemma, part_of_speech, grammatical_tags, source_code]",
        "normalization": "NFC and casefold (ß→ss), shard prefix ä/ö/ü→ae/oe/ue",
        "shards": shard_stats,
        "unique_forms": sum(x["forms"] for x in shard_stats.values()),
        "analyses": count_analyses,
        "shard_count": len(shard_stats),
        "build_stats": dict(stats)
    }
    manifest["analyses"] = conn.execute("SELECT count(*) FROM forms").fetchone()[0]
    (directory / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8")
    return manifest

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wiktionary", type=Path, required=True,
                        help="Existing Wiktionary German-language JSONL or JSONL.gz")
    parser.add_argument("--out", type=Path, default=Path("public/forms"))
    parser.add_argument("--no-simplemma", action="store_true")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="langrad-forms-") as scratch:
        conn = sqlite3.connect(str(Path(scratch) / "forms.sqlite"))
        conn.execute("PRAGMA journal_mode=OFF")
        conn.execute("PRAGMA synchronous=OFF")
        conn.execute("PRAGMA cache_size=-200000")
        conn.execute("CREATE TABLE forms (prefix TEXT NOT NULL,form TEXT NOT NULL,"
                     "lemma TEXT NOT NULL,pos TEXT NOT NULL,tags TEXT NOT NULL,"
                     "source TEXT NOT NULL,PRIMARY KEY(prefix,form,lemma,pos,tags,source)) "
                     "WITHOUT ROWID")
        stats = load_wiktionary(conn, args.wiktionary)
        print("Wiktionary ingestion:", dict(stats), flush=True)
        if not args.no_simplemma:
            add_simplemma(conn, stats)
        result = emit(conn, args.out, stats)
        print("RESULT", json.dumps({k: result[k] for k in
              ("unique_forms", "analyses", "shard_count", "build_stats")},ensure_ascii=False), flush=True)

if __name__ == "__main__":
    main()
