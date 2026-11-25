# Genesis Ocean Roadmap

This is the living development plan for Genesis Ocean, from the audited Phase 4.3/5.1 baseline through the first public release for desktop and mobile browsers. Update completion states only after implementation, tests, review, and explicit user approval.

## Planning baseline

- Repository: `HelyxLab/genesis-ocean`
- Maintainer: Helyx
- Release candidate: v1.0.0
- Baseline date: 2026-11-25
- Stack: Vite, JavaScript ES modules, Three.js, CSS.
- Application sections: Universe, Uptime, Community Pool, Apps, and Helyx.
- Default Universe experience: MANUAL.
- Data sources: Genesis L1 LCD, RPC, WebSocket, and GL1X HTTP API.
- License: MIT for original source code; reserved branding and third-party licenses remain separate.
- Hosting: static deployment through Cloudflare Workers.
- Verification: 320 automated tests passed before preparation of the clean repository. The final release checks remain pending.
- The release candidate does not yet have a published Git tag.

Executable source code and automated tests establish actual implementation status.
This roadmap governs approved phases, priorities, and development sequencing.

## Operating modes and independence

The Universe will support three distinct modes. These are behavioral requirements, not claims that the modes have been implemented.

### MANUAL

- The visitor controls navigation and selects the core, validators, and delegators.
- The visitor retains control of camera movement and exploration.
- No automatic presentation behavior may take control while the visitor is exploring manually.

### AUTO

- The Universe guides an autonomous visual tour of validators and their clusters, with changing highlights and camera movement.
- AUTO may use presentation animations without waiting for new blockchain transactions.
- Presentation effects must not be represented as real blockchain activity or imply that an unobserved event occurred.
- AUTO must yield camera and navigation control whenever MANUAL exploration is active.

### LIVE

- LIVE represents only real Genesis L1 events that have been received and validated.
- It may highlight participants in evidence-backed operations and confirmed transfers, and will provide the real-event input for the future Activity Log.
- New-block production is not proof that a transaction or other operation occurred. A block notification may trigger a refresh, but cannot itself create an activity item or transaction animation.
- LIVE must not invent, simulate, or present unconfirmed operations as real.

### Shared architecture

- MANUAL, AUTO, and LIVE must coexist without one mode corrupting another mode's state or taking control unexpectedly.
- LIVE event ingestion continues independently of the selected visual mode. Choosing MANUAL or AUTO changes presentation, not whether real events are collected and validated.
- Preserve the existing Genesis REST/LCD, RPC, and RPC WebSocket architecture. Keep GL1X available as the official explorer and an additional source where its verified capabilities are appropriate; do not treat it as a replacement without an approved, evidence-backed change.
- Keep real-event ingestion and normalization distinct from visual presentation so that AUTO cannot create LIVE records.

## Status at the v1.0.0 release candidate

| Area | Status |
| --- | --- |
| Genesis L1 direct client | Implemented and tested |
| GL1X HTTP client | Implemented and tested |
| Cosmos normalizer | Implemented for supported operations; further coverage planned |
| Cosmos data adapter | Implemented and tested |
| Transaction details | LCD and GL1X evidence reconciled by hash |
| Transaction view contract | Unit-tested; full integration remains pending |
| Universe / MANUAL | Operational default experience |
| Uptime | Implemented; 100-block observation window |
| Community Pool | Implemented; balance, historical comparison and governance |
| Apps | Implemented; 27 applications and resources |
| Helyx | Implemented; validator information loaded on demand |
| AUTO and LIVE | Approved and planned |
| Wallets and Activity Log | Approved and planned |
| EVM, IBC and unified activity | Further integration planned |
| Public release | Final verification pending |

### Known limitations

- Indexed Cosmos sender transactions are limited to 50 records per delegator.
- Transaction discovery is not a complete account history.
- Non-L1 amounts may display raw denominations.
- Conflicting provider evidence must remain explicitly identified.
- Historical balances depend on historical state availability.
- Governance records without identifiable spending messages cannot always be attributed to the Community Pool.
- Comprehensive EVM, IBC and unified activity exploration remain pending.
- Further transaction-view contract integration remains pending.
- External provider failures must not be masked by silent fallback.
- Delegation and transaction-list caches use a 60-second TTL.
- Accessibility and broader performance testing remain future quality work.
- The production JavaScript bundle exceeds the Vite size-warning threshold.

## Phase 4 — Data intelligence and integration

**Objective:** Build a reliable data layer that does not invent relationships, confirmations, or operation states.

### 4.1 — GL1X HTTP client: COMPLETE

Read-only GL1X HTTP client with validated responses, resource caching, stale last-valid responses, pagination helpers, and Cosmos/EVM query methods. Keep its tests as regression coverage when other data-layer work changes.

### 4.2 — Cosmos transaction normalizer: PARTIALLY IMPLEMENTED

Converts Cosmos transaction details into per-message operations, preserves raw integer amounts and denoms, records evidence references, distinguishes transaction execution from operation status, and keeps insufficiently evidenced results unknown. Transfer, delegate, and undelegate paths are covered by tests. IBC initiation does not imply remote receipt.

**Verified improvement:** redelegation normalization uses matching message-scoped evidence. Scheduled completion remains distinct from confirmed completion. Further operation coverage remains planned.


### 4.3 — Integrate the Cosmos normalizer into the data layer: PARTIALLY COMPLETE

The Cosmos adapter implementation is complete and tested. It feeds selected transaction details through `src/js/transaction-details.js`; it does not normalize the transaction list or the transaction spheres. Genesis RPC/LCD cross-provider verification remains pending, and any fallback strategy requires separate explicit design and approval. Full visual Universe integration remains part of Phase 5.1.

Connects the read-only GL1X HTTP client to the Cosmos transaction normalizer with a strict, non-destructive envelope contract, preserving exact provider references and error propagation.

#### Completed deliverables (GL1X transaction adapter: COMPLETE)

- Defined and verified the stable input contract between the GL1X client and normalizer: `createCosmosDataApi({ gl1xApi })` exposing `getNormalizedCosmosTransaction(hash)`.
- Maintained exact three-field return envelope: `{ raw, normalized, meta }`.
- Preserved `raw === response.data` and `meta === response.meta` by direct reference without reconstructing, converting, or discarding provider payloads.
- Preserved stale metadata unchanged (`freshness.state === 'stale'`) and propagated provider/normalizer errors directly without silent fallback.
- Recognized real GL1X redelegation event keys and canonical participant roles. The matcher uses evidence from the corresponding message without requiring a redundant delegator event attribute.
- Tested provider/normalizer boundaries across all 13 required categories in `src/js/data/cosmos-data.test.mjs`, with 97 data-layer tests plus 6 transaction-details tests passing (103 total at the audit). Redelegation fixtures include a synthetic `delegator` attribute and do not cover the production shape.
- Preserved the existing Universe input contract. The later additive selected-transaction detail card is documented under Phase 5.1.


#### Remaining scope (approved Phase 4.3 work)

- Complete Genesis RPC/LCD cross-provider verification for claims that both sources can support, with source provenance and uncertainty kept explicit.
- Preserve the direct GL1X data adapter contract and keep Genesis RPC/LCD as independent complementary verification sources instead of silently substituting one source for another.
- Never introduce silent, automatic fallback that masks transport or API errors.
- Never fabricate missing fields, participants, or operations.

#### Future fallback strategy (not an approved deliverable)

- Any fallback strategy remains a possible future design topic requiring separate explicit design, evaluation, and human approval before implementation.
- Fallback orchestration is not an approved Phase 4.3 deliverable unless the roadmap is explicitly updated and approved.
- Silent automatic fallback remains prohibited.

### 4.4 — Cosmos activity pipeline

- Implement account activity retrieval, bounded pagination, cursor validation, deduplication, refresh, and cache behavior.
- Verify whether account queries return both outgoing and incoming activity; do not treat `message.sender` as a complete account history without evidence.
- Current implementation note: the Universe query uses `message.sender` only and caps results at 50. Incoming transfers are not included, and the UI must not present this as a complete history.
- Document indexer coverage, gaps, limits, and freshness in the result metadata.
- Use new-block notifications as a reason to refresh relevant data. A block notification alone must never create a transaction or activity animation.
- Keep last-valid data distinguishable from current data.

### 4.5 — EVM activity integration: PLANNED

- Use the existing `gl1x-api.js` EVM methods (`getEvmTransaction`, token transfers, logs, address transactions and pagination); do not create a second EVM client.
- Create a separate EVM transaction model. Do not route EVM records through `cosmos-normalizer.js` or present them as Cosmos operations.
- Preserve EVM chain identity, receipt status, revert information, log indices, token standards, and denominations.
- Load EVM details lazily; do not prefetch transactions, receipts, logs or token transfers.
- Avoid duplicating a Cosmos wrapper and its EVM transaction for the same block; resolve identity explicitly.
- Use external GL1X pages for heavy contract/log/token detail when Ocean does not need to reproduce it visually.
- Validate pagination, indexing freshness, errors, and account-query direction.

### 4.6 — Unified activity model: PLANNED

- Introduce a shared envelope for time, layer/source, transaction identity, participants, status, and evidence.
- Preserve network-specific payloads and operation types as tagged variants; Cosmos and EVM remain distinguishable.
- Avoid collapsing Cosmos and EVM addresses, hashes, statuses, or denoms into ambiguous common fields.
- Treat GL1X `/api/transactions` and `/api/transactions/{hash}` as investigated future inputs, not current dependencies. Reuse only after the separate EVM model exists.
- Make unknown and partial coverage explicit; do not infer confirmation from an available detail state.

### 4.7 — Wallet discovery and indexing

- Define the supported meaning of “discovery” before implementation: known address lookup, provider-indexed account history, or a separately operated address index.
- State historical coverage and indexer limits for every discovery method.
- Do not claim exhaustive wallet discovery unless the chosen source demonstrates exhaustive coverage.
- Keep wallet identity and confirmed cross-network aliases separate unless independently verified.

### 4.8 — Operation classification

- Classify transfers, staking operations, IBC, bridge, wrapping, and other recognized operations only from their required evidence.
- Keep transaction execution, local operation initiation, pending completion, remote receipt, and unknown states distinct.
- Bridge completion requires destination-chain evidence; a source-chain `deposit` or `transferRemote` call alone is insufficient.
- Add classification only alongside fixtures from verified provider payloads and negative cases that prevent false positives.

## Phase 5 — Visual experiences

**Objective:** Turn verified data into accessible, understandable visual experiences while preserving the established identity and existing behavior.

### 5.1 — Universe: validators, delegators, and real relationships

**Partially implemented.** Preserve the existing core, validator and delegator clusters, selection/focus behavior, contextual cards, navigation, rotation, glow, and block pulse.

- **Implemented:** Delegator transaction-cluster navigation is reversible. Reopening a loaded delegator reuses per-delegator session data without a new RPC; loading data does not itself open a closed cluster. In-flight RPCs are deduplicated and stale selection callbacks are ignored. The active parent validator is preferred only when the ray also intersects it; the core and unrelated validators retain nearest-hit behavior.
- **Implemented:** An orientation- and viewport-aware zoom minimum keeps the active parent validator in the frustum, shifting the available zoom range only as much as required. The validator layer bounding sphere is recomputed after the parent branch displacement so Three.js raycasting does not reject the moved instance during its broad-phase test.
- **Verified:** 13 transaction-cluster state/picking/zoom tests, including a displaced-`InstancedMesh` raycast regression; 5 delegator transaction cache/request tests.
- **Known limitation:** The in-memory transaction cache lasts for the browser session and does not refresh on re-open; reloading the application starts a new cache session.
- **Done:** selected transaction details are fetched through the Cosmos adapter by `src/js/transaction-details.js` and rendered in the contextual card.
- **Done at unit level:** Etapas A/A.1 provide the pure `transaction-view.js` contract with 22 tests, safe normalized projection, raw-reference removal and deep-freezing. It is not imported by the application.
- **Pending:** normalize the transaction list and transaction spheres against the same adapter; keep status and coverage limitations explicit; integrate LIVE activity only after validation.
- **Pending contract caveats:** the nested record shape must be reconciled with the flat card/hover fields; `transaction-details.js` must map `available` + `meta.freshness === 'stale'` to the record's `stale` state; coverage must represent total/returned count or be labeled clearly; non-JSON metadata and the lost IBC `source_port`/`source_channel` need explicit handling; `available` must never be treated as confirmed.
- **Rule:** Keep Universe as the default experience. Do not rebuild working visualization features as part of data migration. The current transaction list is outgoing-only and capped at 50 records.

### 5.2 — Wallets

Planned. Define address search and account detail behavior against supported data coverage. Show network-specific balances, activity coverage, and freshness; do not imply balances or relationships that the sources do not establish.

### 5.3 — Live Activity

Planned. Display only evidence-backed operations. Treat block notifications as refresh triggers, then fetch and validate transaction details before presenting activity.

### 5.4 — Live Activity Log

Planned. Provide a readable, filterable record of normalized activity, including source, status, partial-data indicators, and verifiable transaction links where available.

### 5.5 — Bridge & Wrapping

Planned. Represent source and destination legs separately, link them only through verified identifiers/evidence, and show pending or unverified state until destination receipt is confirmed.

### 5.6 — AUTO mode

Planned. Add an autonomous visual tour of the existing Universe, including validator and delegator-cluster highlights and camera transitions. AUTO may run without new chain activity, but its presentation animations must never be labeled or logged as real transactions or confirmed network events. It must not take camera control during MANUAL exploration.

### 5.7 — MANUAL, AUTO, and LIVE navigation integration

Planned. Integrate mode selection and transitions with the existing Universe navigation after LIVE and AUTO behavior have been implemented independently. Preserve MANUAL as the default experience and ensure switching presentation modes does not stop LIVE ingestion, discard verified event state, or leave camera/navigation control in an inconsistent state.

### Section-level status outside numbered phases

Community Pool and Apps are required product sections. Apps remains an empty layout shell with no approved numbered phase. Community Pool is implemented under H3 using Genesis L1 LCD `/cosmos/distribution/v1beta1/community_pool`; integer atom strings are safe for `formatL1()`.

## Hybrid Cosmos + EVM integration plan (approved direction; not implemented)

This track records product and architecture direction. It does not reorder the existing Phase 4/5 sequence, and no stage is complete. GL1X API support is not an Ocean implementation. The current Cosmos discovery path remains the Genesis LCD query in the planning baseline.

### H1 — Consolidate the Cosmos transaction contract: PARTIALLY IMPLEMENTED, NOT INTEGRATED

- Preserve Etapas A and A.1 in `src/js/data/transaction-view.js` and its tests; do not recreate them.
- The contract is unit-tested (22 tests) but not imported by `app.js` or `universe.js`.
- Resolve pending caveats before integration:
  - reconcile nested `block`/`discovery` fields with the flat fields read by the current card/hover;
  - map states explicitly: `not-loaded` before any request; `loading` while a request is in flight; `available` when the normalized result and metadata are current; `stale` when the last-valid result has stale metadata; `unavailable` when the provider explicitly has no transaction; `error` when the request fails, retaining any last-valid detail;
  - map `transaction-details.js` `available` + stale metadata to the record `stale` state;
  - represent total/returned coverage or label the 50-record outgoing subset;
  - decide how non-JSON metadata and the dropped IBC `source_port`/`source_channel` are handled.
- `available` means the detail is available, never that an operation is confirmed.
- H1 does not itself authorize UI integration; that belongs to H4.

### H2 — GL1X contextual links: PLANNED

- Add a small, reusable link builder later; do not embed GL1X as an iframe or duplicate its UI.
- Canonical base: `https://explorer.genesisl1.org` (deprecated; not used on the website).
- Planned targets: `/tx/{hash}` (Cosmos or EVM), `/address/{address}`, `/validator/{operator}`, `/block/{height}`, `/community-pool`.
- External links must use `target="_blank"` and `rel="noopener noreferrer"`.
- No change to sphere geometry, camera, colors or selection is planned for this stage.
- No link helper exists today.

### H3 — Community Pool: IMPLEMENTED

- The GL1X balance snapshot, live chain height, and height-pinned 24-hour Genesis RPC comparison have separate data paths.
- The Genesis LCD governance response establishes execution for passed native pool-spend messages and canonical legacy-wrapped pool spends. The pinned SDK commits proposal handler state before persisting a passed outcome, and the migration preserves legacy outcomes. The cards use the existing pagination requests. [Pinned governance handler](https://github.com/crypto-org-chain/cosmos-sdk/blob/8d0a31ef043d/x/gov/abci.go) · [Legacy migration](https://github.com/crypto-org-chain/cosmos-sdk/blob/8d0a31ef043d/x/gov/migrations/v3/convert.go)
- Spending messages must be identifiable to list a proposal. The SDK can remove unsupported messages when it records a failure, so those records cannot be attributed to the pool from this response alone.
- Governance execution verified during development. The complete suite passed 310 tests, including the Universe cluster suite.

### H4 — Cosmos integration: PLANNED

- Integrate the H1 contract into the existing card and transaction spheres only after the H1 caveats are resolved.
- Preserve Genesis LCD discovery (`/cosmos/tx/v1beta1/txs`, `message.sender`) in this phase.
- Preserve `cosmos-normalizer.js`, `cosmos-data.js` and `transaction-details.js`; do not replace them with GL1X heuristics.
- Keep detail loading lazy and bounded; no prefetch of every transaction.
- Surface stale data and query failures explicitly; never silently substitute another source.
- Keep `available` distinct from confirmed; preserve `unknown` statuses.
- Recording H4 does not itself authorize implementation; separate approval is required.

### H5 — EVM integration: PLANNED

- Create an EVM-specific transaction model; do not route EVM through the Cosmos normalizer.
- Reuse the existing `gl1x-api.js` EVM methods and pagination where appropriate; do not add a second EVM client.
- Load EVM details only on demand; avoid prefetching receipts, logs, token transfers or contract data.
- Avoid duplicating a Cosmos `MsgEthereumTx` wrapper and its EVM transaction for the same block; resolve identity explicitly.
- Use contextual GL1X links for heavy contract/log/token detail when visual reproduction is unnecessary.
- Adding EVM spheres to the Universe requires a separate product decision and an approved discovery model.
- No EVM model, data flow or UI exists today.

### H6 — Future expansions: PLANNED

Only after H1–H5 are separately approved and evidenced:

- IBC transfers/channels, with direction, channel and remote-receipt limits explicit.
- Enriched validators (uptime, missed blocks, self-delegation, delegator count).
- Governance proposals and voting.
- Combined Cosmos/EVM account views.
- Additional network metrics.
- All expansions remain lazy, link-heavy and free of a local indexer.

## Approved development sequence

This is the approved execution order; it takes precedence over the numeric ordering of existing phase sections. Existing phase identifiers and their planned work remain unchanged.

1. Finish and preserve MANUAL, including verification of the current Universe behavior in Phase 5.1.
2. Record the AUTO and LIVE behavior specifications. Their requirements are recorded above; this documentation does not mean either mode is implemented.
3. Develop the event-ingestion and normalization infrastructure in the applicable Phase 4 work, especially Phases 4.3–4.6 and 4.8. Preserve source provenance, validation, and uncertainty. Keep Phase 4.7 wallet-discovery work with the later Wallets step unless a verified dependency is identified.
4. Implement LIVE under Phase 5.3 using only received and validated real events.
5. Implement AUTO under Phase 5.6 without fabricating or implying blockchain activity.
6. Integrate AUTO and LIVE with Universe navigation under Phase 5.7, preserving MANUAL as the default and keeping LIVE ingestion mode-independent.
7. Develop Wallets under the existing Phase 5.2 scope.
8. Develop the Activity Log under the existing Phase 5.4 scope, fed by validated real events.

All listed phases remain subject to their existing status and acceptance requirements. Recording this sequence does not mark any implementation phase complete.

The H1–H6 hybrid track is recorded separately and does not reorder the sequence above. It starts only with explicit authorization, and its stages remain planned or partially implemented at unit level until implementation, tests, review and approval exist.

## Post-v1.0.0 product proposals

The following proposals extend the long-term product direction.
They are not implemented in v1.0.0 and do not reorder the approved
development sequence. Each requires an explicit implementation plan,
acceptance criteria, and maintainer approval.

### Universe Search

- Search validators by moniker and operator address.
- Search public Cosmos and EVM wallet addresses.
- Search transaction hashes.
- Focus the camera on existing matching Universe objects.
- Load verified relationships on demand when necessary.
- Preserve MANUAL navigation and existing cluster behavior.
- Clearly distinguish unavailable records from empty results.

### Wallet Explorer

- Explore public wallet information without connecting or signing
  with a wallet.
- Support addresses that do not delegate to an active validator.
- Create temporary visual representations only when supported
  by verified blockchain evidence.
- Remove temporary representations when exploration is reset.
- Never invent relationships, balances, or transaction activity.
- Keep this proposal aligned with the existing Phase 5.2 scope.

### Helyx Names integration

- Investigate optional resolution of .gl1 names to EVM addresses.
- Reuse the verified Helyx Names resolution interface.
- Integrate resolved addresses into Universe Search where appropriate.
- Keep names optional; raw address exploration must remain available.
- Validate ownership, resolution, network identity, and freshness.
- Do not assume that a name automatically resolves to both
  Cosmos and EVM addresses.
- Do not require wallet connections or transactions.

### Activity Log interaction

- Present chronological, filterable, evidence-backed activity.
- Allow navigation from verified activity to associated Universe objects.
- Preserve the Phase 5.4 scope and LIVE event-ingestion requirements.
- Never record AUTO presentation animations as blockchain events.

### Performance improvements

- Evaluate deferred loading of Community Pool and Uptime data.
- Review historical query caching and freshness policies.
- Measure request volume, memory use, and mobile rendering cost.
- Consider code splitting only when supported by measured benefits.
- Preserve data integrity and existing navigation behavior.

## Phase 6 — Product quality

**Objective:** Ensure reliable operation on desktop and mobile, including unstable network conditions.

### 6.1 — Architecture and code review

Review module boundaries, provider responsibilities, data contracts, state ownership, and error propagation after the integrations are in place.

### 6.2 — Integration and data-consistency tests

Test provider adapters, normalization, pagination, deduplication, caching, live refresh, and visual input records. Include failed, partial, stale, duplicate, and out-of-order data.

### 6.3 — Performance and memory

Measure API request volume, retained activity history, Three.js object counts, rendering cost, and cleanup behavior. Optimize only against measured bottlenecks.

### 6.4 — Responsiveness and accessibility

Validate touch navigation, keyboard use, screen-reader labels, reduced motion, text readability, focus visibility, and overflow on representative desktop and mobile sizes.

### 6.5 — Errors, outages, and stale data

Verify clear offline/indexer-lag states, bounded retries, rate-limit handling, stale-data labels, preservation of last-valid data, and recovery after connectivity returns.

### 6.6 — Security and release readiness

Review dependency and build output, browser security policies, public endpoints, logging, and deployment configuration. Keep SSH and administrative interfaces private.

## Phase 7 — Public release

**Objective:** Publish the reviewed application over HTTPS.

### 7.1 — Production build

Generate and verify the Vite production distribution in `dist/`.
Include both HTML pages, visual assets, and license notices.

### 7.2 — Public source repository

Maintain the reviewed release on main and ongoing development
on separate branches. Publish release tags only after approval.

### 7.3 — Cloudflare Workers

Deploy static production files through Cloudflare Workers.
No dedicated application backend or validator-host exposure is required.

### 7.4 — HTTPS and security policies

Verify HTTPS, browser security policies, public API access,
and production error handling.

### 7.5 — External desktop and mobile tests

Verify navigation, layout, WebGL, API availability, WebSocket behavior,
and recovery after connection changes.

### 7.6 — Monitoring, recovery, and backups

Maintain verified recovery copies and document deployment recovery.
Preserve the previous public address through a tested redirect
when migrating the website.

## Delivery milestones

### MVP local — REACHED

The five application sections are operational, including the
existing MANUAL Universe experience.

### Release candidate v1.0.0 — IN REVIEW

Functional improvements, licensing, legal information, documentation,
and targeted security checks have been prepared.
Final tests, build verification, and publication approval remain pending.

### Public release v1.0.0 — PENDING

Publish the reviewed source repository, release tag, and production
website after final approval.

### Hybrid Cosmos + EVM track — PLANNED

Preserve the approved development sequence and existing architecture.
Future integrations require implementation, tests, and approval.

## Required development process

Apply this cycle to each bounded change:

1. Audit the current implementation without changes.
2. Agree on the technical plan and acceptance criteria.
3. Implement only the approved scope.
4. Run the complete automated test suite with `npm test` and the production build with `npm run build`.
5. Review the diff and check for regressions, unrelated changes, and documentation synchronization.
6. Obtain explicit user approval before creating a commit.
7. After approval, synchronize with the authorized GitHub remote and follow the maintainer's recovery-copy procedure as agreed. Do not modify or move external recovery copies without explicit authorization.

Do not commit, push, deploy, or make external blockchain transactions without explicit authorization. Keep development on feature branches and preserve the reviewed stable version on the main branch. The initial release commit and subsequent release merges require explicit maintainer authorization.

## Ongoing roadmap maintenance

- Update this document when a phase is implemented and reviewed; do not mark work complete based only on a plan or partial code.
- Record the completion commit and relevant verification evidence for completed phases.
- Keep unresolved API behavior, coverage boundaries, and architecture decisions visible.
- Reassess dependencies and milestone scope when new evidence changes the plan; record scope changes explicitly rather than silently rewriting approved work.
- Update the baseline, status table, test counts, and known limitations in the same change as the code. The full-suite command is `npm test`; the build command is `npm run build`.
- Add regression tests from real provider payloads when behavior depends on provider-specific event attributes, and state when a fixture is synthetic.
- Keep GL1X API/link references tied to the audited canonical base (`https://explorer.genesisl1.org`, deprecated and not used on the website); do not invent routes or promote a GL1X capability to an Ocean implementation without code, tests and approval.
- Do not add a local indexer or database as part of the hybrid direction.
