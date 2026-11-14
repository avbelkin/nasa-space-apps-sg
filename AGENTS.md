# Repository Agent Guidelines

## Git & Remote Sync Workflow

- **Parallel feature worktrees**: Start new features in an isolated sibling Git worktree on a dedicated feature branch (for example, `git worktree add ..\nasa-space-apps-sg-wt-<feature> -b feat/<feature> main`) so multiple features or agents can be built, tested, and committed in parallel without branch-switching or dirty-worktree conflicts. Remove the worktree (`git worktree remove ..\nasa-space-apps-sg-wt-<feature>`) once merged.
- **Commit and push intermediate milestones**: After completing and verifying any intermediate part or meaningful unit of work, stage the relevant files, commit with a clear message, and push to `origin` (`main` or the active feature branch) so other team members always have access to the latest changes.
- **Always offer remote push**: If a step ends without having pushed local commits (for example, when awaiting confirmation or finishing a partial task), explicitly offer to push the changes to the remote repository right away.
- Never force-push (`git push --force`) or rewrite shared history without explicit user approval.

## Project Context

- Refer to [doc/README.md](doc/README.md) for the application purpose and NASA Space Apps Challenge 2026 requirements (**Harmonization of MODIS and VIIRS Hot Spots**).
- Refer to [doc/architecture-and-harmonization.md](doc/architecture-and-harmonization.md) for the division of responsibilities between `ui/` (React SPA on GitHub Pages) and `backend/` (ASP.NET Core `.NET 10` API on Google Cloud Run).

## Branding & Data Attribution

- **Provisional Application Title**: Use **Earth Fire Calendar** as the UI/application title for now (subject to reconsideration later).
- **No NASA Branding or Logos**: Even though this project is built for the 2026 NASA Space Apps Challenge, never brand the app as an official NASA or Space Apps project/product, never imply NASA endorsement, and never use NASA logos or insignias (e.g., NASA "meatball", "worm", or Space Apps logos) in the UI, favicons, or assets.
- **NASA Data Attribution**: Whenever NASA datasets, APIs, or mission/sensor parameters are used or displayed (e.g., NASA FIRMS active-fire feeds/archives, NASA EOS Terra/Aqua MODIS, NOAA/NASA JPSS VIIRS, or NASA GIBS/Earthdata), expose clear factual attribution to NASA as the data source in map/UI attributions while keeping non-endorsement explicit (and clearly note when stub/illustrative data is shown instead of live feeds).
