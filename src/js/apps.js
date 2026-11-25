/**
 * Genesis Ocean — Apps Directory Module
 * Provides structured ecosystem directory data and category filtering.
 */

export const VALID_CATEGORIES = Object.freeze([
  'all',
  'explore',
  'wallets',
  'defi',
  'dev',
  'ecosystem',
  'dapps-science',
  'network-tools',
]);

export const APPS_DIRECTORY = Object.freeze([
  Object.freeze({
    id: 'gl1x-explorer',
    name: 'GL1X Explorer',
    category: 'explore',
    categoryLabel: 'Explore',
    badge: 'Explorer & Science',
    description: 'Open-source explorer and bioinformatics analysis suite indexing Genesis L1 Cosmos and EVM transactions with scientific data queries.',
    endpoint: 'gl1x.com',
    url: 'https://gl1x.com',
  }),
  Object.freeze({
    id: 'helyx-names',
    name: 'Helyx Names',
    category: 'ecosystem',
    categoryLabel: 'Ecosystem',
    badge: '.gl1 Names',
    description: 'Register .gl1 names and resolve names or addresses on Genesis L1 EVM.',
    endpoint: 'helyxnames.helyxlab.workers.dev',
    url: 'https://helyxnames.helyxlab.workers.dev/',
  }),
  Object.freeze({
    id: 'unmask-crypto',
    name: 'Unmask Crypto',
    category: 'explore',
    categoryLabel: 'Explore',
    badge: 'Chain Analytics',
    description: 'Explore L1 and wL1 trades, staking flows, and wallet activity across Genesis L1 and Base.',
    endpoint: 'unmaskcrypto.io',
    url: 'https://unmaskcrypto.io/',
  }),
  Object.freeze({
    id: 'gl1x-chess',
    name: 'GL1X Chess',
    category: 'dapps-science',
    categoryLabel: 'DApps & Science',
    badge: 'On-Chain Game',
    description: 'Play chess against a neural network stored on Genesis L1. No wallet required.',
    endpoint: 'gl1x.com/dapps/chess',
    url: 'https://gl1x.com/dapps/chess',
  }),
  Object.freeze({
    id: 'gl1x-api-reference',
    name: 'GL1X API Reference',
    category: 'dev',
    categoryLabel: 'Developer Tools',
    badge: 'Explorer API',
    description: 'Browse endpoint documentation for GL1X ledger, governance, and developer data.',
    endpoint: 'gl1x.com/api-reference',
    url: 'https://gl1x.com/api-reference',
  }),
  Object.freeze({
    id: 'gl1x-mcp',
    name: 'GL1X MCP',
    category: 'dev',
    categoryLabel: 'Developer Tools',
    badge: 'AI Connector',
    description: 'Connect an MCP-compatible client to read-only Genesis L1 data and GL1X tools.',
    endpoint: 'gl1x.com/dapps/mcp',
    url: 'https://gl1x.com/dapps/mcp',
  }),
  Object.freeze({
    id: 'gl1x-molnft-search',
    name: 'GL1X MolNFT Search',
    category: 'dapps-science',
    categoryLabel: 'DApps & Science',
    badge: 'Molecular Search',
    description: 'Find indexed MolNFT records by PDB ID, UniProt accession, title, or sequence.',
    endpoint: 'gl1x.com/bio/search',
    url: 'https://gl1x.com/bio/search',
  }),
  Object.freeze({
    id: 'gl1x-ibc-transfers',
    name: 'GL1X IBC Transfers',
    category: 'defi',
    categoryLabel: 'DeFi & IBC',
    badge: 'Transfer History',
    description: 'Inspect indexed inbound and outbound IBC transfers on Genesis L1.',
    endpoint: 'gl1x.com/ibc-transfers',
    url: 'https://gl1x.com/ibc-transfers',
  }),
  Object.freeze({
    id: 'gl1x-docs',
    name: 'GL1X Documentation',
    category: 'dev',
    categoryLabel: 'Developer Tools',
    badge: 'Developer Guides',
    description: 'Read guides to the explorer architecture, indexing, data provenance, and developer tools.',
    endpoint: 'gl1x.com/docs',
    url: 'https://gl1x.com/docs',
  }),
  Object.freeze({
    id: 'genesis-staking',
    name: 'Genesis L1 Staking',
    category: 'wallets',
    categoryLabel: 'Wallets & Staking',
    badge: 'Staking Portal',
    description: 'Official non-custodial staking interface to delegate native L1 coins, redelegate between validators, and claim rewards.',
    endpoint: 'genesisl1.com/stake.html',
    url: 'https://genesisl1.com/stake.html',
  }),
  Object.freeze({
    id: 'keplr-wallet',
    name: 'Keplr Wallet',
    category: 'wallets',
    categoryLabel: 'Wallets & Staking',
    badge: 'Cosmos Wallet',
    description: 'Leading Cosmos interchain wallet supporting Genesis L1 native accounts, staking delegation, and IBC transfers.',
    endpoint: 'keplr.app',
    url: 'https://www.keplr.app',
  }),
  Object.freeze({
    id: 'metamask-wallet',
    name: 'MetaMask',
    category: 'wallets',
    categoryLabel: 'Wallets & Staking',
    badge: 'EVM Wallet',
    description: 'Web3 browser wallet compatible with Genesis L1 EVM via Chain ID 29 and the official JSON-RPC endpoint.',
    endpoint: 'metamask.com',
    url: 'https://metamask.com/',
  }),
  Object.freeze({
    id: 'osmosis-dex',
    name: 'Osmosis DEX & Bridge',
    category: 'defi',
    categoryLabel: 'DeFi & IBC',
    badge: 'IBC Liquidity',
    description: 'Interchain decentralized exchange and IBC bridge connecting Genesis L1 (channel-1) with the broader Cosmos ecosystem.',
    endpoint: 'app.osmosis.zone',
    url: 'https://app.osmosis.zone',
  }),
  Object.freeze({
    id: 'chainlist-genesis',
    name: 'Chainlist Genesis L1',
    category: 'dev',
    categoryLabel: 'Developer Tools',
    badge: 'Network Config',
    description: 'Verified EVM network profile to connect MetaMask and other Web3 wallets to Genesis L1 (Chain ID 29) with one click.',
    endpoint: 'chainlist.org/chain/29',
    url: 'https://chainlist.org/chain/29',
  }),
  Object.freeze({
    id: 'genesis-evm-rpc',
    name: 'Genesis EVM JSON-RPC',
    category: 'dev',
    categoryLabel: 'Developer Tools',
    badge: 'EVM RPC',
    description: 'Public Genesis L1 EVM endpoint. Use JSON-RPC POST requests from an Ethereum client.',
    endpoint: 'rpc.genesisl1.org',
    url: 'https://rpc.genesisl1.org',
  }),
  Object.freeze({
    id: 'cosmos-rest-lcd',
    name: 'Cosmos REST API (LCD)',
    category: 'dev',
    categoryLabel: 'Developer Tools',
    badge: 'Cosmos REST',
    description: 'Swagger interface for the Genesis L1 Cosmos REST API, including staking, bank supply, and governance queries.',
    endpoint: '1317.genesisl1.org/swagger/',
    url: 'https://1317.genesisl1.org/swagger/',
  }),
  Object.freeze({
    id: 'tendermint-consensus-rpc',
    name: 'Tendermint Consensus RPC',
    category: 'dev',
    categoryLabel: 'Developer Tools',
    badge: 'Consensus RPC',
    description: 'Direct Tendermint RPC (:26657) and WebSocket (/websocket) for real-time block streaming and validator consensus queries.',
    endpoint: '26657.genesisl1.org',
    url: 'https://26657.genesisl1.org',
  }),
  Object.freeze({
    id: 'genesis-portal',
    name: 'Genesis L1 Ecosystem Portal',
    category: 'ecosystem',
    categoryLabel: 'Ecosystem',
    badge: 'Official Portal',
    description: 'Official directory of Genesis L1 applications, protocols, and public infrastructure.',
    endpoint: 'genesisl1.com/ecosystem.html',
    url: 'https://genesisl1.com/ecosystem.html',
  }),
  Object.freeze({
    id: 'gl1f-ml-studio',
    name: 'GL1F Crypto',
    category: 'ecosystem',
    categoryLabel: 'Ecosystem',
    badge: 'AI & DeSci',
    description: 'Build and backtest crypto-market models in the browser and publish them on Genesis L1.',
    endpoint: 'crypto.gl1f.com',
    url: 'https://crypto.gl1f.com',
  }),
  Object.freeze({
    id: 'l1coin-web3desk',
    name: 'L1coin Web3Desk',
    category: 'explore',
    badge: 'Network Desk',
    categoryLabel: 'Explore',
    description: 'Non-custodial Web3 desk for L1 Coin on GenesisL1 with supply, staking, governance, bridge, IBC, and ledger exploration tools.',
    url: 'https://l1coin.com',
    endpoint: 'l1coin.com',
  }),
  Object.freeze({
    id: 'genesisl1-forest',
    name: 'GenesisL1 Forest (GL1F)',
    category: 'dapps-science',
    badge: 'AI Studio',
    categoryLabel: 'DApps & Science',
    description: 'Browser-based decentralized AI studio for training GBDT models and minting them as on-chain Model NFTs on GenesisL1.',
    url: 'https://gl1f.com',
    endpoint: 'gl1f.com',
  }),
  Object.freeze({
    id: 'molnft',
    name: 'MolNFT',
    category: 'dapps-science',
    badge: 'Molecular Data',
    categoryLabel: 'DApps & Science',
    description: 'Molecular structures published as ERC-721 NFTs on GenesisL1, with on-chain storage and decentralized scientific data access.',
    url: 'https://app.molnft.org',
    endpoint: 'app.molnft.org',
  }),
  Object.freeze({
    id: 'cipnft',
    name: 'CIPNFT',
    category: 'dapps-science',
    badge: 'Encrypted IP',
    categoryLabel: 'DApps & Science',
    description: 'Browser-only protocol for encrypting sensitive data locally and minting it as an on-chain NFT on GenesisL1.',
    url: 'https://cipnft.com',
    endpoint: 'cipnft.com',
  }),
  Object.freeze({
    id: 'broccoli',
    name: 'Broccoli',
    category: 'dapps-science',
    badge: 'Search Clustering',
    categoryLabel: 'DApps & Science',
    description: 'Open-source search results clustering engine that turns searches into zoomable topic maps in the browser.',
    url: 'https://genesisl1.com/broccoli.html',
    endpoint: 'genesisl1.com/broccoli.html',
  }),
  Object.freeze({
    id: 'genesisl1-governance',
    name: 'GenesisL1 Governance',
    category: 'network-tools',
    badge: 'Governance',
    categoryLabel: 'Network Tools',
    description: 'Public interface for inspecting GenesisL1 governance proposals, deposits, and voting with bonded L1.',
    url: 'https://genesisl1.com/gov.html',
    endpoint: 'genesisl1.com/gov.html',
  }),
  Object.freeze({
    id: 'genesisl1-bridge',
    name: 'GenesisL1 Bridge',
    category: 'network-tools',
    badge: 'Experimental Bridge',
    categoryLabel: 'Network Tools',
    description: 'Community bridge interface for moving wrapped L1 between GenesisL1 and Base.',
    url: 'https://genesisl1.com/bridge.html',
    endpoint: 'genesisl1.com/bridge.html',
  }),
  Object.freeze({
    id: 'genesisl1-swap',
    name: 'GenesisL1 Swap',
    category: 'network-tools',
    badge: 'Swap Routes',
    categoryLabel: 'Network Tools',
    description: 'Public routes for accessing L1 through Osmosis IBC and a wL1/USDC pool on Base.',
    url: 'https://genesisl1.com/swap.html',
    endpoint: 'genesisl1.com/swap.html',
  }),
]);

/**
 * Initializes category filtering for the Apps section.
 *
 * @param {object} [options]
 * @param {Element|null} [options.container] Root element for the apps section
 * @returns {object|null} Controller API
 */
export function initApps({ container = globalThis.document?.querySelector('[data-view="apps"]') } = {}) {
  if (!container) return null;

  const buttons = [...container.querySelectorAll('[data-apps-filter]')];
  const cards = [...container.querySelectorAll('[data-app-card]')];
  const emptyState = container.querySelector('[data-apps-empty]');
  let activeCategory = 'all';

  function updateFilterCounts() {
    const counts = cards.reduce((accumulator, card) => {
      const category = card.dataset.category;
      if (category) {
        accumulator[category] = (accumulator[category] || 0) + 1;
      }
      accumulator.all = (accumulator.all || 0) + 1;
      return accumulator;
    }, {});
    buttons.forEach((button) => {
      const countElement = typeof button.querySelector === 'function'
        ? button.querySelector('.apps-filter-count')
        : null;
      if (countElement) {
        countElement.textContent = String(counts[button.dataset.appsFilter] || 0);
      }
    });
  }

  function setCategory(category) {
    activeCategory = category;

    buttons.forEach((button) => {
      const match = button.dataset.appsFilter === category;
      button.classList.toggle('is-active', match);
      button.setAttribute('aria-pressed', match ? 'true' : 'false');
    });

    let visibleCount = 0;
    cards.forEach((card) => {
      const match = category === 'all' || card.dataset.category === category;
      card.hidden = !match;
      if (match) visibleCount += 1;
    });

    if (emptyState) {
      emptyState.hidden = visibleCount > 0;
    }

    return visibleCount;
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const category = button.dataset.appsFilter || 'all';
      setCategory(category);
    });
  });

  updateFilterCounts();

  return Object.freeze({
    setCategory,
    getActiveCategory: () => activeCategory,
    getVisibleCount: () => cards.filter((card) => !card.hidden).length,
  });
}
