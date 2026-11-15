# Repository Agent Guidelines

## Language

- All repository content must be in English, including documentation, scripts, comments, review notes, and local review pages. This also applies to authored text in Git-ignored working directories.
- Respond to the user in Russian. The chat language does not change the repository language.

## Submission Folder Layout

Follow the folder rules in [submission/README.md](submission/README.md):

- `submission/deliverables/`: only the documents that are submitted or shown to judges (project page text, technical note, literature review). These are living documents: update them whenever the app, the data or the findings change, in the same piece of work.
- `submission/presentation/`: everything about the slide deck, including the slide text.
- `submission/video/`: everything about the demo video, including the script and the Git-ignored `lama/` footage.
- `submission/docs/`: frozen external reference only, namely the official requirements and general advice from the official guides and the review of the 2025 winners. It must contain no information about our project. Never edit, add or remove files there unless the user explicitly asks; if a deliverable disagrees with it, change the deliverable.
- `submission/working/`: our own working documents about the project that are not submitted or shown (form-field plan, status against the requirements, project notes, design notes, data snapshots the materials cite). Living: keep them current as the app and the materials change.
- `submission/assets/`: only official third-party material (logos, colours, fonts, patterns). Nothing we made goes there.

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
- **Data Attribution**: Add or update credits for actual map layers and data sources in the side panel's **Sources and credits** section ([AttributionFooter.tsx](ui/src/components/panel/AttributionFooter.tsx)). List NASA FIRMS first, then other NASA sources, and Extremum last. Credit NASA datasets, APIs, and mission or sensor parameters where used, and retain the NASA non-affiliation and non-endorsement note.
