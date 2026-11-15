# Earth Fire Calendar: third-party materials, licences and credits

Team **Plush** — Alexey Belkin, Viktoriia Naiman. Checked against repository commit `7bbe91a` on 15 November 2026. This document accompanies the References field of the submission. It names the third-party data, media, methods, software and fonts used by the app and the submission materials, with their uses and licence or service terms.

## Our own work

The team's original code and documentation are released under the [Apache License 2.0](../../LICENSE), an OSI-approved licence. The [NOTICE](../../NOTICE) file excludes third-party data, imagery, software, fonts and generated media from that grant; they keep their own terms. A screen capture includes the licences of the data and imagery it displays.

## NASA data

| Source | Use in the project | Licence / terms |
|---|---|---|
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) — MODIS_NRT, VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT | Live detections, counters, timelines, surface-class counts, raw exports, model inputs | Public NASA Earth-science data; credit NASA FIRMS and the source instruments. The upstream API requires the team's server-side MAP_KEY; the public app does not require a user key |
| [NASA GIBS](https://earthdata.nasa.gov/gibs) — GPM IMERG precipitation rate (30 min) and its colour map | Precipitation layer | NASA open data; credit NASA GIBS and GPM IMERG |
| NASA GIBS — VIIRS NOAA-20 Black Marble | Night lights | NASA open data; credit NASA GIBS and NASA / NOAA Black Marble |
| NASA / NOAA VIIRS imagery from NASA GIBS, blended into Extremum tiles | High-latitude portion of the cloud layer | Credit NASA GIBS / Earthdata and NASA / NOAA VIIRS alongside Extremum; the app receives the blended tiles rather than requesting these VIIRS images directly |
| MODIS and VIIRS algorithm documentation (Giglio et al. 2016; Schroeder et al., VIIRS 375 m ATBD) | Sensor parameters, view and glint angle definitions | Cited publications; only factual parameters are used |

## Partner space agency data

| Source | Use in the project | Licence / terms |
|---|---|---|
| ESA Climate Change Initiative Land Cover / Copernicus C3S land cover v2.1.1, year 2019 ([DOI](https://doi.org/10.24381/cds.006f2c9a)), Cloud Optimized GeoTIFFs hosted by Microsoft Planetary Computer | Land cover inside each detection's footprint | [ESA CCI Land Cover licence](https://ecds.ecmwf.int/licences/satellite-land-cover): free use with attribution. Credit: ESA Climate Change Initiative Land Cover led by UCLouvain; Copernicus Climate Change Service |
| ESA Hipparcos catalogue and the Yale Bright Star Catalogue | Positions of about 230 bright stars in the globe's background; fainter stars are generated procedurally | Public astronomical catalogues; star positions are factual data |
| Copernicus Sentinel-2 via EOxCloudless 2016 by EOX IT Services GmbH, layer `s2cloudless_3857` | Earth basemap | **CC BY 4.0** ([EOX licence page](https://cloudless.eox.at/license-non-commercial/)). Credit: EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017) |

The app and the seven-slide PDF use the EOxCloudless 2016 layer.

## Other data

| Source | Use in the project | Licence / terms |
|---|---|---|
| [CelesTrak](https://celestrak.org/) GP / TLE orbital elements for Terra, Aqua, NOAA-20, NOAA-21 | Satellite tracks, swaths, estimated viewing geometry, passes without a detection | Public orbital data published under the [CelesTrak usage policy](https://celestrak.org/usage-policy.php); orbital elements are factual data |
| NOAA GFS (NOMADS and NOAA open data on AWS / Google Cloud) | Weather at acquisition | US Government work, public domain; credit NOAA / NCEP |
| NOAA GOES-R ABI and GLM (NOAA open data on AWS) | Brightness temperature, cloud, smoke, lightning | US Government work, public domain; credit NOAA |
| NOAA nowCOAST radar mosaic and Global Mosaic of Geostationary Satellite Imagery (GMGSI) | Radar and satellite samples | NOAA public products; credit NOAA nowCOAST |
| NOAA Climate Prediction Center — NLDAS Noah soil-moisture anomalies | Soil moisture (North America) | US Government work, public domain; credit NOAA CPC |
| [Open-Meteo](https://open-meteo.com/en/terms) forecast and air-quality APIs, including Copernicus CAMS aerosols | Weather codes, precipitation, aerosols | Data **CC BY 4.0**; credit Open-Meteo and Copernicus CAMS. Accessed through Open-Meteo's free API, which is offered for non-commercial use |
| [Copernicus GWIS](https://gwis.jrc.ec.europa.eu/about-gwis/data-license) (European Commission JRC) | Fire Weather Index, danger class, fuel-moisture and drought codes | **CC BY 4.0**; credit European Commission JRC, Copernicus GWIS |
| [Copernicus Global Drought Observatory soil-moisture anomaly](https://data.jrc.ec.europa.eu/dataset/4ce9599e-b3e1-406d-a87b-b98b814565da) | Soil-moisture anomaly class | **CC BY 4.0**; credit European Commission JRC, Copernicus GDO |
| [US Forest Service WFAS](https://www.wfas.net/) | Dead-fuel moisture (contiguous United States) | US Government work, public domain; credit USDA Forest Service WFAS |
| [Extremum SAR GIS](https://gis.extremum.org) satellite cloud tiles, built from EUMETSAT, NOAA and JMA geostationary imagery and NASA / NOAA VIIRS imagery | Optional cloud layer | Used with Extremum's permission; credited in the app as Extremum SAR GIS with its underlying imagery sources |

## Software and fonts

All 122 locked UI package entries and the direct backend references are listed with their licences in the [software inventory](software-licenses.md); the software licence identifiers in those tables are OSI-approved (MIT, Apache-2.0, BSD-2/3-Clause, ISC, 0BSD, MPL-2.0). Licence and notice texts for the installed UI packages are published with the app in [`third-party-notices.txt`](../../ui/public/third-party-notices.txt); optional platform packages are inventoried but are not all installed or reproduced in that file. Main components: MapLibre GL JS (BSD-3-Clause), React, Vite, oxlint, .NET / ASP.NET Core, PureHDF (MIT), TypeScript, xUnit (Apache-2.0).

Presentation fonts Overpass and Fira Sans: **SIL Open Font License 1.1**, licence texts in `submission/presentation/assets/fonts/`.

## AI-generated media in the demo

| Asset | Tool | Terms |
|---|---|---|
| Lama character design and edited photographic cutout, from the team's own photograph of their plush alpaca | OpenAI ChatGPT image generation | [OpenAI terms of use](https://openai.com/policies/row-terms-of-use/): output belongs to the user; the input photograph is the team's own |
| Character motion and reconstructed desk background | Google Veo 3.1 Lite via OpenRouter (paid), composited locally | [OpenRouter terms](https://openrouter.ai/terms) and the model provider's terms; the animated character carries a visible `AI-generated` label |
| English narration | ElevenLabs Eleven v4 via OpenRouter (paid), Voice Library voice "Flicker - Cheerful Fairy & Sparkly Sweetness"; loudness normalized, no pitch or tempo shift | [ElevenLabs terms of use](https://elevenlabs.io/terms-of-use); disclosed in the video description and file metadata |
| Narration check and caption timings | ElevenLabs Scribe v2 via OpenRouter (paid), speech-to-text | [ElevenLabs terms of use](https://elevenlabs.io/terms-of-use); the captions keep the team's own wording |

Live-action footage, app recordings and screenshots are the team's own real captures; the desk background behind the animated character is generated. The video uses no music.

## Methods used in the code

The Sun-position calculation cites the [US Naval Observatory approximate solar coordinates](https://aa.usno.navy.mil/faq/sun_approx); the Moon calculation cites Van Flandern and Pulkkinen (1979), *Low-Precision Formulae for Planetary Positions*, [DOI: 10.1086/190623](https://doi.org/10.1086/190623). The project implements approximate calculations and cites the methods; it does not redistribute the publications. MODIS and VIIRS algorithm references and the GPM precipitation colour scale are listed above.

## Literature

The [literature review](modis-viirs-harmonization-literature-review.md) cites 82 publications, datasets and repositories. They are cited, not redistributed; each keeps its own copyright.

## NASA brand and endorsement

The app and public slide deck use no NASA insignia, logotype, seal or mission emblem. Independent project built for the 2026 NASA Space Apps Challenge; not affiliated with or endorsed by NASA. Model estimates in the app are produced by Earth Fire Calendar's own statistical models, not by NASA; NASA has not reviewed them and is not responsible for their accuracy.
