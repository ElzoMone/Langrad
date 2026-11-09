# Stage 1: Langrad translation shards (9 November 2026)

## Data

- Live Langrad application remains unchanged.
- Original FreeDict/WikDict DE-RU dictionary: `dictionary.json` (26,301 headwords).
- Builder: `scripts/build_shards.py`.
- Generated at commit `88bee28705a9e503445fce137f997cf4b0653ff0`:
  323 two-character translation shards plus `public/dict/manifest.json`.
- Original terms, translations and grammatical metadata were preserved; no
  additional dictionary headwords or inflection analyses have been invented.
- Source licensing remains in `dictionary-license.txt` (FreeDict/WikDict,
  CC BY-SA 3.0).

## Live Vercel configuration

Production domain: https://langrad.vercel.app/

The original Langrad project uses file-based deployments. Direct Vercel
GitHub deployment failed with `git_info_fail`, because the project does not
have the GitHub provider integration linked. To provide all 323 shards under
the existing domain without changing the reader or deploying a separate
project, the following **project-level CDN rewrite** was published:

- Rule ID: `d3abd859-2deb-4f56-9588-271252e16b7b`
- Source: `^/dict/([a-z]{2}|other)\\.json$`
- Destination:
  `https://raw.githubusercontent.com/ElzoMone/Langrad/88bee28705a9e503445fce137f997cf4b0653ff0/public/dict/$1.json`
- Response Content-Type: `application/json; charset=utf-8`

**Important:** The four shards `er`, `ei`, `ge`, `di` and the manifest are
also copied into the Vercel static deployment. The *remaining* shards are
served via the Vercel CDN as a proxy to their pinned GitHub source, not
stored as static objects inside the Vercel deployment. Connecting GitHub to
Vercel would allow a later genuinely Git-built static deployment.

## Validation

- GitHub Actions bootstrap succeeded and wrote the full 323-shard tree.
- Manifest totals: 26,301 entries / 323 shards.
- CDN routes verified on the live domain for 18 diverse shard names, including
  `aa`, `ab`, `er`, `ge`, `sc`, `zu`, `other`.
- `/`, `/dictionary.json`, `/PROJECT.md`, `/project.html` remain 200.
- The reader is NOT yet wired to shards. No inflection index yet.

## Next stage

Generate a separate Wiktionary-derived form -> possible lemma analyses
index (with Simplemma fallback in build), and retain all ambiguous analyses.
Do not replace old translations or browser localStorage data.
