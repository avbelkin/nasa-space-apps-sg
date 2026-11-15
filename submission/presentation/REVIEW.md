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

## New direction: slides 1–2

The independent Codex review accepted direction-r8 as a visual checkpoint: clearer hierarchy, a calmer cover, prominent counts, no blocking visual defects. It checked both actual PDF pages, source wording, embedded fonts, image hashes, alt text, and both native charts/workbooks against the frozen numerical snapshot. The two charts use the same 0–100,000 scale. Main-checkout copies were byte-identical.

A minor orphan-word observation on the cover was corrected by widening its descriptive paragraph for direction-r9. Final verification of that revision is recorded in its JSON report. PowerPoint was not rerun for this visual checkpoint; the PDF remains the appearance reference. Slides 3–7 are outside this visual acceptance.

The frozen resized evidence set is now tracked (about 1.45 MB), so rebuilding does not require fresh live data. Large raw captures and generated decks remain local. The full seven-slide submission PDF location is still an open item; the two-slide preview must not be substituted for it.

Final delta acceptance: direction-r9 was independently reviewed on both actual PDF pages. The orphan word is fixed; no new overlaps were found. Wording matches the source and r8, chart XML is unchanged, and the main copies are identical. All reviewer jobs finished. Native PowerPoint was not rerun.

```text
PDF:  da66e084d30fa298bbc7f976e7ae95d9278246cb0c0c2675044052714560164a
PPTX: 6cfc2ba6a4b0e02b67b5426ceec5b119fbb0414140333c55e799ceed6360d5c5
```


## Concurrent source update

After direction-r9, main received new wording on slides 1–7. The canonical text was retained. Direction-r10 rebuilds the first two slides against that current source, including the longer cover description and Stage copy and the “almost ten times more” sentence. The cover Stage box gained vertical room. The old r9 acceptance remains historical; the latest proof receives a separate copy and visual check. Slides 3–7 and the final seven-slide PDF location remain open.

Final current-copy acceptance: direction-r10 was independently accepted with no findings. Both actual PDF pages and the PPTX match the current source. The longer copy fits without clipping or overlap; the two chart/workbook values remain 8,127 and 79,349 with fixed 0–100,000 ranges. Main copies are identical. All review jobs finished; no new external temporary files were created. PowerPoint was not rerun, and slides 3–7 remain outside this checkpoint.

```text
PDF:  4b186206f3e80349c0ab41340e5e9c055f65bfd2f3d0310217d1cea734977ede
PPTX: b10e76940c4f0925329f973780cf585332d0a6e117653c3b440d060eaefe97cb
```

## Complete deck with final copy: complete-r13

All seven slides now use the approved visual direction and the final source text, including Team Plush — Alexey Belkin, Viktoriia Naiman, the one-day GWIS/CAMS findings, rights links and model attribution. No name or image placeholders and no NASA or Space Apps logos are present.

Maps and evidence panels were captured again after the current EOxCloudless 2016 (CC BY 4.0) deployment; capture metadata verifies the actual raster source. The regional and step images are resized, the legend uses the app's exact colours, and the comparison panels have margins. Slide 5 shows the actual 24-hour timeline. The earlier 08:36 UTC count snapshot remains unchanged.

Root inspection covered all seven actual PDF pages rendered by Poppler. Automated verification passed exact source wording, seven pages, twelve URI annotations, three embedded Unicode Overpass faces, all token sizes, nine image/chart descriptions, both native charts and embedded workbooks, fixed 0–100,000 scales, metadata and the finalizer receipt. Microsoft PowerPoint 16.109.3 opened and exported all seven slides; its visual proof is being checked. Independent Codex acceptance is in progress; this is a review checkpoint, not a claim that the review has finished.

The compact PDF is tracked as `earth-fire-calendar.pdf`; full-sized original captures and versioned export history remain ignored. Local PDF/PPTX/overview copies are also in the main checkout.

```text
PDF:  85aaab71706cb5a9f4cd677031314abe8824853a7214871c4e92300ac9a8018b
PPTX: bb20e0532a55d4527e9666effade2763be9c6546785372fa95b98e151b6ed730
```

No LLM API provider/model/route was used; measured API cost is $0. One independent Codex review is running; subscription allowance usage is unavailable.
