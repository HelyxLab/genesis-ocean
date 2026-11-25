import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCosmosTransaction } from './cosmos-normalizer.js';
import {
  GENESIS_TRANSACTION_COVERAGE,
  TRANSACTION_DETAIL_STATES,
  createTransactionRecord,
  enrichTransactionRecord,
  markTransactionDetailError,
  markTransactionDetailLoading,
  markTransactionDetailUnavailable,
} from './transaction-view.js';

const HASH = 'TX_A';
const HEIGHT = '100';
const TIMESTAMP = '2026-11-12T12:00:00Z';

function genesis(overrides = {}) {
  return {
    hash: HASH,
    height: HEIGHT,
    timestamp: TIMESTAMP,
    type: 'Transfer',
    amountAtoms: '500',
    denom: 'el1',
    code: 0,
    ...overrides,
  };
}

function operation(overrides = {}) {
  return {
    id: `${HASH}:msg:0`,
    transactionHash: HASH,
    type: 'transfer',
    messageType: '/cosmos.bank.v1beta1.MsgSend',
    msgIndex: 0,
    status: 'confirmed',
    participants: [
      { role: 'sender', address: 'genesis1sender' },
      { role: 'recipient', address: 'genesis1recipient' },
    ],
    amounts: [{ integer: '500', denom: 'el1' }],
    amountsComplete: true,
    amountIssues: [],
    completionTime: null,
    evidence: [],
    ...overrides,
  };
}

function normalized(overrides = {}) {
  return {
    chainId: 'genesis_29-2',
    hash: HASH,
    height: HEIGHT,
    timestamp: TIMESTAMP,
    execution: { status: 'success', code: 0, codespace: null },
    operations: [operation()],
    unscopedEvents: [],
    source: 'gl1x-cosmos-transaction',
    ...overrides,
  };
}

function detail({ hash = HASH, freshness = 'current', lastError = null, normalizedOverrides = {} } = {}) {
  return {
    normalized: normalized({ hash, ...normalizedOverrides }),
    meta: {
      source: 'gl1x-http',
      endpoint: 'cosmos-transaction-detail',
      freshness: { state: freshness },
      lastError,
    },
  };
}

function realNormalized() {
  const message = {
    '@type': '/cosmos.bank.v1beta1.MsgSend',
    from_address: 'genesis1sender',
    to_address: 'genesis1recipient',
    amount: [{ denom: 'el1', amount: '500' }],
  };

  return normalizeCosmosTransaction({
    hash: 'TX_REAL',
    height: '123',
    timestamp: TIMESTAMP,
    chain_id: 'genesis_29-2',
    success: true,
    code: 0,
    messages: [message],
    events: [
      {
        type: 'transfer',
        attributes: [
          { key: 'sender', value: 'genesis1sender' },
          { key: 'recipient', value: 'genesis1recipient' },
          { key: 'amount', value: '500el1' },
          { key: 'msg_index', value: '0' },
        ],
      },
      {
        type: 'message',
        attributes: [{ key: 'sender', value: 'genesis1sender' }],
      },
    ],
    tx: { body: { messages: [message] } },
  });
}

test('creates a not-loaded record with stable identity and Genesis provenance', () => {
  const record = createTransactionRecord(genesis());

  assert.equal(record.hash, HASH);
  assert.deepEqual(record.block, { height: HEIGHT, timestamp: TIMESTAMP });
  assert.equal(record.discovery.source, 'genesis-l1');
  assert.equal(record.discovery.endpoint, '/cosmos/tx/v1beta1/txs');
  assert.equal(record.discovery.query, 'message.sender');
  assert.equal(record.discovery.typeLabel, 'Transfer');
  assert.equal(record.discovery.amountAtoms, '500');
  assert.equal(record.discovery.denom, 'el1');
  assert.equal(record.discovery.code, 0);
  assert.deepEqual(record.discovery.coverage, {
    direction: 'outgoing',
    limit: 50,
    complete: false,
  });
  assert.deepEqual(record.discovery.coverage, GENESIS_TRANSACTION_COVERAGE);
  assert.equal(record.detail.state, TRANSACTION_DETAIL_STATES.NOT_LOADED);
  assert.equal(record.detail.normalized, null);
  assert.equal(record.detail.meta, null);
  assert.equal(record.detail.error, null);
  assert.equal('raw' in record, false);
});

test('turns missing or malformed summary fields into null without inventing values', () => {
  const record = createTransactionRecord({ hash: HASH });
  assert.deepEqual(record.block, { height: null, timestamp: null });
  assert.equal(record.discovery.typeLabel, null);
  assert.equal(record.discovery.amountAtoms, null);
  assert.equal(record.discovery.denom, null);
  assert.equal(record.discovery.code, null);

  const arrayAmount = createTransactionRecord(genesis({
    amountAtoms: [{ denom: 'el1', amount: '500' }],
    height: 100,
    timestamp: null,
    type: null,
    denom: null,
    code: '0',
  }));
  assert.equal(arrayAmount.discovery.amountAtoms, null);
  assert.equal(arrayAmount.block.height, null);
  assert.equal(arrayAmount.block.timestamp, null);
  assert.equal(arrayAmount.discovery.typeLabel, null);
  assert.equal(arrayAmount.discovery.denom, null);
  assert.equal(arrayAmount.discovery.code, null);
});

test('requires a hash because it is the stable transaction identity', () => {
  assert.throws(() => createTransactionRecord(null), TypeError);
  assert.throws(() => createTransactionRecord({}), /hash/);
  assert.throws(() => createTransactionRecord({ hash: '' }), /hash/);
});

test('enriches a transfer while preserving summary fields and reference identity', () => {
  const record = createTransactionRecord(genesis());
  const result = detail();
  const enriched = enrichTransactionRecord(record, result);

  assert.equal(enriched.hash, HASH);
  assert.deepEqual(enriched.block, record.block);
  assert.deepEqual(enriched.discovery, record.discovery);
  assert.equal(enriched.detail.state, TRANSACTION_DETAIL_STATES.AVAILABLE);
  assert.notEqual(enriched.detail.normalized, result.normalized);
  assert.notEqual(enriched.detail.meta, result.meta);
  assert.deepEqual(enriched.detail.normalized, result.normalized);
  assert.deepEqual(enriched.detail.meta, result.meta);
  assert.equal(enriched.detail.error, null);
  assert.equal(enriched.detail.normalized.operations[0].type, 'transfer');
  assert.equal(enriched.detail.normalized.operations[0].status, 'confirmed');
  assert.equal(record.detail.state, TRANSACTION_DETAIL_STATES.NOT_LOADED);
  assert.notEqual(enriched, record);
});

test('preserves delegate and undelegate operation statuses without rewriting them', () => {
  const cases = [
    ['delegate', 'confirmed'],
    ['undelegate', 'awaiting_completion'],
  ];

  for (const [type, status] of cases) {
    const record = createTransactionRecord(genesis());
    const result = detail({
      normalizedOverrides: { operations: [operation({ type, status })] },
    });
    const enriched = enrichTransactionRecord(record, result);
    assert.equal(enriched.detail.normalized.operations[0].type, type);
    assert.equal(enriched.detail.normalized.operations[0].status, status);
  }
});

test('keeps a redelegation status unknown instead of promoting it to confirmed', () => {
  const record = createTransactionRecord(genesis());
  const result = detail({
    normalizedOverrides: {
      operations: [operation({
        type: 'redelegate',
        status: 'unknown',
        completionTime: '2026-11-20T13:54:08Z',
      })],
    },
  });

  const enriched = enrichTransactionRecord(record, result);
  assert.equal(enriched.detail.normalized.operations[0].status, 'unknown');
  assert.notEqual(enriched.detail.normalized.operations[0].status, 'confirmed');
});

test('preserves IBC local-initiation semantics and unverified remote receipt', () => {
  const record = createTransactionRecord(genesis());
  const result = detail({
    normalizedOverrides: {
      operations: [operation({
        type: 'ibc_transfer',
        status: 'initiated',
        statusScope: 'local_submission_only',
        remoteReceipt: 'unverified',
      })],
    },
  });

  const enriched = enrichTransactionRecord(record, result);
  assert.equal(enriched.detail.normalized.operations[0].status, 'initiated');
  assert.equal(enriched.detail.normalized.operations[0].statusScope, 'local_submission_only');
  assert.equal(enriched.detail.normalized.operations[0].remoteReceipt, 'unverified');
});

test('preserves unsupported operation types and unknown statuses', () => {
  const record = createTransactionRecord(genesis());
  const result = detail({
    normalizedOverrides: {
      operations: [operation({ type: 'other', status: 'unknown', participants: [], amounts: [], amountsComplete: null })],
    },
  });

  const enriched = enrichTransactionRecord(record, result);
  assert.equal(enriched.detail.normalized.operations[0].type, 'other');
  assert.equal(enriched.detail.normalized.operations[0].status, 'unknown');
  assert.deepEqual(enriched.detail.normalized.operations[0].participants, []);
  assert.deepEqual(enriched.detail.normalized.operations[0].amounts, []);
});

test('does not derive an arbitrary primary amount from multiple operations', () => {
  const record = createTransactionRecord(genesis({ amountAtoms: null, denom: null }));
  const result = detail({
    normalizedOverrides: {
      operations: [
        operation({ type: 'transfer', status: 'confirmed' }),
        operation({
          type: 'delegate',
          status: 'confirmed',
          participants: [{ role: 'delegator', address: 'genesis1delegator' }],
          amounts: [{ integer: '9', denom: 'el1' }],
        }),
      ],
    },
  });

  const enriched = enrichTransactionRecord(record, result);
  assert.equal(enriched.discovery.amountAtoms, null);
  assert.equal(enriched.discovery.denom, null);
  assert.equal(enriched.detail.normalized.operations.length, 2);
  assert.equal('primaryAmount' in enriched, false);
  assert.equal('primaryAmount' in enriched.detail, false);
});

test('retains null summary values instead of fabricating type, amount, denom or code', () => {
  const record = createTransactionRecord(genesis({
    height: null,
    timestamp: null,
    type: null,
    amountAtoms: null,
    denom: null,
    code: null,
  }));

  assert.deepEqual(record.block, { height: null, timestamp: null });
  assert.equal(record.discovery.typeLabel, null);
  assert.equal(record.discovery.amountAtoms, null);
  assert.equal(record.discovery.denom, null);
  assert.equal(record.discovery.code, null);
});

test('represents loading without discarding an existing last-valid detail', () => {
  const initial = createTransactionRecord(genesis());
  const loadingInitial = markTransactionDetailLoading(initial);
  assert.equal(loadingInitial.detail.state, TRANSACTION_DETAIL_STATES.LOADING);
  assert.equal(loadingInitial.detail.normalized, null);
  assert.equal(loadingInitial.detail.meta, null);
  assert.equal(loadingInitial.detail.error, null);

  const available = enrichTransactionRecord(initial, detail());
  const loadingRefresh = markTransactionDetailLoading(available);
  assert.equal(loadingRefresh.detail.state, TRANSACTION_DETAIL_STATES.LOADING);
  assert.equal(loadingRefresh.detail.normalized, available.detail.normalized);
  assert.equal(loadingRefresh.detail.meta, available.detail.meta);
  assert.equal(loadingRefresh.detail.error, null);
});

test('represents unavailable by clearing detail and preserving the provider error', () => {
  const available = enrichTransactionRecord(createTransactionRecord(genesis()), detail());
  const unavailable = markTransactionDetailUnavailable(available, {
    type: 'http',
    message: 'GL1X request failed with HTTP 404.',
    status: 404,
  });

  assert.equal(unavailable.detail.state, TRANSACTION_DETAIL_STATES.UNAVAILABLE);
  assert.equal(unavailable.detail.normalized, null);
  assert.equal(unavailable.detail.meta, null);
  assert.deepEqual(unavailable.detail.error, {
    type: 'http',
    message: 'GL1X request failed with HTTP 404.',
    status: 404,
    retryAfterMs: null,
  });
});

test('represents error while retaining last-valid detail when one exists', () => {
  const initial = createTransactionRecord(genesis());
  const initialError = markTransactionDetailError(initial, {
    type: 'network',
    message: 'offline',
    status: null,
  });
  assert.equal(initialError.detail.state, TRANSACTION_DETAIL_STATES.ERROR);
  assert.equal(initialError.detail.normalized, null);
  assert.equal(initialError.detail.meta, null);

  const available = enrichTransactionRecord(initial, detail());
  const lastValidError = markTransactionDetailError(available, {
    type: 'timeout',
    message: 'timed out',
    status: null,
    retryAfterMs: 500,
  });
  assert.equal(lastValidError.detail.state, TRANSACTION_DETAIL_STATES.ERROR);
  assert.equal(lastValidError.detail.normalized, available.detail.normalized);
  assert.equal(lastValidError.detail.meta, available.detail.meta);
  assert.deepEqual(lastValidError.detail.error, {
    type: 'timeout',
    message: 'timed out',
    status: null,
    retryAfterMs: 500,
  });
});

test('represents stale metadata while preserving the last-valid normalized detail', () => {
  const record = createTransactionRecord(genesis());
  const lastError = {
    type: 'timeout',
    message: 'The GL1X request timed out.',
    status: null,
    retryAfterMs: null,
  };
  const result = detail({ freshness: 'stale', lastError });
  const enriched = enrichTransactionRecord(record, result);

  assert.equal(enriched.detail.state, TRANSACTION_DETAIL_STATES.STALE);
  assert.notEqual(enriched.detail.normalized, result.normalized);
  assert.notEqual(enriched.detail.meta, result.meta);
  assert.deepEqual(enriched.detail.normalized, result.normalized);
  assert.deepEqual(enriched.detail.meta, result.meta);
  assert.deepEqual(enriched.detail.error, lastError);
});

test('serializes errors without retaining stack, cause, or raw provider payloads', () => {
  const error = new Error('boom');
  error.type = 'network';
  error.status = 503;
  error.cause = { secret: 'not-for-the-record' };
  error.stack = 'not-for-the-record';

  const failed = markTransactionDetailError(createTransactionRecord(genesis()), error);
  assert.deepEqual(failed.detail.error, {
    type: 'network',
    message: 'boom',
    status: 503,
    retryAfterMs: null,
  });
  assert.equal('stack' in failed.detail.error, false);
  assert.equal('cause' in failed.detail.error, false);
});

test('rejects a normalized result for a different hash and malformed result input', () => {
  const record = createTransactionRecord(genesis());
  assert.throws(
    () => enrichTransactionRecord(record, detail({ hash: 'TX_OTHER' })),
    /hash/,
  );
  assert.throws(() => enrichTransactionRecord(record, null), TypeError);
  assert.throws(() => enrichTransactionRecord(record, {}), TypeError);
  assert.throws(
    () => enrichTransactionRecord(record, { normalized: normalized() }),
    /metadata/,
  );
});

test('never stores the adapter raw object in the transaction record', () => {
  const result = detail();
  result.raw = { veryLargeProviderPayload: true };
  const enriched = enrichTransactionRecord(createTransactionRecord(genesis()), result);

  assert.equal('raw' in enriched, false);
  assert.equal('raw' in enriched.detail, false);
  assert.notEqual(enriched.detail.normalized, result.normalized);
  assert.notEqual(enriched.detail.meta, result.meta);
});

test('projects real normalizer output without retaining raw messages or events', () => {
  const normalized = realNormalized();
  const record = createTransactionRecord(genesis({ hash: 'TX_REAL' }));
  const enriched = enrichTransactionRecord(record, {
    normalized,
    meta: {
      source: 'gl1x-http',
      endpoint: 'cosmos-transaction-detail',
      freshness: { state: 'current' },
      lastError: null,
    },
  });

  const operation = enriched.detail.normalized.operations[0];
  assert.equal(operation.type, 'transfer');
  assert.equal(operation.status, 'confirmed');
  assert.equal(operation.participants.length, 2);
  assert.deepEqual(operation.amounts, [{ integer: '500', denom: 'el1' }]);
  assert.equal(operation.amountsComplete, true);
  assert.equal(operation.evidence.length, 2);
  assert.equal(operation.evidence[0].source, 'transaction.tx.body.messages');
  assert.equal('message' in operation.evidence[0], false);
  assert.equal('event' in operation.evidence[1], false);
  assert.equal(operation.evidence[1].eventType, 'transfer');

  assert.equal(enriched.detail.normalized.unscopedEvents.length, 1);
  assert.equal(enriched.detail.normalized.unscopedEvents[0].eventType, 'message');
  assert.equal('event' in enriched.detail.normalized.unscopedEvents[0], false);
  assert.equal(enriched.detail.normalized.source, 'gl1x-cosmos-transaction');
  assert.equal(enriched.detail.normalized.chainId, 'genesis_29-2');
  assert.equal(enriched.detail.normalized.height, '123');
  assert.equal(enriched.detail.normalized.timestamp, TIMESTAMP);
});

test('shares no mutable references with the adapter normalized result or metadata', () => {
  const normalized = realNormalized();
  const meta = {
    source: 'gl1x-http',
    endpoint: 'cosmos-transaction-detail',
    freshness: { state: 'current' },
    lastError: { type: 'timeout', message: 'prior', status: null, retryAfterMs: null },
    nested: { values: [{ marker: 'original' }] },
  };
  const record = createTransactionRecord(genesis({ hash: 'TX_REAL' }));
  const enriched = enrichTransactionRecord(record, { normalized, meta });

  assert.notEqual(enriched.detail.normalized, normalized);
  assert.notEqual(enriched.detail.normalized.operations, normalized.operations);
  assert.notEqual(enriched.detail.normalized.operations[0], normalized.operations[0]);
  assert.notEqual(enriched.detail.normalized.operations[0].participants, normalized.operations[0].participants);
  assert.notEqual(enriched.detail.normalized.operations[0].participants[0], normalized.operations[0].participants[0]);
  assert.notEqual(enriched.detail.normalized.operations[0].amounts, normalized.operations[0].amounts);
  assert.notEqual(enriched.detail.normalized.operations[0].evidence, normalized.operations[0].evidence);
  assert.notEqual(enriched.detail.normalized.unscopedEvents, normalized.unscopedEvents);
  assert.notEqual(enriched.detail.meta, meta);
  assert.notEqual(enriched.detail.meta.freshness, meta.freshness);
  assert.notEqual(enriched.detail.meta.lastError, meta.lastError);
  assert.notEqual(enriched.detail.meta.nested, meta.nested);
  assert.notEqual(enriched.detail.meta.nested.values, meta.nested.values);

  normalized.operations[0].status = 'unknown';
  normalized.operations[0].participants[0].address = 'genesis1mutated';
  meta.freshness.state = 'stale';
  meta.nested.values[0].marker = 'mutated';

  assert.equal(enriched.detail.normalized.operations[0].status, 'confirmed');
  assert.equal(enriched.detail.normalized.operations[0].participants[0].address, 'genesis1sender');
  assert.equal(enriched.detail.meta.freshness.state, 'current');
  assert.equal(enriched.detail.meta.nested.values[0].marker, 'original');
});

test('freezes the record and its nested data against accidental mutation', () => {
  const enriched = enrichTransactionRecord(
    createTransactionRecord(genesis()),
    detail(),
  );

  assert.equal(Object.isFrozen(enriched), true);
  assert.equal(Object.isFrozen(enriched.block), true);
  assert.equal(Object.isFrozen(enriched.discovery), true);
  assert.equal(Object.isFrozen(enriched.discovery.coverage), true);
  assert.equal(Object.isFrozen(enriched.detail), true);
  assert.equal(Object.isFrozen(enriched.detail.normalized), true);
  assert.equal(Object.isFrozen(enriched.detail.normalized.operations), true);
  assert.equal(Object.isFrozen(enriched.detail.normalized.operations[0]), true);
  assert.equal(Object.isFrozen(enriched.detail.normalized.operations[0].participants), true);
  assert.equal(Object.isFrozen(enriched.detail.normalized.operations[0].amounts), true);
  assert.equal(Object.isFrozen(enriched.detail.meta), true);
  assert.equal(Object.isFrozen(enriched.detail.meta.freshness), true);

  assert.throws(() => { enriched.hash = 'TX_MUTATED'; }, TypeError);
  assert.throws(() => { enriched.detail.state = TRANSACTION_DETAIL_STATES.ERROR; }, TypeError);
  assert.throws(() => { enriched.detail.normalized.operations[0].status = 'unknown'; }, TypeError);
  assert.throws(() => { enriched.detail.normalized.operations[0].participants[0].address = 'genesis1mutated'; }, TypeError);
  assert.throws(() => { enriched.detail.meta.freshness.state = 'stale'; }, TypeError);
});

test('drops raw values from amount issues while preserving descriptive issue fields', () => {
  const result = detail({
    normalizedOverrides: {
      operations: [operation({
        amountIssues: [{
          field: 'amount',
          reason: 'invalid_coin',
          index: 0,
          raw: { denom: 'el1', amount: 'not-an-integer' },
        }],
      })],
    },
  });
  const enriched = enrichTransactionRecord(createTransactionRecord(genesis()), result);
  const issue = enriched.detail.normalized.operations[0].amountIssues[0];

  assert.deepEqual(issue, {
    field: 'amount',
    reason: 'invalid_coin',
    index: 0,
  });
  assert.equal('raw' in issue, false);
});

test('retains last-valid detail across consecutive errors', () => {
  const available = enrichTransactionRecord(createTransactionRecord(genesis()), detail());
  const firstError = markTransactionDetailError(available, {
    type: 'network',
    message: 'first failure',
    status: null,
  });
  const secondError = markTransactionDetailError(firstError, {
    type: 'timeout',
    message: 'second failure',
    status: null,
  });

  assert.equal(secondError.detail.state, TRANSACTION_DETAIL_STATES.ERROR);
  assert.equal(secondError.detail.normalized, available.detail.normalized);
  assert.equal(secondError.detail.meta, available.detail.meta);
  assert.equal(secondError.detail.error.message, 'second failure');
});
