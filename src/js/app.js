import { initNavigation } from './navigation.js';
import { initApps } from './apps.js';
import { initCommunityPool } from './community-pool.js';
import { initUptime } from './uptime.js';
import { initUniverse } from './universe/universe.js';
import { initHelyx } from './helyx.js';
import { createGenesisApi, formatL1, GENESIS_API } from './data/genesis-api.js';
import { createGl1xApi } from './data/gl1x-api.js';
import { createCosmosDataApi } from './data/cosmos-data.js';
import { createTransactionDetailsController, formatTransactionCoins, reconcileTransactionEvidence } from './transaction-details.js';
import {
  createDelegatorTransactionsCache,
  isCurrentDelegatorTransactionsRequest,
} from './delegator-transactions.js';

initNavigation();
initApps();
const api = createGenesisApi();
const gl1xApi = createGl1xApi();
const cosmosDataApi = createCosmosDataApi({ gl1xApi });
const card = initObjectCard();
const transactionDetails = createTransactionDetailsController({
  cosmosDataApi,
  onState: (update) => card.setTransactionDetails(update),
});
const delegationCache = new Map();
const transactionCache = createDelegatorTransactionsCache({
  getTransactions: (address) => api.getDelegatorTransactions(address),
});
const DELEGATION_CACHE_TTL_MS = 60_000;
let universe;
let currentSelectionKey = null;
let selectionRevision = 0;
let applyingCachedTransactions = false;

try {
  universe = initUniverse({
    onSelectObject: handleSelection,
    onHoverObject: (selection) => card.showHover(selection),
    onFocusPosition: (point) => card.position(point),
    onHoverPosition: (point) => card.positionHover(point),
  });
} catch (error) {
  universe = null;
  const fallback = document.querySelector('[data-universe-fallback]');
  if (fallback) fallback.hidden = false;
  console.error('Genesis Ocean Universe initialization failed; continuing with network data.', error);
}
if (universe) universe.selectCore();
else card.show({ type: 'core', data: null });
const networkStatus = initNetworkStatus({ universe, api });
initCommunityPool({
  api: gl1xApi,
  governanceApi: api,
  container: document.querySelector('[data-view="community-pool"]'),
  blockHeight: networkStatus,
});

initUptime({
  container: document.querySelector('[data-uptime-panel]'),
  blockHeight: networkStatus,
});

initHelyx({
  api: gl1xApi,
  container: document.querySelector('[data-view="helyx"]'),
});

initCameraControls();

function shortAddress(value, prefix = 8, suffix = 6) {
  if (typeof value !== 'string') return 'Unavailable';
  return value.length > prefix + suffix + 1 ? `${value.slice(0, prefix)}…${value.slice(-suffix)}` : value;
}

function formatCommission(rate) {
  if (typeof rate !== 'string' || !/^\d+(?:\.\d+)?$/.test(rate)) return 'Unavailable';
  const [whole, fraction = ''] = rate.split('.');
  const position = whole.length + 2;
  const digits = `${whole}${fraction}`.padEnd(position, '0');
  const percent = digits.slice(0, position).replace(/^0+(?=\d)/, '') || '0';
  const decimal = digits.slice(position).replace(/0+$/, '');
  return `${percent}${decimal ? `.${decimal}` : ''}%`;
}

function splitTransactionTypeWords(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function humanizeTransactionType(value, messageType = null, operation = false) {
  if (typeof value !== 'string' || value.trim() === '') return operation ? 'Unknown Operation' : 'Unknown';
  const normalized = value.trim();
  const direct = {
    Delegate: 'Delegation',
    delegate: 'Delegation',
    Delegation: 'Delegation',
    BeginRedelegate: 'Redelegation',
    redelegate: 'Redelegation',
    Redelegation: 'Redelegation',
    Undelegate: 'Undelegation',
    undelegate: 'Undelegation',
    Undelegation: 'Undelegation',
    Send: 'Token Transfer',
    transfer: 'Token Transfer',
    Transfer: 'Token Transfer',
    WithdrawDelegatorReward: 'Delegation Reward Withdrawal',
  };
  if (Object.prototype.hasOwnProperty.call(direct, normalized)) return direct[normalized];
  if (normalized === 'ibc_transfer') return 'IBC Token Transfer';
  if (normalized === 'other' && typeof messageType === 'string' && messageType.endsWith('MsgWithdrawDelegatorReward')) {
    return 'Delegation Reward Withdrawal';
  }
  if (normalized.includes(' + ')) {
    return normalized.split(' + ').map((part) => humanizeTransactionType(part.trim())).join(' + ');
  }
  if (normalized === 'other' && typeof messageType === 'string' && messageType.length > 0) {
    if (messageType.endsWith('ibc.applications.transfer.v1.MsgTransfer')) return 'IBC Token Transfer';
    const finalName = messageType.split('.').at(-1)?.replace(/^Msg/, '') || '';
    if (finalName) return humanizeTransactionType(finalName);
  }
  return splitTransactionTypeWords(normalized).join(' ') || normalized;
}

function transactionStatus(entry) {
  const shown = String(entry.data.length);
  if (entry.total && BigInt(entry.total) > BigInt(shown)) return `Showing ${shown} of ${entry.total} indexed sender transactions.`;
  return `${shown} indexed sender transaction${shown === '1' ? '' : 's'} loaded.`;
}

function transactionTitle(data) {
  return data.messages?.length > 1 ? `${data.messages.length} messages` : humanizeTransactionType(data.type);
}

function transactionCardItems(data, normalized = null) {
  const summary = reconcileTransactionEvidence(data, normalized);
  const operations = summary.conflicts.length ? [] : normalized?.operations ?? [];
  const messages = data.messages ?? [];
  const messageCount = Math.max(messages.length, operations.length);
  const firstMessageType = operations[0]?.messageType ?? messages[0]?.messageType;
  const primaryType = firstMessageType ? humanizeTransactionType(operations[0]?.type ?? 'other', firstMessageType) : null;
  const time = (timestamp) => timestamp
    ? `${new Date(timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' })} UTC`
    : null;
  const result = summary.conflicts.includes('execution result') ? 'Unverified'
    : summary.status === 'success' ? 'Succeeded'
      : summary.status === 'failed' ? (summary.code > 0 ? `Failed (code ${summary.code})` : 'Failed') : null;

  const items = [
    ['Hash', data.hash, 'data-card-hash'],
    [messageCount > 1 ? 'Messages' : 'Message type', messageCount > 1 ? String(messageCount) : primaryType],
    ['Block height', summary.conflicts.includes('block height') ? 'Unverified' : summary.height?.toLocaleString('en-US')],
    ['Block time', summary.conflicts.includes('block height') ? 'Unverified' : time(summary.timestamp)],
    ['Execution result', result],
  ];
  if (messageCount <= 1) {
    const amounts = messages[0]?.amountsComplete ? messages[0].amounts
      : operations[0]?.amountsComplete ? operations[0].amounts : [];
    if (messages[0]?.amountsComplete != null || operations[0]?.amountsComplete != null) {
      const amountLabel = summary.conflicts.includes('message amounts') ? 'Requested amount (LCD)' : 'Requested amount';
      items.push([amountLabel, formatTransactionCoins(amounts)]);
    }
  }

  const operationStatuses = { confirmed: 'Confirmed', awaiting_completion: 'Scheduled', initiated: 'Submitted on Genesis L1' };
  const participantLabels = { source_validator: 'Source validator', destination_validator: 'Destination validator' };
  for (let index = 0; index < messageCount; index += 1) {
    const operation = operations[index];
    const message = messages[index];
    if (!operation && messageCount === 1) continue;
    const type = operation?.type ?? 'other';
    const messageType = operation?.messageType ?? message?.messageType;
    const title = messageType ? humanizeTransactionType(type, messageType, true) : 'Unknown message';
    const participants = operation?.participants.map(({ role, address }) => `${participantLabels[role] ?? role}: ${address}`) ?? [];
    const amounts = operation?.amountsComplete ? operation.amounts : message?.amountsComplete ? message.amounts : [];
    const amountLabel = summary.conflicts.includes('message amounts') ? 'Requested (LCD)' : 'Requested';
    const amountText = messageCount > 1 && (message?.amountsComplete != null || operation?.amountsComplete != null)
      ? `${amountLabel}: ${formatTransactionCoins(amounts) ?? 'Unavailable'}` : null;
    const details = [
      title,
      operation ? operationStatuses[operation.status] ?? 'Unverified' : null,
      amountText,
      ...participants,
      operation?.status === 'awaiting_completion' && operation.completionTime
        ? `Scheduled completion: ${time(operation.completionTime)}` : null,
      operation?.remoteReceipt === 'unverified' ? 'Remote receipt unverified' : null,
    ].filter(Boolean).join(' · ');
    items.push([`Message ${index + 1}`, details]);
  }
  if (!summary.conflicts.length && normalized?.unscopedEvents?.length) {
    items.push(['Events without a message match', String(normalized.unscopedEvents.length)]);
  }
  return { items, conflicts: summary.conflicts };
}

function initObjectCard() {
  const stage = document.querySelector('.universe-stage');
  const cardElement = document.querySelector('[data-object-card]');
  cardElement.addEventListener('wheel', (event) => {
    event.stopPropagation();
  }, { passive: true });
  const label = document.querySelector('[data-scene-label]');
  const typeElement = document.querySelector('[data-card-type]');
  const titleElement = document.querySelector('[data-card-title]');
  const detailsElement = document.querySelector('[data-card-details]');
  const explorerLink = document.querySelector('[data-card-explorer]');
  const statusElement = document.querySelector('[data-cluster-status]');
  const backButton = document.querySelector('[data-card-back]');
  const validatorBackButton = document.querySelector('[data-card-back-validator]');
  let selection = null;
  let hoverSelection = null;
  let coreData = { chainId: null, height: null, time: null, validatorCount: null, bondedAtoms: null, updatedAt: null, unavailable: false, partial: false, stale: false, blockFeed: 'Connecting' };
  let dimensions = { width: 270, height: 150 };
  let labelDimensions = { width: 0, height: 0 };
  const stageSize = { width: stage.clientWidth, height: stage.clientHeight };
  new ResizeObserver(([entry]) => {
    stageSize.width = entry.contentRect.width;
    stageSize.height = entry.contentRect.height;
  }).observe(stage);

  function setDetails(items) {
    detailsElement.replaceChildren(...items.map(([labelText, value, className]) => {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = labelText;
      description.textContent = value ?? 'Unavailable';
      if (className) description.className = className;
      row.append(term, description);
      return row;
    }));
  }

  function show(nextSelection) {
    selection = nextSelection;
    hoverSelection = null;
    label.hidden = true;
    if (!selection) {
      cardElement.hidden = true;
      explorerLink.hidden = true;
      explorerLink.removeAttribute('href');
      statusElement.hidden = true;
      backButton.hidden = true;
      validatorBackButton.hidden = true;
      updateValidatorListSelection(null);
      return;
    }

    const { type, data } = selection;
    let items = [];
    validatorBackButton.hidden = true;
    explorerLink.hidden = type !== 'transaction' || !/^[\da-f]{64}$/i.test(data.hash || '');
    if (!explorerLink.hidden) explorerLink.href = `https://gl1x.com/tx/${encodeURIComponent(data.hash)}`;
    else explorerLink.removeAttribute('href');
    if (type === 'core') {
      typeElement.textContent = 'Genesis L1 network';
      titleElement.textContent = 'The Genesis Core';
      items = [
        ['Network', 'Genesis L1'],
        ['Chain ID', coreData.chainId],
        ['Latest block', coreData.height ? BigInt(coreData.height).toLocaleString('en-US') : null],
        ['Last block time', coreData.time ? `${new Date(coreData.time).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' })} UTC` : null],
        ['Active validators', coreData.validatorCount?.toLocaleString('en-US')],
        ['L1 bonded to active validators', coreData.bondedAtoms === null ? null : formatL1(coreData.bondedAtoms)],
      ];
      statusElement.textContent = coreData.unavailable
        ? 'Network data unavailable.'
        : coreData.partial
          ? `Block details are available; validator metrics are not. ${coreData.blockFeed}.`
        : coreData.stale
          ? `Showing the last valid data; the latest refresh failed. ${coreData.blockFeed}.`
          : coreData.updatedAt
            ? `Updated ${new Date(coreData.updatedAt).toLocaleTimeString('en-US', { timeZone: 'UTC' })} UTC. ${coreData.blockFeed}.`
            : `Waiting for Genesis L1 data. ${coreData.blockFeed}.`;
      statusElement.dataset.state = coreData.unavailable ? 'error' : coreData.stale ? 'stale' : coreData.updatedAt ? 'ready' : 'loading';
      statusElement.hidden = false;
      backButton.hidden = true;
      updateValidatorListSelection(null);
    } else if (type === 'validator') {
      typeElement.textContent = 'Validator';
      titleElement.textContent = data.moniker || data.operatorAddress;
      items = [
        ['Operator address', data.operatorAddress, 'data-card-address'],
        ['Bonding status', data.status === 'BOND_STATUS_BONDED' ? 'Bonded' : null],
        ['Bonded stake', formatL1(data.bondedAtoms)],
        ['Commission rate', formatCommission(data.commissionRate)],
      ];
    } else if (type === 'delegator') {
      typeElement.textContent = 'Delegator';
      titleElement.textContent = shortAddress(data.delegatorAddress);
      items = [
        ['Wallet address', data.delegatorAddress, 'data-card-address'],
        ['Validator', data.validatorMoniker || data.validatorAddress, 'data-card-address'],
        ['Delegated to validator', formatL1(data.amountAtoms)],
        ['Transaction scope', 'Cosmos transactions indexed with this wallet as a message sender.'],
      ];
    } else {
      typeElement.textContent = 'Transaction';
      titleElement.textContent = `${transactionTitle(data)} · ${shortAddress(data.hash, 10, 8)}`;
      items = transactionCardItems(data).items;
      statusElement.textContent = 'Showing the Genesis LCD summary.';
      statusElement.dataset.state = 'not-loaded';
    }
    setDetails(items);
    if (type !== 'core') {
      const parentType = type === 'transaction' ? 'delegator' : type === 'delegator' ? 'validator' : 'core';
      backButton.hidden = false;
      backButton.textContent = `Back to ${parentType}`;
      if (type === 'transaction') {
        validatorBackButton.hidden = false;
        validatorBackButton.textContent = 'Back to validator';
      }
    }
    cardElement.hidden = false;
    statusElement.hidden = type !== 'core' && type !== 'transaction';
    dimensions = { width: cardElement.offsetWidth, height: cardElement.offsetHeight };
    updateValidatorListSelection(type === 'validator' ? data.operatorAddress : type === 'delegator' ? data.validatorAddress : null);
  }

  function setTransactionDetails({ hash, state, result, error }) {
    if (selection?.type !== 'transaction' || selection.data.hash !== hash) return;

    const { items, conflicts } = transactionCardItems(selection.data, result?.normalized);
    setDetails(items);
    statusElement.dataset.state = conflicts.length ? 'error' : state;
    statusElement.textContent = conflicts.length
      ? `Genesis LCD and GL1X disagree on ${conflicts.join(' and ')}. GL1X details withheld.`
      : state === 'loading'
      ? 'Loading message details from GL1X…'
      : state === 'available'
        ? result.meta.freshness?.state === 'stale'
          ? 'Showing the Genesis LCD summary and cached GL1X details.'
          : 'Showing the Genesis LCD summary and GL1X message details.'
        : state === 'unavailable'
          ? 'Showing the Genesis LCD summary. GL1X details are unavailable.'
          : state === 'error'
            ? `Showing the Genesis LCD summary. ${error?.message || 'GL1X details could not be loaded.'}`
            : 'Showing the Genesis LCD summary.';
    statusElement.hidden = false;
    dimensions = { width: cardElement.offsetWidth, height: cardElement.offsetHeight };
  }

  function updateValidatorListSelection(address) {
    document.querySelectorAll('[data-validator-address]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.validatorAddress === address));
    });
  }

  function setClusterStatus(message, state = 'loading') {
    statusElement.textContent = message;
    statusElement.dataset.state = state;
    statusElement.hidden = false;
    dimensions = { width: cardElement.offsetWidth, height: cardElement.offsetHeight };
  }

  function place(element, point, size, dx = 18) {
    if (!point || !stage) return;
    const { width, height } = stageSize;
    if (element === cardElement && width >= 430) {
      element.style.left = 'auto';
      element.style.right = '18px';
      element.style.top = '50%';
      element.style.transform = 'translateY(-50%)';
      return;
    }
    if (element === cardElement && width < 430) {
      const x = Math.max(8, (width - size.width) / 2);
      const y = point.y >= height / 2 ? 8 : height - size.height - 54;
      element.style.right = 'auto';
      element.style.left = `${x}px`;
      element.style.top = `${Math.max(8, y)}px`;
      element.style.transform = 'none';
      return;
    }
    let x = point.x + dx;
    let y = point.y - size.height / 2;
    if (x + size.width > width - 8) x = point.x - size.width - dx;
    x = Math.max(8, Math.min(x, width - size.width - 8));
    y = Math.max(8, Math.min(y, height - size.height - 8));
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
  }

  function position(point) {
    if (!selection || cardElement.hidden) return;
    if (selection.type === 'core') {
      place(cardElement, { x: stageSize.width / 2, y: stageSize.height / 2 }, dimensions);
      return;
    }
    place(cardElement, point, dimensions);
  }

  function showHover(nextSelection) {
    if (!nextSelection) {
      hoverSelection = null;
      label.hidden = true;
      return;
    }
    hoverSelection = nextSelection;
    const { type, data } = nextSelection;
    if (type === 'validator') label.textContent = data.moniker || data.operatorAddress;
    else if (type === 'delegator') label.textContent = data.delegatorAddress;
    else label.textContent = transactionTitle(data);
    label.hidden = false;
    labelDimensions = { width: label.offsetWidth, height: label.offsetHeight };
  }

  function positionHover(point) {
    if (!hoverSelection || label.hidden) return;
    place(label, point, labelDimensions, 12);
  }

  document.querySelector('[data-close-card]')?.addEventListener('click', () => {
    if (universe) universe.resetUniverse();
    else { currentSelectionKey = null; card.show(null); }
  });
  backButton.addEventListener('click', () => universe?.goToParent());
  validatorBackButton.addEventListener('click', () => universe?.goToValidator());

  function updateCoreData(nextData) {
    coreData = { ...coreData, ...nextData };
    if (selection?.type === 'core') show(selection);
  }

  return Object.freeze({ show, setClusterStatus, updateCoreData, setTransactionDetails, position, positionHover, showHover, getSelection: () => selection });
}

function handleSelection(selection) {
  const requestRevision = ++selectionRevision;
  if (selection?.type !== 'transaction') transactionDetails.clearSelection();
  if (!selection) {
    currentSelectionKey = null;
    card.show(null);
    return;
  }

  if (selection.type === 'core') {
    currentSelectionKey = 'core:genesis';
    card.show(selection);
    return;
  }

  const data = selection.data;
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    currentSelectionKey = null;
    card.show(null);
    return;
  }

  let selectionKey;
  if (selection.type === 'validator' && typeof data.operatorAddress === 'string' && data.operatorAddress.length > 0) {
    selectionKey = `validator:${data.operatorAddress}`;
  } else if (selection.type === 'delegator' && typeof data.delegatorAddress === 'string' && data.delegatorAddress.length > 0) {
    selectionKey = `delegator:${data.delegatorAddress}`;
  } else if (selection.type === 'transaction' && typeof data.hash === 'string' && data.hash.length > 0) {
    selectionKey = `transaction:${data.hash}`;
  } else {
    currentSelectionKey = null;
    card.show(null);
    return;
  }

  currentSelectionKey = selectionKey;
  card.show(selection);
  if (selection.type === 'transaction') {
    transactionDetails.select(data.hash);
    return;
  }
  if (applyingCachedTransactions) return;
  if (selection.preserveTransactionsClosed) return;

  if (selection.type === 'validator') {
    const address = selection.data.operatorAddress;
    const cached = delegationCache.get(address);
    if (cached) {
      const delegations = cached.data;
      universe?.setDelegators(address, delegations);
      card.setClusterStatus(delegations.length ? `${delegations.length} delegators loaded` : 'No non-zero delegations returned.', 'ready');
      if (Date.now() - cached.timestamp < DELEGATION_CACHE_TTL_MS) return;
    }
    card.setClusterStatus(cached ? 'Refreshing delegations from Genesis L1…' : 'Loading delegations from Genesis L1…');
    api.getValidatorDelegations(address).then((delegations) => {
      delegationCache.set(address, { data: delegations, timestamp: Date.now() });
      if (currentSelectionKey !== `validator:${address}`) return;
      universe?.setDelegators(address, delegations);
      card.setClusterStatus(delegations.length ? `${delegations.length} delegators loaded` : 'No non-zero delegations returned.', 'ready');
    }).catch((error) => {
      if (currentSelectionKey === `validator:${address}`) card.setClusterStatus(`Delegations unavailable: ${error.message}`, 'error');
    });
  } else if (selection.type === 'delegator') {
    const address = selection.data.delegatorAddress;
    const cached = transactionCache.getCached(address);
    if (cached) {
      const transactions = cached.data;
      const cachedCount = cached.total ?? String(transactions.length);
      if (String(selection.data.transactionCount ?? '') !== cachedCount) {
        applyingCachedTransactions = true;
        try { universe?.setTransactions(address, transactions, cached.total); }
        finally { applyingCachedTransactions = false; }
      }
      card.setClusterStatus(transactionStatus(cached), 'ready');
      return;
    }
    card.setClusterStatus('Loading indexed sender transactions…');
    transactionCache.load(address).then((entry) => {
      if (!isCurrentDelegatorTransactionsRequest({
        requestRevision,
        currentRevision: selectionRevision,
        address,
        currentSelectionKey,
      })) return;
      universe?.setTransactions(address, entry.data, entry.total);
      card.setClusterStatus(transactionStatus(entry), 'ready');
    }).catch((error) => {
      if (isCurrentDelegatorTransactionsRequest({
        requestRevision,
        currentRevision: selectionRevision,
        address,
        currentSelectionKey,
      })) card.setClusterStatus(`Indexed sender transactions unavailable: ${error.message}`, 'error');
    });
  }
}

function initNetworkStatus({ universe, api }) {
  const status = document.querySelector('[data-connection-status]');
  const error = document.querySelector('[data-network-error]');
  const fields = {
    chainId: document.querySelector('[data-chain-id]'),
    height: document.querySelector('[data-block-height]'),
    time: document.querySelector('[data-block-time]'),
    validators: document.querySelector('[data-validator-count]'),
  };
  const list = document.querySelector('[data-validator-list]');
  const details = document.querySelector('[data-validator-details]');
  const summary = document.querySelector('[data-validator-summary]');
  if (!status || !list || !details || !summary) return;

  let refreshing = false;
  let hasConnected = false;
  let highestObservedHeight = null;
  let hasValidSnapshot = false;
  let hasBlockData = false;
  let apiState = 'loading';
  let websocketState = 'connecting';
  let blockFeed = 'Connecting to the block feed';

  function publishCoreData(patch) {
    card.updateCoreData({ ...patch, blockFeed });
  }

  function setState(state, visualState = null) {
    const normalizedState = visualState || (state.startsWith('WebSocket live') ? 'live' : state.startsWith('RPC fallback') ? 'fallback' : state === 'Unavailable' || state.startsWith('Data unavailable') ? 'unavailable' : 'connecting');
    status.dataset.state = normalizedState;
    status.querySelector('[data-connection-label]').textContent = state;
  }

  function updateConnectionStatus() {
    if (websocketState === 'live') {
      setState(apiState === 'stale' ? 'WebSocket live · some data stale'
        : apiState === 'unavailable' ? 'WebSocket live · validator data unavailable' : 'WebSocket live', 'live');
    } else if (apiState === 'current') {
      setState('RPC fallback', 'fallback');
    } else if (apiState === 'stale') {
      setState('RPC fallback · data stale', 'fallback');
    } else if (apiState === 'unavailable') {
      if (websocketState === 'connecting' || websocketState === 'reconnecting') {
        setState(`Data unavailable · WebSocket ${websocketState}`, 'unavailable');
      } else if (websocketState === 'paused') {
        setState('Paused', 'connecting');
      } else {
        setState('Unavailable', 'unavailable');
      }
    } else if (websocketState === 'paused') {
      setState('Paused', 'connecting');
    } else {
      setState('Connecting');
    }
  }

  function renderValidators(validators) {
    const items = validators.map((validator) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      const identity = document.createElement('div');
      const name = document.createElement('strong');
      const address = document.createElement('small');
      const bonded = document.createElement('span');
      button.className = 'validator-row';
      button.type = 'button';
      button.dataset.validatorAddress = validator.operatorAddress;
      button.setAttribute('aria-pressed', String(validator.operatorAddress === universe?.getActiveValidatorAddress()));
      name.textContent = validator.moniker || validator.operatorAddress;
      address.textContent = validator.operatorAddress;
      const formattedBonded = validator.bondedAtoms === null ? null : formatL1(validator.bondedAtoms);
      bonded.textContent = formattedBonded ? `${formattedBonded} bonded` : 'Bonded amount unavailable';
      identity.append(name, address);
      button.append(identity, bonded);
      button.addEventListener('click', () => {
        if (universe) universe.selectValidator(validator.operatorAddress);
        else handleSelection({ type: 'validator', data: validator });
      });
      item.append(button);
      return item;
    });
    list.replaceChildren(...items);
    summary.textContent = `Active validators · ${validators.length}`;
    details.hidden = false;
  }

  let latestBlockHeight = null;
  const blockHeightSubscribers = new Set();
  let websocketHealthy = false;

  function updateBlock(identity, { pulse = false } = {}) {
    if (!identity || identity.chainId !== GENESIS_API.chainId || !/^\d+$/.test(identity.height)) return false;
    const currentHeight = BigInt(identity.height);
    if (highestObservedHeight !== null && currentHeight < highestObservedHeight) return false;
    const advanced = highestObservedHeight === null || currentHeight > highestObservedHeight;
    if (advanced) highestObservedHeight = currentHeight;
    latestBlockHeight = identity.height;
    fields.chainId.textContent = identity.chainId;
    fields.height.textContent = currentHeight.toLocaleString('en-US');
    if (identity.time) {
      fields.time.textContent = `${new Date(identity.time).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' })} UTC`;
    }
    if (pulse && advanced) universe?.pulseCore();
    hasConnected = true;
    hasBlockData = true;
    if (advanced) blockHeightSubscribers.forEach((listener) => listener(identity.height));
    publishCoreData({ chainId: identity.chainId, height: currentHeight.toString(), time: identity.time || null });
    return advanced;
  }

  async function refresh() {
    if (refreshing || document.hidden) return;
    refreshing = true;
    if (!hasConnected) updateConnectionStatus();
    if (error) error.hidden = true;
    try {
      const identityRequest = websocketHealthy ? Promise.resolve(null) : api.getNetworkIdentity();
      const [identity, validators] = await Promise.all([identityRequest, api.getValidators()]);
      if (identity) updateBlock(identity, { pulse: highestObservedHeight !== null });
      fields.validators.textContent = validators.length.toLocaleString('en-US');
      renderValidators(validators);
      universe?.setValidators(validators);
      const allStakesAvailable = validators.every((validator) => typeof validator.bondedAtoms === 'string' && /^\d+$/.test(validator.bondedAtoms));
      const bondedAtoms = allStakesAvailable
        ? validators.reduce((total, validator) => total + BigInt(validator.bondedAtoms), 0n).toString()
        : null;
      hasValidSnapshot = true;
      apiState = 'current';
      publishCoreData({ validatorCount: validators.length, bondedAtoms, updatedAt: Date.now(), unavailable: false, partial: false, stale: false });
      hasConnected = true;
      updateConnectionStatus();
    } catch (cause) {
      apiState = hasValidSnapshot ? 'stale' : 'unavailable';
      publishCoreData({ unavailable: !hasValidSnapshot && !hasBlockData, partial: !hasValidSnapshot && hasBlockData, stale: hasValidSnapshot });
      if (!hasConnected) {
        if (fields.validators) fields.validators.textContent = 'Unavailable';
        details.hidden = true;
      }
      updateConnectionStatus();
      if (error) {
        error.textContent = `${cause.message} Verify connectivity and endpoint CORS, then try again.`;
        error.hidden = false;
      }
    } finally {
      refreshing = false;
    }
  }

  refresh();
  window.setInterval(refresh, 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

  let stopBlockStream = null;
  function startBlockStream() {
    if (stopBlockStream) return;
    stopBlockStream = api.subscribeNewBlocks({
      onBlock: (block) => {
        if (block.chainId !== GENESIS_API.chainId || !/^\d+$/.test(block.height)) return;
        updateBlock(block, { pulse: block.pulse === true });
      },
      onStatus: ({ state, detail }) => {
        websocketState = state;
        websocketHealthy = state === 'live';
        if (websocketHealthy) {
          blockFeed = 'Live block updates';
        }
        else if (state === 'offline' || state === 'unavailable') {
          blockFeed = 'RPC polling fallback';
          if (detail) console.warn('Genesis block stream is unavailable; RPC polling remains active.', detail);
        } else if (state === 'paused') {
          blockFeed = 'Block feed paused while the page is hidden';
        } else {
          blockFeed = hasConnected || hasValidSnapshot || hasBlockData ? 'RPC polling fallback' : 'Connecting to the block feed';
        }
        updateConnectionStatus();
        publishCoreData({});
      },
      onGap: (gap) => console.info('Genesis block stream resynchronized; intermediate heights were not replayed.', gap),
    });
  }

  startBlockStream();
  window.addEventListener('pagehide', () => {
    stopBlockStream?.();
    stopBlockStream = null;
    websocketHealthy = false;
  });
  window.addEventListener('pageshow', startBlockStream);
  return {
    getLatestBlockHeight: () => latestBlockHeight,
    subscribeBlockHeight: (listener) => {
      blockHeightSubscribers.add(listener);
      return () => blockHeightSubscribers.delete(listener);
    },
  };
}

function initCameraControls() {
  document.querySelector('[data-zoom-in]')?.addEventListener('click', () => universe?.zoomBy(0.8));
  document.querySelector('[data-zoom-out]')?.addEventListener('click', () => universe?.zoomBy(1.25));
  document.querySelector('[data-recenter]')?.addEventListener('click', () => {
    if (universe) universe.selectCore();
    else { currentSelectionKey = null; card.show(null); }
  });
}
