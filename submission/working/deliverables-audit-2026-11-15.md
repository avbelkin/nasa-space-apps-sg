# Deliverables audit — 15 November 2026

Checked all five documents against repository commit `ab196ce`, then rechecked `7bbe91a` (only presentation review records changed), the actual UI/backend code, the source manifests, saved FIRMS summary, published presentation and current video production records. This is a repository-consistency audit, not a fresh source-by-source review of the 82 scientific references. The final user instruction explicitly limited further article reading.

## Accepted document coverage

| Document | Independent Codex acceptance |
|---|---|
| [Project description](../deliverables/project-description.md) | Replaced publication placeholders with the existing public seven-slide PDF; updated deployed versions, surface bar, surface-class comparison, live CSV and API exports; corrected video-production disclosures and inventory scope. No invented final video link. |
| [Technical note](../deliverables/technical-note.md) | Added exact surface aggregation and CSV contract, excluded fields and API capabilities; updated 120-test/build/lint and deployment evidence; removed unsubstantiated median-FRP statistics absent from the saved summary; replaced abbreviated endpoint examples with complete URLs and a key derived from the live feed; narrowed unvalidated geometry claims. |
| [Literature review](../deliverables/modis-viirs-harmonization-literature-review.md) | Accepted the API review's zero contradiction finding for the hypothesis/implementation distinction. Added an explicit current-prototype boundary: coarse 2019 sampling and raw export do not test the class-by-angle hypothesis, implement a static-source filter or produce a harmonized calendar. Checked citation-ID coverage and reference count, without claiming a new full scientific review. |
| [Software licences](../deliverables/software-licenses.md) | Accepted the API's zero direct-manifest contradiction verdict after independently regenerating the lock hash and all 122 package/version/licence rows: no discrepancies. Checked both project manifests and the notice-file scope. Clarified that direct backend references are not a frozen transitive NuGet inventory. |
| [Third-party rights](../deliverables/third-party-rights.md) | Added the generated desk and edited photographic cutout, exact accepted voice, legacy EOX 2025 review-only imagery, indirect NASA GIBS cloud imagery, astronomical method credits, actual original-work licence scope and separate Open-Meteo service terms. Scoped branding assertions to the app and public deck. |

Every API finding was checked against actual inputs. PD-1/TN-1 were confirmed in `LiveFiresSection.tsx`, `exportSlice.ts` and backend endpoints; the API packet omitted the callers, so its uncertainty about visible CSV/surface controls was resolved by reading their render path. PD-2/PD-3/TR-1/TR-2 were confirmed against the public PDF, capture manifest, current video README and assembly renderer. PD-4 and the software zero verdict were checked against the complete lockfile, both project files and notices. TN-2 was accepted because no instrument-geolocation validation exists. TR-3 was confirmed in `SunMoonPositions.cs`. No API caveat was converted into a claim of missing repository data without checking the checkout.

## Verification

- UI and backend Git tree objects at both `ab196ce` and `7bbe91a` match deployments `5b66aec` and `4686c3c`: `a09823468f5015c8490be7365652784e57c858de` and `37867d6ea84ec110f6dfcd5e1789238816cd5475`.
- `npm test`: 120 passed, 0 failed, 0 skipped. `npm run build` and `npm run lint` passed; the existing large-bundle warning remains.
- All relative document links and Markdown heading targets resolve; no fill-in placeholders remain in the five deliverables. All 82 cited reference IDs have unique bibliography entries.
- All three model sidecar SHA-256 values match their coefficient files. The UI lock SHA-256 matches `76d3197fa4838dc6d9e88c6508094abd57af3eeda645172b94d2f25ed26d671f`; all 122 inventory rows match.
- Public app, health endpoint, worldwide feed and public PDF: HTTP 200 at 14:21:49 UTC. The 77,946 live detections are an availability check; the earlier 8,127/79,349 comparison remains frozen and consistent with the deck.
- [Machine-readable receipt](deliverables-audit-2026-11-15.json) records the HTTP check, API usage, terminal receipt and output hash. All work launched for this audit is collected and accepted; no API/Batch job remains pending.

## Actual limits retained in the documents

The final video is still in production. Fitting scripts and frozen training rows are absent, so historical model metrics cannot be rerun from the checkout. Backend tests were not executed because no .NET SDK is installed, and CI does not run them. No resolved transitive NuGet lock is committed. The scarf pattern's ownership is not established by the repository; no rights grant is invented. These are explicit current-state limits, not fill-in placeholders or claimed completed work. Scientific uncertainty and planned harmonization remain labelled honestly.

## API routing and accounting

Preliminary review: OpenAI `gpt-6.1-sol`, reasoning high, **synchronous Flex**, one complete response, finish reason `stop`; this was not native Batch. The model was selected using the existing gateway's source-grounding benchmark guidance. The root Codex session independently accepted all findings and zero-finding scopes. The gateway enforced its existing run/provider budgets; no dependencies or providers were installed or added.

Actual usage: 66,657 input tokens, 11,799 output tokens (including 6,147 thinking tokens). **Estimated API cost: $0.125652**, calculated from actual usage and the gateway's Flex price table; provider billing was not supplied. The $0.1611 pre-call estimate is not the final usage-based estimate. Subscription usage belongs to the root Codex session; allowance telemetry is unavailable and no percentage is inferred. API receipt: `20261115T142552Z_e83776f4fb19e3c8.json`; exec session `95892` finished with exit code 0. No native subagents were launched.
