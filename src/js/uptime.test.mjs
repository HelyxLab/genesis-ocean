import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bech32ToHex,
  classifyHistoricalHeight,
  mergeHistoricalClassifications,
  requiresMissedConfirmation,
  consensusAddressMapFromValidatorSet,
  calculateSlashingUptime,
  formatSlashingUptime,
  parseSigningInfo,
  validateValidatorSetResponse,
  validateCommitResponse,
  createUptimeDataSource,
  visibleHeightsForTip,
  enteringHeightsBetween,
  slideVisibleHeight,
  resolveHeightClassifications,
  slideUptimeRowCells,
  createUptimeWindowPump,
  formatUptimeInitialProgress,
  countCompletedUptimeHeight,
  updateUptimeCell,
  uptimeValidatorContextSignature,
} from './uptime.js';

class TestCell {
  constructor(height, value) {
    this.dataset = { height: String(height) };
    this.value = value;
    this.removed = false;
  }

  remove() {
    this.removed = true;
    if (this.parent) {
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }
  }
}

class TestRow {
  constructor(cells = []) {
    this.children = [];
    cells.forEach((cell) => this.append(cell));
  }

  append(cell) {
    cell.parent = this;
    this.children.push(cell);
  }
}

test('calculateSlashingUptime handles a full signing window', () => {
  const info = { indexOffset: 10000, missedBlocksCounter: 3, tombstoned: false };
  assert.equal(calculateSlashingUptime(info, 10000), 99.97);
  assert.equal(formatSlashingUptime(info, 10000), '99.97%');
});

test('calculateSlashingUptime handles a partial window', () => {
  const info = { indexOffset: 50, missedBlocksCounter: 2, tombstoned: false };
  assert.equal(calculateSlashingUptime(info, 10000), 96);
});

test('calculateSlashingUptime excludes missed counter correctly', () => {
  const info = { indexOffset: 100, missedBlocksCounter: 3, tombstoned: false };
  assert.equal(calculateSlashingUptime(info, 10000), 97);
});

test('calculateSlashingUptime handles recently joined validators', () => {
  const info = { indexOffset: 10, missedBlocksCounter: 0, tombstoned: false };
  assert.equal(calculateSlashingUptime(info, 10000), 100);
});

test('calculateSlashingUptime handles jail reset state', () => {
  const info = { indexOffset: 0, missedBlocksCounter: 0, tombstoned: false };
  assert.equal(calculateSlashingUptime(info, 10000), null);
  assert.equal(formatSlashingUptime(info, 10000), 'N/A');
});

test('calculateSlashingUptime rejects tombstoned validators', () => {
  const info = { indexOffset: 10000, missedBlocksCounter: 0, tombstoned: true };
  assert.equal(calculateSlashingUptime(info, 10000), null);
});

test('calculateSlashingUptime rejects missing signing info', () => {
  assert.equal(calculateSlashingUptime(null, 10000), null);
  assert.equal(formatSlashingUptime(null, 10000), 'N/A');
});

test('calculateSlashingUptime rejects invalid numeric data', () => {
  assert.equal(calculateSlashingUptime({ indexOffset: 10, missedBlocksCounter: 11, tombstoned: false }, 10000), null);
  assert.equal(calculateSlashingUptime({ indexOffset: 10, missedBlocksCounter: 1, tombstoned: false }, 0), null);
});

test('parseSigningInfo validates signing info', () => {
  const parsed = parseSigningInfo({
    address: 'genesisvalcons1qdkhpehzm6kv8hautytx5xgmx0hl7amzup0h05',
    start_height: '4563189',
    index_offset: '2',
    missed_blocks_counter: '2',
    jailed_until: '2022-11-23T06:33:59.107869315Z',
    tombstoned: false,
  });
  assert.equal(parsed.indexOffset, 2);
  assert.equal(parsed.missedBlocksCounter, 2);
  assert.equal(parsed.tombstoned, false);
});

test('bech32ToHex decodes consensus addresses', () => {
  const hex = bech32ToHex('genesisvalcons1qdkhpehzm6kv8hautytx5xgmx0hl7amzup0h05');
  assert.equal(typeof hex, 'string');
  assert.equal(hex.length, 40);
});


test('validateValidatorSetResponse accepts a non-empty valid validator set', () => {
  assert.equal(validateValidatorSetResponse(1, [{ address: 'A', pubKey: 'B' }]), true);
});

test('validateValidatorSetResponse rejects empty or malformed validator sets', () => {
  assert.equal(validateValidatorSetResponse(1, []), false);
  assert.equal(validateValidatorSetResponse(1, [{ address: 'A' }]), false);
  assert.equal(validateValidatorSetResponse(1, [{ pubKey: 'B' }]), false);
  assert.equal(validateValidatorSetResponse(1, null), false);
});

test('validateCommitResponse accepts COMMIT, ABSENT, and NIL signatures', () => {
  assert.equal(validateCommitResponse(1, [{ block_id_flag: 2 }, { block_id_flag: 1 }, { block_id_flag: 3 }]), true);
});

test('validateCommitResponse rejects empty or malformed commit responses', () => {
  assert.equal(validateCommitResponse(1, []), false);
  assert.equal(validateCommitResponse(1, [{ block_id_flag: 0 }]), false);
  assert.equal(validateCommitResponse(1, [{ block_id_flag: '2' }]), false);
  assert.equal(validateCommitResponse(1, null), false);
});

test('production fetchValidatorSet caches valid responses and reuses them', async () => {
  let calls = 0;
  const source = createUptimeDataSource({
    fetchJson: async () => {
      calls += 1;
      return { result: { block_height: '10', validators: [{ address: 'A', pub_key: { value: 'B' } }], total: '1' } };
    },
    rpcBase: 'https://example.invalid',
  });
  const first = await source.fetchValidatorSet(10);
  const second = await source.fetchValidatorSet(10);
  assert.deepEqual(first, [{ address: 'A', pubKey: 'B' }]);
  assert.equal(second, first);
  assert.equal(calls, 1);
});

test('production fetchValidatorSet rejects invalid responses without caching', async () => {
  const source = createUptimeDataSource({
    fetchJson: async () => ({ result: { block_height: '10', validators: [], total: '1' } }),
    rpcBase: 'https://example.invalid',
  });
  await assert.rejects(() => source.fetchValidatorSet(10));
  await assert.rejects(() => source.fetchValidatorSet(10));
});

test('production fetchCommit caches valid responses and reuses them', async () => {
  let calls = 0;
  const source = createUptimeDataSource({
    fetchJson: async () => {
      calls += 1;
      return { result: { signed_header: { header: { height: '10' }, commit: { signatures: [{ block_id_flag: 2 }] } } } };
    },
    rpcBase: 'https://example.invalid',
  });
  const first = await source.fetchCommit(10);
  const second = await source.fetchCommit(10);
  assert.deepEqual(first, [{ block_id_flag: 2 }]);
  assert.equal(second, first);
  assert.equal(calls, 1);
});

test('production fetchCommit rejects empty signatures without caching', async () => {
  const source = createUptimeDataSource({
    fetchJson: async () => ({ result: { signed_header: { header: { height: '10' }, commit: { signatures: [] } } } }),
    rpcBase: 'https://example.invalid',
  });
  await assert.rejects(() => source.fetchCommit(10));
  await assert.rejects(() => source.fetchCommit(10));
});

test('production fetch functions share one in-flight request per height', async () => {
  let calls = 0;
  const source = createUptimeDataSource({
    fetchJson: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { result: { block_height: '10', validators: [{ address: 'A', pub_key: { value: 'B' } }], total: '1' } };
    },
    rpcBase: 'https://example.invalid',
  });
  const [first, second] = await Promise.all([source.fetchValidatorSet(10), source.fetchValidatorSet(10)]);
  assert.equal(first, second);
  assert.equal(calls, 1);
});

test('production failed requests clear in-flight entries', async () => {
  let calls = 0;
  const source = createUptimeDataSource({
    fetchJson: async () => {
      calls += 1;
      throw new Error('network failure');
    },
    rpcBase: 'https://example.invalid',
  });
  await assert.rejects(() => source.fetchValidatorSet(10));
  await assert.rejects(() => source.fetchValidatorSet(10));
  assert.equal(calls, 2);
});

test('production force refresh bypasses cached data', async () => {
  let calls = 0;
  const source = createUptimeDataSource({
    fetchJson: async () => {
      calls += 1;
      return { result: { block_height: '10', validators: [{ address: 'A', pub_key: { value: 'B' } }], total: '1' } };
    },
    rpcBase: 'https://example.invalid',
  });
  await source.fetchValidatorSet(10);
  await source.fetchValidatorSet(10, { force: true });
  assert.equal(calls, 2);
});

test('production fetchValidatorSet uses no-store cache', async () => {
  let requestOptions;
  const source = createUptimeDataSource({
    fetchJson: async (_url, options) => {
      requestOptions = options;
      return { result: { block_height: '10', validators: [{ address: 'A', pub_key: { value: 'B' } }], total: '1' } };
    },
    rpcBase: 'https://example.invalid',
  });
  await source.fetchValidatorSet(10);
  assert.deepEqual(requestOptions, { cache: 'no-store' });
});

test('production fetchCommit uses no-store cache', async () => {
  let requestOptions;
  const source = createUptimeDataSource({
    fetchJson: async (_url, options) => {
      requestOptions = options;
      return { result: { signed_header: { header: { height: '10' }, commit: { signatures: [{ block_id_flag: 2 }] } } } };
    },
    rpcBase: 'https://example.invalid',
  });
  await source.fetchCommit(10);
  assert.deepEqual(requestOptions, { cache: 'no-store' });
});

test('production forced refresh uses no-store cache', async () => {
  let requestOptions;
  const source = createUptimeDataSource({
    fetchJson: async (_url, options) => {
      requestOptions = options;
      return { result: { signed_header: { header: { height: '10' }, commit: { signatures: [{ block_id_flag: 2 }] } } } };
    },
    rpcBase: 'https://example.invalid',
  });
  await source.fetchCommit(10, { force: true });
  assert.deepEqual(requestOptions, { cache: 'no-store' });
});

test('classifyHistoricalHeight stores signed, missed, and unknown only after full validation', () => {
  const validators = new Map([
    ['op1', { consensusKey: 'pk1' }],
    ['op2', { consensusKey: 'pk2' }],
  ]);
  const validatorSet = [
    { address: 'cons1', pubKey: 'pk1' },
    { address: 'cons2', pubKey: 'pk2' },
  ];
  const signatures = [
    { block_id_flag: 2, validator_address: 'cons1' },
    { block_id_flag: 1, validator_address: 'cons2' },
  ];
  const result = classifyHistoricalHeight(validatorSet, signatures, validators);
  assert.equal(result.consistent, true);
  assert.equal(result.classifications.get('op1'), 'signed');
  assert.equal(result.classifications.get('op2'), 'missed');
});

test('classifyHistoricalHeight treats NIL as unknown', () => {
  const validators = new Map([['op1', { consensusKey: 'pk1' }]]);
  const result = classifyHistoricalHeight(
    [{ address: 'cons1', pubKey: 'pk1' }],
    [{ block_id_flag: 3, validator_address: 'cons1' }],
    validators
  );
  assert.equal(result.consistent, true);
  assert.equal(result.classifications.get('op1'), 'unknown');
});

test('classifyHistoricalHeight rejects height and structural response problems', () => {
  const validators = new Map([['op1', { consensusKey: 'pk1' }]]);
  assert.equal(classifyHistoricalHeight([], [{ block_id_flag: 2 }], validators).consistent, false);
  assert.equal(classifyHistoricalHeight([{ address: 'cons1', pubKey: 'pk1' }], [], validators).consistent, false);
  assert.equal(classifyHistoricalHeight([{ address: 'cons1', pubKey: 'pk1' }], [{ block_id_flag: 0 }], validators).consistent, false);
});

test('classifyHistoricalHeight rejects address mismatch', () => {
  const validators = new Map([['op1', { consensusKey: 'pk1' }]]);
  const result = classifyHistoricalHeight(
    [{ address: 'cons1', pubKey: 'pk1' }],
    [{ block_id_flag: 1, validator_address: 'cons2' }],
    validators
  );
  assert.equal(result.consistent, false);
});

test('classifyHistoricalHeight rejects unmapped validators', () => {
  const validators = new Map([['op1', { consensusKey: 'pk1' }]]);
  const result = classifyHistoricalHeight(
    [{ address: 'cons1', pubKey: 'pk2' }],
    [{ block_id_flag: 1, validator_address: 'cons1' }],
    validators
  );
  assert.equal(result.consistent, false);
});

test('classifyHistoricalHeight rejects duplicate consensus addresses', () => {
  const validators = new Map([['op1', { consensusKey: 'pk1' }], ['op2', { consensusKey: 'pk1' }]]);
  const result = classifyHistoricalHeight(
    [
      { address: 'cons1', pubKey: 'pk1' },
      { address: 'cons1', pubKey: 'pk1' },
    ],
    [
      { block_id_flag: 2, validator_address: 'cons1' },
      { block_id_flag: 1, validator_address: 'cons1' },
    ],
    validators
  );
  assert.equal(result.consistent, false);
});

test('classifyHistoricalHeight rejects duplicate consensus public keys', () => {
  const validators = new Map([['op1', { consensusKey: 'pk1' }]]);
  const result = classifyHistoricalHeight(
    [
      { address: 'cons1', pubKey: 'pk1' },
      { address: 'cons2', pubKey: 'pk1' },
    ],
    [
      { block_id_flag: 2, validator_address: 'cons1' },
      { block_id_flag: 1, validator_address: 'cons2' },
    ],
    validators
  );
  assert.equal(result.consistent, false);
});

test('classifyHistoricalHeight does not expose partial classifications as consistent', () => {
  const validators = new Map([
    ['op1', { consensusKey: 'pk1' }],
    ['op2', { consensusKey: 'pk2' }],
  ]);
  const result = classifyHistoricalHeight(
    [
      { address: 'cons1', pubKey: 'pk1' },
      { address: 'cons2', pubKey: 'pk2' },
    ],
    [
      { block_id_flag: 2, validator_address: 'cons1' },
      { block_id_flag: 1, validator_address: 'cons3' },
    ],
    validators
  );
  assert.equal(result.consistent, false);
});

test('classifyHistoricalHeight inconsistency in the last element keeps no committed result', () => {
  const validators = new Map([
    ['op1', { consensusKey: 'pk1' }],
    ['op2', { consensusKey: 'pk2' }],
  ]);
  const result = classifyHistoricalHeight(
    [
      { address: 'cons1', pubKey: 'pk1' },
      { address: 'cons2', pubKey: 'pk2' },
    ],
    [
      { block_id_flag: 2, validator_address: 'cons1' },
      { block_id_flag: 1, validator_address: 'cons2' },
    ],
    validators
  );
  // Baseline for the all-valid case is intentionally established here.
  assert.equal(result.consistent, true);

  const inconsistentResult = classifyHistoricalHeight(
    [
      { address: 'cons1', pubKey: 'pk1' },
      { address: 'cons2', pubKey: 'pk2' },
    ],
    [
      { block_id_flag: 2, validator_address: 'cons1' },
      { block_id_flag: 1, validator_address: 'cons9' },
    ],
    validators
  );
  assert.equal(inconsistentResult.consistent, false);
});

test('requiresMissedConfirmation detects candidate missed classifications', () => {
  assert.equal(requiresMissedConfirmation(new Map([['op1', 'signed']])), false);
  assert.equal(requiresMissedConfirmation(new Map([['op1', 'missed']])), true);
});

test('mergeHistoricalClassifications requires two ABSENT observations for red', () => {
  const first = new Map([['op1', 'missed'], ['op2', 'missed'], ['op3', 'signed']]);
  const second = new Map([['op1', 'missed'], ['op2', 'signed'], ['op3', 'missed']]);
  const merged = mergeHistoricalClassifications(first, second);
  assert.equal(merged.get('op1'), 'missed');
  assert.equal(merged.get('op2'), 'signed');
  assert.equal(merged.get('op3'), 'signed');
});

test('mergeHistoricalClassifications treats NIL as unknown', () => {
  const first = new Map([['op1', 'missed']]);
  const second = new Map([['op1', 'unknown']]);
  assert.equal(mergeHistoricalClassifications(first, second).get('op1'), 'unknown');
});

test('mergeHistoricalClassifications cannot turn a missing confirmation into ABSENT', () => {
  assert.equal(mergeHistoricalClassifications(new Map([['op1', 'missed']]), new Map()).get('op1'), 'unknown');
  assert.equal(mergeHistoricalClassifications(new Map(), new Map([['op1', 'missed']])).get('op1'), 'unknown');
});

test('visible uptime window excludes the tip and contains exactly the preceding 100 heights', () => {
  const heights = visibleHeightsForTip(1000);

  assert.equal(heights.length, 100);
  assert.equal(heights[0], 900);
  assert.equal(heights.at(-1), 999);
  assert.equal(heights.includes(1000), false);
});

test('height window advances one block by inserting the old tip and evicting only the oldest height', () => {
  const heights = visibleHeightsForTip(1000);
  const update = slideVisibleHeight(heights, 1000);

  assert.deepEqual(update, {
    heights: [...heights.slice(1), 1000],
    evictedHeight: 900,
  });
  assert.equal(update.heights.length, 100);
});

test('height pump targets all intermediate entering heights in order', () => {
  assert.deepEqual(enteringHeightsBetween(1000, 1004), [1000, 1001, 1002, 1003]);
  assert.deepEqual(enteringHeightsBetween(1004, 1004), []);
  assert.deepEqual(enteringHeightsBetween(1004, 1003), []);
});

test('multiple entering heights slide the matrix one column at a time and retain exactly 100 positions', () => {
  let heights = visibleHeightsForTip(1000);
  const updates = [];
  for (const enteringHeight of enteringHeightsBetween(1000, 1003)) {
    const update = slideVisibleHeight(heights, enteringHeight);
    updates.push(update);
    heights = update.heights;
    assert.equal(heights.length, 100);
  }

  assert.deepEqual(updates.map(({ evictedHeight }) => evictedHeight), [900, 901, 902]);
  assert.equal(heights[0], 903);
  assert.equal(heights.at(-1), 1002);
});

test('sliding a DOM row preserves the identity and order of its other 99 cells', () => {
  const heights = visibleHeightsForTip(1000);
  const existingCells = heights.map((height) => new TestCell(height, 'signed'));
  const row = new TestRow(existingCells);
  const cellsByHeight = new Map(heights.map((height, index) => [height, existingCells[index]]));

  const result = slideUptimeRowCells(row, cellsByHeight, 1000, 'unknown', (height, value) => new TestCell(height, value));

  assert.equal(result.evictedHeight, 900);
  assert.equal(result.evictedCell, existingCells[0]);
  assert.equal(existingCells[0].removed, true);
  assert.equal(row.children.length, 100);
  assert.equal(cellsByHeight.size, 100);
  for (let index = 0; index < 99; index += 1) {
    assert.equal(row.children[index], existingCells[index + 1]);
    assert.equal(cellsByHeight.get(heights[index + 1]), existingCells[index + 1]);
  }
  assert.equal(row.children.at(-1), result.enteringCell);
  assert.equal(result.enteringCell.dataset.height, '1000');
});

test('retry updates only the affected cell and preserves the other 99 DOM identities', () => {
  const heights = visibleHeightsForTip(1000);
  const originalCells = heights.map((height) => new TestCell(height, 'unknown'));
  const cellsByHeight = new Map(heights.map((height, index) => [height, originalCells[index]]));
  const changed = updateUptimeCell(cellsByHeight, 950, 'missed', (cell, height, value) => {
    cell.dataset.height = String(height);
    cell.value = value;
  });

  assert.equal(changed, true);
  assert.equal(cellsByHeight.get(950), originalCells[50]);
  assert.equal(originalCells[50].value, 'missed');
  for (let index = 0; index < originalCells.length; index += 1) {
    assert.equal(cellsByHeight.get(heights[index]), originalCells[index]);
    if (index !== 50) assert.equal(originalCells[index].value, 'unknown');
  }
});

test('initial progress counts only complete height classifications', () => {
  let completed = 0;
  completed = countCompletedUptimeHeight(completed, { complete: true });
  completed = countCompletedUptimeHeight(completed, { complete: false });

  assert.equal(completed, 1);
  assert.equal(formatUptimeInitialProgress(0), 'Loading uptime data… 0/100');
  assert.equal(formatUptimeInitialProgress(completed), 'Loading uptime data… 1/100');
});

test('validator context signature ignores ordering but changes for membership or mapping updates', () => {
  const first = [
    { operatorAddress: 'op1', consensusKey: 'key1', status: 'BOND_STATUS_BONDED' },
    { operatorAddress: 'op2', consensusKey: 'key2', status: 'BOND_STATUS_BONDED' },
  ];
  assert.equal(uptimeValidatorContextSignature(first), uptimeValidatorContextSignature([...first].reverse()));
  assert.notEqual(uptimeValidatorContextSignature(first), uptimeValidatorContextSignature([
    ...first,
    { operatorAddress: 'op3', consensusKey: 'key3', status: 'BOND_STATUS_BONDED' },
  ]));
  assert.notEqual(uptimeValidatorContextSignature(first), uptimeValidatorContextSignature([
    { ...first[0], consensusKey: 'rotated-key' }, first[1],
  ]));
});

test('only two complete ABSENT observations resolve to missed', () => {
  const first = { consistent: true, classifications: new Map([['op1', 'missed']]) };
  const absentAgain = { consistent: true, classifications: new Map([['op1', 'missed']]) };

  assert.equal(resolveHeightClassifications(first, absentAgain).get('op1'), 'missed');
});

test('COMMIT supersedes an earlier ABSENT and NIL remains unknown', () => {
  const first = { consistent: true, classifications: new Map([['op1', 'missed'], ['op2', 'missed']]) };
  const second = { consistent: true, classifications: new Map([['op1', 'signed'], ['op2', 'unknown']]) };
  const resolved = resolveHeightClassifications(first, second);

  assert.equal(resolved.get('op1'), 'signed');
  assert.equal(resolved.get('op2'), 'unknown');
});

test('ABSENT without a valid matching confirmation remains unknown', () => {
  const first = { consistent: true, classifications: new Map([['op1', 'missed']]) };

  assert.equal(resolveHeightClassifications(first, null), null);
  assert.equal(resolveHeightClassifications(first, { consistent: false, classifications: new Map() }), null);
  assert.equal(resolveHeightClassifications(first, { consistent: true, classifications: new Map() }), null);
  assert.equal(resolveHeightClassifications(first, { consistent: true, classifications: new Map([['op1', 'unknown']]) }).get('op1'), 'unknown');
});

test('an RPC failure on the forced ABSENT confirmation cannot resolve to missed', () => {
  const first = { consistent: true, classifications: new Map([['op1', 'missed']]) };
  const forcedRpcFailure = null;

  assert.equal(resolveHeightClassifications(first, forcedRpcFailure), null);
});

test('height classification validation rejects incomplete or mismatched operator maps', () => {
  assert.equal(resolveHeightClassifications({ consistent: false, classifications: new Map([['op1', 'signed']]) }), null);
  assert.equal(resolveHeightClassifications(
    { consistent: true, classifications: new Map([['op1', 'missed']]) },
    { consistent: true, classifications: new Map([['op2', 'missed']]) },
  ), null);
});

test('window pump initializes once and processes multi-height advances in order', async () => {
  const events = [];
  const pump = createUptimeWindowPump({
    initialize: async (tip) => events.push(['initialize', tip]),
    advance: async (tip, entering) => events.push(['advance', tip, entering]),
    rebuild: async (tip) => events.push(['rebuild', tip]),
  });

  await pump.request(1000);
  await pump.request(1003);

  assert.deepEqual(events, [
    ['initialize', 1000],
    ['advance', 1001, 1000],
    ['advance', 1002, 1001],
    ['advance', 1003, 1002],
  ]);
  assert.equal(pump.getCurrentTip(), 1003);
});

test('window pump serializes and coalesces tips received during an update', async () => {
  let releaseFirstAdvance;
  const events = [];
  const firstAdvance = new Promise((resolve) => { releaseFirstAdvance = resolve; });
  const pump = createUptimeWindowPump({
    initialize: async (tip) => events.push(['initialize', tip]),
    advance: async (tip, entering) => {
      events.push(['start', tip, entering]);
      if (tip === 1001) await firstAdvance;
      events.push(['finish', tip, entering]);
    },
    rebuild: async (tip) => events.push(['rebuild', tip]),
  });

  await pump.request(1000);
  const firstUpdate = pump.request(1001);
  const coalescedUpdate = pump.request(1003);
  releaseFirstAdvance();
  await Promise.all([firstUpdate, coalescedUpdate]);

  assert.deepEqual(events, [
    ['initialize', 1000],
    ['start', 1001, 1000],
    ['finish', 1001, 1000],
    ['start', 1002, 1001],
    ['finish', 1002, 1001],
    ['start', 1003, 1002],
    ['finish', 1003, 1002],
  ]);
  assert.equal(pump.getCurrentTip(), 1003);
});

test('window pump rebuilds only when the tip rolls back', async () => {
  const events = [];
  const pump = createUptimeWindowPump({
    initialize: async (tip) => events.push(['initialize', tip]),
    advance: async (tip, entering) => events.push(['advance', tip, entering]),
    rebuild: async (tip) => events.push(['rebuild', tip]),
  });

  await pump.request(1000);
  await pump.request(1001);
  await pump.request(900);

  assert.deepEqual(events, [
    ['initialize', 1000],
    ['advance', 1001, 1000],
    ['rebuild', 900],
  ]);
  assert.equal(pump.getCurrentTip(), 900);
});

test('window pump serializes retry and explicit rebuild operations with tip updates', async () => {
  const events = [];
  const pump = createUptimeWindowPump({
    initialize: async (tip) => events.push(['initialize', tip]),
    advance: async (tip, entering) => events.push(['advance', tip, entering]),
    rebuild: async (tip) => events.push(['rebuild', tip]),
    retry: async (tip) => events.push(['retry', tip]),
  });

  await pump.request(1000);
  await Promise.all([pump.requestRetry(), pump.request(1001)]);
  await pump.requestRebuild();

  assert.deepEqual(events, [
    ['initialize', 1000],
    ['retry', 1000],
    ['advance', 1001, 1000],
    ['rebuild', 1001],
  ]);
});
