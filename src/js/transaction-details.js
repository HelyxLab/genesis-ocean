import { formatL1, GENESIS_API } from './data/genesis-api.js';

function sameTransactionHash(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  return left === right || (/^[\da-f]{64}$/i.test(left) && left.toLowerCase() === right.toLowerCase());
}

export function formatTransactionCoins(coins) {
  if (!Array.isArray(coins) || !coins.length) return null;
  return coins.map(({ integer, denom }) => denom === GENESIS_API.denom
    ? formatL1(integer)
    : `${integer} ${denom}`).join(', ');
}

export function reconcileTransactionEvidence(lcd, normalized = null) {
  const height = (value) => typeof value === 'string' && /^\d+$/.test(value) ? BigInt(value) : null;
  const code = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
  const lcdHeight = height(lcd.height);
  const lcdCode = code(lcd.code);
  const lcdStatus = lcdCode === null ? 'unknown' : lcdCode === 0 ? 'success' : 'failed';
  const summary = { height: lcdHeight, timestamp: timestamp(lcd.timestamp), code: lcdCode, status: lcdStatus, conflicts: [] };
  if (!normalized) return summary;
  if (!sameTransactionHash(lcd.hash, normalized.hash)) return { ...summary, conflicts: ['transaction hash'] };

  const detailHeight = height(normalized.height);
  const detailCode = code(normalized.execution?.code);
  const detailStatus = normalized.execution?.status ?? 'unknown';
  if (lcdHeight !== null && detailHeight !== null && lcdHeight !== detailHeight) summary.conflicts.push('block height');
  if ((lcdCode !== null && detailCode !== null && lcdCode !== detailCode)
    || (lcdStatus !== 'unknown' && detailStatus !== 'unknown' && lcdStatus !== detailStatus)) {
    summary.conflicts.push('execution result');
  }
  const messages = lcd.messages ?? [];
  const operations = normalized.operations ?? [];
  if (messages.length && operations.length) {
    const messageType = (value) => value?.replace(/^\//, '');
    if (messages.length !== operations.length || messages.some((message, index) => message.messageType
      && operations[index].messageType && messageType(message.messageType) !== messageType(operations[index].messageType))) {
      summary.conflicts.push('message list');
    } else {
      const coins = (amounts) => JSON.stringify(amounts.map(({ integer, denom }) => `${integer} ${denom}`).sort());
      if (messages.some((message, index) => message.amountsComplete && operations[index].amountsComplete
        && coins(message.amounts) !== coins(operations[index].amounts))) {
        summary.conflicts.push('message amounts');
      }
    }
  }
  if (summary.conflicts.length) return summary;
  return {
    height: lcdHeight ?? detailHeight,
    timestamp: summary.timestamp ?? timestamp(normalized.timestamp),
    code: lcdCode ?? detailCode,
    status: lcdStatus === 'unknown' ? detailStatus : lcdStatus,
    conflicts: [],
  };
}

export function createTransactionDetailsController({ cosmosDataApi, onState = () => {} } = {}) {
  if (typeof cosmosDataApi?.getNormalizedCosmosTransaction !== 'function') {
    throw new TypeError('cosmosDataApi.getNormalizedCosmosTransaction is required.');
  }
  if (typeof onState !== 'function') throw new TypeError('onState must be a function.');

  const cache = new Map();
  const pending = new Map();
  const states = new Map();
  let selectedHash = null;

  function publish(hash, update) {
    if (selectedHash === hash) onState({ hash, ...update });
  }

  function getState(hash) {
    return states.get(hash) || 'not-loaded';
  }

  function select(hash) {
    if (typeof hash !== 'string' || hash.length === 0) {
      throw new TypeError('A transaction hash is required.');
    }
    selectedHash = hash;

    if (cache.has(hash)) {
      const result = cache.get(hash);
      states.set(hash, 'available');
      publish(hash, { state: 'available', result });
      return Promise.resolve({ state: 'available', result });
    }

    const existingRequest = pending.get(hash);
    if (existingRequest) {
      states.set(hash, 'loading');
      publish(hash, { state: 'loading' });
      return existingRequest;
    }

    states.set(hash, 'loading');
    publish(hash, { state: 'loading' });
    const request = Promise.resolve()
      .then(() => cosmosDataApi.getNormalizedCosmosTransaction(hash))
      .then((result) => {
        if (!sameTransactionHash(result?.normalized?.hash, hash)) {
          const error = new Error('GL1X returned transaction details for a different hash.');
          error.type = 'invalid_payload';
          throw error;
        }
        cache.set(hash, result);
        states.set(hash, 'available');
        return { state: 'available', result };
      })
      .catch((error) => {
        const state = error?.status === 404 ? 'unavailable' : 'error';
        states.set(hash, state);
        return { state, error };
      })
      .then((outcome) => {
        publish(hash, outcome);
        return outcome;
      })
      .finally(() => pending.delete(hash));

    pending.set(hash, request);
    return request;
  }

  function clearSelection() {
    selectedHash = null;
  }

  return Object.freeze({ select, clearSelection, getState });
}
