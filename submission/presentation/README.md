# Earth Fire Calendar presentation

## Current checkpoint

The new visual direction covers **slides 1–2 only**, with the original wording and team placeholders. Slides 3–7 still have the earlier layout and remain the next reviewed block.

Local files, also synchronized to this directory in the main checkout:

- [New direction: PDF](output/earth-fire-calendar-direction-r10.pdf)
- [Two-slide overview](output/earth-fire-calendar-direction-r10-overview.png)
- [Editable two-slide PPTX](output/earth-fire-calendar-direction-r10.pptx)
- [Previous seven-slide baseline](output/earth-fire-calendar-scaffold-r6.pdf)
- [Review status](REVIEW.md)

The new cover uses a solid Deep Blue background, a larger globe and Overpass typography. Slide 2 gives the two counts the strongest visual emphasis. The wording of slides 1–2 has not been rewritten.

The canonical slide text was updated independently across slides 1–7 to reflect the app and its experimental one-day baselines. These edits are preserved. Direction-r10 uses the current wording of slides 1–2. The earlier seven-slide r6 output predates these text changes; the next full build must incorporate the current copy and receive renewed visual review.

## Everything lives here

- `demo-slides.md`: the slide copy; the builder reads it directly.
- `first-block.mjs`, `build.mjs`, `render-pdf.mjs`: layout and export code.
- `assets/data/`: the frozen numerical snapshot, 79,349 VIIRS / 8,127 MODIS.
- `assets/evidence/`: frozen, resized slide images and their hashes; these small assets are tracked for reproducible builds.
- `assets/screenshots/`: original captures and provenance; original PNGs stay local and ignored.
- `assets/fonts/`: font files, licences and source hashes; no system installation.
- `assets/brand/`: local brand references and guide; large reference images and PDF are ignored.
- `output/`: local PDF, PPTX and preview files, plus tracked verification JSON.
- `.build/`: ignored renders, HTML, receipts and intermediate files.

The build reads no presentation inputs from sibling `docs/`, `working/` or `assets/` directories. Links in the copy to project documents are navigation, not build dependencies. Each reviewed checkpoint is committed in the worktree, merged to main and pushed; local outputs are copied into main as well.

## Image size and provenance

The resized evidence set is about 1.45 MB in total. The regional map is 1800×1020; the two step maps are 860×390. Map controls are cropped from the right edge. Photographic maps use high-quality JPEG; interface text panels remain lossless PNG. No detection values are changed or generated. The [manifest](assets/evidence/manifest.json) records original and derived hashes and crop bounds.

`prepare-assets.mjs` regenerates those assets from the original local captures. A fresh checkout can build from the committed frozen evidence without recapturing live data. `capture-scenes.mjs` is an explicit refresh, which changes the evidence and requires review.

## Build the two-slide checkpoint

Use the existing managed runtime; no package installation is required.

```sh
export RUNTIME_NODE_MODULES=/absolute/path/to/managed/runtime/dependencies/node/node_modules
export RUNTIME_PYTHON=/absolute/path/to/managed/runtime/dependencies/python/bin/python
export PRESENTATIONS_SKILL=/absolute/path/to/presentations/skills/presentations
export DECK_SCOPE=first-block
export DECK_VERSION=direction-r11
/absolute/path/to/node submission/presentation/build.mjs
/absolute/path/to/node submission/presentation/verify.mjs
```

Use a fresh version for every export. The full-deck layout still needs adaptation to the new source blocks on slides 3–7. Use `first-block` for the current verified checkpoint. Edit the source copy and layout code, then rebuild both exports. Manual PowerPoint edits do not update the PDF.

The PDF uses the same layout records and embedded TrueType fonts. PPTX uses Artifact Tool, editable text, native chart objects and embedded workbooks. PowerPoint may substitute Overpass on a machine without the font; PDF is the appearance reference.

## Remaining submission work

The two-slide proof is not the submission PDF. The complete seven-slide PDF and its repository or external delivery location still need to be finalized after the remaining visual blocks. The earlier claim in the form plan that a PDF is already in the repository must not be treated as complete. Large local binaries are not pushed.

The next review covers screenshots/legends on slides 3–5, the added headings, the pipeline proportions and the attribution spacing. Technical acceptance of r6 was not visual approval by the user.

No LLM API provider/model/route is used; LLM API cost is $0. Work uses the primary Codex session and one independent Codex reviewer. Subscription allowance consumption is unavailable.
