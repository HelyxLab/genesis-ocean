import test from 'node:test';
import assert from 'node:assert/strict';
import { createCosmosDataApi } from './cosmos-data.js';
import { createGl1xApi, Gl1xApiError } from './gl1x-api.js';

function jsonResponse(payload, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      Date: 'Wed, 11 Nov 2026 23:00:00 GMT',
      ETag: 'W/"fixture"',
      ...headers,
    },
  });
}

function createGl1x(fetchImpl, options = {}) {
  return createGl1xApi({
    fetchImpl,
    timeoutMs: 100,
    now: () => new Date('2026-11-11T23:00:01.000Z'),
    ...options,
  });
}

const baseTx = {
  hash: 'TX_BASE_FIXTURE',
  height: '100001',
  timestamp: '2026-11-11T12:00:00Z',
  chain_id: 'genesis_29-2',
  success: true,
  code: 0,
  messages: [{
    '@type': '/cosmos.bank.v1beta1.MsgSend',
    from_address: 'genesis1sender',
    to_address: 'genesis1recipient',
    amount: [{ denom: 'el1', amount: '500' }],
  }],
  events: [{
    type: 'transfer',
    attributes: [
      { key: 'sender', value: 'genesis1sender' },
      { key: 'recipient', value: 'genesis1recipient' },
      { key: 'amount', value: '500el1' },
      { key: 'msg_index', value: '0' },
    ],
  }],
  tx: {
    body: {
      messages: [{
        '@type': '/cosmos.bank.v1beta1.MsgSend',
        from_address: 'genesis1sender',
        to_address: 'genesis1recipient',
        amount: [{ denom: 'el1', amount: '500' }],
      }],
    },
  },
};

test('validates required gl1xApi dependency on construction', () => {
  assert.throws(() => createCosmosDataApi(), TypeError);
  assert.throws(() => createCosmosDataApi({}), TypeError);
  assert.throws(() => createCosmosDataApi({ gl1xApi: null }), TypeError);
  assert.throws(() => createCosmosDataApi({ gl1xApi: {} }), TypeError);
  assert.throws(() => createCosmosDataApi({ gl1xApi: { getCosmosTransaction: 'not-a-fn' } }), TypeError);
});

// 1. Original response.data reaches the normalizer.
test('1. original response.data reaches the normalizer directly', async () => {
  const gl1x = createGl1x(async () => jsonResponse(baseTx));
  const api = createCosmosDataApi({ gl1xApi: gl1x });

  const result = await api.getNormalizedCosmosTransaction('TX_BASE_FIXTURE');

  assert.equal(result.normalized.hash, baseTx.hash);
  assert.equal(result.normalized.chainId, 'genesis_29-2');
  assert.equal(result.normalized.height, '100001');
  assert.equal(result.normalized.execution.status, 'success');
  assert.equal(result.normalized.operations.length, 1);
  assert.equal(result.normalized.operations[0].type, 'transfer');
  assert.equal(result.normalized.operations[0].status, 'confirmed');
});

// 2. Original raw and meta references are preserved.
test('2. original raw and meta references are preserved strictly', async () => {
  let capturedGl1xResponse;
  const gl1x = {
    async getCosmosTransaction(hash) {
      capturedGl1xResponse = {
        data: { ...baseTx, hash },
        meta: {
          source: 'gl1x-http',
          endpoint: 'cosmos-transaction-detail',
          queriedAt: '2026-11-11T23:00:01.000Z',
          serverTime: '2026-11-11T23:00:00.000Z',
          etag: 'W/"meta-ref-test"',
          freshness: { state: 'current' },
        },
      };
      return capturedGl1xResponse;
    },
  };

  const api = createCosmosDataApi({ gl1xApi: gl1x });
  const result = await api.getNormalizedCosmosTransaction('TX_REF_TEST');

  // Exact shape: { raw, normalized, meta }
  assert.deepEqual(Object.keys(result).sort(), ['meta', 'normalized', 'raw']);

  // Strict reference equality
  assert.equal(result.raw, capturedGl1xResponse.data);
  assert.equal(result.meta, capturedGl1xResponse.meta);
  assert.equal(result.raw.hash, 'TX_REF_TEST');
  assert.equal(result.meta.etag, 'W/"meta-ref-test"');
});

// 3. Complete real-shaped GL1X redelegation fixture.
test('3. complete real-shaped GL1X redelegation fixture resolves as awaiting_completion with canonical roles', async () => {
  const delegator = 'genesis1delegatorfixture';
  const source = 'genesisvaloper1sourcefixture';
  const destination = 'genesisvaloper1destinationfixture';
  const completionTime = '2026-11-25T14:30:00Z';

  const realRedelegateTx = {
    hash: 'TX_REAL_REDELEGATE',
    height: '200001',
    timestamp: '2026-11-11T12:00:00Z',
    chain_id: 'genesis_29-2',
    success: true,
    code: 0,
    messages: [{
      '@type': '/cosmos.staking.v1beta1.MsgBeginRedelegate',
      delegator_address: delegator,
      validator_src_address: source,
      validator_dst_address: destination,
      amount: { denom: 'el1', amount: '8000000000000000000' },
    }],
    events: [{
      type: 'redelegate',
      attributes: [
        { key: 'delegator', value: delegator },
        { key: 'source_validator', value: source },
        { key: 'destination_validator', value: destination },
        { key: 'amount', value: '8000000000000000000el1' },
        { key: 'completion_time', value: completionTime },
        { key: 'msg_index', value: '0' },
      ],
    }],
    tx: {
      body: {
        messages: [{
          '@type': '/cosmos.staking.v1beta1.MsgBeginRedelegate',
          delegator_address: delegator,
          validator_src_address: source,
          validator_dst_address: destination,
          amount: { denom: 'el1', amount: '8000000000000000000' },
        }],
      },
    },
  };

  const gl1x = createGl1x(async () => jsonResponse(realRedelegateTx));
  const api = createCosmosDataApi({ gl1xApi: gl1x });

  const result = await api.getNormalizedCosmosTransaction('TX_REAL_REDELEGATE');

  assert.equal(result.normalized.operations[0].type, 'redelegate');
  assert.equal(result.normalized.operations[0].status, 'awaiting_completion');
  assert.equal(result.normalized.operations[0].completionTime, completionTime);
  assert.deepEqual(result.normalized.operations[0].participants, [
    { role: 'delegator', address: delegator },
    { role: 'source_validator', address: source },
    { role: 'destination_validator', address: destination },
  ]);
  assert.deepEqual(result.normalized.operations[0].amounts, [
    { integer: '8000000000000000000', denom: 'el1' },
  ]);
});

// 4. Existing synthetic redelegation fixture remains supported.
test('4. existing synthetic redelegation fixture remains supported with canonical roles', async () => {
  const delegator = 'genesis1delegatorfixture';
  const source = 'genesisvaloper1sourcefixture';
  const destination = 'genesisvaloper1destinationfixture';
  const completionTime = '2026-11-20T10:00:00Z';

  const syntheticRedelegateTx = {
    hash: 'TX_SYNTHETIC_REDELEGATE',
    height: '200002',
    timestamp: '2026-11-11T12:00:00Z',
    chain_id: 'genesis_29-2',
    success: true,
    code: 0,
    messages: [{
      '@type': '/cosmos.staking.v1beta1.MsgBeginRedelegate',
      delegator_address: delegator,
      validator_src_address: source,
      validator_dst_address: destination,
      amount: { denom: 'el1', amount: '4000000000000000000' },
    }],
    events: [{
      type: 'redelegate',
      attributes: [
        { key: 'delegator', value: delegator },
        { key: 'src_validator', value: source },
        { key: 'dst_validator', value: destination },
        { key: 'amount', value: '4000000000000000000el1' },
        { key: 'completion_time', value: completionTime },
        { key: 'msg_index', value: '0' },
      ],
    }],
    tx: {
      body: {
        messages: [{
          '@type': '/cosmos.staking.v1beta1.MsgBeginRedelegate',
          delegator_address: delegator,
          validator_src_address: source,
          validator_dst_address: destination,
          amount: { denom: 'el1', amount: '4000000000000000000' },
        }],
      },
    },
  };

  const gl1x = createGl1x(async () => jsonResponse(syntheticRedelegateTx));
  const api = createCosmosDataApi({ gl1xApi: gl1x });

  const result = await api.getNormalizedCosmosTransaction('TX_SYNTHETIC_REDELEGATE');

  assert.equal(result.normalized.operations[0].type, 'redelegate');
  assert.equal(result.normalized.operations[0].status, 'awaiting_completion');
  assert.equal(result.normalized.operations[0].completionTime, completionTime);
  assert.deepEqual(result.normalized.operations[0].participants, [
    { role: 'delegator', address: delegator },
    { role: 'source_validator', address: source },
    { role: 'destination_validator', address: destination },
  ]);
});

// 5. Missing chain_id remains unknown/null according to the existing normalizer contract.
test('5. missing chain_id remains null according to normalizer contract', async () => {
  const txWithoutChainId = {
    ...baseTx,
    hash: 'TX_NO_CHAIN_ID',
    chain_id: undefined,
  };

  const gl1x = createGl1x(async () => jsonResponse(txWithoutChainId));
  const api = createCosmosDataApi({ gl1xApi: gl1x });

  const result = await api.getNormalizedCosmosTransaction('TX_NO_CHAIN_ID');

  assert.equal(result.normalized.chainId, null);
});

// 6. Missing event_index is never fabricated from eventPosition.
test('6. missing event_index is never fabricated from eventPosition', async () => {
  const txWithoutEventIndex = {
    ...baseTx,
    hash: 'TX_NO_EVENT_INDEX',
    events: [
      {
        type: 'transfer',
        attributes: [
          { key: 'sender', value: 'genesis1sender' },
          { key: 'recipient', value: 'genesis1recipient' },
          { key: 'amount', value: '500el1' },
          // msg_index absent: event will be in unscopedEvents
        ],
      },
    ],
  };

  const gl1x = createGl1x(async () => jsonResponse(txWithoutEventIndex));
  const api = createCosmosDataApi({ gl1xApi: gl1x });

  const result = await api.getNormalizedCosmosTransaction('TX_NO_EVENT_INDEX');

  assert.equal(result.normalized.unscopedEvents.length, 1);
  const unscoped = result.normalized.unscopedEvents[0];
  assert.equal(unscoped.eventIndex, null);
  assert.equal(unscoped.rawEventIndex, undefined);
  assert.equal(unscoped.eventPosition, 0);
  assert.notEqual(unscoped.eventPosition, unscoped.eventIndex);
});

// 7. msg_index correctly scopes events to messages.
test('7. msg_index correctly scopes events to their corresponding messages', async () => {
  const sender = 'genesis1sender';
  const recipient = 'genesis1recipient';
  const delegator = 'genesis1delegator';
  const validator = 'genesisvaloper1validator';

  const multiMessageTx = {
    hash: 'TX_MULTI_SCOPED',
    height: '100005',
    timestamp: '2026-11-11T12:00:00Z',
    chain_id: 'genesis_29-2',
    success: true,
    code: 0,
    messages: [
      { '@type': '/cosmos.bank.v1beta1.MsgSend' },
      { '@type': '/cosmos.staking.v1beta1.MsgDelegate' },
    ],
    events: [
      {
        type: 'transfer',
        attributes: [
          { key: 'sender', value: sender },
          { key: 'recipient', value: recipient },
          { key: 'amount', value: '100el1' },
          { key: 'msg_index', value: '0' },
        ],
      },
      {
        type: 'delegate',
        attributes: [
          { key: 'delegator', value: delegator },
          { key: 'validator', value: validator },
          { key: 'amount', value: '200el1' },
          { key: 'msg_index', value: '1' },
        ],
      },
    ],
    tx: {
      body: {
        messages: [
          {
            '@type': '/cosmos.bank.v1beta1.MsgSend',
            from_address: sender,
            to_address: recipient,
            amount: [{ denom: 'el1', amount: '100' }],
          },
          {
            '@type': '/cosmos.staking.v1beta1.MsgDelegate',
            delegator_address: delegator,
            validator_address: validator,
            amount: { denom: 'el1', amount: '200' },
          },
        ],
      },
    },
  };

  const gl1x = createGl1x(async () => jsonResponse(multiMessageTx));
  const api = createCosmosDataApi({ gl1xApi: gl1x });

  const result = await api.getNormalizedCosmosTransaction('TX_MULTI_SCOPED');

  assert.equal(result.normalized.operations.length, 2);

  const op0 = result.normalized.operations[0];
  assert.equal(op0.msgIndex, 0);
  assert.equal(op0.type, 'transfer');
  assert.equal(op0.status, 'confirmed');
  assert.equal(op0.evidence.some((e) => e.eventType === 'delegate'), false);

  const op1 = result.normalized.operations[1];
  assert.equal(op1.msgIndex, 1);
  assert.equal(op1.type, 'delegate');
  assert.equal(op1.status, 'confirmed');
  assert.equal(op1.evidence.some((e) => e.eventType === 'transfer'), false);
});

// 8. Multiple messages produce separate operations.
test('8. multiple messages produce separate operations with distinct identities', async () => {
  const threeMessageTx = {
    hash: 'TX_THREE_MSGS',
    height: '100008',
    timestamp: '2026-11-11T12:00:00Z',
    chain_id: 'genesis_29-2',
    success: true,
    code: 0,
    messages: [
      { '@type': '/cosmos.bank.v1beta1.MsgSend' },
      { '@type': '/cosmos.staking.v1beta1.MsgDelegate' },
      { '@type': '/cosmos.staking.v1beta1.MsgUndelegate' },
    ],
    events: [],
    tx: {
      body: {
        messages: [
          { '@type': '/cosmos.bank.v1beta1.MsgSend', from_address: 'genesis1a', to_address: 'genesis1b', amount: [{ denom: 'el1', amount: '10' }] },
          { '@type': '/cosmos.staking.v1beta1.MsgDelegate', delegator_address: 'genesis1a', validator_address: 'genesisvaloper1a', amount: { denom: 'el1', amount: '20' } },
          { '@type': '/cosmos.staking.v1beta1.MsgUndelegate', delegator_address: 'genesis1a', validator_address: 'genesisvaloper1a', amount: { denom: 'el1', amount: '30' } },
        ],
      },
    },
  };

  const gl1x = createGl1x(async () => jsonResponse(threeMessageTx));
  const api = createCosmosDataApi({ gl1xApi: gl1x });

  const result = await api.getNormalizedCosmosTransaction('TX_THREE_MSGS');

  assert.equal(result.normalized.operations.length, 3);
  assert.equal(result.normalized.operations[0].id, 'TX_THREE_MSGS:msg:0');
  assert.equal(result.normalized.operations[1].id, 'TX_THREE_MSGS:msg:1');
  assert.equal(result.normalized.operations[2].id, 'TX_THREE_MSGS:msg:2');
  assert.equal(result.normalized.operations[0].type, 'transfer');
  assert.equal(result.normalized.operations[1].type, 'delegate');
  assert.equal(result.normalized.operations[2].type, 'undelegate');
});

// 9. Large integer strings remain exact.
test('9. very large integer strings remain exact without numeric or floating-point conversion', async () => {
  const hugeInteger = '12345678901234567890123456789012345678901234567890';
  const hugeTx = {
    ...baseTx,
    hash: 'TX_HUGE_AMOUNT',
    messages: [{
      '@type': '/cosmos.bank.v1beta1.MsgSend',
      from_address: 'genesis1sender',
      to_address: 'genesis1recipient',
      amount: [{ denom: 'el1', amount: hugeInteger }],
    }],
    events: [{
      type: 'transfer',
      attributes: [
        { key: 'sender', value: 'genesis1sender' },
        { key: 'recipient', value: 'genesis1recipient' },
        { key: 'amount', value: `${hugeInteger}el1` },
        { key: 'msg_index', value: '0' },
      ],
    }],
    tx: {
      body: {
        messages: [{
          '@type': '/cosmos.bank.v1beta1.MsgSend',
          from_address: 'genesis1sender',
          to_address: 'genesis1recipient',
          amount: [{ denom: 'el1', amount: hugeInteger }],
        }],
      },
    },
  };

  const gl1x = createGl1x(async () => jsonResponse(hugeTx));
  const api = createCosmosDataApi({ gl1xApi: gl1x });

  const result = await api.getNormalizedCosmosTransaction('TX_HUGE_AMOUNT');

  assert.equal(result.normalized.operations[0].amounts[0].integer, hugeInteger);
  assert.equal(typeof result.normalized.operations[0].amounts[0].integer, 'string');
  assert.equal(result.normalized.operations[0].amounts[0].denom, 'el1');
  assert.equal(result.normalized.operations[0].status, 'confirmed');
});

// 10. Minimal type-only transactions do not invent participants or amounts.
test('10. minimal type-only transactions do not invent participants or amounts', async () => {
  const typeOnlyTx = {
    hash: 'TX_TYPE_ONLY',
    height: '100010',
    timestamp: '2026-11-11T12:00:00Z',
    chain_id: 'genesis_29-2',
    success: true,
    code: 0,
    messages: ['/cosmos.staking.v1beta1.MsgDelegate'],
    events: [],
  };

  const gl1x = createGl1x(async () => jsonResponse(typeOnlyTx));
  const api = createCosmosDataApi({ gl1xApi: gl1x });

  const result = await api.getNormalizedCosmosTransaction('TX_TYPE_ONLY');

  assert.equal(result.normalized.operations.length, 1);
  const op = result.normalized.operations[0];
  assert.equal(op.type, 'delegate');
  assert.equal(op.status, 'unknown');
  assert.deepEqual(op.participants, []);
  assert.deepEqual(op.amounts, []);
});

// 11. Stale metadata remains unchanged.
test('11. stale metadata remains unchanged and is passed through by reference', async () => {
  const staleMeta = {
    source: 'gl1x-http',
    endpoint: 'cosmos-transaction-detail',
    queriedAt: '2026-11-11T23:05:00.000Z',
    serverTime: '2026-11-11T23:00:00.000Z',
    etag: 'W/"stale-etag"',
    freshness: { state: 'stale' },
    lastError: { type: 'network', message: 'Service unreachable', status: null, retryAfterMs: null },
    lastValidResponse: {
      receivedAt: '2026-11-11T23:00:01.000Z',
      serverTime: '2026-11-11T23:00:00.000Z',
      etag: 'W/"stale-etag"',
    },
  };

  const gl1x = {
    async getCosmosTransaction() {
      return {
        data: baseTx,
        meta: staleMeta,
      };
    },
  };

  const api = createCosmosDataApi({ gl1xApi: gl1x });
  const result = await api.getNormalizedCosmosTransaction('TX_STALE_TEST');

  assert.equal(result.meta, staleMeta);
  assert.equal(result.meta.freshness.state, 'stale');
  assert.equal(result.meta.lastError.type, 'network');
  assert.equal(result.meta.lastError.message, 'Service unreachable');
});

// 12. API errors propagate without fallback.
test('12. API errors propagate directly without fallback', async () => {
  const apiError = new Gl1xApiError('network', 'The GL1X request could not reach the service.');
  const gl1x = {
    async getCosmosTransaction() {
      throw apiError;
    },
  };

  const api = createCosmosDataApi({ gl1xApi: gl1x });

  await assert.rejects(
    api.getNormalizedCosmosTransaction('TX_ERR_TEST'),
    (error) => error === apiError && error.type === 'network'
  );
});

// 13. Malformed or unsupported data remains unknown or produces explicit errors.
test('13. malformed data produces explicit errors and unsupported message types remain unknown', async () => {
  // 13a: Malformed raw data (null) causes normalizer to throw TypeError
  const gl1xNullData = {
    async getCosmosTransaction() {
      return { data: null, meta: {} };
    },
  };
  const apiNull = createCosmosDataApi({ gl1xApi: gl1xNullData });
  await assert.rejects(
    apiNull.getNormalizedCosmosTransaction('TX_NULL'),
    (error) => error instanceof TypeError
  );

  // 13b: Unsupported message type produces type 'other' and status 'unknown'
  const unsupportedTx = {
    hash: 'TX_UNSUPPORTED_MSG',
    height: '100013',
    timestamp: '2026-11-11T12:00:00Z',
    chain_id: 'genesis_29-2',
    success: true,
    code: 0,
    messages: [{ '@type': '/custom.governance.v1.MsgMysteryProposal' }],
    events: [],
    tx: {
      body: {
        messages: [{
          '@type': '/custom.governance.v1.MsgMysteryProposal',
          proposer: 'genesis1proposer',
        }],
      },
    },
  };

  const gl1xUnsupported = createGl1x(async () => jsonResponse(unsupportedTx));
  const apiUnsupported = createCosmosDataApi({ gl1xApi: gl1xUnsupported });
  const result = await apiUnsupported.getNormalizedCosmosTransaction('TX_UNSUPPORTED_MSG');

  assert.equal(result.normalized.operations.length, 1);
  assert.equal(result.normalized.operations[0].type, 'other');
  assert.equal(result.normalized.operations[0].status, 'unknown');
  assert.equal(result.normalized.operations[0].messageType, '/custom.governance.v1.MsgMysteryProposal');
});

test('interface object is frozen', () => {
  const gl1x = createGl1x(async () => jsonResponse(baseTx));
  const api = createCosmosDataApi({ gl1xApi: gl1x });

  assert.ok(Object.isFrozen(api));
  assert.throws(() => { api.getNormalizedCosmosTransaction = null; }, TypeError);
});
