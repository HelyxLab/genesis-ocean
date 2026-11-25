import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransactionDetailsController, formatTransactionCoins, reconcileTransactionEvidence } from './transaction-details.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function result(hash) {
  return {
    raw: { hash },
    normalized: { hash, execution: { status: 'success' }, operations: [{ type: 'other', status: 'unknown' }] },
    meta: { source: 'gl1x-http', freshness: { state: 'current' } },
  };
}

test('reports not-loaded, queries the selected hash, and preserves the adapter result', async () => {
  const response = result('TX_A');
  const queriedHashes = [];
  const updates = [];
  const controller = createTransactionDetailsController({
    cosmosDataApi: {
      async getNormalizedCosmosTransaction(hash) {
        queriedHashes.push(hash);
        return response;
      },
    },
    onState: (update) => updates.push(update),
  });

  assert.equal(controller.getState('TX_A'), 'not-loaded');
  const loaded = await controller.select('TX_A');

  assert.deepEqual(queriedHashes, ['TX_A']);
  assert.equal(loaded.result, response);
  assert.equal(controller.getState('TX_A'), 'available');
  assert.equal(updates[0].state, 'loading');
  assert.equal(updates[1].state, 'available');
  assert.equal(updates[1].result.raw, response.raw);
  assert.equal(updates[1].result.normalized, response.normalized);
  assert.equal(updates[1].result.meta, response.meta);
});

test('reuses an in-flight and completed result for repeated selections of the same hash', async () => {
  const pending = deferred();
  let requestCount = 0;
  const updates = [];
  const controller = createTransactionDetailsController({
    cosmosDataApi: {
      getNormalizedCosmosTransaction() {
        requestCount += 1;
        return pending.promise;
      },
    },
    onState: (update) => updates.push(update),
  });

  const firstSelection = controller.select('TX_A');
  const repeatedSelection = controller.select('TX_A');
  await Promise.resolve();
  assert.equal(requestCount, 1);

  const response = result('TX_A');
  pending.resolve(response);
  await Promise.all([firstSelection, repeatedSelection]);
  await controller.select('TX_A');

  assert.equal(requestCount, 1);
  assert.equal(updates.at(-1).state, 'available');
  assert.equal(updates.at(-1).result, response);
});

test('distinguishes a missing GL1X transaction from other request errors without fallback', async () => {
  const queriedHashes = [];
  const updates = [];
  const controller = createTransactionDetailsController({
    cosmosDataApi: {
      async getNormalizedCosmosTransaction(hash) {
        queriedHashes.push(hash);
        const error = new Error(hash);
        if (hash === 'TX_MISSING') error.status = 404;
        else error.type = 'network';
        throw error;
      },
    },
    onState: (update) => updates.push(update),
  });

  const unavailable = await controller.select('TX_MISSING');
  const failed = await controller.select('TX_ERROR');

  assert.equal(unavailable.state, 'unavailable');
  assert.equal(failed.state, 'error');
  assert.deepEqual(queriedHashes, ['TX_MISSING', 'TX_ERROR']);
  assert.deepEqual(updates.filter(({ state }) => state === 'unavailable' || state === 'error').map(({ state }) => state), [
    'unavailable', 'error',
  ]);
});

test('rejects and does not cache details returned for a different transaction hash', async () => {
  let requestCount = 0;
  const updates = [];
  const controller = createTransactionDetailsController({
    cosmosDataApi: {
      async getNormalizedCosmosTransaction() {
        requestCount += 1;
        return result('TX_OTHER');
      },
    },
    onState: (update) => updates.push(update),
  });

  const outcome = await controller.select('TX_A');

  assert.equal(outcome.state, 'error');
  assert.equal(outcome.error.type, 'invalid_payload');
  assert.equal(controller.getState('TX_A'), 'error');
  assert.equal(requestCount, 1);
  assert.equal(updates.at(-1).state, 'error');
});

test('matches hex hashes across providers regardless of case and compares evidence before merging', async () => {
  const hash = 'AB'.repeat(32);
  const response = result(hash.toLowerCase());
  response.normalized.height = '42';
  response.normalized.timestamp = '2026-11-25T12:00:00Z';
  response.normalized.execution.code = 0;
  const controller = createTransactionDetailsController({ cosmosDataApi: { getNormalizedCosmosTransaction: async () => response } });
  assert.equal((await controller.select(hash)).result, response);
  assert.deepEqual(reconcileTransactionEvidence({ hash }, response.normalized), {
    height: 42n, timestamp: response.normalized.timestamp, code: 0, status: 'success', conflicts: [],
  });
  assert.deepEqual(reconcileTransactionEvidence({ hash, height: '43', code: 5 }, response.normalized).conflicts, [
    'block height', 'execution result',
  ]);
  assert.deepEqual(reconcileTransactionEvidence({ hash: 'CD'.repeat(32) }, response.normalized).conflicts, ['transaction hash']);
});

test('keeps mixed-denomination amounts separate and detects conflicting complete message amounts', () => {
  const amounts = [{ integer: '1000000000000000000', denom: 'el1' }, { integer: '9007199254740993', denom: 'ibc/ABC' }];
  const messageType = '/cosmos.bank.v1beta1.MsgSend';
  const lcd = { hash: 'TX_A', messages: [{ messageType, amounts, amountsComplete: true }] };
  const detail = { hash: lcd.hash, operations: [{ messageType, amounts: [...amounts].reverse(), amountsComplete: true }] };
  assert.equal(formatTransactionCoins(amounts), '1 L1, 9007199254740993 ibc/ABC');
  assert.deepEqual(reconcileTransactionEvidence(lcd, detail).conflicts, []);
  detail.operations[0].amounts = amounts.slice(0, 1);
  assert.deepEqual(reconcileTransactionEvidence(lcd, detail).conflicts, ['message amounts']);
  detail.operations[0].amountsComplete = false;
  assert.deepEqual(reconcileTransactionEvidence(lcd, detail).conflicts, []);
});

test('does not publish a late response from a previous transaction selection', async () => {
  const first = deferred();
  const second = deferred();
  const updates = [];
  const controller = createTransactionDetailsController({
    cosmosDataApi: {
      getNormalizedCosmosTransaction(hash) {
        return hash === 'TX_A' ? first.promise : second.promise;
      },
    },
    onState: (update) => updates.push(update),
  });

  const firstSelection = controller.select('TX_A');
  const secondSelection = controller.select('TX_B');
  second.resolve(result('TX_B'));
  await secondSelection;
  first.resolve(result('TX_A'));
  await firstSelection;

  assert.deepEqual(updates.map(({ hash, state }) => [hash, state]), [
    ['TX_A', 'loading'],
    ['TX_B', 'loading'],
    ['TX_B', 'available'],
  ]);
  assert.equal(controller.getState('TX_A'), 'available');
});

test('clearing selection prevents pending responses from updating the interface', async () => {
  const pending = deferred();
  const updates = [];
  const controller = createTransactionDetailsController({
    cosmosDataApi: { getNormalizedCosmosTransaction: () => pending.promise },
    onState: (update) => updates.push(update),
  });

  const selection = controller.select('TX_A');
  controller.clearSelection();
  pending.resolve(result('TX_A'));
  await selection;

  assert.deepEqual(updates.map(({ state }) => state), ['loading']);
});
