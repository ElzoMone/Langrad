# Stage 2 — German morphology offline index (9 Nov 2026)

## Status: published, reader not yet connected

German wordform morphology is now **automatically** built from external
sources, not hand-authored. The original Langrad reader JavaScript and
localStorage data were NOT changed in this stage.

### Data and workflow

* Build script: [scripts/build_forms.py](../scripts/build_forms.py).
* GitHub action: [.github/workflows/build-forms.yml](../.github/workflows/build-forms.yml).
* Main data: [Kaikki/Wiktextract German entries from English Wiktionary](https://kaikki.org/dictionary/German/kaikki.org-dictionary-German.jsonl.gz).
* Fallback: Simplemma **1.2.0** bundled German wordform dictionary (not a runtime call).
* Attribution: [public/forms/SOURCES.txt](../public/forms/SOURCES.txt).
* Build output: **639,489 distinct normalized forms, 1,842,021 candidate analyses, 478 shards, ~124 MB** of JSON.
* Raw Wiktionary JSONL and temporary SQLite are used only during GitHub Actions and are **not committed**.

### Index schema

Public path: https://langrad.vercel.app/forms/er.json

Each JSON object maps a casefolded form to an array of possible analyses:

    "erkannte": [
      ["erkennen", "verb", ["first-person", "indicative", "preterite", "singular"], "w"],
      ...
    ]

Each candidate item is:

    [lemma, part_of_speech, grammatical_tag_array, source_code]

* w = Wiktionary data from Kaikki; tags describe grammar.
* s = Simplemma fallback; tags are empty (no guessed grammar).
* Multiple candidates and multiple grammatical readings MUST be retained.
* Form normalization: NFC and lowercase/casefold; German ß/ss is unified.
* Shard routing: the first two normalized Latin letters, converting
  ä/ö/ü to ae/oe/ue. Nonstandard beginnings go into other.json.
* For \`diesen\` Wiktionary can yield \`diese\`, \`dieser\`, \`dieses\`.
  Reader should show all plausible analyses, not prematurely assume one.
* The index supplies **lemmas and grammar, not Russian translations**.
  Translation lookup must follow existing \`/dict/{prefix}.json\` or its
  later expanded replacement.

### Verified examples

* erkannte -> erkennen (Präteritum 1st/3rd sg alternatives)
* gegangen -> gehen (past participle)
* eingenommen -> einnehmen (past participle)
* diesen -> diese / dieser / dieses (multiple declension candidates)
* kam -> kommen (Präteritum)
* abgelöst -> ablösen (past participle)
* Zigaretten -> Zigarette (plural forms)

### Vercel delivery

The existing Vercel project remains in place. Its Git integration is not
connected, so the prepared shards are served at /forms/... through a
**Vercel CDN rewrite**, sourced from a pinned GitHub commit:

    f5d74f0725411594a89d1885611e6cd2376a6c48

* Rewrite: \`^/forms/([a-z]{2}|other)\.json$\`
* Manifest: https://langrad.vercel.app/forms/manifest.json
* Credits: https://langrad.vercel.app/forms/SOURCES.txt
* Repo files: \`public/forms/*.json\`
* No Vercel build was invoked for this stage, only deployment-independent
  routing configuration. The existing \`/dict/\` translation route remains.
* Note: GitHub is an upstream origin for this CDN rewrite; files are not
  directly part of the Vercel deployment package. For high traffic or to
  remove this dependency, connect the repository to the existing Vercel
  project and deploy assets directly.

### Next steps (not done here)

* Stage 3: lazy fetch + cache the appropriate \`/forms/{prefix}.json\` and
  \`/dict/{prefix}.json\` on clicks; choose exact-form -> morphological
  analysis -> lemma -> translation, preserve user-provided translations.
* Stage 4: separable verbs (e.g. \`kam ... an\` -> \`ankommen\`) and
  Wiktionary API fallback for words not covered by the offline index.
* Stage 5: link license attributions in reader UI/footer and regression tests.

DO NOT remove the existing \`dictionary.json\` until the reader fully migrates.
