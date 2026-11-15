# Official assets

Official third-party brand material reused across the video, the presentation and the documents: logos, colours, fonts and patterns. Nothing we made belongs here; our own images, footage and data live next to the material that uses them (see the [folder rules](../README.md)).

## `space-apps-brand/`

Official NASA Space Apps brand elements, taken from <https://www.spaceappschallenge.org/brand/> (retrieved 2026-11-14). The full 20-page brand guide is not stored here (31 MB): <https://assets.spaceappschallenge.org/media/documents/Space_Apps_Brand_Guide_VUGpVJm.pdf>.

- `logos/` — the 2026 logo set in SVG, PNG and PDF (files renamed to kebab-case, contents untouched)
- `patterns/` — six background patterns, 2360 × 2360 transparent PNG
- `reference/` — the brand page's own illustrations of the palette, gradient, logo variants and patterns
- `palette.json`, `palette.css` — the palette, gradient and fonts in machine-readable form

### Logos

| File prefix | Use |
|---|---|
| `space-apps-logo-color-and-black`, `-color-and-white`, `-black` | Default logo — the preferred option; black text for light backgrounds, white text for dark ones |
| `…-motif` | Circular logo for space-limited layouts |
| `space-apps-black-small-logo`, `space-apps-white-small-logo` | Starburst mark without words, for the smallest sizes |

### Colours

| Name | HEX | Pantone |
|---|---|---|
| Blue Yonder | `#2E96F5` | |
| Neon Blue | `#0960E1` | |
| Electric Blue | `#0042A6` | PMS 2146 C |
| Deep Blue | `#07173F` | PMS 295 C |
| Rocket Red | `#E43700` | PMS Bright Red C |
| Martian Red | `#8E1100` | |
| Neon Yellow | `#EAFE07` | PMS Neon 387 |
| White | `#FFFFFF` | |

- The red inside the official logo files is `#DB240B`, not the palette's Rocket Red; use the logo files as they are and do not recolour them.
- Body text goes only on Deep Blue, Electric Blue or White.
- Neon Yellow is an accent for text, buttons and symbols, never a background; use it sparingly.
- Rocket Red is not a background colour.
- Colour combinations must reach a contrast ratio of at least 4.5:1.
- Background gradient: linear, from Electric Blue at the top left to Deep Blue at the bottom right, ideally at 45°, with a smooth transition across the whole field.

### Fonts

Both families are free (SIL OFL) and available on Google Fonts. The presentation's selected font files and licences are stored in [`../presentation/assets/fonts/`](../presentation/assets/fonts/), without system installation.

- Titles and headings: Fira Sans Black, Fira Sans Bold, Overpass Bold, Overpass Regular
- Body copy: Overpass Regular, Overpass Bold, Overpass Italic
- Sources: [Fira Sans](https://github.com/bBoxType/FiraSans/tree/master/Fira_Sans_4_3/Fonts/Fira_Sans_OTF_4301/Normal), [Overpass](https://github.com/RedHatOfficial/Overpass/tree/master/fonts/otf)

### Patterns and icons

- Patterns (`code`, `fiduciaries`, `orbits`, `rosette`, `voronoi`, `waves`) are screened back to roughly 25% opacity over a brand colour, preferably a blue.
- Icons: Phosphor or Feather style, and only where the meaning is unambiguous; otherwise prefer a text label.

## What is deliberately not here

- **NASA Insignia ("meatball"), Logotype ("worm") and Seal** — allowed only with explicit NASA permission, so they must not appear in the video or the slides. Factual attribution of NASA data in text is fine.
- **NASA Data Insignia ("Data at Work")** — requires prior approval from NASA's Office of Communications.
- AI-generated content must not use, contain or modify NASA branding or design elements.
