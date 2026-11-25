import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCosmosTransaction } from './cosmos-normalizer.js';

const sender = 'genesis1senderfixture';
const recipient = 'genesis1recipientfixture';
const delegator = 'genesis1delegatorfixture';
const validator = 'genesisvaloper1validatorfixture';

function event(type, attributes, extra = {}) {
  return {
    type,
    attributes: Object.entries(attributes).map(([key, value]) => ({ key, value: String(value) })),
    ...extra,
  };
}

function tx({ messages, events = [], success = true, code = 0, hash = 'TX_FIXTURE' } = {}) {
  return {
    hash,
    height: '123456',
    timestamp: '2026-11-11T12:00:00Z',
    code,
    success,
    messages: messages.map((message) => message['@type']),
    events,
    tx: { body: { messages } },
  };
}

function normalizeUnscopedEvents(events) {
  return normalizeCosmosTransaction(tx({ messages: [], events })).unscopedEvents;
}

function completeIbcMessage() {
  return {
    '@type': '/ibc.applications.transfer.v1.MsgTransfer',
    sender,
    receiver: 'cosmos1remote',
    source_port: 'transfer',
    source_channel: 'channel-0',
    token: { denom: 'el1', amount: '100' },
  };
}

test('normalizes a successful transfer only when its matching event confirms it', () => {
  const amount = { denom: 'el1', amount: '123456789000000000000' };
  const normalized = normalizeCosmosTransaction(tx({
    messages: [{ '@type': '/cosmos.bank.v1beta1.MsgSend', from_address: sender, to_address: recipient, amount: [amount] }],
    events: [
      event('transfer', { sender, recipient, amount: '123456789000000000000el1', msg_index: '0' }, { event_index: 4 }),
    ],
  }));

  assert.equal(normalized.execution.status, 'success');
  assert.equal(normalized.operations[0].type, 'transfer');
  assert.equal(normalized.operations[0].status, 'confirmed');
  assert.deepEqual(normalized.operations[0].participants, [
    { role: 'sender', address: sender }, { role: 'recipient', address: recipient },
  ]);
  assert.deepEqual(normalized.operations[0].amounts, [{ integer: amount.amount, denom: 'el1' }]);
  assert.equal(normalized.operations[0].evidence[1].msgIndex, '0');
  assert.equal(normalized.operations[0].evidence[1].eventIndex, 4);
});

test('normalizes a delegation with its delegator, validator, amount, and event evidence', () => {
  const normalized = normalizeCosmosTransaction(tx({
    messages: [{
      '@type': '/cosmos.staking.v1beta1.MsgDelegate', delegator_address: delegator,
      validator_address: validator, amount: { denom: 'el1', amount: '900000000000000000001' },
    }],
    events: [event('delegate', {
      delegator, validator, amount: '900000000000000000001el1', msg_index: '0',
    })],
  }));

  assert.equal(normalized.operations[0].type, 'delegate');
  assert.equal(normalized.operations[0].status, 'confirmed');
  assert.deepEqual(normalized.operations[0].participants, [
    { role: 'delegator', address: delegator }, { role: 'validator', address: validator },
  ]);
});

test('treats an evidenced undelegation as awaiting completion, not completed', () => {
  const completionTime = '2026-11-18T12:00:00Z';
  const normalized = normalizeCosmosTransaction(tx({
    messages: [{
      '@type': '/cosmos.staking.v1beta1.MsgUndelegate', delegator_address: delegator,
      validator_address: validator, amount: { denom: 'el1', amount: '7000000000000000000' },
    }],
    events: [event('unbond', {
      delegator, validator, amount: '7000000000000000000el1', completion_time: completionTime, msg_index: '0',
    })],
  }));

  assert.equal(normalized.execution.status, 'success');
  assert.equal(normalized.operations[0].status, 'awaiting_completion');
  assert.equal(normalized.operations[0].completionTime, completionTime);
});

test('undelegation completionTime ignores other event types and invalid times', () => {
  const undelegate = {
    '@type': '/cosmos.staking.v1beta1.MsgUndelegate', delegator_address: delegator,
    validator_address: validator, amount: { denom: 'el1', amount: '7000000000000000000' },
  };
  const normalized = normalizeCosmosTransaction(tx({
    messages: [undelegate],
    events: [
      event('delegate', { completion_time: '2026-11-18T12:00:00Z', msg_index: '0' }),
      event('unbond', { delegator, validator, amount: '7000000000000000000el1', completion_time: 'not-a-time', msg_index: '0' }),
    ],
  }));

  assert.equal(normalized.operations[0].status, 'awaiting_completion');
  assert.equal(normalized.operations[0].completionTime, null);
});

test('undelegation completionTime stays null when the matching event is absent', () => {
  const normalized = normalizeCosmosTransaction(tx({
    messages: [{
      '@type': '/cosmos.staking.v1beta1.MsgUndelegate', delegator_address: delegator,
      validator_address: validator, amount: { denom: 'el1', amount: '7000000000000000000' },
    }],
    events: [event('delegate', { completion_time: '2026-11-18T12:00:00Z', msg_index: '0' })],
  }));

  assert.equal(normalized.operations[0].completionTime, null);
});

test('undelegation completionTime does not use an unbond event from another message', () => {
  const undelegate = {
    '@type': '/cosmos.staking.v1beta1.MsgUndelegate', delegator_address: delegator,
    validator_address: validator, amount: { denom: 'el1', amount: '7000000000000000000' },
  };
  const completionTime = '2026-11-18T12:00:00Z';
  const normalized = normalizeCosmosTransaction(tx({
    messages: [undelegate, undelegate],
    events: [event('unbond', {
      delegator, validator, amount: '7000000000000000000el1', completion_time: completionTime, msg_index: '1',
    })],
  }));

  assert.equal(normalized.operations[0].completionTime, null);
  assert.equal(normalized.operations[1].completionTime, completionTime);
});

test('normalizes redelegation as awaiting completion with both validator roles', () => {
  const source = 'genesisvaloper1sourcefixture';
  const destination = 'genesisvaloper1destinationfixture';
  const normalized = normalizeCosmosTransaction(tx({
    messages: [{
      '@type': '/cosmos.staking.v1beta1.MsgBeginRedelegate', delegator_address: delegator,
      validator_src_address: source, validator_dst_address: destination,
      amount: { denom: 'el1', amount: '8000000000000000000' },
    }],
    events: [event('redelegate', {
      delegator, src_validator: source, dst_validator: destination,
      amount: '8000000000000000000el1', msg_index: '0',
    })],
  }));

  assert.equal(normalized.operations[0].type, 'redelegate');
  assert.equal(normalized.operations[0].status, 'awaiting_completion');
  assert.deepEqual(normalized.operations[0].participants, [
    { role: 'delegator', address: delegator },
    { role: 'source_validator', address: source },
    { role: 'destination_validator', address: destination },
  ]);
});

test('matches a live-shaped redelegation event without a delegator only within its message', () => {
  const message = {
    '@type': '/cosmos.staking.v1beta1.MsgBeginRedelegate',
    delegator_address: delegator,
    validator_src_address: 'genesisvaloper1sourcefixture',
    validator_dst_address: 'genesisvaloper1destinationfixture',
    amount: { denom: 'el1', amount: '139948000000000000000000' },
  };
  const attributes = {
    source_validator: message.validator_src_address,
    destination_validator: message.validator_dst_address,
    amount: '139948000000000000000000el1',
    completion_time: '2026-12-02T00:29:22Z',
    msg_index: '1',
  };
  const normalized = normalizeCosmosTransaction(tx({
    messages: [message, message],
    events: [
      event('redelegate', { ...attributes, amount: '2el1', completion_time: '2026-12-03T00:00:00Z' }),
      event('redelegate', attributes),
    ],
  }));
  assert.deepEqual(normalized.operations.map(({ status, completionTime }) => [status, completionTime]), [
    ['unknown', null],
    ['awaiting_completion', attributes.completion_time],
  ]);

  const conflicting = normalizeCosmosTransaction(tx({
    messages: [message],
    events: [event('redelegate', { ...attributes, msg_index: '0', delegator: 'different-delegator' })],
  }));
  assert.equal(conflicting.operations[0].status, 'unknown');
  assert.equal(conflicting.operations[0].completionTime, null);
});

test('redelegation completionTime ignores other event types and invalid times', () => {
  const source = 'genesisvaloper1sourcefixture';
  const destination = 'genesisvaloper1destinationfixture';
  const normalized = normalizeCosmosTransaction(tx({
    messages: [{
      '@type': '/cosmos.staking.v1beta1.MsgBeginRedelegate', delegator_address: delegator,
      validator_src_address: source, validator_dst_address: destination,
      amount: { denom: 'el1', amount: '8000000000000000000' },
    }],
    events: [
      event('unbond', { completion_time: '2026-11-18T12:00:00Z', msg_index: '0' }),
      event('redelegate', {
        delegator, src_validator: source, dst_validator: destination,
        amount: '8000000000000000000el1', completion_time: 'not-a-time', msg_index: '0',
      }),
    ],
  }));

  assert.equal(normalized.operations[0].status, 'awaiting_completion');
  assert.equal(normalized.operations[0].completionTime, null);
});

test('redelegation completionTime stays null when the matching event is absent', () => {
  const source = 'genesisvaloper1sourcefixture';
  const destination = 'genesisvaloper1destinationfixture';
  const normalized = normalizeCosmosTransaction(tx({
    messages: [{
      '@type': '/cosmos.staking.v1beta1.MsgBeginRedelegate', delegator_address: delegator,
      validator_src_address: source, validator_dst_address: destination,
      amount: { denom: 'el1', amount: '8000000000000000000' },
    }],
    events: [event('unbond', { completion_time: '2026-11-18T12:00:00Z', msg_index: '0' })],
  }));

  assert.equal(normalized.operations[0].completionTime, null);
});

test('redelegation completionTime does not use a redelegate event from another message', () => {
  const source = 'genesisvaloper1sourcefixture';
  const destination = 'genesisvaloper1destinationfixture';
  const redelegate = {
    '@type': '/cosmos.staking.v1beta1.MsgBeginRedelegate', delegator_address: delegator,
    validator_src_address: source, validator_dst_address: destination,
    amount: { denom: 'el1', amount: '8000000000000000000' },
  };
  const completionTime = '2026-11-18T12:00:00Z';
  const normalized = normalizeCosmosTransaction(tx({
    messages: [redelegate, redelegate],
    events: [event('redelegate', {
      delegator, src_validator: source, dst_validator: destination,
      amount: '8000000000000000000el1', completion_time: completionTime, msg_index: '1',
    })],
  }));

  assert.equal(normalized.operations[0].completionTime, null);
  assert.equal(normalized.operations[1].completionTime, completionTime);
});

test('keeps multiple messages as separate operations and associates events by msg_index', () => {
  const transferAmount = { denom: 'el1', amount: '2500000000000000000' };
  const delegateAmount = { denom: 'el1', amount: '5000000000000000000' };
  const normalized = normalizeCosmosTransaction(tx({
    messages: [
      { '@type': '/cosmos.bank.v1beta1.MsgSend', from_address: sender, to_address: recipient, amount: [transferAmount] },
      { '@type': '/cosmos.staking.v1beta1.MsgDelegate', delegator_address: delegator, validator_address: validator, amount: delegateAmount },
    ],
    events: [
      event('transfer', { sender, recipient, amount: `${transferAmount.amount}el1`, msg_index: '0' }),
      event('delegate', { delegator, validator, amount: `${delegateAmount.amount}el1`, msg_index: '1' }),
    ],
  }));

  assert.equal(normalized.operations.length, 2);
  assert.deepEqual(normalized.operations.map(({ msgIndex, type, status }) => ({ msgIndex, type, status })), [
    { msgIndex: 0, type: 'transfer', status: 'confirmed' },
    { msgIndex: 1, type: 'delegate', status: 'confirmed' },
  ]);
  assert.equal(normalized.operations[0].evidence.some((item) => item.eventType === 'delegate'), false);
});

test('keeps failed transaction and failed operation status distinct from business evidence', () => {
  const normalized = normalizeCosmosTransaction(tx({
    success: false,
    code: 5,
    messages: [{
      '@type': '/cosmos.staking.v1beta1.MsgDelegate', delegator_address: delegator,
      validator_address: validator, amount: { denom: 'el1', amount: '1000000000000000000' },
    }],
    events: [],
  }));

  assert.equal(normalized.execution.status, 'failed');
  assert.equal(normalized.operations[0].status, 'unknown');
  assert.equal(normalized.operations[0].statusReason, 'transaction_failed_operation_result_unavailable');
});

test('does not attribute a failed multi-message transaction to every operation', () => {
  const normalized = normalizeCosmosTransaction(tx({
    success: false,
    code: 5,
    messages: [
      { '@type': '/cosmos.bank.v1beta1.MsgSend', from_address: sender, to_address: recipient, amount: [{ denom: 'el1', amount: '4' }] },
      { '@type': '/cosmos.staking.v1beta1.MsgDelegate', delegator_address: delegator, validator_address: validator, amount: { denom: 'el1', amount: '8' } },
    ],
  }));

  assert.equal(normalized.execution.status, 'failed');
  assert.deepEqual(normalized.operations.map((operation) => operation.status), ['unknown', 'unknown']);
  assert.ok(normalized.operations.every((operation) => operation.statusReason === 'transaction_failed_operation_result_unavailable'));
});

test('preserves invalid coin entries and prevents partial amount confirmation', () => {
  const valid = { denom: 'el1', amount: '10' };
  const invalid = { denom: 'el1', amount: 'ten' };
  const normalized = normalizeCosmosTransaction(tx({
    messages: [{ '@type': '/cosmos.bank.v1beta1.MsgSend', from_address: sender, to_address: recipient, amount: [valid, invalid] }],
    events: [event('transfer', { sender, recipient, amount: '10el1', msg_index: '0' })],
  }));

  assert.deepEqual(normalized.operations[0].amounts, [{ integer: '10', denom: 'el1' }]);
  assert.equal(normalized.operations[0].amountIssues.length, 1);
  assert.equal(normalized.operations[0].amountIssues[0].index, 1);
  assert.deepEqual(normalized.operations[0].amountIssues[0].raw, invalid);
  assert.equal(normalized.operations[0].amountsComplete, false);
  assert.equal(normalized.operations[0].status, 'unknown');
});

test('distinguishes absent, invalid, and unmatched msg_index without substituting eventPosition', () => {
  const normalized = normalizeCosmosTransaction(tx({
    messages: [{ '@type': '/cosmos.bank.v1beta1.MsgSend', from_address: sender, to_address: recipient, amount: [{ denom: 'el1', amount: '1' }] }],
    events: [
      event('transfer', { sender, recipient, amount: '1el1' }, { event_index: 12 }),
      event('transfer', { sender, recipient, amount: '1el1', msg_index: 'not-an-index' }, { event_index: 13 }),
      event('transfer', { sender, recipient, amount: '1el1', msg_index: '9' }, { event_index: 14 }),
    ],
  }));

  assert.deepEqual(normalized.unscopedEvents.map(({ msgIndex, msgIndexStatus, eventIndex, eventPosition }) => ({
    msgIndex, msgIndexStatus, eventIndex, eventPosition,
  })), [
    { msgIndex: null, msgIndexStatus: 'absent', eventIndex: 12, eventPosition: 0 },
    { msgIndex: 'not-an-index', msgIndexStatus: 'invalid', eventIndex: 13, eventPosition: 1 },
    { msgIndex: '9', msgIndexStatus: 'unmatched', eventIndex: 14, eventPosition: 2 },
  ]);
});

test('preserves event_index supplied directly on an event', () => {
  const [normalizedEvent] = normalizeUnscopedEvents([
    { type: 'transfer', event_index: 17, attributes: [] },
  ]);

  assert.equal(normalizedEvent.eventIndex, 17);
  assert.equal(normalizedEvent.rawEventIndex, 17);
});

test('reads event_index supplied only as an event attribute', () => {
  const [normalizedEvent] = normalizeUnscopedEvents([
    event('transfer', { event_index: '23' }),
  ]);

  assert.equal(normalizedEvent.eventIndex, 23);
  assert.equal(normalizedEvent.rawEventIndex, '23');
});

test('uses null when event_index is absent', () => {
  const [normalizedEvent] = normalizeUnscopedEvents([
    event('transfer', {}),
  ]);

  assert.equal(normalizedEvent.eventIndex, null);
  assert.equal(normalizedEvent.rawEventIndex, undefined);
});

test('preserves an invalid raw event_index without treating it as an index', () => {
  const [normalizedEvent] = normalizeUnscopedEvents([
    { type: 'transfer', event_index: 'not-an-index', attributes: [] },
  ]);

  assert.equal(normalizedEvent.eventIndex, null);
  assert.equal(normalizedEvent.rawEventIndex, 'not-an-index');
});

test('keeps eventPosition independent from eventIndex', () => {
  const normalizedEvents = normalizeUnscopedEvents([
    { type: 'transfer', event_index: 17, attributes: [] },
    event('delegate', { event_index: '4' }),
    event('unbond', {}),
  ]);

  assert.deepEqual(normalizedEvents.map(({ eventPosition, eventIndex }) => ({ eventPosition, eventIndex })), [
    { eventPosition: 0, eventIndex: 17 },
    { eventPosition: 1, eventIndex: 4 },
    { eventPosition: 2, eventIndex: null },
  ]);
});

test('keeps exact observed event attribute keys instead of accepting aliases', () => {
  const normalized = normalizeCosmosTransaction(tx({
    messages: [{ '@type': '/cosmos.bank.v1beta1.MsgSend', from_address: sender, to_address: recipient, amount: [{ denom: 'el1', amount: '2' }] }],
    events: [event('transfer', { from: sender, to: recipient, amount: '2el1', msg_index: '0' })],
  }));

  assert.equal(normalized.operations[0].status, 'unknown');
});

test('leaves operation unknown when success lacks a message-scoped confirming event', () => {
  const normalized = normalizeCosmosTransaction(tx({
    messages: [{ '@type': '/cosmos.bank.v1beta1.MsgSend', from_address: sender, to_address: recipient, amount: [{ denom: 'el1', amount: '3' }] }],
    events: [event('transfer', { sender, recipient, amount: '3el1' })], // no msg_index: scope is ambiguous
  }));

  assert.equal(normalized.execution.status, 'success');
  assert.equal(normalized.operations[0].status, 'unknown');
  assert.equal(normalized.unscopedEvents.length, 1);
});

test('preserves arbitrarily large integer amounts and denominations without conversion', () => {
  const integer = '12345678901234567890123456789012345678901234567890';
  const normalized = normalizeCosmosTransaction(tx({
    messages: [{ '@type': '/cosmos.bank.v1beta1.MsgSend', from_address: sender, to_address: recipient, amount: [{ denom: 'el1', amount: integer }] }],
    events: [event('transfer', { sender, recipient, amount: `${integer}el1`, msg_index: '0' })],
  }));

  assert.equal(normalized.operations[0].amounts[0].integer, integer);
  assert.equal(normalized.operations[0].amounts[0].denom, 'el1');
  assert.equal(normalized.operations[0].status, 'confirmed');
});

test('represents incomplete and unrecognized data without inventing participants or amounts', () => {
  const incomplete = normalizeCosmosTransaction({ hash: 'TX_UNKNOWN', success: true, code: 0, events: [], tx: { body: { messages: [
    { '@type': '/cosmos.staking.v1beta1.MsgDelegate', amount: { denom: 'el1', amount: 'NaN' } },
    { '@type': '/cosmos.unknown.v1.MsgMystery', arbitrary: 'opaque' },
  ] } } });

  assert.equal(incomplete.execution.status, 'success');
  assert.equal(incomplete.operations[0].type, 'delegate');
  assert.equal(incomplete.operations[0].status, 'unknown');
  assert.deepEqual(incomplete.operations[0].participants, []);
  assert.deepEqual(incomplete.operations[0].amounts, []);
  assert.equal(incomplete.operations[1].type, 'other');
  assert.equal(incomplete.operations[1].status, 'unknown');

  const typeOnly = normalizeCosmosTransaction({
    hash: 'TX_TYPES_ONLY', success: true, code: 0, events: [],
    messages: ['/cosmos.staking.v1beta1.MsgDelegate'],
  });
  assert.equal(typeOnly.operations[0].type, 'delegate');
  assert.equal(typeOnly.operations[0].status, 'unknown');
  assert.equal(typeOnly.operations[0].evidence[0].source, 'transaction.messages');
});

test('does not treat an IBC transfer message as proof of remote receipt', () => {
  const normalized = normalizeCosmosTransaction(tx({
    messages: [{
      '@type': '/ibc.applications.transfer.v1.MsgTransfer', sender, receiver: 'cosmos1remote',
      token: { denom: 'el1', amount: '100' }, source_port: 'transfer',
    }],
  }));

  assert.equal(normalized.operations[0].type, 'ibc_transfer');
  assert.equal(normalized.operations[0].status, 'unknown');
  assert.equal(normalized.operations[0].remoteReceipt, 'unverified');
  assert.deepEqual(normalized.operations[0].amounts, [{ integer: '100', denom: 'el1' }]);
});

test('marks a complete IBC transfer as locally initiated without claiming remote receipt', () => {
  const normalized = normalizeCosmosTransaction(tx({
    messages: [{
      '@type': '/ibc.applications.transfer.v1.MsgTransfer', sender, receiver: 'cosmos1remote',
      token: { denom: 'el1', amount: '100' }, source_port: 'transfer', source_channel: 'channel-0',
    }],
  }));

  assert.equal(normalized.operations[0].status, 'initiated');
  assert.equal(normalized.operations[0].statusScope, 'local_submission_only');
  assert.equal(normalized.operations[0].remoteReceipt, 'unverified');
});

const incompleteIbcCases = [
  ['sender absent', (message) => { delete message.sender; }],
  ['receiver absent', (message) => { delete message.receiver; }],
  ['source_port absent', (message) => { delete message.source_port; }],
  ['source_channel absent', (message) => { delete message.source_channel; }],
  ['token absent', (message) => { delete message.token; }],
  ['token amount invalid', (message) => { message.token.amount = 'not-an-integer'; }],
  ['token denomination invalid', (message) => { message.token.denom = ''; }],
];

for (const [description, makeIncomplete] of incompleteIbcCases) {
  test(`keeps IBC status unknown when ${description}`, () => {
    const message = completeIbcMessage();
    makeIncomplete(message);
    const normalized = normalizeCosmosTransaction(tx({ messages: [message] }));

    assert.equal(normalized.operations[0].type, 'ibc_transfer');
    assert.equal(normalized.operations[0].status, 'unknown');
    assert.equal(normalized.operations[0].remoteReceipt, 'unverified');
  });
}

test('normalizes redelegation as awaiting completion with real GL1X event attributes (source_validator, destination_validator)', () => {
  const source = 'genesisvaloper1sourcefixture';
  const destination = 'genesisvaloper1destinationfixture';
  const completionTime = '2026-11-25T12:00:00Z';
  const normalized = normalizeCosmosTransaction(tx({
    messages: [{
      '@type': '/cosmos.staking.v1beta1.MsgBeginRedelegate',
      delegator_address: delegator,
      validator_src_address: source,
      validator_dst_address: destination,
      amount: { denom: 'el1', amount: '8000000000000000000' },
    }],
    events: [event('redelegate', {
      delegator,
      source_validator: source,
      destination_validator: destination,
      amount: '8000000000000000000el1',
      completion_time: completionTime,
      msg_index: '0',
    })],
  }));

  assert.equal(normalized.operations[0].type, 'redelegate');
  assert.equal(normalized.operations[0].status, 'awaiting_completion');
  assert.equal(normalized.operations[0].completionTime, completionTime);
  assert.deepEqual(normalized.operations[0].participants, [
    { role: 'delegator', address: delegator },
    { role: 'source_validator', address: source },
    { role: 'destination_validator', address: destination },
  ]);
});
