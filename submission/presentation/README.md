# Earth Fire Calendar presentation

**Checkpoint 01, paused for review. This is not the final submission deck.**

- [Editable PowerPoint](output/earth-fire-calendar-checkpoint-01-r3.pptx)
- [Visual review PDF](output/earth-fire-calendar-checkpoint-01-r3.pdf)
- [Overview](output/earth-fire-calendar-checkpoint-01-r3-overview.png)
- [Review brief](REVIEW.md)

Slides 1–2 establish the design and count comparison. Slides 3–7 contain the current copy in editable layout scaffolds. The five outlined screenshot positions on slides 3–5 are intentional placeholders for the next reviewed block. The pipeline on slide 6 is still a text scaffold. The existing team-name and member-name placeholders remain unchanged.

## Copy and evidence

The builder reads [demo-slides.md](../docs/demo-slides.md) directly. Its wording, seven-slide order, dates, counts, qualifications and attribution are retained. The source file is not edited. Every source paragraph is checked for coverage before export, and the exported PPTX is checked again separately.

The native chart on slide 2 uses the [saved 08:36 UTC snapshot](../assets/firms-snapshot-2026-11-15T0836Z.json): 79,349 VIIRS and 8,127 MODIS detections. Its embedded workbook contains those same values. The cover uses a later unretouched browser screenshot; its [capture metadata](assets/screenshots/cover-globe.json) is recorded separately. It is an illustration, not evidence for the earlier count comparison. No live screenshot with different counters is substituted for that snapshot.

## Design and assets

16:9, 1600 × 900, 80 px margins. Fira Sans Black on the cover, Fira Sans Bold for headings, Overpass for body copy. Electric Blue to Deep Blue gradient, white content slides, sparse Neon Yellow emphasis and the supplied orbit pattern. [Design tokens](design-tokens.json) centralize the palette, typography and canvas.

The [existing reference collection](../assets/README.md) supplies the palette and pattern. No NASA or Space Apps logos are inserted. Factual attribution and the original non-affiliation statement are retained.

[Font files](assets/fonts/) and their OFL licences are included as project assets, **not installed in the system**. PowerPoint may require those fonts to be installed on the viewing machine; the PPTX does not embed font binaries. The PDF contains the checked slide images and preserves their appearance without installing fonts. It is a visual proof, not a searchable or editable PDF; use the PPTX for text, links and chart editing.

The full 30 MB brand guide is downloaded locally to `.build/space-apps-brand-guide.pdf` and excluded from Git. Official source: https://assets.spaceappschallenge.org/media/documents/Space_Apps_Brand_Guide_VUGpVJm.pdf. Typography, gradient, contrast and pattern guidance were checked against it.

Font sources, downloaded 2026-11-15:

- Fira Sans Black and Bold: https://github.com/google/fonts/tree/main/ofl/firasans
- Overpass Regular, Bold and Italic: https://github.com/RedHatOfficial/Overpass/tree/master/fonts/otf
- The upstream font files and licences are unchanged. The local licence filenames distinguish the two families.

## Rebuild with existing dependencies

Use a managed runtime that already contains `@oai/artifact-tool`, `pdf-lib`, `playwright` and the presentation skill validators. This repository adds no package dependency and the scripts never install anything. The initial checkpoint was built with the installed Codex runtime, Artifact Tool 2.8.157 and its Python 3.12 interpreter.

```sh
export RUNTIME_NODE_MODULES=/absolute/path/to/managed/runtime/dependencies/node/node_modules
export RUNTIME_PYTHON=/absolute/path/to/managed/runtime/dependencies/python/bin/python
export PRESENTATIONS_SKILL=/absolute/path/to/presentations/skills/presentations
export DECK_VERSION=checkpoint-02
/absolute/path/to/managed/runtime/dependencies/node/bin/node submission/presentation/build.mjs
```

Use a new `DECK_VERSION` for each reviewed revision. The finalizer refuses to overwrite an existing PPTX. Output goes to `output/`; draft files, per-slide renders, copy coverage and validation receipts go to `.build/<version>/`. Copy edits can change line lengths and require renewed visual review; the existing block structure is the builder's input contract.

`capture-cover.mjs` can refresh the cover screenshot, with `RUNTIME_NODE_MODULES` set and a local Chrome available. A refresh changes the capture metadata and should be reviewed. It must not change slide 2's evidence without also updating the approved text and snapshot.

## Execution and cost

No approved LLM gateway or model-routing configuration was found in this repository. This small frozen-copy assembly used local deterministic processing and the current Codex session; no bulk API classification or extraction was needed. API provider/model/route: none. API calls: 0; API cost: $0. Subscription work: this Codex session, no subagents. Allowance consumption is unavailable and is not inferred from token prices.

No asynchronous API jobs or reviewer jobs were submitted. Claude and the second reviewer have not reviewed this checkpoint. The next action is to collect their comments against this exact checkpoint and correct them before proceeding to the next block.
