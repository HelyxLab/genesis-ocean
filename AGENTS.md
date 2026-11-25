# Genesis Ocean — Project Instructions

## Project identity

Genesis Ocean is an independent visual explorer for the Genesis L1 blockchain ecosystem, created by Helyx.

The project must be English-only, lightweight, responsive, elegant, interactive, and visually immersive.

Footer signature:
"© 2026 Helyx · MIT Licensed · GitHub · Legal & Transparency"

## Main principles

- Preserve the established Genesis Ocean visual identity.
- Prefer simple, lightweight solutions.
- Avoid unnecessary dependencies and frameworks.
- Prioritize performance, readability, accessibility, and mobile compatibility.
- Never replace existing functionality without understanding its purpose.
- Never remove features without explicit authorization.
- Do not invent blockchain data or display fabricated live activity.
- Keep the code organized and understandable.

## Main sections

The application should include:

1. Universe
2. Uptime
3. Community Pool
4. Apps
5. Helyx

The removed Hell Protocol game must not be reintroduced.

## Universe

The Universe is an animated visual representation of the Genesis L1 ecosystem.

Expected features:

- Active validators only.
- Validators represented as spheres.
- Selecting a validator reveals its delegator cluster.
- Hide delegators with zero L1 delegation.
- Selecting a delegator reveals related blockchain transactions as blue spheres; selecting it again closes the transaction cluster, and selecting it after closing reuses cached data.
- Selecting the active transaction again or returning to its delegator closes the transaction cluster.
- Keep transaction data isolated by delegator and prevent stale RPC responses from changing the current selection.
- Keep the active parent validator selectable while its child clusters are open; when the ray hits both parent and child, prefer the parent, but preserve child selection when the ray misses the parent.
- Only one validator cluster should be expanded at a time.
- Preserve MANUAL as the default exploration experience.
- Label transaction discovery as indexed Cosmos sender transactions, not complete account history.
- Preserve individual denominations and message-scoped transaction evidence.
- Reconcile LCD and GL1X transaction details by hash and expose conflicting evidence.
- Never treat a scheduled redelegation completion time as confirmed completion.
- Clicking the core resets the visualization.
- Selected spheres should be correctly centered.
- Use subtle glow effects.
- Preserve smooth sphere rotation and animation.
- The core should have a subtle pulse when new blocks arrive.
- Avoid oversized star particles and excessive visual effects.

## Uptime

- Display exactly 100 heights preceding the latest observed tip; this one-block display delay is a UI policy and does not claim additional consensus finality.
- Map COMMIT (`block_id_flag: 2`) to signed, ABSENT (`block_id_flag: 1`) to missed only after two complete, consistent observations, and NIL (`block_id_flag: 3`) to unknown.
- RPC failures, incomplete responses, height mismatches, and inconsistent validator mappings must remain unknown and must never be shown as missed.
- Advance the window incrementally: add newly visible heights, evict the oldest, and preserve the other 99 cell elements.
- Serialize height updates, preserve per-height cache/deduplication, and rebuild the matrix only for initial load, validator-context changes, rollback/reorganization, or an explicit global rebuild.
- Retry failed heights without rebuilding successful cells.

## Community Pool

- Display community pool information in English.
- Prioritize L1 balances and relevant blockchain information.
- Use reliable Genesis L1 data sources.
- Never fabricate balances or network information.
- Derive spending execution from the Genesis LCD proposal record. Require a passed proposal and a recognized native or legacy-wrapped spending message before labeling it executed. Keep ambiguous records unverified and exclude signaling-only proposals.

## Apps

- Provide a dedicated area for ecosystem applications.
- Keep the interface simple and consistent with the rest of the project.

## Helyx

- Present the independent Helyx validator, infrastructure, and initiatives.
- Load validator data on demand when the section is opened.
- Distinguish validator stake from voting power.
- Never fabricate validator metrics.
- Preserve the official Helyx branding and visual assets.

## Responsive design

- Desktop and mobile must both be fully supported.
- Text must remain readable.
- Navigation must work on touch screens.
- Footer must remain properly positioned on mobile.
- Avoid horizontal overflow.

## Development and safety rules

- Inspect existing files before editing.
- Explain the intended changes before substantial modifications.
- Prefer small, focused changes.
- Do not rewrite the entire project unnecessarily.
- Do not introduce dependencies without explaining why.
- Do not expose API keys, passwords, private keys, or other secrets.
- Do not make blockchain transactions or sign messages.
- Do not publish or deploy anything without explicit authorization.
- Do not push directly to the main branch.
- Use feature branches for development.
- Run the checks listed below after modifications.
- Report changed files, tests performed, and any remaining issues.
- Reuse the existing canonical modules: `src/js/data/genesis-api.js`, `src/js/data/gl1x-api.js`, `src/js/data/cosmos-normalizer.js`, `src/js/data/cosmos-data.js`, `src/js/transaction-details.js`, `src/js/universe/universe.js`, `src/js/app.js`, and `src/js/navigation.js`. Do not recreate or duplicate them without explicit justification and authorization.
- Preserve `src/js/data/cosmos-normalizer.js` and its tests. Extend them with evidence instead of replacing them.
- Run the complete automated test suite with `npm test` and the production build with `npm run build`. The test command includes the data, application, and Universe test suites.
- Keep `AGENTS.md`, `docs/PRODUCT_VISION.md`, and `docs/ROADMAP.md` synchronized with every change to behavior, data contracts, tests, or capabilities. Update the baseline, status, test counts, and known limitations in the same change.

## Version control

The main branch must always represent a reviewed, stable version.

Development should happen in separate branches and be merged only after review.

The v1.0.0 release candidate establishes a new repository baseline.

The public repository is intended to be maintained at `HelyxLab/genesis-ocean`, with `main` representing reviewed releases and `develop` supporting ongoing development.

The initial repository commit, release merges, tags, pushes, and deployments require explicit maintainer authorization.

## Multi-agent collaboration

- Inspect Git status before editing any file.
- Preserve existing uncommitted work and do not overwrite pending user changes.
- Avoid simultaneous edits to the same files when multiple agents are involved.
- Coordinate file ownership and responsibilities before parallel work begins.
- Never overwrite another agent's pending work without explicit authorization.

## Important references and recovery

Project repository:
HelyxLab/genesis-ocean

This checkout is the source of truth for the implementation described by these instructions. Historical commits, branches, or files that are not present in this checkout must not be treated as verified baselines or described as available.

External recovery copies of Genesis Ocean exist outside this repository. They are not versioned here, their contents are not verified by this document, and they must not be modified, moved, or treated as a baseline without explicit maintainer confirmation. Do not record paths, hashes, or branch names for those copies unless the maintainer explicitly provides and confirms them.


## Release and licensing policy

- The original source code is licensed under MIT.
- Reserved brand assets and third-party components retain their respective rights and licenses.
- Preserve LICENSE, NOTICE, and the distributed license files.
- Keep the application read-only and independent of wallet signing.
- Use the Vite production build for static deployment to Cloudflare Workers.
- Never publish local credentials, temporary experiments, private infrastructure, or recovery copies.
- Do not treat proposed roadmap features as implemented functionality.
- Preserve the approved development sequence in docs/ROADMAP.md.
