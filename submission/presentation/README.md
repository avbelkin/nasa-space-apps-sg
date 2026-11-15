# Earth Fire Calendar presentation

The complete deck uses the final English copy in [demo-slides.md](demo-slides.md): **seven slides**, Team **Plush — Alexey Belkin, Viktoriia Naiman**. The approved solid Deep Blue / white direction, Overpass typography and yellow emphasis now cover all seven slides. No NASA, Space Apps or third-party logos are used.

## Files

- [Submission PDF](earth-fire-calendar.pdf): the compact published appearance reference.
- [Editable PPTX](output/earth-fire-calendar-complete-r14.pptx) and [overview](output/earth-fire-calendar-complete-r14-overview.png): local files, synchronized to the main checkout.
- [Review record](REVIEW.md): verification, independent acceptance and known export limitations.
- [Slide copy](demo-slides.md): the only source of authored slide wording.
- `output/`: versioned local PDF, editable PPTX, overview and verification reports. Generated historical binaries are ignored.
- `assets/evidence/`: committed, resized captures and hashes; a fresh clone needs no live recapture.
- `assets/screenshots/`: capture provenance and ignored original PNGs.
- `assets/fonts/`: supplied fonts and licences; no system installation.
- `assets/brand/`: reference colours and guides; large reference binaries are ignored.
- `.build/`: ignored HTML, previews, validation receipts and PowerPoint proof exports.

All presentation inputs, scripts, outputs and review files live in this directory. Local generated files are copied into this directory in the main checkout after verified milestones.

## Evidence and reproducibility

Slide 2 retains the frozen **15 November 2026, 08:36 UTC** FIRMS count: **8,127 MODIS / 79,349 VIIRS**. The remaining screenshots are later interface illustrations, refreshed on 15 November after the EOxCloudless 2016 basemap was deployed. They are not evidence for the earlier global totals. The capture manifest records the raster source and the exact time of each capture. No observations are synthesized or altered.

The regional map is 1800×1020; the sensor comparison maps are 860×390. Interface excerpts retain PNG text and are displayed with margins. The timeline and two sensor columns are shown on slide 5; the slide 3 key is native text with the app's exact sensor colours.

`prepare-assets.mjs` resizes raw local captures. `prepare-focus.mjs` crops the committed full geometry and weather panels to readable excerpts and records their hashes. `capture-scenes.mjs` is an explicit live refresh and changes the evidence. Ordinary builds use only the frozen assets.

## Build

Use the already managed runtime; no dependency or font installation is required.

```sh
export RUNTIME_NODE_MODULES=/absolute/path/to/managed/runtime/dependencies/node/node_modules
export RUNTIME_PYTHON=/absolute/path/to/managed/runtime/dependencies/python/bin/python
export PRESENTATIONS_SKILL=/absolute/path/to/presentations/skills/presentations
export DECK_VERSION=complete-r15
/absolute/path/to/node submission/presentation/build.mjs
/absolute/path/to/node submission/presentation/verify.mjs
```

Leave `DECK_SCOPE` unset for all seven slides. Use a fresh version for every finalized export. Edit the source copy and layout, then rebuild both files; manual PowerPoint changes are not propagated into the PDF.

The PDF contains vector text and shapes, embedded Unicode TrueType fonts and native URI links. PPTX contains editable text, native diagrams, two native charts and their embedded workbooks. Fonts are supplied separately rather than embedded in PPTX; PowerPoint may substitute Overpass. Use the PDF when a stable appearance is required.

## Remaining inputs

There are no name, image, numerical or link placeholders in the deck. The broader submission still needs its final public video URL and the submitted app commit or tag. The project-description Materials block still contains a PDF-link placeholder; use [this published PDF URL](https://github.com/avbelkin/nasa-space-apps-sg/blob/main/submission/presentation/earth-fire-calendar.pdf). These are outside the slide build; the deck requires no additional user-supplied data.

## Submission format

The official [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/#tips-for-creating-a-project-demo), dated 13 November 2026 and retrieved again on 15 November, requires a publicly accessible slide deck with no more than seven English-language slides. It does not require PPTX or an editable format. PDF suitability is an inference from these format-neutral requirements, not an explicit list of permitted extensions. Documents cannot be uploaded directly to Space Apps; the guide explicitly permits links to files hosted in GitHub or a cloud service, without sign-in or access requests.

No LLM API provider/model/processing route is used; measured LLM API cost is $0. The work uses the primary Codex session and one independent Codex reviewer. Subscription allowance consumption is unavailable.
