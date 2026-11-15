# Earth Fire Calendar: third-party materials, licences and credits

Team **Plush** — Alexey Belkin, Viktoriia Naiman. This document accompanies the References field of the submission. It names every third-party source the project uses, what it is used for, and the licence or terms under which it is used.

## Our own work

The team's original code, documentation and media are released under the [Apache License 2.0](../../LICENSE), an OSI-approved licence. The [NOTICE](../../NOTICE) file excludes the third-party materials below from that grant; they keep their own licences.

## NASA data

| Source | Use in the project | Licence / terms |
|---|---|---|
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) — MODIS_NRT, VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT | Live detections, counters, timelines, model inputs | NASA open data, no restrictions on reuse; credit NASA FIRMS |
| [NASA GIBS](https://earthdata.nasa.gov/gibs) — GPM IMERG precipitation rate (30 min) and its colour map | Precipitation layer | NASA open data; credit NASA GIBS and GPM IMERG |
| NASA GIBS — VIIRS NOAA-20 Black Marble | Night lights | NASA open data; credit NASA GIBS and NASA / NOAA Black Marble |
| MODIS and VIIRS algorithm documentation (Giglio et al. 2016; Schroeder et al., VIIRS 375 m ATBD) | Sensor parameters, view and glint angle definitions | Cited publications; only factual parameters are used |

## Partner space agency data

| Source | Use in the project | Licence / terms |
|---|---|---|
| ESA Climate Change Initiative Land Cover / Copernicus C3S land cover v2.1.1, year 2019 ([DOI](https://doi.org/10.24381/cds.006f2c9a)), Cloud Optimized GeoTIFFs hosted by Microsoft Planetary Computer | Land cover inside each detection's footprint | [ESA CCI Land Cover licence](https://ecds.ecmwf.int/licences/satellite-land-cover): free use with attribution. Credit: ESA Climate Change Initiative Land Cover led by UCLouvain; Copernicus Climate Change Service |
| ESA Hipparcos catalogue and the Yale Bright Star Catalogue | Positions of about 230 bright stars in the globe's background; fainter stars are generated procedurally | Public astronomical catalogues; star positions are factual data |
| Copernicus Sentinel-2 via EOxCloudless 2016 by EOX IT Services GmbH, layer `s2cloudless_3857` | Earth basemap | **CC BY 4.0** ([EOX licence page](https://cloudless.eox.at/license-non-commercial/)). Credit: EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017) |

The current video review also retains the earlier desk footage and a derived generated desk background, whose physical monitor shows **EOxCloudless 2025, CC BY-NC-SA 4.0**. This is distinct from the new live-app screen recordings. The older monitor imagery remains a publication review item; successful rendering is not a rights-clearance verdict.

## Other data

| Source | Use in the project | Licence / terms |
|---|---|---|
| [CelesTrak](https://celestrak.org/) GP / TLE orbital elements for Terra, Aqua, NOAA-20, NOAA-21 | Satellite tracks, swaths, estimated viewing geometry, passes without a detection | Public orbital data published under the [CelesTrak usage policy](https://celestrak.org/usage-policy.php); orbital elements are factual data |
| NOAA GFS (NOMADS and NOAA open data on AWS / Google Cloud) | Weather at acquisition | US Government work, public domain; credit NOAA / NCEP |
| NOAA GOES-R ABI and GLM (NOAA open data on AWS) | Brightness temperature, cloud, smoke, lightning | US Government work, public domain; credit NOAA |
| NOAA nowCOAST radar mosaic and Global Mosaic of Geostationary Satellite Imagery (GMGSI) | Radar and satellite samples | NOAA public products; credit NOAA nowCOAST |
| NOAA Climate Prediction Center — NLDAS Noah soil-moisture anomalies | Soil moisture (North America) | US Government work, public domain; credit NOAA CPC |
| [Open-Meteo](https://open-meteo.com/en/terms) forecast and air-quality APIs, including Copernicus CAMS aerosols | Weather codes, precipitation, aerosols | Data **CC BY 4.0**; credit Open-Meteo and Copernicus CAMS |
| [Copernicus GWIS](https://gwis.jrc.ec.europa.eu/about-gwis/data-license) (European Commission JRC) | Fire Weather Index, danger class, fuel-moisture and drought codes | **CC BY 4.0**; credit European Commission JRC, Copernicus GWIS |
| [Copernicus Global Drought Observatory soil-moisture anomaly](https://data.jrc.ec.europa.eu/dataset/4ce9599e-b3e1-406d-a87b-b98b814565da) | Soil-moisture anomaly class | **CC BY 4.0**; credit European Commission JRC, Copernicus GDO |
| [US Forest Service WFAS](https://www.wfas.net/) | Dead-fuel moisture (contiguous United States) | US Government work, public domain; credit USDA Forest Service WFAS |
| [Extremum SAR GIS](https://gis.extremum.org) satellite cloud tiles, built from EUMETSAT, NOAA and JMA geostationary imagery and NASA / NOAA VIIRS imagery | Optional cloud layer | Used with Extremum's permission; credited in the app as Extremum SAR GIS with its underlying imagery sources |

## Software and fonts

All UI dependencies and the direct backend references are listed with their licences in the [software inventory](software-licenses.md); every licence there is OSI-approved (MIT, Apache-2.0, BSD-2/3-Clause, ISC, 0BSD, MPL-2.0). Their licence and notice texts are published with the app in [`third-party-notices.txt`](../../ui/public/third-party-notices.txt). Main components: MapLibre GL JS (BSD-3-Clause), React, Vite, oxlint, .NET / ASP.NET Core, PureHDF (MIT), TypeScript, xUnit (Apache-2.0).

Presentation fonts Overpass and Fira Sans: **SIL Open Font License 1.1**, licence texts in `submission/presentation/assets/fonts/`.

## AI-generated media in the demo

| Asset | Tool | Terms |
|---|---|---|
| Lama character design, from the team's own photograph of their plush alpaca | OpenAI ChatGPT image generation | [OpenAI terms of use](https://openai.com/policies/row-terms-of-use/): output belongs to the user |
| Lama animation | Google Veo 3.1 Lite via OpenRouter (paid) | [OpenRouter terms](https://openrouter.ai/terms) and the model provider's terms; the generated character carries a visible `AI-generated` label |
| English narration | ElevenLabs Eleven v4 via OpenRouter (paid), voice "Flicker" from the ElevenLabs Voice Library | [ElevenLabs terms of use](https://elevenlabs.io/terms-of-use); disclosed in the video description and file metadata |

Live-action footage and app screen recordings are the team's own. The jump also uses an AI-edited photographic toy cutout and a generated empty desk background, both disclosed in the video metadata and description. The demo uses no music.

## Literature

The [literature review](modis-viirs-harmonization-literature-review.md) cites 82 publications, datasets and repositories. They are cited, not redistributed; each keeps its own copyright.

## NASA brand and endorsement

No NASA insignia, logotype, seal or mission emblem is used. Independent project built for the 2026 NASA Space Apps Challenge; not affiliated with or endorsed by NASA. Model estimates in the app are produced by Earth Fire Calendar's own statistical models, not by NASA; NASA has not reviewed them and is not responsible for their accuracy.
