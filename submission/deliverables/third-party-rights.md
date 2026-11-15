# Earth Fire Calendar: third-party rights, licences and credits

This document accompanies the submission's References field. Audit date: 15 November 2026. Team: **Plush** — **Alexey Belkin** and **Viktoriia Naiman**. It distinguishes verified terms from unresolved permissions; it is not a statement that the submission has passed every rights requirement.

## How the licences fit together

The original project contributions are released under [Apache License 2.0](../../LICENSE), an OSI-approved licence. The [NOTICE](../../NOTICE) excludes third-party materials from that grant. Apache-2.0 permits use, modification and redistribution, including commercial use, subject to its notice and other conditions. It does not transfer ownership of NASA data, imagery, fonts, voices or trademarks to the team.

A public URL is not a licence. A source credit identifies an author; a licence supplies permission and conditions. An AI watermark identifies generation; it does not supply redistribution permission. Buying a physical toy does not establish ownership of its visual design or scarf artwork. A paid API request is evidence of purchase, not the complete output-use agreement.

For this submission the participant rules require both identification of third-party licences and sufficient rights to submit and redistribute the materials. Their separate rule for non-partner third-party materials is stricter than merely allowing educational use. CC BY permits commercial reuse with attribution; CC BY-NC-SA restricts commercial reuse and imposes share-alike conditions. Neither licence is an OSI software licence: the unrestricted-material route in the participant terms is the relevant interpretation for CC BY data. This is the audit's reading of the frozen requirements, not an organizer ruling.

## NASA data and scientific parameters

| Resource | Actual use | Permission and credit |
|---|---|---|
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) MODIS_NRT, VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT | Live detections, attributes, counters, timelines and model inputs | NASA Earth-science open data; credit NASA FIRMS and the underlying MODIS / VIIRS products. API access and a MAP_KEY are service conditions, not a proprietary licence on the team's code. No raw API credentials are submitted |
| [NASA GIBS](https://earthdata.nasa.gov/gibs) IMERG_Precipitation_Rate_30min | Precipitation tiles and a port of the published colour map | NASA open data; credit NASA GIBS and GPM IMERG, identify resampling / display interpolation |
| NASA GIBS VIIRS NOAA-20 Black Marble | Night lights | NASA open data; credit NASA GIBS, NASA / NOAA VIIRS Black Marble; display masking and rendering are the team's |
| NASA MODIS / VIIRS algorithm documentation | Sensor parameters, viewing-angle and glint definitions | Cited scientific documentation; factual parameters and original implementation are distinguished from copied software or figures |

[NASA's media guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/) does not grant rights to third-party works merely hosted by NASA. No blanket public-domain claim is made for all NASA-site content. NASA logos, insignia, mission emblems and endorsement rights are not granted by using datasets. Model estimates are Earth Fire Calendar outputs; NASA has not reviewed or validated them and is not responsible for their accuracy.

## Basemap and map captures

**Corrected live source:** EOxCloudless 2016, layer `s2cloudless_3857`, licensed **CC BY 4.0**. [EOX's year-specific terms](https://cloudless.eox.at/license-non-commercial/) explicitly distinguish 2016 from 2018–2025. The [WMTS capabilities](https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml) identify `s2cloudless_3857` as the 2016 layer and name CC BY 4.0; a sample tile returned JPEG successfully during the audit. There is no `s2cloudless-2016_3857` endpoint in the advertised capabilities.

Use this credit, visibly near imagery and linked in online publications:

> EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017), CC BY 4.0.

Cropping, resampling and overlaying detections are modifications. This is historical background imagery; the fire detections have their own acquisition dates. The visual source does not establish current land conditions.

**Unresolved for existing exports:** presentation evidence images, the old complete r6 PDF, the two-slide previews and the Lama pilot were captured before the switch and contain **EOX 2025 / CC BY-NC-SA 4.0**. They are not converted to CC BY by changing the live URL or changing a caption. Recapture them on the corrected app before final publication, rebuild the deck and video, and retain source timestamps and hashes. Until that happens these outputs remain blocked under the audit's reading of the submission rules. Do not relabel old imagery as 2016.

## Other data

| Resource | Role | Verified terms / remaining gap |
|---|---|---|
| [ESA CCI / C3S 2019 land cover](https://doi.org/10.24381/cds.006f2c9a), v2.1.1, via Microsoft Planetary Computer | Land cover sampled over detection footprints | **ESA CCI Land Cover licence**, not a verified CC BY grant. The [ESA licence](https://ecds.ecmwf.int/licences/satellite-land-cover) permits educational/scientific use with credit and specifies conditions for publications and advertising. The [actual COG collection](https://planetarycomputer.microsoft.com/api/stac/v1/collections/esa-cci-lc) declares `license: proprietary`; that field alone does not mean all research use is prohibited. ESA is a partner agency, so its terms must be assessed under the partner-data route. Confirm which C3S/ESA terms cover the exact 2019 COG and NASA redistribution before declaring this cleared. Credit ESA CCI Land Cover led by UCLouvain, Copernicus C3S and Microsoft as host/processor; sampling and overview aggregation are modifications |
| [CelesTrak GP / TLE](https://celestrak.org/NORAD/elements/) | Orbit tracks, swaths, inferred passes, fallback elements | Publicly available GP data under [CelesTrak usage policy](https://celestrak.org/usage-policy.php). This is an access policy, not an identified OSI or CC licence. No unrestricted redistribution grant was established by the reviewed page; retain as **unresolved** rather than invent a licence. Cache and fetch no more often than source updates; policy says GP updates once per two hours |
| Bright Star / Hipparcos curated coordinates | Bright-star background; additional faint stars are procedural | Source comments name two catalogues without exact edition, extraction history or terms. **Unresolved provenance.** ESA's status as a partner does not automatically cover the Yale catalogue or a third party's compiled table. Identify the actual source and permission, replace it with a documented open source, or remove the curated table from the submitted version |
| NOAA GFS via NOMADS / public cloud mirrors | Weather model fields | US Government-produced data, public domain under US law, subject to product-specific third-party notices. [NOAA reuse guidance](https://oceanservice.noaa.gov/about/faq.html). Credit NOAA/NCEP GFS; mirrors do not become data owners. Local tiling and sampling are modifications |
| NOAA GOES-R ABI / GLM | Temperature, cloud, smoke and lightning | US Government-produced NOAA products; same public-domain basis and product-notice qualification. Credit NOAA GOES-R ABI / GLM, retain product names, units and scan times |
| NOAA CPC NLDAS Noah anomalies | Weekly soil moisture | US Government-produced NOAA products; same basis. Credit NOAA CPC / NLDAS Noah and identify depth summation and point sampling |
| NOAA nowCOAST radar and GMGSI satellite mosaic | Observational context | NOAA-produced products use the public-domain basis above, **but a global mosaic can include non-US imagery**. An unrestricted grant for every actual mosaic constituent was not verified. Confirm native product provenance; do not extend NOAA's public-domain status to JMA / EUMETSAT content |
| [Open-Meteo](https://open-meteo.com/en/terms) forecast and air quality | Supplemental weather and pollutant series | **Data: CC BY 4.0. Hosted free API: non-commercial use with request limits.** These are different permissions. Credit Open-Meteo and the actual underlying models, including CAMS for air quality where used. Record actual model selection before freezing References; do not claim that the hosted service itself has unrestricted terms |
| [Copernicus GWIS](https://gwis.jrc.ec.europa.eu/about-gwis/data-license) | FWI, danger class, fuel-moisture / drought codes and modelled lightning | EU-owned site content: **CC BY 4.0**, unless separately indicated; appropriate credit and changes required. Third-party products require their own terms. Confirm the actual forecast-product metadata; identify European Commission JRC / Copernicus GWIS and the underlying ECMWF product where applicable |
| [Copernicus GDO soil-moisture anomaly](https://data.jrc.ec.europa.eu/dataset/4ce9599e-b3e1-406d-a87b-b98b814565da) | Drought context | Dataset's download entries explicitly state **CC BY 4.0**, with no access limitations. Credit European Commission JRC, product version and actual period. The live catalogue now describes v3.0.1 and a 1995–2024 baseline; the code/documentation mention an older baseline. Do not silently treat a changed catalogue as proof of the exact deployed raster version |
| [US Forest Service WFAS](https://www.wfas.net/) | Dead-fuel moisture rasters | Site identifies US Forest Service production. US federal-work public-domain basis is plausible, but an explicit product-level permission / third-party exclusion for the actual rasters was not retrieved: **unresolved verification**, not a verified named proprietary licence. Credit USFS WFAS; retain observed/forecast status and validity date |
| [Extremum SAR GIS](https://gis.extremum.org) and EUMETSAT / NOAA / JMA / NASA imagery | Proxied cloud tiles | **Unresolved redistribution terms for the composite and constituent imagery.** A public endpoint and existing credit do not provide a licence. Partner status cannot be assumed for EUMETSAT or JMA from ESA / JAXA membership. Obtain the terms for the exact composite, replace it with documented permitted imagery, or omit that layer and its captures from the final submission |

## Software, fonts and build tools

The [complete UI lockfile inventory](software-licenses.md) lists 122 entries and the direct .NET / test references. All UI entries have declared licences, including transitive MPL-2.0, ISC and 0BSD components missing from the earlier short list. The [website notice bundle](../../ui/public/third-party-notices.txt) preserves installed dependency notices. A declared licence does not erase upstream copyright notices.

Presentation fonts **Overpass** and **Fira Sans** are under **SIL OFL 1.1**; their actual licence texts and source/hash manifest are bundled in `submission/presentation/assets/fonts/`. OFL is a font licence, not an OSI software licence; it permits embedding and redistribution under its conditions. Do not describe a PDF as proprietary solely because a proprietary tool generated it. Build-tool licences are distinguished from asset/output permissions.

**Remaining coverage limit:** a verified resolved transitive .NET inventory is missing; collect it from the existing build environment before claiming complete software-licence coverage. No new packages or SDKs were installed for this audit.

## Video, generated assets and people

| Asset | Provenance | Rights status / action |
|---|---|---|
| Original live footage and plush photograph | Team-selected source material | Confirm the photographer / camera operator's publication rights as well as written consent for every identifiable adult. Team membership is not the written-consent record. Keep consents private |
| Lama character image | OpenAI ChatGPT image tool; exact model undisclosed | [OpenAI consumer terms](https://openai.com/policies/row-terms-of-use/) assign output rights between user and OpenAI to the extent permitted by law, subject to rights in inputs and third-party output. The photograph, toy design and scarf remain separate checks. Do not invent exclusive copyright in purely generated output |
| Lama animation | Google Veo 3.1 Lite via OpenRouter | [OpenRouter terms](https://openrouter.ai/terms), §§5 and 6.1, defer output ownership to the exact model's terms. Preserve the model/provider terms linked for the actual generation; unrestricted redistribution has not been established by the receipt alone. Visible `AI-generated` watermark required throughout generated appearance |
| English synthetic narration | ElevenLabs Eleven v4, Charlie through OpenRouter in the inspected pilot; locally shifted +3 semitones | This was an OpenRouter purchase, not evidence of a direct ElevenLabs free-tier account. The [official integration](https://openrouter.ai/blog/announcements/elevenlabs-on-openrouter/) says no separate ElevenLabs plan is needed and describes premade voices. [ElevenLabs terms](https://elevenlabs.io/terms-of-use), §4(c), retain output rights, while §1(c) distinguishes free and paid use and supplemental terms may apply. Preserve the actual route's model terms, voice selection and receipt. No proof of disallowed cloning was found; complete permission for NASA/public redistribution through this route remains unverified. Disclosure in description **and** metadata required |
| Music | None planned | Do not add an unlicensed track. A short excerpt or a non-commercial purpose does not automatically clear it |
| Social preview illustration | Earlier `og-preview.png` had no provenance and overstated harmonization | Must be removed or replaced with a documented original / permitted asset. A caption alone cannot prove rights in the older illustration |
| NASA / Space Apps logos | Official reference kit stored separately | No NASA insignia or Space Apps logo is used in the inspected deck pages or Lama pilot frame. Storage of an official kit is not blanket permission to redistribute it as original work. Never put NASA marks into generated art |

The word “childlike” describes a fictional alpaca's performance, not evidence that a real minor appears. The prohibition concerns identifiable real minors, including names and voices. Review the actual final edit; neither a script nor one sampled frame establishes full coverage.

## Research text and citations

The literature review contains 82 numbered bibliography entries. It cites findings in prose and equations rather than bundling the papers, their full text or their figures. Those external works retain publisher/author rights; listing a DOI does not relicense a paper under Apache-2.0. Do not upload third-party PDFs as the team's deliverables without verified permission. A lack of open-access status does not by itself prohibit citing a paper. The compliance audit checks citation coverage and distribution boundaries, not a fresh scientific validation of every numerical claim against all 82 originals.

## Release decision

**Not yet cleared for final submission.** The corrected basemap, project licence, dependency inventory and disclosures resolve concrete gaps. Outstanding permissions are explicitly identified above; no unresolved item has been marked compliant merely because it was listed. The [internal compliance audit](../working/submission-compliance-audit.md) records the remaining release gates and checks against each formal requirement.
