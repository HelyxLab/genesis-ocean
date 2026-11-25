import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDelegatorTransactionsCache,
  isCurrentDelegatorTransactionsRequest,
} from './delegator-transactions.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('deduplicates in-flight requests and reuses the successful result for a delegator', async () => {
  const pending = deferred();
  let calls = 0;
  const cache = createDelegatorTransactionsCache({
    getTransactions(address) {
      calls += 1;
      assert.equal(address, 'delegator-A');
      return pending.promise;
    },
  });

  const first = cache.load('delegator-A');
  const second = cache.load('delegator-A');
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);

  const transactions = [{ hash: 'TX_A' }];
  pending.resolve({ transactions, total: '1' });
  const entry = await first;

  assert.equal(entry.data, transactions);
  assert.equal(cache.getCached('delegator-A'), entry);
  assert.equal(await cache.load('delegator-A'), entry);
  assert.equal(calls, 1);
});

test('keeps transaction data isolated by delegator address', async () => {
  const entries = new Map([
    ['delegator-A', [{ hash: 'TX_A' }]],
    ['delegator-B', [{ hash: 'TX_B' }]],
  ]);
  const cache = createDelegatorTransactionsCache({
    async getTransactions(address) {
      return { transactions: entries.get(address), total: '1' };
    },
  });

  const [a, b] = await Promise.all([cache.load('delegator-A'), cache.load('delegator-B')]);

  assert.deepEqual(a.data, [{ hash: 'TX_A' }]);
  assert.deepEqual(b.data, [{ hash: 'TX_B' }]);
  assert.notEqual(a, b);
});

test('does not cache failures and allows a later retry', async () => {
  let calls = 0;
  const cache = createDelegatorTransactionsCache({
    async getTransactions() {
      calls += 1;
      if (calls === 1) throw new Error('temporary RPC failure');
      return { transactions: [{ hash: 'TX_RETRY' }], total: '1' };
    },
  });

  await assert.rejects(cache.load('delegator-A'), /temporary RPC failure/);
  assert.equal(cache.getCached('delegator-A'), null);
  const entry = await cache.load('delegator-A');

  assert.deepEqual(entry.data, [{ hash: 'TX_RETRY' }]);
  assert.equal(calls, 2);
});

test('rejects malformed responses without caching them', async () => {
  const cache = createDelegatorTransactionsCache({ getTransactions: async () => ({ transactions: null }) });

  await assert.rejects(cache.load('delegator-A'), /transactions array/);
  assert.equal(cache.getCached('delegator-A'), null);
});

test('rejects late callbacks after a later selection, including A-to-B-to-A', () => {
  assert.equal(isCurrentDelegatorTransactionsRequest({
    requestRevision: 1,
    currentRevision: 3,
    address: 'delegator-A',
    currentSelectionKey: 'delegator:delegator-A',
  }), false);
  assert.equal(isCurrentDelegatorTransactionsRequest({
    requestRevision: 3,
    currentRevision: 3,
    address: 'delegator-A',
    currentSelectionKey: 'delegator:delegator-A',
  }), true);
  assert.equal(isCurrentDelegatorTransactionsRequest({
    requestRevision: 3,
    currentRevision: 3,
    address: 'delegator-A',
    currentSelectionKey: 'delegator:delegator-B',
  }), false);
});