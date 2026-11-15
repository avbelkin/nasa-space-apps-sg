# Earth Fire Calendar: design notes for the harmonized calendar

Companion to the [literature review](../deliverables/modis-viirs-harmonization-literature-review.md). The review covers what is published; these notes record what the challenge asks for, what the FIRMS data can and cannot support, and the design decisions that follow for the harmonized record and the calendar.

**Status.** Nothing in sections 3, 5 and 6 is implemented. Metrics, reference scale and calibration method are candidates until they pass the validation in [section 5](#5-validation). Statements about the prototype in [section 4](#4-prototype-against-these-notes) were made at commit `82f1a17` (15 November 2026); all rows were re-checked at `2d3f5df`. Since `82f1a17` the app has gained first baselines fitted on one 24-hour snapshot (unmatched predicted passes and FRP difference between passes), described in [doc/architecture-and-harmonization.md](../../doc/architecture-and-harmonization.md). They are not the calibration discussed here.

## 1. What the challenge asks for

From the [challenge page](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/):

| Element of the brief | Consequence for the design |
|---|---|
| A harmonized burning activity calendar in a web application, "showing the number of hotspots detected from the early 2000s to the present" | A multi-year record, with a year axis, on one scale across MODIS and VIIRS |
| After harmonization "the sensor of origin no longer matters" | A declared reference scale and evidence that the join does not create a step |
| A user can "select a region and a specific date range, then download analytics and visualizations" | Arbitrary area and period, not a fixed list of places or whole months only |
| Which periods of the year see more fires, which years had more activity, how the current month compares with the historical median | Year × month view; baseline with median, spread and number of years |
| "A downloadable CSV file of hot spots detected during a search" | Export of the source detections, separate from the analytical series |
| Accessible colour ramps; optionally a drawn area or latitude and longitude input | Meaning never carried by hue alone |

The brief names early-warning and emergency responders, scientists, land managers and firefighters as the audience. A historical hotspot record answers "when does this area usually burn" and "is this period unusual". It does not give tomorrow's fire risk, the cause of a fire or smoke exposure.

## 2. What the FIRMS data provides

**Archive coverage**, as shown by the [FIRMS archive download form](https://firms.modaps.eosdis.nasa.gov/download/) in November 2026:

| Dataset | Coverage |
|---|---|
| MODIS Collection 6.1 (Terra, Aqua) | 1 November 2000 – present |
| VIIRS Suomi NPP, 375 m | 20 January 2012 – 2 November 2026 |
| VIIRS NOAA-20, 375 m | 1 April 2018 – present |
| VIIRS NOAA-21, 375 m | 1 March 2023 – present |

- Suomi NPP data distribution ended on 2 November 2026 ([NOAA notice](https://www.nesdis.noaa.gov/news/update-4-cessation-of-suomi-national-polar-orbiting-partnership-s-npp-data-users-november-02-2026-1540-utc-and-decommissioning-issued-november-2-2026-1800-utc)). No single satellite pair spans the whole record.
- The archive is delivered on request as CSV, JSON or Shapefile. Near-real-time (NRT) records are replaced by standard products after about five months.
- The [Area API](https://firms.modaps.eosdis.nasa.gov/api/area/) returns 1–5 days per request. Twenty-five years cannot be assembled during an interactive request: history has to be precomputed from the archive.
- The [missing-data table](https://firms.modaps.eosdis.nasa.gov/api/missing_data/) lists gaps in the FIRMS database by satellite and data type. It is not a record of cloud cover, and absence from the table does not prove normal coverage: check each satellite's daily count against adjacent days and the other platforms before reading a low count as low activity.
- A FIRMS table holds positive detections only. Cloud, water and unprocessed pixels are in the swath-level products: the VIIRS Level 2 fire mask and QA layers ([VIIRS user guide](https://www.earthdata.nasa.gov/s3fs-public/2025-06/VIIRS_C2_AF-375m_User_Guide_1.2.pdf), section 3.1).

**Record fields that matter for harmonization:**

| Field | Note |
|---|---|
| `latitude`, `longitude` | Centre of the pixel, not the position of a fire |
| `acq_date`, `acq_time` | UTC |
| `satellite` | The unit of observation effort: each added satellite adds chances to detect |
| `scan`, `track` | Actual pixel size; it grows toward the swath edge |
| `confidence` | MODIS: 0–100. VIIRS: low, nominal, high. Not interchangeable |
| `frp` | Fire radiative power in MW: instantaneous, per pixel |
| `daynight` | Day and night differ in sensitivity for both sensors |
| `version` | Collection and processing stream (NRT or standard) |
| `type` | Inferred source type; see below |

**Confidence.** The MODIS guide groups its 0–100 value into low (below 30), nominal (30 to below 80) and high (80 and above) ([MODIS user guide](https://earthdata.nasa.gov/s3fs-public/2023-09/MODIS_C6_C6.1_Fire_User_Guide_1.0.pdf)). VIIRS supplies the class directly. The same class name does not mean the same reliability, so a filter needs a documented rule per product, not one threshold.

**Source type.** The MODIS guide defines `type` 0 as presumed vegetation fire, 1 as active volcano, 2 as other static land source (repeatedly detected on 16 or more days in a calendar year, or in an urban area) and 3 as offshore. The field is part of the standard products; its presence has to be checked for each download, and the near-real-time feed the prototype reads does not carry it.

**Limits of single detections.**

- *Displaced night detections near large fires.* The VIIRS guide (FAQ) describes cases where the 375 m product detected part of a tall, hot plume together with the surface fire: at night, over very large fires with explosive growth, at high scan angle. Parallax then places those pixels outside the fire perimeter, on the side toward the swath edge, and the algorithm cannot separate them from surface fire. The guide advises preferring an overpass closer to nadir. For any correction by land cover and view angle, the cover class under such a pixel may not be the class that is burning.
- *Saturated MODIS detections have no valid FRP.* In very intense burning a MODIS detection can saturate and carry no valid FRP, so summed FRP is underestimated exactly in extreme events. [Li et al., 2021](https://doi.org/10.1088/2515-7620/ac2e6f) report 14% and 23% saturated MODIS detections on peak days in two Australian ecoregions in 2019–2020. Count detections without valid FRP separately when comparing FRP sums between sensors or between years.

## 3. Design decisions

### 3.1 Measures and units

- **Cell-days are not a common scale by themselves.** Counting active grid cell-days is less sensitive to pixel size than counting detections, but it still needs a response model or a same-sensor comparison.
- **One primary quantity with a unit.** The brief asks for the number of hotspots. Candidates: detections on a declared reference scale (an estimate, possibly fractional) or active cell-days. Native per-satellite counts are shown next to it. Native counts, estimated counts and cell-days are three different measures, and none is a number of fires.
- **A fixed, versioned analytical grid** and an explicit rule for including cells in an area. A value must not change when the user zooms the map; screen-distance grouping is a display aid only.
- **Two different area statistics**, never mixed: summed cell-days, and days with any activity anywhere in the area.
- **FRP is instantaneous power.** Sum non-duplicate pixel FRP within one satellite overpass and one spatial unit. Across overpasses show separate observations or a named summary (latest per-pass total, maximum per-pass total) with times. A sum over repeated observations is neither current power nor energy; energy needs time integration, and burned area needs a different product.
- **Duplicate VIIRS pixels.** The Level 2 product flags residual bow-tie pixels (algorithm QA bit 22) so that FRP is not counted twice. FIRMS CSV rows carry no QA field: on that data path, test for near-coincident detections from one satellite and acquisition time.

### 3.2 Observation status

- **Zero is not "no data".** Store the value and the status separately: detections recorded, usable observation with no detection, obscured or invalid, no coverage, missing delivery, coverage unknown. Do not fill unknown bins with zero.
- **Keep on every aggregate:** satellite, day/night, collection, processing stream. A total over "whichever satellites were flying" changes its meaning over time.
- **Provisional data.** Mark partial first and last months, and NRT records not yet replaced by standard ones. Replace NRT with standard records by a reproducible rule; do not append both.
- **Predicted is not confirmed.** An orbit calculation gives an opportunity to observe, not a valid observation: cloud, outages and processing failures still matter. Keep predicted pass time, actual FIRMS acquisition time, age of the orbital elements and confirmed data availability as separate fields. Orbital elements are usable only near their epoch; current ones cannot reconstruct the historical record.

### 3.3 Vegetation fires and other heat sources

- Say "active-fire detections and thermal anomalies" where the data does not establish a vegetation fire, and keep an "unknown" source category. Repeated detections alone do not identify a cause.
- Where the feed has no `type` field, a candidate is a static-source flag built from the locations of non-zero-type standard records. The matching distance and the persistence rule are choices to validate.
- Context layers to evaluate: the FIRMS [static thermal anomalies](https://wiki.earthdata.nasa.gov/spaces/FIRMS/blog/2025/02/28/425855667/FIRMS+incorporates+static+thermal+anomalies+data+to+help+users+differentiate+between+vegetation+and+non+vegetation+fires.) layer and the global industrial heat source polygons ([Ma, 2024](https://doi.org/10.5281/zenodo.10570342)). Check geometry, coverage, classification and version before use, and keep the flag reversible.

### 3.4 Reference scale

- **Fix the reference convention before the method.** Default candidate: express VIIRS on a MODIS-equivalent scale, fitted on overlap years with a fixed set of satellites and with day and night separate. This leaves 2000–2011 as observed. Scaling MODIS up to VIIRS is possible in aggregate, but it cannot recover individual missed detections and turns those years into model output with nothing to check it against.
- **State how both ends are bridged:** Terra alone before July 2002; NOAA-20 and NOAA-21 after S-NPP.
- **A VIIRS-only series** (S-NPP from 2012, continued by NOAA-20) is a candidate continuous record that needs no MODIS conversion. Test the handover on complete seasons and place it inside the overlap of the two platforms, not at the end of S-NPP.
- **Orbit drift is a break in the reference itself.** Aqua's final inclination adjustment and drag make-up manoeuvres were in 2021 and Terra's in 2022; significant sampling effects were reported from late 2024, and the effect on fire products is still under investigation ([Giglio, 2025](https://landweb.modaps.eosdis.nasa.gov/data/filePost/LANCE_UWG_Orbit_Drift_Giglio_202505.pdf); [NASA LDOPE note](https://landweb.modaps.eosdis.nasa.gov/displayissue?id=1254)). Prefer fitting on overlap years before those dates and evaluate later years as a separate stratum.
- **A calibration is valid at the scale it was fitted.** A nonlinear fit on region-month totals cannot be applied per cell and then summed over an arbitrary area. The fitting unit, grid and area rule belong in the method description.
- **Quantile matching refitted per period can erase real change.** Fit once on a declared period.

### 3.5 Method candidates and their limits

| Candidate | Use | Limit |
|---|---|---|
| Observation operator ([Sofiev & Kouznetsov, 2026](https://doi.org/10.5194/gmd-19-10123-2026); [code](https://doi.org/10.5281/zenodo.18339604)) | A MODIS detection-response model applied to VIIRS observations aggregated over a reference footprint | See the note below. The code is GPL-3.0, needs external tooling and ships no input data: an algorithm reference, not a drop-in dependency |
| Correction before fusion with near-synchronous footprint matching ([Zheng et al., 2026](https://doi.org/10.3390/rs18101650)) | Pairing design and view-angle correction | Coefficients are for Aqua and S-NPP; not transferable to Terra or other VIIRS platforms without refitting |
| Quantile mapping ([Kaur et al., 2019](https://doi.org/10.3390/rs11101205)) | Swath-dependent bias within one sensor | Viewing-geometry and zero-cell limits stated by the authors |
| MODIS–VIIRS FRP comparison ([Li et al., 2018](https://doi.org/10.1029/2017JD027823)) | Design of cluster and grid comparisons | Studies the 750 m VIIRS product; its numbers are not coefficients for the 375 m feeds |
| Fixed 1 km grid plus a hard FRP cut-off | A simple sensitivity scenario | Does not reproduce MODIS sampling or recover hidden fires |

**Note on the observation-operator coefficients.** Evaluating the paper's detection-limit relation (Eq. 5) with Table 1 at a 1 km² pixel gives 4.96 MW by day and 5.44 MW by night for MODIS; the paper's conclusions give 5.7 and 3.7 MW for the smallest pixels. For VIIRS, Table 2 at a 0.375 km × 0.375 km pixel gives 2.31 and 0.54 MW; the conclusions give 3.7 and 0.7 MW. We have not reconciled the two sets, which may rest on different definitions. Neither should be copied as an implementation constant before the equations, tables and code are reconciled.

**Note on the operator output.** In the released code (`FRP_OOp_pixel.py`, function `observe`), each fire near the detection limit is kept with its input FRP or set to zero by a random draw against the detection probability; the FRP itself is not scaled. A run is therefore one random realization, not an expected value. An implementation has to choose between the two representations, state the choice, and fix the random seed for reproducible results.

### 3.6 A shortcut to a MODIS baseline

The MODIS guide documents monthly 0.25° climate-modelling-grid products, `MOD14CMQ` and `MYD14CMQ`, with layers including `RawFirePix`, `CorrFirePix`, `CloudCorrFirePix`, `MeanCloudFraction`, `CloudPix`, `TotalPix` and `MeanFRP`. They can reduce the work for a coarse MODIS historical baseline. Limits: the files are a time series from which a climatology still has to be computed; `CloudCorrFirePix` is a corrected estimate, not a detection count; monthly 0.25° data cannot serve daily history or a small arbitrary polygon; Terra and Aqua stay separate until their combination is defined; `TotalPix` is a number of pixels, not a number of overpasses and not evidence of clear-sky observation; inferred non-vegetation hot spots are excluded from the CMG products but not from the fire location product (guide, sections 8.6.6 and 8.7.3), so a comparison between the two needs the same exclusion on both sides. We have not downloaded these products or tested a reader for their HDF4 format.

The same guide warns of large sampling bias in MODIS analyses over periods shorter than about eight days. Start with monthly comparisons, keep daily records so that other summaries stay possible, and require coverage evidence before publishing daily or five-day statistics.

### 3.7 Seasonal baseline and anomaly

- Show the baseline interval, the number of contributing years, the median, the spread and the completeness.
- Compare a partial current period with the same elapsed dates in every historical year, and keep the target period out of its own baseline.
- Where the median is zero or counts are sparse, show absolute differences, not percentages.
- Define the "above / below typical" threshold on the computed statistic, for example a percentile of the baseline spread.
- Same-satellite percentiles avoid a cross-sensor conversion but do not remove changes in coverage, processing or overpass time.
- Seasonal timing from MODIS and VIIRS does not agree everywhere: tropical forest is a reported exception ([Giglio et al., 2006](https://doi.org/10.1029/2005JG000142)), and regional caution is advised for long-term changes ([Zubkova et al., 2024](https://doi.org/10.1016/j.jag.2024.104064)).

### 3.8 Calendar, area selection and export

- A year × month matrix for a selected area and date range, with native and adjusted series on the same measure, unit and coverage rules.
- Two exports: the detections returned by the search, and the analytical series, both with provenance and quality fields.
- A two-layer cell: colour for activity, hatching or transparency for observability (missing data, provisional NRT), so that "no fires" and "no observations" look different.
- Label the area and time window of every view. The live layer is global and covers the last 24 hours; it must not look as if it had been filtered to a selected area or month.
- The shared link carries area, period, measure and the data and method versions, so that it reproduces the same numbers.

## 4. Prototype against these notes

Checked in the code at `82f1a17`; every row re-checked at `2d3f5df` and still accurate unless the row says otherwise.

| Topic | In the prototype | Note |
|---|---|---|
| Confidence | VIIRS classes are mapped to 25, 65 and 95 for display; an unrecognized value becomes 50 | Unknown should stay unknown, and the source value should be kept next to the display class |
| Pixel size | `scan` and `track` are kept and used for the land-cover footprint; the nominal radius is the fallback | `scan` × `track` is an approximate area, not an oriented footprint |
| Source identity | An unrecognized dataset name resolves to the NOAA-20 NRT metadata | Needed before any `*_SP` or S-NPP data is read: explicit mappings, and rejection of unknown sources |
| Overpass search | When no sampled position falls inside the swath, the nearest approach is still returned as the latest pass | To be removed or marked before the calculation is used as coverage evidence |
| Data availability | "Processing" is derived from elapsed time and a fixed delay | Described in the app as an estimate; a timer cannot confirm delivery |
| Nominal crossing times | The orbit API still returns the historical 10:30 and 13:30 local-time notes for Terra and Aqua | Both satellites have drifted; label as historical nominal times if shown |
| Storage | Fire detections are held in memory only. A shared Firestore cache now keeps weather grids, not detections | Raw inputs and daily aggregates for the history need durable files or object storage |

## 5. Validation

- Hold out whole years and one contrasting region.
- Inside the overlap, hide the reference sensor for an interval, reconstruct the declared reference measure from the other sensor, and compare with the withheld data.
- Compare against plain baselines: native counts, and one scale factor per day/night stratum.
- Set the acceptance thresholds before looking at the held-out results.
- Report signed bias, the timing of the seasonal peak, and behaviour in sparse periods, in extreme periods and at the dates when satellites enter or leave the record.
- "The curves look continuous" is not evidence.
- **Same test for every alternative:** plain merge; common grid with duplicates removed; one coefficient from the overlap; corrections by geometry, season and land cover; quantile mapping or an observation operator. Each added step has to earn its place on the held-out data.
- **Break tests at sensor transitions:** the start of VIIRS in 2012, NOAA-20 in 2018, the Terra and Aqua drift years, NOAA-21, the end of S-NPP in November 2026. Repeat the test at placebo dates to see how often a break appears by chance.
- **Changing the satellite set on purpose.** Inside the overlap, recompute the measure with different subsets of the available platforms. The burning is the same and only the observing system changes, so the measure should not move.
- **Injected signals.** Add a known step or trend to one sensor's era and confirm that the pipeline returns it. This tests whether real change survives harmonization.
- **Real anomalies are preserved:** ranks of extreme years, the size of unusual periods, the onset and the peak of the season. Do not force every year to one historical distribution.
- **Residuals** must not depend systematically on view angle, cloudiness, local time, platform or processing version.
- **Cells seen by one sensor only.** Check MODIS-only, VIIRS-only and no-detection cells separately; a calibration fitted on matched detections learns mostly from burning that is easy to detect.
- **Results by class:** cropland burning, forest fires, savanna, peat; day and night; weak and strong sources. A good overall score must not hide a class that got worse.
- **Uncertainty.** Resample whole space-time blocks or fire episodes, not single pixels, so that dependent pixels do not produce intervals that are too narrow. A prediction interval for a new cell-period is not a confidence interval for a fitted parameter: report which one is shown, and check the coverage of prediction intervals on held-out data.
- Split held-out data by whole seasons and spatial blocks; never distribute neighbouring pixels of one event between training and test.
- Burned-area products can serve as a secondary check, with two cautions: a burn scar does not establish active combustion at a given overpass, and products that share active-fire inputs are not independent.
- If the calibration fails, publish the source-separated history and label the adjusted view experimental.

## 6. Order of work

| Stage | Result |
|---|---|
| 1. One regional history | Versioned inputs from the archive, durable daily aggregates by cell, satellite and day/night (or an explicitly coarse CMG baseline), an observed monthly history with missingness |
| 2. Harmonization test | A declared reference measure, coverage-aware comparison, and results on withheld years and a contrasting region |
| 3. Product | Area and period selection, year × month view, native / adjusted comparison, reproducible exports |

Candidate regions: one for the demonstration and a contrasting one for validation, subject to actual data coverage. A successful first delivery traces a displayed number back to source records, distinguishes missing observations from low activity, and shows whether the harmonized result passes the held-out comparison.

## 7. Existing products to compare with

| Product | What to look at |
|---|---|
| [GWIS](https://gwis.jrc.ec.europa.eu/) (Global Wildfire Information System) | Country profiles and seasonal trends: current season against a multi-year baseline |
| [GFED](https://www.globalfiredata.org/) and its near-real-time extension [GFED5NRT](https://doi.org/10.5281/zenodo.18702700) | GFED5NRT scales VIIRS 375 m active-fire counts with factors specific to region and land cover |
| [FEDS](https://gis.earthdata.nasa.gov/image/rest/services/FireTracking/Fire_Events_Data_Suite_Fire_Perimeters_nrt/MapServer) and [fireatlas](https://github.com/Earth-Information-System/fireatlas) (NASA Earth Information System) | Turning successive detections into tracked fire events |
| [Global Fire Atlas](https://doi.org/10.5194/essd-11-529-2019) | Individual fire size, duration and spread from burned-area data |
| MODIS–VIIRS land product continuity ([Román et al., 2024](https://doi.org/10.1016/j.rse.2023.113963)) | How NASA documents continuity between the two instrument records |

## 8. Data documentation and further sources

Documentation and studies that the literature review does not cite and that are useful when building the pipeline.

**FIRMS and product documentation**

- [FIRMS API](https://firms.modaps.eosdis.nasa.gov/api/), [Area API](https://firms.modaps.eosdis.nasa.gov/api/area/), [missing data](https://firms.modaps.eosdis.nasa.gov/api/missing_data/), [archive download](https://firms.modaps.eosdis.nasa.gov/download/).
- FIRMS product descriptions: [MODIS](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_MODIS_Firehotspots.html), [VIIRS](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html); [notes on fire alerts](https://firms.modaps.eosdis.nasa.gov/alerts/notes.php).
- [MODIS Collection 6 and 6.1 Active Fire Product User's Guide](https://earthdata.nasa.gov/s3fs-public/2023-09/MODIS_C6_C6.1_Fire_User_Guide_1.0.pdf); [MOD14 file specification](https://ladsweb.modaps.eosdis.nasa.gov/filespec/MODIS/61/MOD14).
- [VIIRS Collection 2 375 m Active Fire Product User's Guide](https://www.earthdata.nasa.gov/s3fs-public/2025-06/VIIRS_C2_AF-375m_User_Guide_1.2.pdf); the earlier [VIIRS 375 m and 750 m user guide](https://www.earthdata.nasa.gov/s3fs-public/imported/VIIRS_activefire_User_Guide.pdf) (2018); [VIIRS I-band 375 m active fire data](https://earthdata.nasa.gov/data/instruments/viirs/viirs-i-band-375-m-active-fire-data).
- [VIIRS Active Fire Quick Guide](https://rammb2.cira.colostate.edu/wp-content/uploads/2025/09/VIIRS_Active_Fire_Quick_Guide_v1-2022.pdf) (CIRA, 2022): a screening workflow for individual detections.
- [NOAA-20 VIIRS active fire beta maturity review](https://www.star.nesdis.noaa.gov/jpss/documents/AMM/N20/Land_ActiveFires_Iband_Beta_Provisional.pdf) (2019): differences between VIIRS platforms.
- [NASA Fire Products Update](https://gofcgold.org/sites/default/files/2024-11/Giglio_GOFC_2024_NASA_Fire.pdf) (Giglio et al., 2024); [static thermal anomalies and their contribution to global thermal activity](https://gofcgold.umd.edu/sites/default/files/2024-11/GOFC_GWIS_2024_Roberts_short.pdf) (Roberts, 2024).
- Publication indexes: [MODIS fire products](https://modis-fire.umd.edu/pubs.html), [VIIRS land](https://viirsland.gsfc.nasa.gov/Publications/PubsPR.html).

**Studies**

| Source | Use |
|---|---|
| [Wooster et al., 2021](https://doi.org/10.1016/j.rse.2021.112694), Satellite remote sensing of active fires | Overview of the field; active-fire pixels are not a burned-area map |
| [Wooster et al., 2005](https://doi.org/10.1029/2005JD006318), FRP and combustion rates | What FRP and time-integrated radiative energy mean |
| [Freeborn et al., 2022](https://doi.org/10.1016/j.rse.2021.112777), nighttime fire activity over the contiguous United States | Long-term trends in nighttime detections; day and night as separate strata |
| [Kaiser et al., 2012](https://doi.org/10.5194/bg-9-527-2012), GFAS | FRP-based processing, gap filling and product comparison |
| [Schroeder et al., 2008](https://doi.org/10.1016/j.rse.2008.01.005), validation of GOES and MODIS detections | Separating omission from commission; false detections by vegetation context |
| [Li et al., 2020](https://doi.org/10.1016/j.rse.2019.111600), GOES-16 evaluation | Reporting resolution, time window and reference threshold with every detection rate |
| [Oliva & Schroeder, 2015](https://doi.org/10.1016/j.rse.2015.01.010), VIIRS 375 m for burned-area mapping | Aggregating footprints between overpasses; limits for fast fires and industrial sources |
| [Santos et al., 2020](https://doi.org/10.1080/01431161.2020.1771791), VIIRS and burned area in the Cerrado | Omission of small scars; single-season result |
| [Giglio et al., 2018](https://doi.org/10.1016/j.rse.2018.08.005), MODIS Collection 6 burned area | Inputs of MCD64A1 for a secondary check |
| [Mahood et al., 2022](https://doi.org/10.1038/s41597-022-01572-3), country-level fire perimeters | Converting burn-date grids into fire objects |
| [Chen et al., 2022](https://doi.org/10.1038/s41597-022-01343-0), object-based fire tracking | Keeping an identifier and perimeter between overpasses |
| [Majumdar, 2025](https://doi.org/10.1038/s41598-025-11200-w), biomass fires over India 2012–2023 | Monthly aggregation on a 20 km grid with product, confidence class and counting unit kept separate |
| [Jones et al., 2024](https://doi.org/10.5194/essd-16-3601-2024), State of Wildfires 2023–2024 | Regional anomalies in context; season definitions |
| [Kato et al., 2021](https://doi.org/10.1016/j.jag.2021.102491) and [Ma et al., 2022](https://doi.org/10.3390/rs14040835), heat-source classification | Separating industrial sources from fires |
| [Karlsson et al., 2025](https://doi.org/10.1007/978-3-031-95918-9_5), next-day predictability with MODIS and VIIRS | A public MODIS–VIIRS benchmark; Australia only |

## 9. Not checked

- The `type` and `version` fields of the standard products, including `VIIRS_NOAA21_SP`, were not read from FIRMS responses. Confirm them before keying logic to them.
- No harmonization calibration was run: the baselines in the app are fitted on a single 24-hour snapshot and do not put the two sensors on one scale. No CMG file was downloaded.
- The static-source layers were not opened: geometry, coverage and classification are unverified.
- Current overpass times of the satellites were not measured.

Independent project built for the 2026 NASA Space Apps Challenge. Not affiliated with or endorsed by NASA.
