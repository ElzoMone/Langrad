#!/usr/bin/env python3
"""Build static DE-RU translation shards from Langrad's existing small dictionary.
No network access, lemmatization or raw Wiktionary dump processing is needed.
Usage: python3 scripts/build_shards.py --input dictionary.json --output public/dict
"""
import argparse
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

def shard_key(word: str) -> str:
    term = str(word).strip().casefold()
    for old, new in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        term = term.replace(old, new)
    term = re.sub(r"^[^a-z]+", "", term)
    return term[:2] if len(term) >= 2 and re.fullmatch(r"[a-z]{2}", term[:2]) else "other"

def build(source: Path, destination: Path) -> None:
    dictionary = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(dictionary, dict):
        raise ValueError("Expected a dictionary JSON object")
    groups = defaultdict(dict)
    for word, entry in dictionary.items():
        groups[shard_key(word)][word] = entry
    destination.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for prefix, entries in sorted(groups.items()):
        text = json.dumps(dict(sorted(entries.items())), ensure_ascii=False, separators=(",", ":")) + "\n"
        raw = text.encode("utf-8")
        (destination / (prefix + ".json")).write_bytes(raw)
        manifest[prefix] = {
            "entries": len(entries), "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest()
        }
    info = {
        "version": 1, "kind": "lemma-to-russian-translation",
        "source": "FreeDict/WikDict DE-RU (existing Langrad dictionary.json)",
        "license": "CC BY-SA 3.0 Unported",
        "shard_rule": "first two normalized Latin letters; otherwise other.json",
        "normalization": "casefold, ä→ae, ö→oe, ü→ue, ß→ss, strip nonletter prefix",
        "entries": len(dictionary), "shard_count": len(manifest), "shards": manifest
    }
    (destination / "manifest.json").write_text(
        json.dumps(info, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    assert sum(s["entries"] for s in manifest.values()) == len(dictionary)
    print(f"Generated {len(manifest)} shards with {len(dictionary)} entries.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=Path("dictionary.json"))
    parser.add_argument("--output", type=Path, default=Path("public/dict"))
    args = parser.parse_args()
    build(args.input, args.output)
