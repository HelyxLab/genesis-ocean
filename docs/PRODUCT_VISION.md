# Genesis Ocean — Product Vision and Technical Reference

> **Definitive Architectural Source of Truth**
> **Repository:** `HelyxLab/genesis-ocean`
> **Maintainer:** Helyx
> **Version:** v1.0.0
> **Baseline Date:** 2026-11-25
> **Stable Release:** Published on 2026-11-25
> **Release Commit:** `f985a54325f6a83701d0224b5747161367d41dac`
> **Production Website:** https://genesisocean.helyxlab.workers.dev/
> **License:** MIT (original source code)
> **Signature:** © 2026 Helyx
> **Audience:** All human contributors and AI coding assistants (ChatGPT / Codex, GitHub Copilot, Google Antigravity / Gemini, Cline, Continue, and future agents).

---

## 1. Executive Summary and Mission

Genesis Ocean is an independent, visual, and interactive explorer for the Genesis L1 blockchain ecosystem, created by Helyx. Its mission is to transform raw, distributed ledger data into an immersive, accessible, and intuitive 3D experience without sacrificing technical rigor, cryptographic precision, or architectural transparency.

The product merges three foundational disciplines:
1. **Verifiable Data Engineering:** Conservative normalization, exact integer arithmetic, provenance tracking, and explicit uncertainty without data fabrication.
2. **Three-Dimensional Visual Exploration:** A high-performance WebGL/Three.js universe representing validators, delegators, and transactions as physical celestial bodies in a cohesive celestial-ocean aesthetic.
3. **Transparent Public Infrastructure:** A lightweight, client-side web application designed to run smoothly on desktop and mobile browsers, with static deployment through Cloudflare Workers, without centralized telemetry or fabricated activity.

The central tenet of Genesis Ocean is absolute data integrity: **the visual experience must always be grounded in verifiable blockchain information. Visual elements must never invent, simulate, or imply unconfirmed network activity.**

### 1.1 Product Direction: Hybrid Cosmos + EVM

Genesis Ocean is Cosmos-first today. Its approved direction is to evolve progressively into a **hybrid visual explorer for both Genesis L1 layers** — Cosmos SDK and EVM — while preserving its own visual identity, interaction model, and independent architecture. Genesis Ocean must not become a copy of the GL1X interface.

The visual experience remains Ocean's responsibility. Detailed explorer functions that do not need to be reproduced visually may be delegated to the GL1X explorer through contextual links. GL1X is a complementary data source and a destination for detailed information, not a replacement for the current Genesis LCD/RPC/WebSocket path.

Community Pool data is implemented. Comprehensive EVM support, IBC visualization, unified Cosmos/EVM activity and broader contextual GL1X links remain planned.

---

## 2. Document Authority and Precedence Hierarchy

To prevent conflicting interpretations between different AI models, documentation files, and the codebase, all contributors and coding agents must adhere to the following strict hierarchy of authority:

```
+-------------------------------------------------------------------------------+
| 1. HUMAN USER INSTRUCTIONS                                                    |
|    Sovereign direction provided during the active session.                    |
+-------------------------------------------------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
| 2. AGENTS.md (Operational Inviolable Rules)                                   |
|    Inviolable behavioral rules, safety boundaries, Git restrictions, and      |
|    security constraints governing all automated assistants.                   |
+-------------------------------------------------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
| 3. docs/ROADMAP.md (Execution Roadmap & Phase Tracker)                        |
|    Authoritative source for approved execution phases, phase completion       |
|    statuses, baseline commit hashes, and development sequencing.              |
+-------------------------------------------------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
| 4. docs/PRODUCT_VISION.md (Product Vision & Architecture Reference)          |
|    Authoritative reference for product goals, domain concepts, data contracts,|
|    visual specifications, capability categorization, and Definition of Done. |
+-------------------------------------------------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
| 5. EXECUTABLE SOURCE CODE AND AUTOMATED TESTS (src/, .test.mjs, package.json) |
|    The ground-truth implementation reality. Documentation cannot claim        |
|    capabilities that the codebase contradicts.                                |
+-------------------------------------------------------------------------------+
```

Explicit human instructions have final authority. `AGENTS.md` defines mandatory agent operating rules. `docs/ROADMAP.md` governs approved phases, priorities, and development sequencing. `docs/PRODUCT_VISION.md` defines product purpose, architecture, and intended experience. Source code and automated tests establish actual implementation status.

This document does not override `docs/ROADMAP.md` sequencing or executable evidence. When a conflict arises between an agent's internal suggestions and this document, this document remains the authoritative product and architecture reference, subordinate only to explicit human instructions, `AGENTS.md`, and `docs/ROADMAP.md` on sequencing and approval.

---

## 3. Four-Category Capability Classification

Every capability, feature, and architectural element in Genesis Ocean belongs to exactly one of the following four categories:

1. **`[IMPLEMENTED AND VERIFIED]`**: Code exists in the repository, builds cleanly, and passes automated or manual verification.
2. **`[PARTIALLY IMPLEMENTED]`**: Functional components exist, but related integration, fallback orchestration, or complete UI wiring remains incomplete.
3. **`[APPROVED AND PLANNED]`**: Formally approved in the product scope and/or `docs/ROADMAP.md` with defined requirements, awaiting execution in the approved sequence.
4. **`[PROPOSED FUTURE POSSIBILITY]`**: Exploratory proposals, aspirational quality targets, or post-1.0 vision items requiring evaluation before approval.

An `IMPLEMENTED AND VERIFIED` claim requires evidence in the repository and in automated tests. Where a working implementation has only manual or live evidence, the status row uses the qualifier `IMPLEMENTED — LIVE-VERIFIED, NO AUTOMATED TESTS`; this is a verification qualifier, not a fifth capability category. A capability with no data, state, or behavior beyond a layout shell is documented as not implemented, even when an empty shell exists.

### 3.1 Status Matrix at the v1.0.0 Stable Release

| Component / Area | Classification | Repository Evidence | Technical Capabilities & Status |
| :--- | :--- | :--- | :--- |
| **Genesis L1 Direct Client** | `IMPLEMENTED AND VERIFIED` | `src/js/data/genesis-api.js`, `src/js/data/genesis-api.test.mjs` | Public REST, RPC and WebSocket integration with network identity, validators, delegations, indexed sender transactions, governance and historical balance queries. |
| **GL1X HTTP Client** | `IMPLEMENTED AND VERIFIED` | `src/js/data/gl1x-api.js`<br>`src/js/data/gl1x-api.test.mjs` | Read-only explorer client. Supports Cosmos and EVM endpoints, cursor pagination, payload shape validation, ETag and server time capture, and graceful stale last-valid caching on transient network failure. Selected Cosmos details are wired; many Cosmos/EVM/account methods and the unified GL1X API are not wired into the UI. |
| **GL1X Contextual Links** | `APPROVED AND PLANNED (NOT IMPLEMENTED)` | `docs/ROADMAP.md` H2 | Planned only. The previously planned canonical external base `https://explorer.genesisl1.org` is deprecated and must not be used on the website; any future contextual-link implementation requires a verified replacement endpoint; links for transactions, addresses, validators, blocks and Community Pool are not implemented. No visual-sphere change is planned for this stage. |
| **Cosmos Normalizer** | `PARTIALLY IMPLEMENTED` | `src/js/data/cosmos-normalizer.js`, `src/js/data/cosmos-normalizer.test.mjs` | Evidence-backed normalization of supported Cosmos operations. Redelegation matching uses message-scoped evidence. Scheduled completion does not establish completed execution. Further operation coverage remains planned. |
| **Cosmos Data Adapter** | `IMPLEMENTED AND VERIFIED` | `src/js/data/cosmos-data.js`<br>`src/js/data/cosmos-data.test.mjs` | Connects GL1X transaction queries directly to the Cosmos normalizer. Strictly enforces the `{ raw, normalized, meta }` contract. Preserves exact object references (`raw === response.data`, `meta === response.meta`). Propagates errors directly without silent fallback. Frozen interface object. |
| **Transaction Details Controller** | `IMPLEMENTED AND VERIFIED` | `src/js/transaction-details.js`<br>`src/js/transaction-details.test.mjs` | Requests normalized details for the selected transaction, deduplicates in-flight requests, distinguishes loading/available/unavailable/error states, rejects a mismatched hash, and prevents late responses from updating another selection. Results are cached for the session with no TTL. |
| **Transaction View Contract (Etapas A/A.1)** | `PARTIALLY IMPLEMENTED (UNIT LEVEL, NOT INTEGRATED)` | `src/js/data/transaction-view.js`<br>`src/js/data/transaction-view.test.mjs` | Pure transaction record mapper with safe normalized projection, raw-reference removal and deep-freezing. Unit-level only: not imported by `app.js` or `universe.js`; nested shape is not yet compatible with the current card/hover; controller `stale` mapping, total coverage and non-JSON metadata caveats remain. See Section 6.3. |
| **Data Layer Integration** | `PARTIALLY IMPLEMENTED` | `src/js/app.js`<br>`src/js/transaction-details.js` | Selected transaction details use the Cosmos adapter. The validator, delegator, and transaction list/spheres still use `genesis-api.js`. Genesis RPC/LCD cross-provider verification remains pending. GL1X contextual links and hybrid EVM integration are planned, not implemented. Silent automatic fallback is prohibited. |
| **3D Universe Engine** | `PARTIALLY IMPLEMENTED` | `src/js/universe/universe.js`<br>`src/js/app.js` | Three.js instanced rendering for validator, delegator, and transaction spheres; golden-angle distribution; selection/focus zoom; smooth orbit; subtle glow; core pulse on WebSocket block arrival; floating contextual cards. Lists and spheres consume `genesis-api.js`; selected transaction details consume `cosmos-data.js` through `transaction-details.js`. Full normalized transaction visualization, EVM and IBC representation remain pending. |
| **Uptime Window** | `IMPLEMENTED AND VERIFIED` | `src/js/uptime.js`<br>`src/js/uptime.test.mjs` | Displays exactly 100 heights before the observed tip. The display delay is an application policy, not a claim of extra consensus finality. Updates the window incrementally while preserving 99 existing cell nodes, serializes tip reconciliation, and renders missed only after two complete consistent ABSENT observations; errors, incomplete data and NIL remain unknown. |
| **Delegator Transaction Navigation and Parent Picking** | `IMPLEMENTED AND VERIFIED` | `src/js/universe/transaction-cluster-state.test.mjs`<br>`src/js/delegator-transactions.test.mjs` | Reversible open/close navigation; cached records remain separate from visual expansion state. Per-delegator in-flight requests are deduplicated, failures can be retried, and stale selection callbacks cannot update the current view. The active validator wins a child overlap only when its sphere is also intersected; its instanced-mesh bounds are refreshed after branch displacement. Viewport-aware zoom bounds keep it accessible. Cache is in-memory for the browser session and is not refreshed by reopening. |
| **Hybrid Cosmos + EVM Direction** | `APPROVED AND PLANNED (NOT IMPLEMENTED)` | `docs/ROADMAP.md` H1–H6 | Architectural direction only. The application remains Cosmos-first; EVM, IBC and unified activity are not implemented. No local indexer/database will be introduced. |
| **EVM Transaction Model** | `APPROVED AND PLANNED (NOT IMPLEMENTED)` | `docs/ROADMAP.md` Phase 4.5 and H5 | Planned separate EVM model using the existing `gl1x-api.js` EVM methods. EVM records must not pass through the Cosmos normalizer. Details are lazy; no code exists yet. |
| **Application Navigation & Shell** | `IMPLEMENTED AND VERIFIED` | `src/js/navigation.js`, `index.html`, `src/css/` | Five application sections, hash navigation, responsive layout, camera controls and reduced-motion support. Broader accessibility verification remains pending. |
| **Community Pool** | `IMPLEMENTED AND VERIFIED` | `src/js/community-pool.js`, `src/js/community-pool.test.mjs` | GL1X balance snapshots, historical 24-hour Genesis RPC comparison, supply indicators, separate snapshot and chain heights, and evidence-backed governance spending outcomes. |
| **Apps Directory** | `IMPLEMENTED AND VERIFIED` | `src/js/apps.js`, `src/js/apps.test.mjs` | Directory of 27 ecosystem applications and resources with category filtering and responsive cards. |
| **MANUAL Mode** | `PARTIALLY IMPLEMENTED` | `src/js/universe/universe.js`<br>`src/js/app.js` | User-driven camera navigation, validator selection, and reversible delegator/transaction cluster navigation are operational. There is no explicit mode state machine; isolation and coordination with AUTO and LIVE remain planned under Phase 5.7. |
| **LIVE Mode** | `APPROVED AND PLANNED` | Phase 5.3 in `docs/ROADMAP.md` | Real-time visual updates triggered exclusively by validated block transactions, supporting graceful pause on tab invisibility and immediate reconnection. Not yet implemented. |
| **AUTO Mode** | `APPROVED AND PLANNED` | Phase 5.6 in `docs/ROADMAP.md` | Autonomous visual tour with camera transitions and highlights without implying real blockchain activity. Must yield control to manual input. Not yet implemented. |
| **Mode Navigation Integration** | `APPROVED AND PLANNED` | Phase 5.7 in `docs/ROADMAP.md` | Unified UI toggle and state coordination between MANUAL, AUTO, and LIVE modes. Not yet implemented. |
| **Wallets Module** | `APPROVED AND PLANNED` | Phase 5.2 in `docs/ROADMAP.md` | Public address exploration across Cosmos (`genesis1...`) and EVM (`0x...`) address spaces with liquid balances, active delegations, and unbonding positions. Not yet implemented. |
| **Live Activity Log** | `APPROVED AND PLANNED` | Phase 5.4 in `docs/ROADMAP.md` | Tabular, filterable chronological record of normalized blockchain operations. Not yet implemented. |
| **Bridge & Wrapping** | `APPROVED AND PLANNED` | Phase 5.5 in `docs/ROADMAP.md` | Visual representation of cross-chain IBC transfers and wrapped asset flows with explicit unverified remote receipt status. Not yet implemented. |
| **Quality & Resilience Audits** | `APPROVED AND PLANNED` | Phase 6 in `docs/ROADMAP.md` | Systematic review of memory leaks, accessibility, touch navigation, rate-limit resilience, and error recovery. |
| **Deployment Architecture** | `IMPLEMENTED — LIVE-VERIFIED, NO AUTOMATED TESTS` | Phase 7 in `docs/ROADMAP.md` | Static Vite production deployment through Cloudflare Workers. Public HTTPS access, legal resources, and the legacy HTTP 301 redirect were verified. Broader operational testing remains ongoing. |
| **Performance Benchmark Targets** | `PROPOSED FUTURE POSSIBILITY` | Sections 7.2 and 10.3 of this document | Sustained 60 FPS on mobile hardware, Google Lighthouse scores > 90 for performance and accessibility. Aspirational quality targets, not verified benchmarks. |

The transaction-view contract remains unit-tested and is not fully integrated into the application.

### 3.2 Repository State at the Stable Release

- Stable release: v1.0.0.
- Repository: `HelyxLab/genesis-ocean`.
- Baseline date: 2026-11-25.
- Automated tests: 320 passed in the clean repository.
- Full test command: `npm test`.
- Production build: `npm run build`.
- Original source code licensed under MIT.
- Branding and third-party licensing are documented in NOTICE.
- Public GitHub release and production website published on 2026-11-25.

---

## 4. Application Architecture and Sections

As defined in `AGENTS.md` and `index.html`, the top-level application architecture is organized into five primary sections:

1. **Universe** — The visual 3D core of the ecosystem.
2. **Uptime** — Validator signing history for the 100 displayed heights before the latest observed tip.
3. **Community Pool** — On-chain community pool transparency.
4. **Apps** — Curated ecosystem directory.
5. **Helyx** — Independent validator, infrastructure, initiatives, and public validator information.

Planned feature modules (Wallets, Live Activity, Live Activity Log, Bridge & Wrapping) will integrate as specialized views, overlay panels, or sub-modes within this primary structure.

```
+-----------------------------------------------------------------------------------+
|                               GENESIS OCEAN SHELL                                 |
|  [Header: Logo | Network Status]                                                  |
|  [Navigation: Universe | Uptime | Community Pool | Apps | Helyx]                |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  [ UNIVERSE (3D WebGL Stage) ]           [ SIDEBAR / OVERLAY PANELS ]             |
|   - Pulsing Ecosystem Core                - Contextual Inspection Cards           |
|   - Bonded Active Validators (Teal)       - Live Activity Feed (Phase 5.3 Planned)|
|   - Delegator Clusters (Purple)           - Searchable Activity Log (Phase 5.4 Pl)|
|   - Evidence Transactions (Blue)          - Wallet Inspector (Phase 5.2 Planned)  |
|   - Orbit / Focus / Centering Camera      - Bridge & Wrap Explorer (Phase 5.5 Pl) |
|   - Mode Coordination: MANUAL/AUTO/LIVE                                           |
|                                                                                   |
+-----------------------------------------------------------------------------------+
|  [ FOOTER: "© 2026 Helyx" | "AN INDEPENDENT GENESIS L1 EXPLORER" ]           |
+-----------------------------------------------------------------------------------+
```

### 4.1 Universe (Primary Visual Experience) `[PARTIALLY IMPLEMENTED]`

The Universe is the visual core of Genesis Ocean. It models active consensus and staking relationships in real time.

- **Current Implementation State:**
  - Three.js instanced rendering for validators, delegators, and transactions.
  - Sizing derived from bonded tokens ratio with square root / golden angle distribution.
  - Core pulses subtly on WebSocket block arrival (`subscribeNewBlocks`).
  - Single-cluster expansion: clicking a validator reveals its delegators; clicking a delegator reveals related transactions.
  - Clicking the core resets camera focus and deselects all active clusters.
  - While delegator or transaction clusters are open, raycasting can select the active parent validator when its sphere is intersected, even if a child sphere is nearer. Child spheres remain selectable outside the parent's hit area; core and unrelated validator picks keep their normal priority.
  - The zoom minimum is calculated from parent/focus separation, current camera orientation, field of view, and viewport aspect so the parent remains in the frustum without a fixed global zoom restriction. Existing scale animation and halo rendering remain unchanged.
  - Floating contextual card tracks 3D coordinates to display moniker, operator address, commission rate, bonded stake, and transaction counts.
  - Validator, delegator, and transaction lists/spheres still use the Genesis data path (`genesis-api.js`). Selected transaction details already use the Cosmos adapter through `transaction-details.js`; full normalized transaction visualization remains pending.
  - Clicking an expanded delegator closes its transaction cluster; clicking it again reopens the cached per-delegator records without an RPC. Returning from a transaction or selecting its active sphere closes the transaction cluster. RPC data loading is independent of visual expansion.
  - Concurrent transaction-list RPCs are deduplicated per delegator. Failed requests are not cached, and callbacks from obsolete selections cannot alter the active view. The cache lasts until the browser page is reloaded.
- **Visual Design:**
  - **Core (Gold `#ffbf55`):** Represents network origin and consensus heartbeat.
  - **Validators (Teal `#38d6cf`):** Active bonded validators only (`BOND_STATUS_BONDED` and non-jailed).
  - **Delegators (Purple `#a78bfa`):** Non-zero active delegators arranged in an orbital shell around their validator. Zero-balance delegators are strictly filtered out.
  - **Transactions (Blue `#438cff`):** Outgoing transactions returned by the `message.sender` query for the selected delegator, bounded to 50 records. This is not a complete account history and does not include incoming transfers.
- **Remaining Phase 5.1 Work:** Reconcile the transaction list/spheres with the Phase 4.3 Cosmos data adapter (`cosmos-data.js`) without disrupting existing Three.js rendering or camera animations. The selected transaction detail card is already integrated.

### 4.2 Community Pool `[IMPLEMENTED]`

- The balance and snapshot height come from GL1X. The 24-hour comparison uses a height-pinned Genesis RPC balance when available. The current chain height is displayed separately.
- Spending proposals come from the Genesis LCD. The card uses the governance outcome and the executable message type to identify committed native or legacy-wrapped spends. Failed, rejected, pending, and unverified outcomes are shown separately. See [H3 in the roadmap](ROADMAP.md#h3--community-pool-implemented) for the verified baseline and coverage limits.
- **Requirements:** English-only display; prioritize verified L1 balances; never fabricate balances or network information.

### 4.3 Apps Directory `[IMPLEMENTED]`

- **Current Implementation State:** Implemented. The Apps directory contains 27 ecosystem applications and resources, with category filtering, responsive cards and automated tests.
- **Approved Scope:** Curated showcase of decentralized applications, infrastructure tools, and ecosystem services operating on Genesis L1.
- **Requirements:** Responsive card grid categorized by domain; consistent visual styling; verified links only.
- **Strict Rule:** The removed historical "Hell Protocol" game must **never** be reintroduced.

### 4.4 Uptime `[IMPLEMENTED]`

The Uptime view displays exactly 100 heights from `H-100` through `H-1`, where `H` is the latest observed tip. Keeping `H` outside the matrix is a one-block display delay only; it does not assert additional consensus finality.

- COMMIT (`block_id_flag: 2`) is signed (green).
- ABSENT (`block_id_flag: 1`) is missed (red) only after two complete, consistent observations for the same height and validator.
- NIL (`block_id_flag: 3`), failed RPCs, incomplete responses, mismatched heights and inconsistent mappings are unknown (gray), never missed.
- After initial load, each entering height updates one column and evicts the oldest; the other 99 cells retain their DOM identity.
- One serialized window pump orders height changes, coalesces pending tips and catches up every intermediate height. Failed heights can be retried individually. A full rebuild is reserved for initial load, validator-context change, rollback/reorganization, or explicit global refresh.
- **Verification:** 54 tests in `src/js/uptime.test.mjs`, including window boundaries, confirmations, incremental DOM identity, retries, context changes and pump concurrency.

### 4.5 Hybrid Cosmos + EVM Experience Direction `[APPROVED AND PLANNED]`

This section records product direction. It does **not** claim that EVM, IBC, unified activity, or Community Pool integration exists.

- **Current state:** Genesis Ocean remains a Cosmos-first visual explorer. The Universe models active validators, non-zero delegators and outgoing Genesis LCD transactions. Selected Cosmos transaction details use the existing GL1X adapter. Etapas A/A.1 exist only as a unit-level transaction contract and are not integrated. EVM and IBC are not represented.
- **Own identity:** The visual language, camera behavior, sphere hierarchy, card layout, and interaction model remain Genesis Ocean's. GL1X is not a design template and must not be embedded as a replacement UI.
- **Complementary sources:**

  | Source | Current role | Planned role |
  |---|---|---|
  | Genesis LCD/RPC/WebSocket | Validators, delegations, outgoing transaction discovery, network head | Continue as the primary Cosmos discovery path in this phase |
  | GL1X selected Cosmos detail | Selected transaction detail through `cosmos-data.js` | Preserve; do not replace with GL1X heuristics |
  | GL1X Community Pool API | Not used | Planned for the Community Pool section |
  | GL1X unified and EVM APIs | Not used | Investigated for future EVM/unified activity, with lazy loading |
  | GL1X external pages | Not used | Planned contextual links for detailed information |

- **Progressive experience:** Future work may represent Cosmos, EVM and IBC activity in the visual/list experience. EVM must use its own model; it must not be routed through `cosmos-normalizer.js`. Cosmos and EVM records related to the same block or `MsgEthereumTx` wrapper must not be duplicated or collapsed without evidence.
- **Laziness and limits:** No prefetch of transactions or EVM details. No local indexer or database. Detailed EVM/contract/token information should normally open the canonical GL1X page instead of being reproduced.
- **Contextual links:** The previously planned canonical external base `https://explorer.genesisl1.org` is deprecated and must not be used on the website; any future contextual-link implementation requires a verified replacement endpoint. Planned link targets include `/tx/{hash}` (Cosmos or EVM), `/address/{address}`, `/validator/{operator}`, `/block/{height}`, and `/community-pool`. Links must use the identifiers Ocean already holds and must not change the sphere visualization.
- **Truthfulness:** A GL1X API being capable of returning EVM or unified data does not make that capability implemented in Genesis Ocean. No hybrid stage is functionally integrated; H1 exists only as unit-level code and tests, and H2–H6 remain planned until code, review and explicit approval exist.

---

## 5. Operating Modes Architecture

Genesis Ocean specifies three distinct operating modes in `docs/ROADMAP.md`. These are **behavioral requirements and specifications**, not claims that all three modes are currently operational:

```
               +------------------------------------------------+
               |                  USER ACTION                   |
               +-----------------------+------------------------+
                                       |
                   +-------------------+-------------------+
                   |                                       |
                   v                                       v
         [ MANUAL INTERACTION ]                  [ AUTO TOUR TRIGGER ]
                   |                                       |
                   v                                       v
        +----------------------+                +----------------------+
        |     MANUAL MODE      |                |      AUTO MODE       |
        | [PARTIALLY IMPLEMENT]|                | [APPROVED & PLANNED] |
        | - Full user control  |                | - Camera tour        |
        | - Cluster expansion  |                | - Ambient highlights |
        | - Detail inspection  |                | - Yields on touch/key|
        +----------------------+                +----------------------+
                   ^                                       ^
                   |                                       |
                   +-------------------+-------------------+
                                       |
                                       v
                        +------------------------------+
                        |          LIVE MODE           |
                        |     [APPROVED & PLANNED]     |
                        | - Validated event highlights |
                        | - Real-time block pulses     |
                        | - Ingestion is mode-agnostic |
                        +------------------------------+
```

### 5.1 MANUAL Mode `[PARTIALLY IMPLEMENTED]`
- **Status:** The default mode. Selection, camera rotation, zoom, recentering, and cluster expansion are implemented in `src/js/universe/universe.js` and `src/js/app.js`.
- **Behavior:** The user controls camera position, zoom, and entity selection. Expanding validator clusters, selecting delegators, and inspecting transactions occurs strictly on user demand.
- **Rule:** Autonomous presentation behaviors are strictly prohibited from hijacking camera control or clearing selections while the user is actively exploring.

### 5.2 AUTO Mode `[APPROVED AND PLANNED]`
- **Status:** Planned under Phase 5.6. Not yet implemented.
- **Behavior:** Designed for kiosk, ambient, or unattended display. Autonomously animates camera transitions across key validators and delegator clusters with changing highlights.
- **Critical Rule:** AUTO may use presentation effects, but these effects must **never** be labeled, logged, or animated as real blockchain transactions. AUTO must instantly yield camera and navigation control whenever manual user input is detected.

### 5.3 LIVE Mode `[APPROVED AND PLANNED]`
- **Status:** Planned under Phase 5.3. Not yet implemented.
- **Behavior:** Displays real, incoming Genesis L1 network activity in real time. Highlights spheres only when incoming transaction messages have been validated against the normalized activity model.
- **Critical Invariant:** A new block event indicates *only* that a block was minted. It is **never** proof that a transaction occurred. Real-event highlights must only render after transaction payloads have been fetched, normalized, and confirmed.
- **Independence:** LIVE event ingestion continues independently in the background regardless of whether visual display is in MANUAL or AUTO mode.

---

## 6. Data Architecture and Mandatory Technical Principles

```
 [ Genesis L1 Node ]               [ GL1X Explorer Service ]
  - REST / LCD (:1317)              - HTTP API (https://gl1x.com)
  - Consensus RPC (:26657)          - Cosmos detail endpoints
  - WebSocket (/websocket)          - EVM indexer endpoints
         |                                     |
         +------------------+------------------+
                            |
                            v
               +--------------------------+
               |   src/js/data/           |
               |   - genesis-api.js       |  [IMPLEMENTED, NO UNIT TESTS]
               |   - gl1x-api.js          |  [IMPLEMENTED & VERIFIED]
               +------------+-------------+
                            |
                            v
               +--------------------------+
               |   cosmos-normalizer.js   |  [PARTIALLY IMPLEMENTED]
               +------------+-------------+
                            |
                            v
               +--------------------------+
               |   cosmos-data.js         |  [IMPLEMENTED & VERIFIED]
               |   transaction-details.js |  [IMPLEMENTED & VERIFIED]
               +------------+-------------+
                            |
                            v
               +--------------------------+
               |   Visual Application     |  [PARTIALLY IMPLEMENTED:
               |   - universe.js          |   lists/spheres use genesis-api;
               |   - app.js               |   selected details use cosmos-data
               |   - contextual UI cards  |   through transaction-details.js]
               +--------------------------+
```

The diagram describes the **current Cosmos path only**. EVM is not wired. A future EVM path must use a separate EVM model through the existing `gl1x-api.js` EVM methods and must not pass through `cosmos-normalizer.js`. The GL1X unified API is an investigated future complement, not a current dependency.

### 6.1 The Eight Mandatory Data Principles

Every contributor and AI agent must adhere to these eight non-negotiable principles:

1. **Never Invent Blockchain Data:** No mock transactions, fabricated balances, simulated blocks, or synthetic address relationships may ever be rendered in production modes.
2. **Never Fabricate Missing Fields or Participants:** If an event attribute, participant address, or coin amount is missing or malformed in a provider response, it must be marked as `unknown`, `null`, or `incomplete`. Never substitute array indices or guess addresses.
3. **Preserve Original Provider Evidence:** Always preserve the raw transaction payload and event logs alongside normalized records (`rawEvidence` / `raw`).
4. **Preserve Strict Integer Precision:** Blockchain tokens are denominated in atomic units (e.g., `el1` with 18 decimal places). Never parse token quantities into JavaScript IEEE-754 floating-point numbers (`Number(amount)`). Keep atomic balances as string integers or use `BigInt`.
5. **Preserve Clear Data Provenance:** Preserve all provenance metadata actually provided by the source. Never fabricate unavailable metadata. Clearly identify the provider and endpoint whenever known. Metadata fields that are unavailable from the source must remain absent or explicitly unknown, according to the data contract.
6. **Never Hide Provider Errors via Silent Fallback:** If GL1X returns an error or malformed payload, propagate that error cleanly. Do not silently fall back to another source in a way that masks errors or returns fabricated empty states. Any future cross-provider verification must make source and status explicit.
7. **Strictly Read-Only Scope:** Genesis Ocean is an explorer, not a wallet. It must never store private keys, request seed phrases, construct unconfirmed state, sign messages, or broadcast transactions.
8. **Never Break Working Visual Features for Data Migration:** Integration of new data layers must proceed incrementally without breaking existing working Three.js animations, camera controls, or UI cards.

### 6.2 Phase 4.3 Cosmos Data Adapter Contract Specification `[IMPLEMENTED AND VERIFIED]`

The completed Phase 4.3 adapter in `src/js/data/cosmos-data.js` enforces the exact three-field return contract:

```javascript
{
  raw,        // Exact, unmodified object reference from gl1xApi (response.data)
  normalized, // Output of normalizeCosmosTransaction(response.data)
  meta        // Exact, unmodified metadata reference from gl1xApi (response.meta)
}
```

- **Reference Equality Guarantee:** `result.raw === response.data` and `result.meta === response.meta`.
- **Stale Metadata Preservation:** Stale responses returned by the client caching layer retain their `freshness: { state: 'stale' }` and `lastError` properties without modification.
- **Normalized Operation Schema:**
  - `id`: Unique operation identifier (`${hash}:msg:${msgIndex}`).
  - `transactionHash`: Hash of the containing transaction.
  - `type`: Standardized operation type (`transfer`, `delegate`, `undelegate`, `redelegate`, `ibc_transfer`, `other`, `unknown` when the message type is absent).
  - `messageType`: Raw `@type` string from the Cosmos message.
  - `msgIndex`: Integer index of the message within the transaction.
  - `status`: Conservative business status (`confirmed`, `awaiting_completion`, `initiated`, `unknown`).
  - `statusReason`: Conditional reason when a transaction failed and the per-message result is unavailable.
  - `participants`: Array of `{ role, address }` using canonical roles:
    - Transfer: `sender`, `recipient`
    - Delegate / Undelegate: `delegator`, `validator`
    - Redelegate: `delegator`, `source_validator`, `destination_validator`
    - IBC Transfer: `sender`, `recipient`
  - `amounts`: Array of `{ integer, denom }` preserving exact string amounts.
  - `amountsComplete`: Boolean when the amount contract is known, otherwise `null`; `false` when any amount is missing or malformed.
  - `amountIssues`: Array of explicit amount parsing issues, preserving the raw value and reason.
  - `completionTime`: ISO timestamp string for the scheduled unbonding/redelegation completion, or `null`.
  - `statusScope` and `remoteReceipt`: IBC-only fields; local submission is scoped explicitly and remote receipt remains `unverified`.
  - `evidence`: Scoped events and message payload verifying the operation.
- **Top-Level Unscoped Evidence:** `unscopedEvents` preserves events that cannot be attributed to a message by a valid `msg_index`; they are never silently reassigned.

### 6.3 Known Limitations at the Audited Baseline

- **Outgoing-only transaction history:** the delegator transaction list queries `message.sender` only and is capped at 50 records (`MAX_DELEGATOR_TRANSACTIONS`). It is not a complete account history; incoming transfers are not included.
- **Transfer amounts:** array-valued coins and multiple denominations are handled separately. Non-L1 denominations may retain their raw identifiers.
- **Redelegation status:** matching evidence must belong to the same message. Completion timestamps represent scheduled completion, not confirmed completion.
- **Community Pool:** historical comparisons depend on available historical state. Governance records without identifiable spending messages cannot always be attributed to the pool.
- **Apps:** external application availability and behavior remain outside Ocean's control.
- **Transaction view contract (Etapas A/A.1):** `transaction-view.js` is unit-tested but not integrated into `app.js` or `universe.js`. Its nested shape is not yet compatible with the current card/hover flat fields; `transaction-details.js` has no `stale` state and must be mapped from `available` plus `meta.freshness`; coverage does not carry `total`/returned count; non-JSON metadata is flattened by `copyPlain`; IBC `source_port`/`source_channel` are not preserved by the allowlist; `available` means detail availability, not confirmed operations.
- **EVM and unified activity:** not implemented. GL1X EVM/unified APIs exist and were audited, but no EVM model, list, sphere, or unified Cosmos/EVM activity is wired. A separate EVM model is required; the Cosmos normalizer must not be reused for EVM.
- **GL1X contextual links:** not implemented. No link helper or external-link UI exists. Planned canonical base: `https://explorer.genesisl1.org` (deprecated; must not be used on the website).
- **External GL1X dependency:** GL1X APIs are public and CORS-enabled, but rate limits, availability and payload evolution are outside Ocean's control. No silent fallback may mask an external failure.
- **IBC:** not represented in the visual experience. GL1X IBC endpoints are an investigated future source, not an implemented Ocean capability.
- **Detail cache:** normalized transaction details are cached for the session with no TTL; delegation and transaction-list caches use a 60-second TTL and do not provide a full stale-data indicator for clusters.
- **WebSocket baseline:** the live feed establishes its baseline through `getNetworkIdentity()`, which requires both Genesis REST and RPC. A REST failure can prevent live WebSocket activation even when the socket and RPC are reachable. There is no heartbeat or explicit detection of a silently stalled feed.
- **Cross-provider verification:** LCD and GL1X transaction evidence is reconciled by hash. Conflicting GL1X details are withheld. Broader cross-provider verification remains future work.
- **Automated coverage:** the complete Node test suite passed 320 tests in the clean repository. Comprehensive browser, accessibility and end-to-end coverage remains future work.
- **Mobile and accessibility verification:** Pointer Events and reduced-motion handling exist in code, but real-device mobile, keyboard-only, screen-reader, and automated accessibility verification remain pending.
- **Build size:** the production JavaScript bundle is approximately 665 kB minified and 173 kB gzip. Code splitting remains a potential optimization.
- **Repository state:** the public repository and v1.0.0 release are published.

### 6.4 Hybrid Source and Integration Policy

1. **Cosmos discovery stays on Genesis LCD in this phase.** The current transaction discovery query is `/cosmos/tx/v1beta1/txs` with `message.sender`, bounded to 50 outgoing records. It is not a complete account history.
2. **GL1X is complementary.** Selected Cosmos transaction details already use GL1X through `gl1x-api.js`, `cosmos-data.js`, `cosmos-normalizer.js` and `transaction-details.js`. Future Community Pool, contextual links and EVM/unified data must remain additive.
3. **Do not replace the Cosmos normalizer with GL1X heuristics.** GL1X decoded messages are provider evidence, not a substitute for Ocean's conservative operation status model.
4. **EVM has its own model.** EVM transactions, logs, token transfers and receipts must not be routed through the Cosmos normalizer or presented as Cosmos operations.
5. **No local indexer or database.** The Ocean consumes Genesis/GL1X APIs and links to GL1X for detailed pages; it must not reproduce GL1X's indexing infrastructure.
6. **Lazy by default.** Load feed pages and details only when needed. Do not prefetch all transactions, EVM receipts, logs or token transfers to populate spheres.
7. **Canonical external links.** Do not use the deprecated `https://explorer.genesisl1.org`; any future implementation requires a verified replacement endpoint; do not invent routes. A GL1X API capability is not an Ocean implementation.
8. **States are not business confirmations.** `transaction-view.js` states describe detail availability. Operation confirmation remains in normalized operation status and must never be inferred from `available` alone.

---

## 7. Visual Identity and Styling System

The Genesis Ocean visual identity is defined by restraint, performance, and celestial elegance.

### 7.1 Color Palette
- **Background / Panel:** `#071014` / `#0b171b`; the Universe stage uses a radial gradient over `#081316`.
- **UI Accent:** `#74d9bd` for interactive text, focus rings, and active navigation.
- **Core (Consensus Root):** `#ffbf55` (warm gold glow).
- **Validators (Active Stake):** `#38d6cf` (luminescent cyan/teal).
- **Delegators (Bonded Stakeholders):** `#a78bfa` (soft cosmic violet).
- **Transactions (On-Chain Movement):** `#438cff` (azure blue).
- **Surfaces & Cards:** Semi-transparent dark glass (`rgba(7, 17, 21, 0.94)`) with subtle borders (`rgba(142, 208, 188, 0.26)`), crisp typography, and restrained glow.

### 7.2 Geometry, Performance, and Motion Guidelines
- **Instanced Mesh Rendering `[IMPLEMENTED AND VERIFIED]`:** All recurring celestial bodies (validators, delegators, transactions) use `THREE.InstancedMesh` with dynamic draw usage.
- **Proportional Sizing `[IMPLEMENTED AND VERIFIED]`:** Validator radii use square-root compressed stake ratios to prevent large validators from eclipsing peers.
- **Restrained Effects `[IMPLEMENTED AND VERIFIED]`:** Avoid oversized star fields, chaotic particle clouds, lens flares, or noisy screen shaders. Glow must remain subtle and confined to celestial bodies.
- **Accessibility & Motion `[IMPLEMENTED; AUTOMATED/MANUAL VERIFICATION PENDING]`:** CSS and Three.js animation loops respect `prefers-reduced-motion: reduce`; rotation, validator motion, core pulse, and transitions are reduced or disabled. Keyboard access to delegators/transactions, screen-reader behavior, focus management, and an automated accessibility audit remain pending.
- **Mobile Support `[IMPLEMENTED; REAL-DEVICE VERIFICATION PENDING]`:** Pointer Events (`pointerdown`, `pointermove`, `pointerup`) handle selection, drag, pinch, and long-press on touch screens. Responsive CSS avoids intentional horizontal overflow, and the footer is laid out within the shell. Verification on real iOS/Android devices and cellular networks remains pending.
- **Performance Benchmark Target `[PROPOSED FUTURE POSSIBILITY]`:** The target of sustained 60 FPS on mobile hardware and Lighthouse scores > 90 are aspirational design goals to be benchmarked during Phase 6, not verified performance claims.

---

## 8. Approved Development Sequencing

As defined in `docs/ROADMAP.md`, the approved execution sequence takes precedence over numeric phase identifiers. This sequence is descriptive and does not authorize agents to reorder, skip, or independently redefine roadmap phases.

The roadmap currently records the following approved sequence:

```
1. Finish and preserve MANUAL, including verification of the current Universe behavior in Phase 5.1.
2. Record the AUTO and LIVE behavior specifications. Their requirements are recorded above; this documentation does not mean either mode is implemented.
3. Develop the event-ingestion and normalization infrastructure in the applicable Phase 4 work, especially Phases 4.3–4.6 and 4.8. Preserve source provenance, validation, and uncertainty. Keep Phase 4.7 wallet-discovery work with the later Wallets step unless a verified dependency is identified.
4. Implement LIVE under Phase 5.3 using only received and validated real events.
5. Implement AUTO under Phase 5.6 without fabricating or implying blockchain activity.
6. Integrate AUTO and LIVE with Universe navigation under Phase 5.7, preserving MANUAL as the default and keeping LIVE ingestion mode-independent.
7. Develop Wallets under the existing Phase 5.2 scope.
8. Develop the Activity Log under the existing Phase 5.4 scope, fed by validated real events.
```

This sequence remains the approved roadmap sequence. Any dependency between Phase 4 work and Phase 5.1 remains subject to the roadmap’s explicit approval and to explicit human review if the roadmap wording does not fully define the dependency.

The hybrid Cosmos + EVM track is recorded separately in `docs/ROADMAP.md` as H1–H6. It does not reorder or complete the phases above. No hybrid stage is functionally integrated; H1 exists only as a unit-level contract. The track remains a planning direction until explicitly approved and evidenced by code and tests.

---

## 9. AI Agent Operating Contract

> [!IMPORTANT]
> **MANDATORY RULES FOR ALL AI CODING AGENTS**
> This section is an immutable operating contract. It applies to **every AI model, agent, IDE extension, and automated assistant** working in this repository (ChatGPT/Codex, Copilot, Gemini/Antigravity, Cline, Continue, etc.). No AI assistant has the authority to bypass or alter these rules.

1. **Read Before Proposing:** Inspect `docs/PRODUCT_VISION.md`, `docs/ROADMAP.md`, and `AGENTS.md` before generating plans or proposing changes.
2. **Inspect Actual Repository Files First:** Never trust assumptions, training memories, or prior agent summaries. Always use read or grep tools to verify the real files and git status.
3. **Preserve Existing Work:** Check `git status --short` before editing and preserve all uncommitted user work. Do not overwrite another agent's pending changes without explicit authorization.
4. **Avoid Conflicting Edits:** When multiple agents are involved, coordinate file ownership and avoid simultaneous edits to the same files. Keep each agent's scope explicit and non-overlapping.
5. **Reuse Existing Modules:** Do not invent duplicate clients, normalizers, adapters, or controllers. Build upon `genesis-api.js`, `gl1x-api.js`, `cosmos-normalizer.js`, `cosmos-data.js`, `transaction-details.js`, and `transaction-view.js`. Preserve `cosmos-normalizer.js` and its tests; extend them with evidence. Preserve `transaction-view.js` and its tests; do not recreate them.
6. **Never Create Unauthorized Architectural Abstractions:** Do not introduce unapproved fallback layers, external SDKs, state management libraries, or complex multi-provider facades without explicit authorization.
7. **Small, Verifiable Changes:** Keep edits minimal, focused, and reviewable. Never rewrite working files completely when a targeted edit suffices.
8. **Strict Git Discipline:**
   - **NEVER** run `git commit`, `git push`, `git checkout -b`, `git merge`, or `git reset` unless explicitly commanded by the human user.
   - **NEVER** delete existing project files or backup branches.
   - Always verify `git status --short` and `git diff --check` before completing any turn.
9. **Test Verification Required:** Run `npm test` and `npm run build` after code modifications. All applicable checks must pass before declaring work complete.
10. **No Secrets or Signing:** Never add private keys, mnemonic seeds, API keys with billing access, or credentials to any file in the workspace.
11. **Never Bypass Boundaries or CAPTCHAs:** Do not attempt to bypass access controls, anti-bot mechanisms, rate limits, or network sandbox restrictions.
12. **Explain Architectural Risk Upfront:** If a user request contradicts the roadmap, risks data fabrication, or threatens visual stability, explain the technical risk clearly before proceeding.
13. **Keep Documentation Current:** Every change to behavior, data contracts, tests, or capabilities must update `docs/PRODUCT_VISION.md` and `docs/ROADMAP.md` baseline, status, test counts, and known limitations in the same change.
14. **Preserve Cosmos Discovery:** Do not replace the Genesis LCD `message.sender` transaction discovery with a GL1X query unless an approved, evidence-backed change updates the roadmap and coverage contract.
15. **Preserve the Cosmos Normalizer:** Do not replace or duplicate `cosmos-normalizer.js` with GL1X heuristics. Extend it only with evidence, or correct it in a separately approved change.
16. **Keep EVM Separate:** EVM transactions must use an EVM-specific model and the existing `gl1x-api.js` EVM methods. They must not be routed through the Cosmos normalizer or presented as Cosmos operations.
17. **No Local Indexer:** Do not implement an Ocean indexer, database, or infrastructure equivalent to GL1X. Use public APIs, lazy details, and contextual external links.

---

## 10. Granular Definition of Done (DoD)

To ensure consistent quality, Genesis Ocean separates acceptance criteria into three distinct, non-overlapping levels:

### 10.1 Level 1: Feature-Level Definition of Done (Individual Tasks / Commits)

An individual task or feature edit is complete only when:
- [ ] **Functional Correctness:** Implements the exact requested scope without extra features or speculative abstractions.
- [ ] **Cryptographic Precision:** Atomic token amounts are strictly preserved as string integers; zero IEEE-754 float conversions (`Number(amount)`).
- [ ] **Evidence & Provenance:** Raw provider data, metadata, and event references are preserved intact.
- [ ] **Data Integrity:** Missing or malformed fields remain `null`, `unknown`, or trigger explicit errors; zero invented or assumed values.
- [ ] **Error Propagation:** Errors propagate cleanly; no silent swallowing or unauthorized automatic fallback.
- [ ] **Automated Test Coverage:** Relevant unit tests added or updated using Node's native test runner (`node --test`).
- [ ] **Suite Verification:** Run `npm test` and confirm zero failures before publishing the release.
- [ ] **Production Build:** `npm run build` completes cleanly without bundler errors or broken imports.
- [ ] **Git Cleanliness:** `git diff --check` exits with 0 errors (no trailing whitespace or formatting defects).
- [ ] **Scope Confinement:** Only authorized files modified; `git status --short` confirms zero collateral edits.
- [ ] **Human Approval:** User explicitly reviews and authorizes any staging or commit.

### 10.2 Level 2: Phase-Level Definition of Done (Roadmap Phases)

A roadmap phase is complete only when:
- [ ] All deliverables specified in `docs/ROADMAP.md` for that phase are implemented.
- [ ] Cross-module contracts (e.g., between API client, normalizer, adapter, and visual stage) are strictly adhered to.
- [ ] Negative test cases, malformed payload handling, and edge cases are verified in the test suite.
- [ ] Documentation in `docs/ROADMAP.md` and `docs/PRODUCT_VISION.md` is updated with exact status, commit hash, and verification evidence.
- [ ] Zero orphaned, unused, or unauthorized files remain in the repository.
- [ ] User grants explicit phase acceptance.

### 10.3 Level 3: Future Comprehensive Release Readiness Checklist `[PROPOSED FUTURE POSSIBILITY]`

The following proposed requirements remain objectives for future comprehensive releases beyond the published v1.0.0 baseline:
- [ ] **Phase 4 Data Layer Complete:** All data layer milestones (4.1 through 4.8) completed and tested.
- [ ] **Phase 5 Visual Modules Complete:** Universe (wired to normalized adapter), Wallets, Live Activity, Activity Log, and Bridge operational.
- [ ] **Mobile & Cross-Browser Verification:** Real iOS (Safari) and Android (Chrome) touch navigation and rendering verified on cellular data.
- [ ] **Memory & Resource Leak Audit:** Three.js geometries, materials, and instanced meshes properly disposed of during cluster transitions.
- [ ] **Deployment Architecture Validation:** Verify the static Cloudflare Workers deployment, HTTPS access, public API connectivity and recovery procedures.
- [ ] **Security Review:** Zero private keys, administrative interfaces, or SSH ports exposed to public traffic.
- [ ] **Aspirational Quality Targets:** Google Lighthouse audit targeting > 90 for performance and accessibility; smooth frame rates on mobile hardware.

---

## 11. Long-Term Vision and Horizon Possibilities `[PROPOSED FUTURE POSSIBILITY]`

The following capabilities represent potential future evolutions of Genesis Ocean beyond the 1.0 baseline. These are **exploratory proposals**, not approved roadmap commitments:

1. **Historical Time-Travel Scrubbing:** A timeline slider allowing users to rewind consensus state and watch the physical expansion of validator clusters and stake migration over months or years.
2. **Interactive Mempool Visualization:** Visualizing pending consensus transactions as glowing particles orbiting the core before inclusion in a block.
3. **Ecosystem Value Flow Topology:** Macro-level 3D graph view displaying high-volume token transfer corridors between validators, protocols, bridges, and centralized liquidity hubs.
4. **Smart Contract State Decompilation:** Interactive visual inspection of EVM contract storage slots and CosmWasm contract states deployed on Genesis L1.
5. **Decentralized Node Operator Observability:** Integration with validator consensus metrics (voting latency, missed blocks, peer counts) to provide an intuitive health dashboard for node operators.
