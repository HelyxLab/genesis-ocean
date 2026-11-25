const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Polymod(values) {
  const generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;
  for (const value of values) {
    const top = checksum >> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i += 1) {
      if ((top >> i) & 1) checksum ^= generator[i];
    }
  }
  return checksum;
}

function bech32HrpExpand(hrp) {
  const result = [];
  for (const char of hrp) result.push(char.charCodeAt(0) >> 5);
  result.push(0);
  for (const char of hrp) result.push(char.charCodeAt(0) & 31);
  return result;
}

export function bech32ToBytes(address) {
  if (typeof address !== 'string' || address === '') return null;
  const separator = address.lastIndexOf('1');
  if (separator < 1 || separator + 7 > address.length) return null;
  const hrp = address.slice(0, separator);
  const data = address.slice(separator + 1);
  const values = [];
  for (const char of data) {
    const value = BECH32_CHARSET.indexOf(char);
    if (value < 0) return null;
    values.push(value);
  }
  const checksum = bech32Polymod(bech32HrpExpand(hrp).concat(values));
  if (checksum !== 1) return null;
  const payload = values.slice(0, -6);
  let accumulator = 0;
  let bits = 0;
  const bytes = [];
  for (const value of payload) {
    accumulator = (accumulator << 5) | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >> bits) & 0xff);
    }
  }
  if (bits >= 5 || (accumulator & ((1 << bits) - 1)) !== 0) return null;
  return bytes.length ? bytes : null;
}

export function bech32ToHex(address) {
  const bytes = bech32ToBytes(address);
  if (!bytes) return null;
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function parseSigningInfo(info) {
  if (!info || typeof info !== 'object' || Array.isArray(info)) return null;
  if (typeof info.address !== 'string' || info.address === '') return null;
  const startHeight = Number(info.start_height);
  const indexOffset = Number(info.index_offset);
  const missedBlocksCounter = Number(info.missed_blocks_counter);
  if (!Number.isInteger(startHeight) || startHeight < 0) return null;
  if (!Number.isInteger(indexOffset) || indexOffset < 0) return null;
  if (!Number.isInteger(missedBlocksCounter) || missedBlocksCounter < 0) return null;
  if (missedBlocksCounter > indexOffset) return null;
  return {
    address: info.address,
    startHeight,
    indexOffset,
    missedBlocksCounter,
    jailedUntil: typeof info.jailed_until === 'string' ? info.jailed_until : null,
    tombstoned: info.tombstoned === true,
  };
}

export function calculateSlashingUptime(signingInfo, signedBlocksWindow) {
  if (!signingInfo || typeof signingInfo !== 'object') return null;
  if (signingInfo.tombstoned === true) return null;
  if (!Number.isInteger(signedBlocksWindow) || signedBlocksWindow <= 0) return null;
  const observed = Math.min(signedBlocksWindow, signingInfo.indexOffset);
  if (!Number.isInteger(observed) || observed <= 0) return null;
  if (!Number.isInteger(signingInfo.missedBlocksCounter)) return null;
  if (signingInfo.missedBlocksCounter < 0 || signingInfo.missedBlocksCounter > observed) return null;
  const uptime = ((observed - signingInfo.missedBlocksCounter) / observed) * 100;
  if (!Number.isFinite(uptime) || uptime < 0 || uptime > 100) return null;
  return uptime;
}

export function formatSlashingUptime(signingInfo, signedBlocksWindow) {
  const uptime = calculateSlashingUptime(signingInfo, signedBlocksWindow);
  return uptime === null ? 'N/A' : `${uptime.toFixed(2)}%`;
}

export function classifyHistoricalHeight(validatorSet, signatures, validators) {
  const classifications = new Map();
  if (!Array.isArray(validatorSet) || !Array.isArray(signatures) || validatorSet.length === 0 || validatorSet.length !== signatures.length) {
    return { consistent: false, classifications };
  }
  if (!validateValidatorSetResponse(0, validatorSet) || !validateCommitResponse(0, signatures)) {
    return { consistent: false, classifications };
  }

  const seenAddresses = new Set();
  const seenPublicKeys = new Set();
  const consensusKeyToOperator = new Map();
  const consensusToOperator = new Map();
  let duplicateConsensusIdentity = false;

  for (const [operator, validator] of validators) {
    const consensusKey = validator?.consensusKey;
    if (typeof consensusKey !== 'string' || consensusKey === '') continue;
    if (consensusKeyToOperator.has(consensusKey)) duplicateConsensusIdentity = true;
    else consensusKeyToOperator.set(consensusKey, operator);
  }

  for (const entry of validatorSet) {
    if (seenAddresses.has(entry.address) || seenPublicKeys.has(entry.pubKey)) duplicateConsensusIdentity = true;
    seenAddresses.add(entry.address);
    seenPublicKeys.add(entry.pubKey);

    const operator = consensusKeyToOperator.get(entry.pubKey) || null;
    if (operator) {
      const existingOperator = consensusToOperator.get(entry.address) || null;
      if (existingOperator !== null && existingOperator !== operator) duplicateConsensusIdentity = true;
      else consensusToOperator.set(entry.address, operator);
    }
  }
  if (duplicateConsensusIdentity) return { consistent: false, classifications };

  let inconsistent = false;
  signatures.forEach((signature, index) => {
    if (inconsistent) return;
    const historicalValidator = validatorSet[index];
    if (!historicalValidator) {
      inconsistent = true;
      return;
    }

    let operator = null;
    if (signature.validator_address) {
      if (historicalValidator.address !== signature.validator_address) {
        inconsistent = true;
        return;
      }
      operator = consensusToOperator.get(signature.validator_address) || null;
    } else {
      operator = consensusToOperator.get(historicalValidator.address) || null;
    }

    if (!operator) {
      inconsistent = true;
      return;
    }
    classifications.set(operator, signature.block_id_flag === 2 ? 'signed' : signature.block_id_flag === 1 ? 'missed' : 'unknown');
  });

  return { consistent: !inconsistent, classifications };
}

export function requiresMissedConfirmation(classifications) {
  return [...classifications.values()].includes('missed');
}

export function mergeHistoricalClassifications(first, second) {
  const merged = new Map();
  const operators = new Set([...first.keys(), ...second.keys()]);
  for (const operator of operators) {
    const firstValue = first.get(operator);
    const secondValue = second.get(operator);
    if (firstValue === 'signed' || secondValue === 'signed') merged.set(operator, 'signed');
    else if (firstValue === 'unknown' || secondValue === 'unknown' || firstValue === undefined || secondValue === undefined) {
      merged.set(operator, 'unknown');
    } else if (firstValue === 'missed' && secondValue === 'missed') merged.set(operator, 'missed');
    else merged.set(operator, 'unknown');
  }
  return merged;
}

export function visibleHeightsForTip(tip, windowSize = 100) {
  if (!Number.isInteger(tip) || tip <= windowSize || !Number.isInteger(windowSize) || windowSize <= 0) return [];
  return Array.from({ length: windowSize }, (_, index) => tip - windowSize + index);
}

export function enteringHeightsBetween(previousTip, nextTip) {
  if (!Number.isInteger(previousTip) || !Number.isInteger(nextTip) || nextTip <= previousTip) return [];
  return Array.from({ length: nextTip - previousTip }, (_, index) => previousTip + index);
}

export function slideVisibleHeight(heights, enteringHeight, windowSize = 100) {
  if (!Array.isArray(heights) || heights.length !== windowSize || !Number.isInteger(enteringHeight)
    || !Number.isInteger(windowSize) || windowSize <= 0 || enteringHeight <= heights.at(-1)) {
    return null;
  }
  const nextHeights = heights.slice(1);
  nextHeights.push(enteringHeight);
  return { heights: nextHeights, evictedHeight: heights[0] };
}

export function uptimeValidatorContextSignature(stakingValidators) {
  return JSON.stringify(stakingValidators
    .map(({ operatorAddress, consensusKey, status }) => [operatorAddress, consensusKey, status])
    .sort(([left], [right]) => left.localeCompare(right)));
}

export function formatUptimeInitialProgress(completedCount, windowSize = 100) {
  return `Loading uptime data… ${completedCount}/${windowSize}`;
}

export function countCompletedUptimeHeight(completedCount, result) {
  return result?.complete === true ? completedCount + 1 : completedCount;
}

export function updateUptimeCell(cellsByHeight, height, value, updateElement) {
  const element = cellsByHeight?.get(height);
  if (!element || typeof updateElement !== 'function') return false;
  updateElement(element, height, value);
  return true;
}

export function createUptimeWindowPump({ initialize, advance, rebuild, retry = async () => {} }) {
  if (typeof initialize !== 'function' || typeof advance !== 'function' || typeof rebuild !== 'function'
    || typeof retry !== 'function') {
    throw new TypeError('initialize, advance, rebuild, and retry callbacks are required.');
  }

  let currentTip = null;
  let pendingTip = null;
  let pendingRetry = false;
  let pendingRebuild = false;
  let pumpPromise = null;

  async function drain() {
    while (true) {
      if (pendingTip !== null) {
        const targetTip = pendingTip;
        pendingTip = null;
        if (currentTip === null) {
          await initialize(targetTip);
          currentTip = targetTip;
        } else if (targetTip < currentTip) {
          await rebuild(targetTip);
          currentTip = targetTip;
        } else {
          while (currentTip < targetTip) {
            const nextTip = currentTip + 1;
            await advance(nextTip, nextTip - 1);
            currentTip = nextTip;
          }
        }
        continue;
      }

      if (pendingRebuild) {
        pendingRebuild = false;
        if (currentTip !== null) await rebuild(currentTip);
        continue;
      }

      if (pendingRetry) {
        pendingRetry = false;
        await retry(currentTip);
        continue;
      }

      break;
    }
  }

  function kick() {
    if (!pumpPromise) {
      pumpPromise = drain().finally(() => {
        pumpPromise = null;
        if (pendingTip !== null || pendingRebuild || pendingRetry) void kick();
      });
    }
    return pumpPromise;
  }

  function request(tip) {
    if (!Number.isInteger(tip) || tip <= 0) return pumpPromise || Promise.resolve();
    pendingTip = pendingTip === null ? tip : Math.max(pendingTip, tip);
    return kick();
  }

  function requestRetry() {
    pendingRetry = true;
    return kick();
  }

  function requestRebuild() {
    pendingRebuild = true;
    return kick();
  }

  return Object.freeze({ request, requestRetry, requestRebuild, getCurrentTip: () => currentTip });
}

export function resolveHeightClassifications(first, confirmation = null) {
  if (!first?.consistent || !(first.classifications instanceof Map)) return null;
  const initial = first.classifications;
  if (!requiresMissedConfirmation(initial)) return new Map(initial);
  if (!confirmation?.consistent || !(confirmation.classifications instanceof Map)) return null;

  const repeated = confirmation.classifications;
  if (initial.size !== repeated.size || [...initial.keys()].some((operator) => !repeated.has(operator))) return null;
  const resolved = new Map();
  for (const [operator, firstValue] of initial) {
    const secondValue = repeated.get(operator);
    if (firstValue === 'signed' || secondValue === 'signed') resolved.set(operator, 'signed');
    else if (firstValue === 'missed' && secondValue === 'missed') resolved.set(operator, 'missed');
    else resolved.set(operator, 'unknown');
  }
  return resolved;
}

export function slideUptimeRowCells(row, cellsByHeight, enteringHeight, value, createCell) {
  if (!row || !(cellsByHeight instanceof Map) || typeof createCell !== 'function' || cellsByHeight.size === 0) return null;
  const evictedHeight = cellsByHeight.keys().next().value;
  const evictedCell = cellsByHeight.get(evictedHeight);
  evictedCell?.remove();
  cellsByHeight.delete(evictedHeight);
  const enteringCell = createCell(enteringHeight, value);
  row.append(enteringCell);
  cellsByHeight.set(enteringHeight, enteringCell);
  return { evictedHeight, evictedCell, enteringCell };
}

export function consensusAddressMapFromValidatorSet(validatorSet) {
  const map = new Map();
  if (!Array.isArray(validatorSet)) return map;
  for (const entry of validatorSet) {
    if (entry && typeof entry.pubKey === 'string' && typeof entry.address === 'string') {
      map.set(entry.pubKey, entry.address.toLowerCase());
    }
  }
  return map;
}

export function validateValidatorSetResponse(requestedHeight, response) {
  if (!Array.isArray(response) || response.length === 0) return false;
  for (const entry of response) {
    if (!entry || typeof entry !== 'object') return false;
    if (typeof entry.address !== 'string' || entry.address === '') return false;
    if (typeof entry.pubKey !== 'string' || entry.pubKey === '') return false;
  }
  return true;
}

export function validateCommitResponse(requestedHeight, response) {
  if (!Array.isArray(response) || response.length === 0) return false;
  for (const signature of response) {
    if (!signature || typeof signature !== 'object') return false;
    if (!Number.isInteger(signature.block_id_flag)) return false;
    if (![1, 2, 3].includes(signature.block_id_flag)) return false;
  }
  return true;
}

export function createUptimeDataSource({ fetchJson, rpcBase }) {
  const validatorSetCache = new Map();
  const commitCache = new Map();
  const validatorSetInFlight = new Map();
  const commitInFlight = new Map();

  async function fetchValidatorSet(height, options = {}) {
    const force = options.force === true;
    if (!force && validatorSetCache.has(height)) {
      return validatorSetCache.get(height);
    }
    if (!force && validatorSetInFlight.has(height)) return validatorSetInFlight.get(height);

    const request = (async () => {
      const all = [];
      let page = 1;
      let responseHeight = null;
      let total = null;
      while (true) {
        const data = await fetchJson(`${rpcBase}/validators?height=${height}&per_page=100&page=${page}`, { cache: 'no-store' });
        const result = data?.result || {};
        if (responseHeight === null && result.block_height !== undefined) {
          responseHeight = Number(result.block_height);
        }
        for (const validator of result.validators || []) {
          all.push({ address: validator.address, pubKey: validator.pub_key?.value || null });
        }
        const pageTotal = Number(result.total);
        if (Number.isInteger(pageTotal) && pageTotal > 0) total = pageTotal;
        if (total !== null) {
          if (all.length >= total) break;
        } else if (!(result.validators || []).length) {
          break;
        }
        if (!(result.validators || []).length) break;
        page += 1;
      }

      if (responseHeight !== Number(height)) throw new Error('Validator set height mismatch or missing block height.');
      if (!validateValidatorSetResponse(Number(height), all)) throw new Error('Invalid validator set response.');
      if (total !== null && all.length !== total) throw new Error('Incomplete validator set response.');
      validatorSetCache.set(height, all);
      return all;
    })();

    if (!force) validatorSetInFlight.set(height, request);
    try {
      return await request;
    } finally {
      if (!force) validatorSetInFlight.delete(height);
    }
  }

  async function fetchCommit(height, options = {}) {
    const force = options.force === true;
    if (!force && commitCache.has(height)) {
      return commitCache.get(height);
    }
    if (!force && commitInFlight.has(height)) return commitInFlight.get(height);

    const request = (async () => {
       const data = await fetchJson(`${rpcBase}/commit?height=${height}`, { cache: 'no-store' });
      const signatures = data?.result?.signed_header?.commit?.signatures;
      const commitHeight = Number(data?.result?.signed_header?.header?.height);
      if (commitHeight !== Number(height)) throw new Error('Commit height mismatch.');
      if (!validateCommitResponse(Number(height), signatures)) throw new Error('Invalid commit response.');
      commitCache.set(height, signatures);
      return signatures;
    })();

    if (!force) commitInFlight.set(height, request);
    try {
      return await request;
    } finally {
      if (!force) commitInFlight.delete(height);
    }
  }

  function invalidateHistoricalCaches(height) {
    validatorSetCache.delete(height);
    commitCache.delete(height);
  }

  return {
    fetchValidatorSet,
    fetchCommit,
    invalidateHistoricalCaches,
    caches: { validatorSetCache, commitCache, validatorSetInFlight, commitInFlight },
  };
}

export function initUptime({ container, blockHeight = null } = {}) {
  if (!container) return null;

  const REST = 'https://1317.genesisl1.org';
  const RPC = 'https://26657.genesisl1.org';
  const WINDOW_SIZE = 100;
  const CONCURRENCY = 6;
  const REQUEST_TIMEOUT_MS = 10000;

  container.innerHTML = '';
  const root = document.createElement('section');
  root.className = 'uptime-panel';
  root.innerHTML = `
    <div class="uptime-toolbar">
      <input class="uptime-search" type="search" placeholder="Search validators" aria-label="Search validators">
      <button type="button" class="uptime-retry">Retry</button>
      <span class="uptime-status" role="status">Loading uptime data…</span>
    </div>
    <div class="uptime-list"></div>
  `;
  container.append(root);

  const searchInput = root.querySelector('.uptime-search');
  const retryButton = root.querySelector('.uptime-retry');
  const statusEl = root.querySelector('.uptime-status');
  const list = root.querySelector('.uptime-list');

  const validators = new Map();
  const heights = [];
  const cells = new Map();
  const rowsByOperator = new Map();
  let loadedCount = 0;
  let signedBlocksWindow = null;
  let signingInfosByAddress = new Map();
  let signingInfoStale = false;
  let validatorContextKey = null;
  let lastContextRefreshAt = 0;
  const failedHeights = new Set();
  let windowPump = null;
  let contextStale = false;
  let pollTimer = null;
  let polling = false;
  let pollBackoffMs = 5000;
  const POLL_INTERVAL_MS = 5000;
  const MAX_POLL_BACKOFF_MS = 30000;
  const CONTEXT_REFRESH_INTERVAL_MS = 60_000;

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal, ...options, cache: 'no-store' });
      if (!response.ok) throw new Error(`Request failed (${response.status}) at ${new URL(url).host}.`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  const dataSource = createUptimeDataSource({ fetchJson, rpcBase: RPC });
  const fetchValidatorSet = dataSource.fetchValidatorSet;
  const fetchCommit = dataSource.fetchCommit;
  const invalidateHistoricalCaches = dataSource.invalidateHistoricalCaches;

  async function fetchStakingValidators() {
    const result = [];
    let nextKey = null;
    for (let page = 0; page < 50; page += 1) {
      const url = new URL(`${REST}/cosmos/staking/v1beta1/validators`);
      url.searchParams.set('pagination.limit', '200');
      if (nextKey) url.searchParams.set('pagination.key', nextKey);
      const data = await fetchJson(url.toString());
      if (!Array.isArray(data?.validators)) throw new Error('Invalid staking validator list response.');
      for (const validator of data.validators) {
        if (typeof validator?.operator_address !== 'string' || validator.operator_address === ''
          || typeof validator.status !== 'string') {
          throw new Error('Incomplete staking validator record.');
        }
        result.push({
          operatorAddress: validator.operator_address,
          moniker: validator.description?.moniker || validator.operator_address,
          consensusKey: validator.consensus_pubkey?.key || null,
          status: validator.status || null,
        });
      }
      nextKey = data.pagination?.next_key || null;
      if (!nextKey) break;
    }
    if (result.length === 0) throw new Error('Genesis L1 returned an empty staking validator list.');
    return result;
  }

  async function fetchSlashingParams() {
    const data = await fetchJson(`${REST}/cosmos/slashing/v1beta1/params`);
    const params = data?.params || {};
    const windowValue = Number(params.signed_blocks_window);
    if (!Number.isInteger(windowValue) || windowValue <= 0) throw new Error('Invalid slashing signed_blocks_window.');
    return {
      signedBlocksWindow: windowValue,
      minSignedPerWindow: params.min_signed_per_window || null,
      downtimeJailDuration: params.downtime_jail_duration || null,
      slashFractionDowntime: params.slash_fraction_downtime || null,
    };
  }

  async function fetchSigningInfos() {
    const result = [];
    let nextKey = null;
    for (let page = 0; page < 100; page += 1) {
      const url = new URL(`${REST}/cosmos/slashing/v1beta1/signing_infos`);
      url.searchParams.set('pagination.limit', '200');
      if (nextKey) url.searchParams.set('pagination.key', nextKey);
      const data = await fetchJson(url.toString());
      for (const info of data.info || []) {
        const parsed = parseSigningInfo(info);
        if (parsed) result.push(parsed);
      }
      nextKey = data.pagination?.next_key || null;
      if (!nextKey) break;
    }
    return result;
  }

  let queue = [];
  let active = 0;
  function runQueue() {
    while (active < CONCURRENCY && queue.length) {
      const task = queue.shift();
      active += 1;
      Promise.resolve()
        .then(task)
        .finally(() => {
          active -= 1;
          runQueue();
        });
    }
  }
  function enqueue(task) {
    return new Promise((resolve, reject) => {
      queue.push(() => task().then(resolve, reject));
      runQueue();
    });
  }

  function ensureValidator(operatorAddress, moniker = null, consensusKey = null) {
    if (!validators.has(operatorAddress)) {
      validators.set(operatorAddress, {
        operatorAddress,
        moniker: moniker || operatorAddress,
        consensusKey,
        consensusAddress: null,
        signingInfo: null,
        active: false,
        cells: new Map(),
      });
      cells.set(operatorAddress, new Map());
    } else {
      const item = validators.get(operatorAddress);
      if (moniker) item.moniker = moniker;
      if (consensusKey) item.consensusKey = consensusKey;
    }
    return validators.get(operatorAddress);
  }

  async function fetchHeightObservation(height, force = false) {
    let forceAttempt = force;
    let lastError = null;
    for (let attempt = 0; attempt < (force ? 1 : 2); attempt += 1) {
      try {
        const [validatorSet, signatures] = await Promise.all([
          enqueue(() => fetchValidatorSet(height, { force: forceAttempt })),
          enqueue(() => fetchCommit(height, { force: forceAttempt })),
        ]);
        if (!Array.isArray(validatorSet) || !Array.isArray(signatures) || validatorSet.length !== signatures.length) {
          throw new Error('Incomplete validator set or commit response.');
        }
        const classified = classifyHistoricalHeight(validatorSet, signatures, validators);
        if (!classified.consistent) throw new Error('Inconsistent validator set and commit response.');
        return { ...classified, complete: true, error: null };
      } catch (error) {
        lastError = error;
        invalidateHistoricalCaches(height);
        if (forceAttempt) break;
        forceAttempt = true;
      }
    }
    return { consistent: false, classifications: new Map(), complete: false, error: lastError };
  }

  async function processHeight(height, force = false) {
    const first = await fetchHeightObservation(height, force);
    if (!first.complete) return { complete: false, classifications: null, error: first.error };

    let confirmation = null;
    if (requiresMissedConfirmation(first.classifications)) {
      confirmation = await fetchHeightObservation(height, true);
      if (!confirmation.complete) {
        return { complete: false, classifications: null, error: confirmation.error };
      }
    }

    const classifications = resolveHeightClassifications(first, confirmation);
    if (!classifications) {
      invalidateHistoricalCaches(height);
      return { complete: false, classifications: null, error: new Error('Height confirmation did not match the first observation.') };
    }
    return { complete: true, classifications, error: null };
  }

  function cellLabel(value) {
    return value === 'signed' ? 'Signed' : value === 'missed' ? 'Missed' : 'Unknown';
  }

  function updateCellElement(element, height, value) {
    const normalized = ['signed', 'missed', 'unknown'].includes(value) ? value : 'unknown';
    const label = `Block ${height}: ${cellLabel(normalized)}`;
    element.className = `uptime-cell ${normalized}`;
    element.dataset.height = String(height);
    element.title = label;
    element.setAttribute('aria-label', label);
  }

  function createCellElement(height, value) {
    const element = document.createElement('span');
    updateCellElement(element, height, value);
    return element;
  }

  function createValidatorRow(validator) {
    const article = document.createElement('article');
    article.className = 'uptime-validator';
    const head = document.createElement('div');
    head.className = 'uptime-validator-head';
    const identity = document.createElement('div');
    const name = document.createElement('strong');
    const address = document.createElement('small');
    address.className = 'uptime-validator-address';
    const percentage = document.createElement('span');
    percentage.className = 'uptime-value';
    const blocks = document.createElement('div');
    blocks.className = 'uptime-blocks';
    identity.append(name, address);
    head.append(identity, percentage);
    article.append(head, blocks);
    const row = { article, name, address, percentage, blocks, cellsByHeight: new Map() };
    updateValidatorRow(row, validator);
    return row;
  }

  function updateValidatorRow(row, validator) {
    row.name.textContent = validator.moniker || validator.operatorAddress;
    row.address.textContent = validator.operatorAddress;
    row.percentage.textContent = formatSlashingUptime(validator.signingInfo, signedBlocksWindow);
  }

  function updateSearchVisibility() {
    const filter = searchInput.value.trim().toLowerCase();
    for (const [operator, row] of rowsByOperator) {
      const validator = validators.get(operator);
      row.article.hidden = Boolean(filter)
        && !validator.moniker.toLowerCase().includes(filter)
        && !operator.toLowerCase().includes(filter);
    }
  }

  function renderRows() {
    const activeRows = [...validators.values()]
      .filter((validator) => validator.active)
      .sort((a, b) => a.moniker.localeCompare(b.moniker))
      .map((validator) => {
        const row = createValidatorRow(validator);
        const map = cells.get(validator.operatorAddress) || new Map();
        for (const height of heights) {
          const value = map.get(height) || 'unknown';
          row.cellsByHeight.set(height, createCellElement(height, value));
        }
        row.blocks.replaceChildren(...row.cellsByHeight.values());
        rowsByOperator.set(validator.operatorAddress, row);
        return row.article;
      });
    list.replaceChildren(...activeRows);
    updateSearchVisibility();
  }

  function updateRowMetadata() {
    for (const [operator, row] of rowsByOperator) {
      const validator = validators.get(operator);
      if (validator) updateValidatorRow(row, validator);
    }
  }

  function updateHeightCells(height, classifications) {
    for (const [operator] of validators) {
      const value = classifications.get(operator) || 'unknown';
      cells.get(operator)?.set(height, value);
      const row = rowsByOperator.get(operator);
      updateUptimeCell(row?.cellsByHeight, height, value, updateCellElement);
    }
  }

  function initializeCellMaps() {
    for (const [operator, validator] of validators) {
      const map = new Map(heights.map((height) => [height, 'unknown']));
      cells.set(operator, map);
      validator.cells = map;
    }
  }

  function slideWindow(enteringHeight) {
    const update = slideVisibleHeight(heights, enteringHeight, WINDOW_SIZE);
    if (!update) return false;
    heights.splice(0, heights.length, ...update.heights);
    failedHeights.delete(update.evictedHeight);
    for (const [operator, validator] of validators) {
      const map = cells.get(operator) || new Map();
      map.delete(update.evictedHeight);
      map.set(enteringHeight, 'unknown');
      cells.set(operator, map);
      validator.cells = map;
      const row = rowsByOperator.get(operator);
      if (row) {
        slideUptimeRowCells(row.blocks, row.cellsByHeight, enteringHeight, 'unknown', createCellElement);
      }
    }
    return true;
  }

  function setStatus(message) {
    if (statusEl.textContent !== message) statusEl.textContent = message;
  }

  function setWindowStatus(readyMessage = '') {
    if (failedHeights.size) {
      const heightsLabel = failedHeights.size === 1 ? 'block is' : 'blocks are';
      setStatus(`${failedHeights.size} ${heightsLabel} unavailable. Select Retry to try again.`);
    } else if (contextStale || signingInfoStale) {
      setStatus('Validator metadata may be stale.');
    } else {
      setStatus(readyMessage);
    }
  }

  function applyValidatorContext(stakingValidators) {
    const nextKey = uptimeValidatorContextSignature(stakingValidators);
    const changed = nextKey !== validatorContextKey;
    if (changed) {
      validators.clear();
      cells.clear();
      rowsByOperator.clear();
      for (const item of stakingValidators) {
        const validator = {
          operatorAddress: item.operatorAddress,
          moniker: item.moniker || item.operatorAddress,
          consensusKey: item.consensusKey,
          consensusAddress: null,
          signingInfo: null,
          active: item.status === 'BOND_STATUS_BONDED',
          cells: new Map(),
        };
        validators.set(item.operatorAddress, validator);
        cells.set(item.operatorAddress, validator.cells);
      }
      validatorContextKey = nextKey;
    } else {
      for (const item of stakingValidators) {
        const validator = validators.get(item.operatorAddress);
        if (!validator) continue;
        validator.moniker = item.moniker || item.operatorAddress;
        validator.active = item.status === 'BOND_STATUS_BONDED';
      }
    }
    return changed;
  }

  async function refreshSupplementaryContext(visibleHeight) {
    contextStale = false;
    signingInfoStale = false;
    if (visibleHeight > 0) {
      try {
        const currentValidatorSet = await fetchValidatorSet(visibleHeight);
        const addressByPublicKey = consensusAddressMapFromValidatorSet(currentValidatorSet);
        for (const validator of validators.values()) {
          validator.consensusAddress = validator.consensusKey
            ? addressByPublicKey.get(validator.consensusKey) || null
            : null;
        }
      } catch (error) {
        contextStale = true;
        console.error('Uptime consensus address lookup failed.', error);
      }
    }

    try {
      const params = await fetchSlashingParams();
      signedBlocksWindow = params.signedBlocksWindow;
    } catch (error) {
      signingInfoStale = true;
      console.error('Uptime slashing params failed.', error);
    }

    try {
      const signingInfos = await fetchSigningInfos();
      if (signingInfos.length > 0 || signingInfosByAddress.size === 0) {
        const nextMap = new Map();
        for (const info of signingInfos) {
          const hex = bech32ToHex(info.address);
          if (hex) nextMap.set(hex, info);
        }
        if (nextMap.size > 0 || signingInfosByAddress.size === 0) signingInfosByAddress = nextMap;
      }
    } catch (error) {
      signingInfoStale = true;
      console.error('Uptime signing info failed.', error);
    }

    for (const validator of validators.values()) {
      if (validator.consensusAddress) {
        validator.signingInfo = signingInfosByAddress.get(validator.consensusAddress) || validator.signingInfo || null;
      }
    }
    updateRowMetadata();
  }

  async function refreshValidatorContext(tip) {
    const stakingValidators = await fetchStakingValidators();
    const changed = applyValidatorContext(stakingValidators);
    await refreshSupplementaryContext(Math.max(1, tip - 1));
    lastContextRefreshAt = Date.now();
    return changed;
  }

  async function rebuildWindow(tip, { force = false, contextReady = false } = {}) {
    if (!contextReady) {
      try {
        await refreshValidatorContext(tip);
      } catch (error) {
        contextStale = true;
        setStatus('Unable to load validator data.');
        console.error('Uptime validator list failed.', error);
        if (validators.size === 0) throw error;
      }
    }

    const visibleHeights = visibleHeightsForTip(tip, WINDOW_SIZE);
    if (visibleHeights.length !== WINDOW_SIZE) {
      setStatus('Waiting for enough committed blocks to display uptime history.');
      return;
    }

    heights.splice(0, heights.length, ...visibleHeights);
    failedHeights.clear();
    initializeCellMaps();
    renderRows();
    loadedCount = 0;
    setStatus(formatUptimeInitialProgress(0, WINDOW_SIZE));
    const contextKey = validatorContextKey;

    await Promise.all(heights.map(async (height) => {
      const result = await processHeight(height, force);
      if (contextKey !== validatorContextKey || !heights.includes(height)) return;
      if (result.complete) {
        updateHeightCells(height, result.classifications);
        failedHeights.delete(height);
      } else {
        failedHeights.add(height);
      }
      loadedCount = countCompletedUptimeHeight(loadedCount, result);
      setStatus(formatUptimeInitialProgress(loadedCount, WINDOW_SIZE));
    }));

    setWindowStatus();
  }

  async function initializeWindow(tip) {
    await rebuildWindow(tip);
  }

  async function advanceWindow(tip, enteringHeight) {
    if (Date.now() - lastContextRefreshAt >= CONTEXT_REFRESH_INTERVAL_MS) {
      try {
        const contextChanged = await refreshValidatorContext(tip);
        if (contextChanged) {
          await rebuildWindow(tip, { contextReady: true });
          return;
        }
      } catch (error) {
        contextStale = true;
        console.error('Uptime validator context refresh failed.', error);
      }
    }

    if (heights.length !== WINDOW_SIZE || enteringHeight !== heights.at(-1) + 1) {
      await rebuildWindow(tip);
      return;
    }

    if (!slideWindow(enteringHeight)) {
      await rebuildWindow(tip);
      return;
    }

    failedHeights.delete(enteringHeight);
    const result = await processHeight(enteringHeight);
    if (heights.includes(enteringHeight)) {
      if (result.complete) {
        updateHeightCells(enteringHeight, result.classifications);
      } else {
        failedHeights.add(enteringHeight);
      }
    }
    setWindowStatus();
  }

  async function retryFailedHeights(tip) {
    if (!Number.isInteger(tip)) return;
    if (Date.now() - lastContextRefreshAt >= CONTEXT_REFRESH_INTERVAL_MS) {
      try {
        const contextChanged = await refreshValidatorContext(tip);
        if (contextChanged) {
          await rebuildWindow(tip, { contextReady: true });
          return;
        }
      } catch (error) {
        contextStale = true;
        console.error('Uptime validator context retry failed.', error);
      }
    }

    const retryHeights = [...failedHeights].filter((height) => heights.includes(height)).sort((a, b) => a - b);
    if (retryHeights.length) setStatus('Retrying unavailable blocks…');
    for (const height of retryHeights) {
      const result = await processHeight(height, true);
      if (!heights.includes(height)) continue;
      if (result.complete) {
        failedHeights.delete(height);
        updateHeightCells(height, result.classifications);
      }
    }
    setWindowStatus(retryHeights.length ? 'Retry finished.' : 'No unavailable blocks to retry.');
  }

  function createWindowPump() {
    windowPump = createUptimeWindowPump({
      initialize: initializeWindow,
      advance: advanceWindow,
      rebuild: (tip) => rebuildWindow(tip, { force: true }),
      retry: retryFailedHeights,
    });
  }

  async function fetchLatestHeight() {
    const data = await fetchJson(`${RPC}/status`, { cache: 'no-store' });
    const height = data?.result?.sync_info?.latest_block_height;
    if (!/^\d+$/.test(height)) throw new Error('Invalid latest block height.');
    return Number(height);
  }

  async function runPollCycle() {
    if (polling) return;
    polling = true;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    try {
      if (document.hidden) return;
      const latestHeight = await fetchLatestHeight();
      await windowPump.request(latestHeight);
      pollBackoffMs = POLL_INTERVAL_MS;
    } catch (error) {
      pollBackoffMs = Math.min(pollBackoffMs * 2, MAX_POLL_BACKOFF_MS);
      setStatus('Unable to check the latest block. Waiting for the next check.');
      console.error('Uptime height polling failed.', error);
    } finally {
      polling = false;
      if (!document.hidden) pollTimer = setTimeout(runPollCycle, pollBackoffMs);
    }
  }

  createWindowPump();
  const unsubscribeBlockHeight = typeof blockHeight?.subscribeBlockHeight === 'function'
    ? blockHeight.subscribeBlockHeight((height) => {
      const numericHeight = Number(height);
      if (!Number.isInteger(numericHeight) || numericHeight <= 0) return;
      windowPump.request(numericHeight).catch((error) => {
        setStatus('Unable to update uptime data. Showing the last available window.');
        console.error('Uptime block notification failed.', error);
      });
    })
    : null;

  const initialBlockHeight = Number(blockHeight?.getLatestBlockHeight?.());
  if (Number.isInteger(initialBlockHeight) && initialBlockHeight > 0) {
    windowPump.request(initialBlockHeight).catch((error) => {
      setStatus('Unable to load uptime data. Try again with Retry.');
      console.error('Uptime initial load failed.', error);
    });
  }

  searchInput.addEventListener('input', updateSearchVisibility);
  retryButton.addEventListener('click', () => {
    const retry = windowPump.getCurrentTip() === null ? runPollCycle() : windowPump.requestRetry();
    retry?.catch((error) => {
      setStatus('Unable to retry uptime data.');
      console.error('Uptime retry failed.', error);
    });
  });

  const handleVisibilityChange = () => {
    if (!document.hidden) {
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
      runPollCycle();
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  runPollCycle();

  return {
    refresh: () => windowPump.getCurrentTip() === null ? runPollCycle() : windowPump.requestRetry(),
    forceRefresh: () => windowPump.getCurrentTip() === null ? runPollCycle() : windowPump.requestRebuild(),
    destroy: () => {
      if (pollTimer) clearTimeout(pollTimer);
      unsubscribeBlockHeight?.();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    },
  };
}
