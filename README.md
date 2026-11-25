# Genesis Ocean

**An independent visual explorer for the Genesis L1 ecosystem.**

> A living map of the Genesis L1 network.

**Live website:** [genesisocean.helyxlab.workers.dev](https://genesisocean.helyxlab.workers.dev/)

**Stable release:** [v1.0.0](https://github.com/HelyxLab/genesis-ocean/releases/tag/v1.0.0)

Genesis Ocean transforms public blockchain data into an interactive
3D universe. Validators, delegators, and transactions are represented
as celestial bodies, allowing visitors to explore the network through
a visual and contextual experience.

Created and maintained by [Helyx](https://helyx.helyxlab.workers.dev/).

Genesis Ocean is an independent, open-source community project.
It is not an official Genesis L1 product.

## Features

### Universe

- Interactive 3D blockchain visualization powered by Three.js.
- Animated network core responding to new blocks.
- Active validator spheres and expandable delegator clusters.
- Transaction exploration for selected delegators.
- Contextual validator, delegator, and transaction cards.
- Camera focus, zoom, recentering, drag, and touch controls.
- Responsive layout and reduced-motion support.
- WebGL fallback when 3D rendering is unavailable.
- Visibility-aware rendering to reduce unnecessary GPU usage.

### Network Data

- Network identity and chain ID.
- Latest block height and block time.
- Active validator information.
- WebSocket block notifications with RPC polling fallback.
- Public Genesis L1 LCD and RPC integration.
- Complementary transaction details from GL1X.

### Transaction Details

- Normalized Cosmos transaction information.
- Message types, participants, amounts, and execution results.
- Message-scoped redelegation evidence.
- Scheduled completion times where available.
- Support for multiple messages and denominations.
- Reconciliation of Genesis LCD and GL1X evidence by transaction hash.
- Explicit unavailable, loading, error, and conflicting-data states.

Genesis Ocean does not fabricate blockchain activity,
participants, balances, or transaction information.

### Uptime

- Recent validator signature monitoring.
- A 100-block observation window.
- Visual distinction between signed, missed, and unknown blocks.
- Validator search and uptime indicators.
- Explicit handling of incomplete or unavailable evidence.

### Community Pool

- Community pool balance and total supply information.
- Community pool share of the network supply.
- Historical 24-hour balance comparison when available.
- Separate snapshot and current chain heights.
- Governance spending proposals and execution outcomes.
- Proposal filtering and approved spending totals.

### Apps

A curated directory of 27 Genesis L1 ecosystem applications
and resources, with category filtering and external links.

### Helyx

Information about the independent Helyx validator,
its infrastructure, initiatives, and public validator data.

## Technology

| Component | Technology |
|---|---|
| Language | JavaScript ES modules |
| 3D visualization | Three.js |
| Development and build | Vite |
| Styling | CSS |
| Blockchain data | Genesis L1 LCD, RPC and WebSocket |
| Complementary data | GL1X API |
| Automated tests | Node.js test runner |

Genesis Ocean uses no frontend framework and requires no dedicated
application backend, private API credentials, or wallet connection.

## Getting Started

### Requirements

- Node.js and npm.
- A modern browser with WebGL support for the Universe.

Development has been verified using Node.js 22.

### Install dependencies

```bash
npm ci
```

### Start the development server

```bash
npm run dev
```

### Run the complete test suite

```bash
npm test
```

### Build for production

```bash
npm run build
```

### Preview the production build

```bash
npm run preview
```

The production build is generated in `dist/`.

## Project Structure

```text
genesis-ocean/
├── index.html
├── legal.html
├── LICENSE
├── NOTICE
├── README.md
├── AGENTS.md
├── package.json
├── package-lock.json
├── vite.config.mjs
├── docs/
│   ├── PRODUCT_VISION.md
│   └── ROADMAP.md
├── public/
│   ├── images/
│   └── licenses/
└── src/
    ├── css/
    └── js/
        ├── app.js
        ├── navigation.js
        ├── uptime.js
        ├── community-pool.js
        ├── apps.js
        ├── helyx.js
        ├── transaction-details.js
        ├── data/
        └── universe/
```

## Data Architecture

Genesis Ocean consumes public blockchain information directly
from external data providers.

The Genesis LCD is the primary Cosmos transaction discovery path.
GL1X provides complementary data for selected transaction details.
The existing Cosmos normalizer and data adapter are responsible
for processing and interpreting supported transaction evidence.

The Community Pool combines GL1X snapshots with Genesis L1
RPC and LCD information for historical comparisons and governance.

The application does not operate its own blockchain indexer,
database, or dedicated backend.

## Known Limitations

- Transaction discovery is limited to indexed Cosmos
  `message.sender` results, capped at 50 records per delegator.
  It is not a complete account transaction history.
- Blockchain information may be delayed, incomplete,
  inconsistent, or temporarily unavailable.
- Conflicting transaction evidence is explicitly identified.
- Historical Community Pool comparisons depend on the
  availability of historical blockchain state.
- Governance records without identifiable spending messages
  cannot always be attributed to the Community Pool.
- Non-L1 amounts may display their original denominations.
- Uptime represents a recent observation window,
  not lifetime validator performance.
- Comprehensive EVM and IBC activity exploration is not
  currently implemented.
- The 3D visualization requires a compatible browser and GPU.

## Roadmap

Future development may include:

- AUTO and LIVE Universe exploration modes.
- Live Activity Log.
- Unified Universe search.
- Wallet and address exploration.
- Optional Helyx Names `.gl1` resolution.
- Expanded Cosmos, EVM, and IBC data integration.
- Further performance and accessibility improvements.

These features are planned and are not presented as currently
available functionality.

The existing approved development sequence remains documented
in the project roadmap.

See:

- [Product Vision](docs/PRODUCT_VISION.md)
- [Development Roadmap](docs/ROADMAP.md)

## Contributing

Before proposing changes:

- Read [AGENTS.md](AGENTS.md) and the project documentation.
- Preserve the existing visual identity and behavior.
- Reuse the existing data clients and Cosmos normalizer.
- Never fabricate blockchain data.
- Avoid unnecessary dependencies and refactoring.
- Add regression tests for confirmed defects.
- Run the complete test suite and production build.
- Use feature branches rather than working directly on `main`.

## Independence and Transparency

Genesis Ocean is an independent community project maintained
by Helyx.

It is not an official Genesis L1 or GL1X product.

The application is read-only and is intended for informational
and educational purposes.

See [Legal & Transparency](legal.html) for information about
data limitations, privacy, licensing, and availability.

## License

The original Genesis Ocean source code is licensed under
the [MIT License](LICENSE).

The Helyx and Genesis Ocean names, logos, and reserved
brand assets are not included in the MIT license grant.

Third-party components remain subject to their respective
licenses and copyright notices.

See [NOTICE](NOTICE) for additional information.

## Credits

- Created and maintained by Helyx.
- Built with [Three.js](https://threejs.org/) and [Vite](https://vite.dev/).
- Public network data from Genesis L1.
- Complementary blockchain information from [GL1X](https://gl1x.com/).

---

<p align="center">
  <strong>Genesis Ocean</strong><br>
  An independent Genesis L1 explorer.<br><br>
  <a href="https://helyx.helyxlab.workers.dev/">Helyx</a>
  ·
  <a href="LICENSE">MIT License</a>
  <br><br>
  <sub>© 2026 Helyx</sub>
</p>
