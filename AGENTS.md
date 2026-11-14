# Repository Agent Guidelines

## Git & Remote Sync Workflow

- **Commit and push intermediate milestones**: After completing and verifying any intermediate part or meaningful unit of work, stage the relevant files, commit with a clear message, and push to `origin` (`main` or the active feature branch) so other team members always have access to the latest changes.
- **Always offer remote push**: If a step ends without having pushed local commits (for example, when awaiting confirmation or finishing a partial task), explicitly offer to push the changes to the remote repository right away.
- Never force-push (`git push --force`) or rewrite shared history without explicit user approval.

## Project Context

- Refer to [doc/README.md](doc/README.md) for the application purpose and NASA Space Apps Challenge 2026 requirements (**Harmonization of MODIS and VIIRS Hot Spots**).
- Refer to [doc/architecture-and-harmonization.md](doc/architecture-and-harmonization.md) for the division of responsibilities between `ui/` (React SPA on GitHub Pages) and `backend/` (ASP.NET Core `.NET 10` API on Google Cloud Run).
