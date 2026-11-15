# Earth Fire Calendar presentation

**Technical baseline: scaffold-r6. Visual redesign in progress following the user’s feedback. Original copy and team placeholders are retained.** PDF, PPTX, previews and captured screenshots are local artifacts excluded from Git at the user's request; the links below work in the local checkout.

- [Presentation PDF](output/earth-fire-calendar-scaffold-r6.pdf) — vector text, shapes and chart; embedded brand fonts; clickable links.
- [Editable PowerPoint](output/earth-fire-calendar-scaffold-r6.pptx) — editable text, pipeline, and native chart with embedded data workbook.
- [Overview](output/earth-fire-calendar-scaffold-r6-overview.png)
- [Verification](output/verification-scaffold-r6.json) and [review record](REVIEW.md)

Slides 3–5 now contain real application captures; slide 6 has an editable pipeline. Team name and member names intentionally remain placeholders, as requested. This is a finished layout framework, not a claim that the presentation copy or submission is final. Checkpoint 01 files remain locally in `output/` for comparison.

## Copy and evidence

The builder reads [demo-slides.md](demo-slides.md) directly. The source file was unchanged up to scaffold-r6. It was then brought in line with the app at `c73d0b5`: slide 4 gained a bullet on the experimental one-day baselines, and on slide 7 the Extremum link and the AI assistance line were corrected. The r6 outputs predate these edits; the next build must include them and needs renewed visual review. Titles, paragraphs, dates, counts, qualifications and attribution are checked before export and again in the delivered PPTX/PDF. The two descriptive screenshot headings supplement, but do not replace, the source copy.

Slide 2 uses the [frozen 08:36 UTC snapshot](assets/data/firms-snapshot-2026-11-15T0836Z.json): 79,349 VIIRS and 8,127 MODIS detections. The native chart and its workbook contain these values; the value axis is fixed at 0–100,000. The source date is placed below the chart and the detection qualification directly below the lead.

Other slides use a later live illustration, with [capture provenance](assets/screenshots/capture-scenes.json). The same region and live snapshot are used for the MODIS/VIIRS views. The pinned group has both sensors. For legibility, the captured application panel was expanded to 700 CSS pixels in the browser; its data was not changed. These screenshots do not substantiate the earlier count comparison. Images were captured at device scale 2.

## Design and export

16:9, 1600 × 900; Fira Sans Black / Bold and Overpass; the supplied Electric-to-Deep gradient, orbit pattern at 25%, white content slides and limited Neon Yellow emphasis. [Tokens](design-tokens.json) define the 80 / 52 / 30 / 25 / 20 px type scale. [Supplied references](assets/brand/README.md) govern the palette and branding. No NASA or Space Apps logos are used.

Artifact Tool produces PPTX. A narrowly scoped OOXML repair preserves image/chart descriptions and meaningful metadata and explicitly fixes the chart scale before the finalizer validates the file. All text and diagram boxes remain editable.

The PDF uses the same layout records, rendered by Chromium with embedded TrueType font subsets, real text, vectors and URI annotations. Only application screenshots and the reference pattern are raster assets. This avoids the managed Artifact Tool PDF runtime's unavailable standard-font module. It is not a PDF made of whole-slide screenshots. Native PowerPoint may lay out text and charts slightly differently; the supplied PDF is the appearance reference.

Fonts and OFL licences are included in [assets/fonts](assets/fonts/), with URLs and SHA-256 hashes in [sources.json](assets/fonts/sources.json). They are not installed on the system or embedded in PPTX. Native PowerPoint 16.109.3 opened all seven slides and exported a proof; the slide 2 end labels fit. On this machine PowerPoint substitutes Calibri for Overpass. The supplied PDF embeds the intended fonts and is unaffected.

The full 30 MB brand guide is local at `assets/brand/brand-guide.pdf`, excluded from Git. Its official URL is recorded in the [reference collection](assets/brand/README.md). No package installation was performed.

## Rebuild

Use an existing managed runtime with `@oai/artifact-tool`, `skia-canvas`, `sharp`, `jszip`, `xml-js`, `pdf-lib`, `playwright`, Chrome, Poppler and the presentation skill validators. The recorded build used Artifact Tool 2.8.157 and the bundled Python 3.12 runtime.

```sh
export RUNTIME_NODE_MODULES=/absolute/path/to/managed/runtime/dependencies/node/node_modules
export RUNTIME_PYTHON=/absolute/path/to/managed/runtime/dependencies/python/bin/python
export PRESENTATIONS_SKILL=/absolute/path/to/presentations/skills/presentations
export POPPLER_BIN=/absolute/path/to/poppler/bin
export DECK_VERSION=scaffold-r7
/absolute/path/to/node submission/presentation/build.mjs
/absolute/path/to/node submission/presentation/verify.mjs
```

Use a new version on each build; the finalizer refuses to overwrite a final PPTX. Outputs go to `output/`. Per-slide 2× previews, HTML, shared layout, source coverage, font/link reports and validation receipts go to `.build/<version>/`. Source copy changes require renewed visual review.

On a fresh checkout, first run `capture-scenes.mjs` using the existing Chrome and Playwright to create the ignored local screenshot assets. This refreshes the UI illustrations and requires renewed visual review; it does not change the frozen slide 2 snapshot. On macOS with PowerPoint installed, `verify-powerpoint.applescript` accepts absolute PPTX and proof-PDF paths. The native proof is a separate compatibility check, not the delivered PDF.

## Review and accounting

The original checkpoint review was incorporated into r6. The new visual review remains open. A separate Codex reviewer inspected all seven actual PDF pages, source wording/data, OOXML, links and native PowerPoint chart proof. See [REVIEW.md](REVIEW.md) for the accepted revision, coverage and limitations. No Claude job was launched by this session.

No approved LLM API gateway was found in the repository. Local deterministic tools handled assembly; the final independent pass ran inside Codex as required by `AGENTS.md`. API provider/model/route: none; calls: 0; cost: $0. Subscription usage: the primary Codex session plus one independent Codex reviewer; allowance consumption is unavailable. No API or Batch work was submitted.
