# Langrad — The Language Rises

Existing production site: https://langrad.vercel.app/

This repository is intended to preserve the **existing** Langrad application, not replace it.
It was initially empty; the live Vercel site is currently deployed from uploaded files
and is not yet automatically linked to this GitHub repository.

## Step 1: static translation dictionary

* `scripts/build_shards.py` splits the existing FreeDict/WikDict DE–RU
  `dictionary.json` into `public/dict/<two letters>.json`.
* Expected result: **26,301** dictionary headwords, **323** shards plus
  `public/dict/manifest.json`.
* Each shard contains the *original* dictionary values: a mapping
  from headword to existing Russian translation data.
* The naming convention casefolds words, converts ä/ö/ü to ae/oe/ue,
  converts ß to ss, and uses `other.json` for non-Latin prefixes.
* The existing website continues to load `/dictionary.json`. Connecting
  the shards to reader click events belongs to **Step 3**, not this step.

## Reproducible initialization

`.github/workflows/bootstrap-dictionary.yml` downloads a checksum-verified
snapshot of the seven original production site files (without changing them),
executes the deterministic shard builder, and commits the output.

If the GitHub Actions workflow does not run automatically, it may have to
be enabled and run manually from the Actions tab.

## Licenses and sources

Current DE–RU dictionary: FreeDict / WikDict, CC BY-SA 3.0 Unported.
See `dictionary-license.txt` from the live site. This step does **not**
download or commit raw Wiktionary dumps or SQLite source data.

## Preservation

Do not remove or change browser localStorage keys, readers, saved texts,
old dictionary entries, review progress, TFR styling, or the existing
production domain. Do not point the original Vercel project at this repository
until its site snapshot is successfully committed and verified.
