# Cloud Run Deployment, Lifecycle & Google AI Ultra Credits

This guide documents the public operational setup for **Earth Fire Calendar**'s `.NET 10` backend on **Google Cloud Run** (`asia-southeast1`), how **Google AI Ultra (20x)** developer credits cover infrastructure and AI workloads, and how to switch Cloud Run between **warm** judging mode and **hibernate** idle mode.

---

## 1. Google AI Ultra (20x Plan) Developer Perks

A **Google AI Ultra (20x)** subscription unlocks three developer benefits used across this project:

1. **Monthly Google Cloud Credits (\$100 USD/month via Google Developer Program)**
   - Grants accumulate over 12 months on the linked Cloud Billing account and cover **Cloud Run**, **Artifact Registry**, **Secret Manager**, **Cloud Storage**, **BigQuery**, and **Vertex AI (Gemini)**.
   - Protected by a monthly billing budget alert (`earth-fire-calendar-budget`) firing at **50%**, **80%**, and **100%** of the configured monthly cap (e.g., `100 SGD` to leave a wide safety buffer beneath the monthly credit pool).
2. **Google Colab Priority Compute & Background Execution**
   - Used for offline 2000–present **MODIS** (`MOD14`/`MYD14`, ~1 km) and **VIIRS** (`VNP14IMG`/`VJ114IMG`/`VJ214IMG`, 375 m) cross-sensor calibration and multi-decade seasonal baseline generation.
   - Exported static baselines (Parquet, GeoJSON, or PMTiles) can be published to the regional Cloud Storage bucket (`gs://<project>-fire-harmonization`) for low-latency backend loading.
3. **Google Antigravity (20x Agent Quotas)**
   - Supports parallel feature branches across isolated sibling Git worktrees without throttling.

---

## 2. Cloud Run Scaling & Lifecycle Modes (`warm` vs. `hibernate`)

Because the backend caches CelesTrak orbital TLEs and NASA FIRMS responses in memory (12-hour TTL), keeping a single warm instance eliminates cold starts during active development and judge evaluations. Between hackathon submission and final checks—when the backend is largely idle—switching to `hibernate` drops idle compute charges to **\$0**.

| Setting | `warm` Mode (Active / Judging) | `hibernate` Mode (Post-Hackathon Idle) |
| :--- | :--- | :--- |
| `min-instances` (`GCP_MIN_INSTANCES`) | **`1`** | **`0`** |
| `max-instances` (`GCP_MAX_INSTANCES`) | `4` | `4` |
| CPU / Memory (`GCP_CPU` / `GCP_MEMORY`) | `1 vCPU` / `1 GiB` | `1 vCPU` / `1 GiB` |
| Max Concurrency (`GCP_CONCURRENCY`) | `80` | `80` |
| Startup CPU Boost | `--cpu-boost` (enabled) | `--cpu-boost` (enabled) |
| In-Memory TLE & FIRMS Caches | Always warm (`0 ms` cold start) | Re-hydrates on demand (~1–3 s wake-up) |
| Estimated Idle Compute Cost | ~\$12–\$18 USD/mo (covered by credits) | **\$0/mo** when idle |

### Switching Modes with One Command

From the repository root:

```powershell
# After hackathon submission (scales to zero when idle; endpoint stays live on demand):
.\scripts\set-cloudrun-mode.ps1 -Mode hibernate

# Before final checks or live demos (keeps 1 warm instance & in-memory caches resident):
.\scripts\set-cloudrun-mode.ps1 -Mode warm
```

What `scripts/set-cloudrun-mode.ps1` does:
1. Updates the live Cloud Run service (`earth-fire-calendar-api` in `asia-southeast1`) immediately via `gcloud run services update --min-instances=<0|1>`.
2. Syncs `GCP_MIN_INSTANCES` on GitHub repository variables via `gh variable set` so future CI/CD runs preserve your chosen mode.
3. Probes `/health` to verify the service is healthy.

### Manual Alternatives

If you prefer not to run the helper script:
- **GitHub Actions UI**: Under **Settings -> Secrets and variables -> Actions -> Variables**, set `GCP_MIN_INSTANCES` to `0` (`hibernate`) or `1` (`warm`), then re-run **Build and Deploy Backend to Cloud Run** (or run the `gcloud` command below for immediate effect):
  ```powershell
  gcloud run services update earth-fire-calendar-api `
    --project=earth-fire-calendar-sg `
    --region=asia-southeast1 `
    --min-instances=0 `
    --quiet
  ```

---

## 3. Least-Privilege Identity, Secret Manager & Keyless Vertex AI

[bootstrap-gcp-cloudrun.ps1](../scripts/bootstrap-gcp-cloudrun.ps1) separates CI/CD deployment from runtime execution:

- **Deployer Identity (`github-deployer`)**:
  - Impersonated exclusively by GitHub Actions via Workload Identity Federation (`github-pool` / `github-provider`, OIDC condition locked to `assertion.repository=='avbelkin/nasa-space-apps-sg'`).
  - Holds `roles/run.admin`, `roles/artifactregistry.writer`, and `roles/iam.serviceAccountUser`.
- **Runtime Identity (`nasa-api-runtime`)**:
  - Attached directly to the Cloud Run container (replacing the broad default Compute Engine `editor` account).
  - Holds only:
    - `roles/secretmanager.secretAccessor` on `firms-map-key` and `gemini-api-key`
    - `roles/storage.objectViewer` on `gs://<project>-fire-harmonization`
    - `roles/aiplatform.user` on the project (when bootstrapped with `-EnableVertexAi`)

### Why Keyless Vertex AI (`aiplatform.googleapis.com`) Instead of AI Studio Keys

Calling Gemini through **Vertex AI** allows Cloud Run containers running under `nasa-api-runtime` to authenticate via Google Cloud IAM (`roles/aiplatform.user`) with:
- Zero API key secrets to rotate.
- Direct billing against the project's linked Cloud Billing credit pool (no standalone AI Studio prepaid deposit needed).

*(Any AI-generated regional summaries must retain factual NASA FIRMS / MODIS / VIIRS attribution and non-endorsement disclosures per [AGENTS.md](../AGENTS.md).)*

### Adding `FIRMS_MAP_KEY` to Secret Manager Later

When ready to wire live NASA FIRMS feeds into Cloud Run:
1. Run the bootstrap script with `-PromptForSecrets` and `-SyncGitHubVars`:
   ```powershell
   .\scripts\bootstrap-gcp-cloudrun.ps1 -PromptForSecrets -SyncGitHubVars
   ```
2. This uploads an exact UTF-8 (no BOM/newline) secret version to `firms-map-key` and sets `GCP_CLOUDRUN_SECRETS=FIRMS_MAP_KEY=firms-map-key:latest` so `.github/workflows/deploy-backend.yml` injects `FIRMS_MAP_KEY` automatically on deploy.

---

## 4. Shared / Google One Family Subscription Notes

When a **Google AI Ultra** plan is shared via a **Google One Family** group:
- Only the **primary Google One plan manager** sees and can claim the monthly Google Cloud credits in the **Google Developer Program** ([My Benefits](https://developers.google.com/program/my-benefits)) or **Google AI Studio Billing** ([aistudio.google.com/billing](https://aistudio.google.com/billing)); family members do not receive separate credit grants.
- To redeem credits onto an existing team Cloud Billing account, that plan manager must hold **`Billing Account Administrator`** (`roles/billing.admin`) on the target billing account—or create a dedicated billing account as the plan manager, link the GCP project to it, and grant `roles/billing.admin` to co-maintainers who manage deployment budgets.
