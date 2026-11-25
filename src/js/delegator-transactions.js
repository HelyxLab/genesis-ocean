export function createDelegatorTransactionsCache({ getTransactions } = {}) {
  if (typeof getTransactions !== 'function') throw new TypeError('getTransactions is required.');

  const cache = new Map();
  const pending = new Map();

  function getCached(address) {
    return cache.get(address) ?? null;
  }

  function load(address) {
    if (cache.has(address)) return Promise.resolve(cache.get(address));
    if (pending.has(address)) return pending.get(address);

    const request = Promise.resolve()
      .then(() => getTransactions(address))
      .then((result) => {
        if (!Array.isArray(result?.transactions)) {
          throw new TypeError('A delegator transaction response must contain a transactions array.');
        }
        const entry = {
          data: result.transactions,
          total: result.total ?? null,
          timestamp: Date.now(),
        };
        cache.set(address, entry);
        return entry;
      })
      .finally(() => {
        if (pending.get(address) === request) pending.delete(address);
      });

    pending.set(address, request);
    return request;
  }

  return Object.freeze({ getCached, load });
}

export function isCurrentDelegatorTransactionsRequest({
  requestRevision,
  currentRevision,
  address,
  currentSelectionKey,
}) {
  return requestRevision === currentRevision && currentSelectionKey === `delegator:${address}`;
}