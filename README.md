# NASA Space Apps SG

Monorepo starter for the NASA Space Apps SG project:

- **`ui/`** — Pure React + TypeScript + Vite static SPA published to **GitHub Pages**.
- **`backend/`** — ASP.NET Core (`.NET 10`) Minimal API containerized for **Google Cloud Run**.

## Local Development

### 1. Backend (`http://localhost:5180`)

```powershell
dotnet run --project backend/NasaSpaceApps.Api
```

Endpoints:
- `GET /health`
- `GET /api/status`

### 2. Frontend (`http://localhost:5173`)

```powershell
cd ui
npm install
npm run dev
```

During local development, Vite proxies `/api` and `/health` requests to `http://localhost:5180`.

## GitHub Actions Deployment Configuration

### UI (`deploy-ui.yml` -> GitHub Pages)

Repository variables under **Settings -> Secrets and variables -> Actions -> Variables**:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Public HTTPS URL of the Cloud Run backend service | `https://nasa-space-apps-api-xxxx.asia-southeast1.run.app` |
| `VITE_BASE_PATH` | Optional base path override (defaults to `/<repo-name>/` in workflow) | `/nasa-space-apps-sg/` |

### Backend (`deploy-backend.yml` -> Google Cloud Run)

Always runs a `.NET 10` Release build check on pushes to `backend/**`. The Cloud Run deployment job runs once these GitHub repository variables are configured:

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `GCP_PROJECT_ID` | Target Google Cloud project ID | `nasa-space-apps-sg-2026` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full Workload Identity Provider resource name for GitHub OIDC | `projects/<num>/locations/global/workloadIdentityPools/.../providers/...` |
| `GCP_SERVICE_ACCOUNT` | Service account email used by GitHub Actions | `github-deployer@<project>.iam.gserviceaccount.com` |
| `GCP_REGION` | Optional Artifact Registry & Cloud Run region | `asia-southeast1` |
| `GCP_ARTIFACT_REPO` | Optional Artifact Registry Docker repository name | `cloud-run-source-deploy` |
| `GCP_SERVICE_NAME` | Optional Cloud Run service name | `nasa-space-apps-api` |
