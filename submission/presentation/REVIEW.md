# Presentation review status

## Current work

The user rejected the visual direction of scaffold-r6 as dated. Technical acceptance of that revision does not imply visual approval. The next checkpoint is a new visual direction, with the original wording and team placeholders retained.

All presentation source files, local captures, outputs, fonts, reference copies and work files are now under `submission/presentation` in the main checkout. Builders read `demo-slides.md`, `assets/data/` and `assets/brand/` inside this folder. Large generated files remain Git-ignored. Shared project references outside this folder are not build dependencies.

## Accepted technical baseline: scaffold-r6

An independent Codex reviewer inspected all seven delivered PDF pages, the source text and snapshot, native chart XML and workbook, 10 PDF links, 12 image/chart descriptions, typography tokens and metadata. The PDF has vector text and shapes and five embedded TrueType fonts. The count values are 79,349 and 8,127; the chart range is 0–100,000. Source wording and team placeholders were preserved.

PowerPoint 16.109.3 exported seven pages; its slide 2 was visually checked. It substitutes Calibri for Overpass locally. The delivered PDF embeds the intended fonts. No Claude job was launched by this session.

Accepted baseline hashes:

```text
PDF:  210e14aec790d50437267a0c51baf90fed03e734091de14ae7b0d831e4b71856
PPTX: bc9e78ffb34f03738b09a21536297b9ae0233192e83ff313c7e2a7ae02774aa6
```

## New review items to resolve

- Resize map images to twice their displayed size; reduce the 42.7 MB PDF and make its submission location explicit.
- Add breathing room around the pinned comparison; show the promised timeline on slide 5.
- Replace the tiny raster legend with readable slide text and crop map controls.
- Enlarge evidence on slide 4 and remove excessive vertical gaps.
- Remove the two added geometry headings; preserve the source wording.
- Use the source-driven build for both exports. Manual PowerPoint edits are not synchronized into the PDF.
- Improve pipeline proportions and arrows, the slide 2 footer, and slide 7 attribution spacing.
- Keep frozen capture provenance available; a fresh live capture is not the same evidence.

## Accounting

No LLM API provider, model or processing route was used; LLM API cost is $0. The previous baseline used the primary Codex session and one independent Codex reviewer. Subscription allowance consumption is unavailable.
