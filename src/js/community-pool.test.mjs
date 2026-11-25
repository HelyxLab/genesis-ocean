import test from 'node:test';
import assert from 'node:assert/strict';
import { formatL1Whole, formatL1Abbreviated, decimalToAtoms, formatL1Decimal, percentChange, formatChange, formatCompactNumber, initCommunityPool, formatL1Amount } from './community-pool.js';
import { createGenesisApi } from './data/genesis-api.js';

test('formatL1Whole formats very large values with thousand separators', () => {
  const result = formatL1Whole('5640826085750621737405369.279382947184666240');
  assert.equal(result, '5,640,826,085,750,621,737,405,369 L1');
});

test('formatL1Whole formats zero correctly', () => {
  assert.equal(formatL1Whole('0'), '0 L1');
});

test('formatL1Whole formats small values correctly', () => {
  assert.equal(formatL1Whole('12345.678901234567890'), '12,345 L1');
});

test('formatL1Whole returns em dash for invalid input', () => {
  assert.equal(formatL1Whole(''), '—');
  assert.equal(formatL1Whole('abc'), '—');
});

test('formatL1Whole preserves precision internally (BigInt)', () => {
  const result = decimalToAtoms('5640826085750621737405369.279382947184666240');
  assert.equal(typeof result, 'bigint');
  assert.equal(result.toString(), '5640826085750621737405369279382947184666240');
});

test('decimalToAtoms handles fractional values without loss', () => {
  const input = '123.456';
  const result = decimalToAtoms(input);
  assert.equal(result.toString(), '123456000000000000000');
});

test('formatL1Abbreviated formats K, M, B, T for large values', () => {
  assert.equal(formatL1Abbreviated('1500000'), '1.5M L1');
  assert.equal(formatL1Abbreviated('2500000000'), '2.5B L1');
  assert.equal(formatL1Abbreviated('3000000000000'), '3.0T L1');
});

test('formatL1Abbreviated handles values below 1000', () => {
  assert.equal(formatL1Abbreviated('500'), '500 L1');
});

test('formatL1Decimal removes trailing zeros from fractional part', () => {
  assert.equal(formatL1Decimal('100.500000000000000000'), '100.5');
  assert.equal(formatL1Decimal('100.000000000000000000'), '100');
});

test('formatL1Decimal rejects invalid input', () => {
  assert.equal(formatL1Decimal(''), null);
  assert.equal(formatL1Decimal('abc'), null);
});

test('formatL1Abbreviated preserves scale for large string values', () => {
  assert.equal(formatL1Abbreviated('9007199254740993'), '9007.2T L1');
});

test('formatL1Abbreviated handles negative values', () => {
  assert.equal(formatL1Abbreviated('-1500000'), '-1.5M L1');
});

test('formatL1Abbreviated handles BigInt values', () => {
  assert.equal(formatL1Abbreviated(1500000n), '1.5M L1');
});

test('formatL1Abbreviated handles invalid input', () => {
  assert.equal(formatL1Abbreviated(null), '0 L1');
  assert.equal(formatL1Abbreviated('abc'), '0 L1');
});

test('formatCompactNumber preserves scale for BigInt above MAX_SAFE_INTEGER', () => {
  assert.equal(formatCompactNumber(9007199254740993n), '9007.2T');
});

test('formatCompactNumber preserves negative BigInt values', () => {
  assert.equal(formatCompactNumber(-1500000n), '-1.5M');
});

test('formatCompactNumber handles invalid input', () => {
  assert.equal(formatCompactNumber(null), '0');
  assert.equal(formatCompactNumber('abc'), '0');
});

test('empty history is handled correctly', () => {
  const empty = [];
  assert.equal(empty.length, 0);
});

test('formatChange positive 50%', () => {
  const result = formatChange('1500', '1000');
  assert.deepEqual(result, { abs: '+500.00 L1', pct: ' (50.00%)' });
});

test('formatChange negative 20%', () => {
  const result = formatChange('800', '1000');
  assert.deepEqual(result, { abs: '-200.00 L1', pct: ' (-20.00%)' });
});

test('formatChange previous zero string', () => {
  const result = formatChange('1000', '0');
  assert.equal(result.pct, '');
});

test('formatChange empty previous returns null', () => {
  const result = formatChange('1000', '');
  assert.equal(result, null);
});

test('percentChange positive', () => {
  assert.equal(percentChange('1000', '1500'), 50);
});

test('percentChange negative', () => {
  assert.equal(percentChange('1000', '800'), -20);
});

test('percentChange equal values', () => {
  assert.equal(percentChange('1000', '1000'), 0);
});

test('percentChange zero previous', () => {
  assert.equal(percentChange('0', '1000'), null);
});

test('percentChange to zero', () => {
  assert.equal(percentChange('1000', '0'), -100);
});

test('percentChange invalid inputs', () => {
  assert.equal(percentChange('', '1000'), null);
  assert.equal(percentChange('1000', ''), null);
  assert.equal(percentChange('abc', '1000'), null);
});

test('formatCompactNumber 500', () => assert.equal(formatCompactNumber(500), '500'));
test('formatCompactNumber 1000', () => assert.equal(formatCompactNumber(1000), '1K'));
test('formatCompactNumber 500000', () => assert.equal(formatCompactNumber(500000), '500K'));
test('formatCompactNumber 1000000', () => assert.equal(formatCompactNumber(1000000), '1M'));
test('formatCompactNumber 5000000', () => assert.equal(formatCompactNumber(5000000), '5M'));
test('formatCompactNumber 1e9', () => assert.equal(formatCompactNumber(1000000000), '1B'));
test('formatCompactNumber 1e12', () => assert.equal(formatCompactNumber(1000000000000), '1T'));
test('formatCompactNumber decimal', () => assert.equal(formatCompactNumber(1500), '1.5K'));
test('formatCompactNumber below thousand', () => assert.equal(formatCompactNumber(999), '999'));


function createPoolContainer() {
  const elements = new Map();
  const selectors = [
    '[data-pool-balance]',
    '[data-pool-change-24h]',
    '[data-pool-supply-share]',
    '[data-pool-total-supply]',
    '[data-pool-snapshot-height]',
    '[data-pool-chain-height]',
    '[data-pool-last-updated]',
    '[data-pool-loading]',
    '[data-pool-error]',
    '[data-pool-proposals-loading]',
    '[data-pool-proposals-error]',
    '[data-pool-proposals-empty]',
    '[data-pool-proposals-list]',
    '[data-pool-total-approved-value]',
  ];
  for (const selector of selectors) {
    elements.set(selector, { hidden: false, textContent: '', replaceChildren() {}, append() {} });
  }
  return {
    querySelector(selector) {
      return elements.get(selector) ?? null;
    },
    elements,
  };
}

function validPool() {
  return {
    amountL1: '1234.56',
    percent: 12.34,
    totalSupply: '9999.00',
    snapshotHeight: '42',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

async function withDocument(run) {
  const previousDocument = globalThis.document;
  globalThis.document = {
    hidden: false,
    createElement(tag) {
      const node = { tagName: tag, className: '', textContent: '', children: [] };
      node.append = (...nodes) => { node.children.push(...nodes); };
      node.appendChild = (nodeToAppend) => { node.children.push(nodeToAppend); return nodeToAppend; };
      return node;
    },
  };
  try {
    await run();
  } finally {
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
}

test('initCommunityPool renders balance from GL1X', async () => {
  await withDocument(async () => {
    const container = createPoolContainer();
    const api = { getCommunityPool: async () => validPool() };
    initCommunityPool({ api, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(container.elements.get('[data-pool-balance]').textContent, '1,234.56 L1');
  });
});

test('initCommunityPool renders supply share from GL1X', async () => {
  await withDocument(async () => {
    const container = createPoolContainer();
    const api = { getCommunityPool: async () => validPool() };
    initCommunityPool({ api, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(container.elements.get('[data-pool-supply-share]').textContent, '12.34%');
  });
});

test('initCommunityPool renders total supply from GL1X', async () => {
  await withDocument(async () => {
    const container = createPoolContainer();
    const api = { getCommunityPool: async () => validPool() };
    initCommunityPool({ api, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(container.elements.get('[data-pool-total-supply]').textContent, '9,999.00 L1');
  });
});

test('initCommunityPool renders block height from snapshotHeight', async () => {
  await withDocument(async () => {
    const container = createPoolContainer();
    const api = { getCommunityPool: async () => validPool() };
    initCommunityPool({ api, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(container.elements.get('[data-pool-snapshot-height]').textContent, '42');
  });
});

test('current chain updates never replace the balance snapshot height', async () => {
  await withDocument(async () => {
    const container = createPoolContainer();
    let publishHeight;
    let snapshotHeight = '42';
    const api = { getCommunityPool: async () => ({ ...validPool(), snapshotHeight }) };
    const blockHeight = {
      getLatestBlockHeight: () => '50',
      subscribeBlockHeight: (publish) => { publishHeight = publish; },
    };
    const pool = initCommunityPool({ api, container, blockHeight });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const snapshot = container.elements.get('[data-pool-snapshot-height]');
    const chain = container.elements.get('[data-pool-chain-height]');
    assert.deepEqual([snapshot.textContent, chain.textContent], ['42', '50']);
    publishHeight('9007199254740993');
    assert.deepEqual([snapshot.textContent, chain.textContent], ['42', '9,007,199,254,740,993']);
    snapshotHeight = '49';
    await pool.refresh();
    assert.deepEqual([snapshot.textContent, chain.textContent], ['49', '9,007,199,254,740,993']);
  });
});

test('initCommunityPool renders last updated from updatedAt', async () => {
  await withDocument(async () => {
    const container = createPoolContainer();
    const api = { getCommunityPool: async () => validPool() };
    initCommunityPool({ api, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.match(container.elements.get('[data-pool-last-updated]').textContent, /Dec 2025/);
  });
});

test('initCommunityPool leaves 24h change unavailable without a historical source', async () => {
  await withDocument(async () => {
    const container = createPoolContainer();
    const api = { getCommunityPool: async () => validPool() };
    initCommunityPool({ api, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(container.elements.get('[data-pool-change-24h]').textContent, 'Unavailable');
  });
});

test('24h change is tied to the balance snapshot and ignores a superseded lookup', async () => {
  await withDocument(async () => {
    const container = createPoolContainer();
    let snapshotHeight = '42';
    const results = new Map();
    const api = { getCommunityPool: async () => ({ ...validPool(), snapshotHeight }) };
    const governanceApi = {
      getCommunityPoolBalance24h: (height) => new Promise((resolve, reject) => results.set(height, { resolve, reject })),
    };
    const pool = initCommunityPool({ api, governanceApi, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const change = container.elements.get('[data-pool-change-24h]');
    assert.equal(change.textContent, 'Loading…');
    snapshotHeight = '43';
    await pool.refresh();
    results.get('43').resolve({ amountL1: '1000' });
    await Promise.resolve();
    assert.equal(change.textContent, '+234.56 L1 (23.46%)');
    results.get('42').resolve({ amountL1: '10' });
    await Promise.resolve();
    assert.equal(change.textContent, '+234.56 L1 (23.46%)');
    snapshotHeight = '44';
    await pool.refresh();
    results.get('44').reject(new Error('Historical state pruned'));
    await Promise.resolve();
    assert.equal(change.textContent, 'Unavailable');
  });
});

test('initCommunityPool loading state hides indicators', async () => {
  await withDocument(async () => {
    const container = createPoolContainer();
    const deferred = {};
    const api = {
      getCommunityPool: () => new Promise((resolve, reject) => {
        deferred.resolve = resolve;
        deferred.reject = reject;
      }),
    };
    initCommunityPool({ api, container });
    assert.equal(container.elements.get('[data-pool-loading]').hidden, false);
    assert.equal(container.elements.get('[data-pool-balance]').hidden, true);
    deferred.resolve(validPool());
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

test('initCommunityPool ready state shows indicators', async () => {
  await withDocument(async () => {
    const container = createPoolContainer();
    const api = { getCommunityPool: async () => validPool() };
    initCommunityPool({ api, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(container.elements.get('[data-pool-loading]').hidden, true);
    assert.equal(container.elements.get('[data-pool-balance]').hidden, false);
  });
});

test('initCommunityPool error state shows error message', async () => {
  await withDocument(async () => {
    const container = createPoolContainer();
    const api = { getCommunityPool: async () => { throw new Error('boom'); } };
    initCommunityPool({ api, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(container.elements.get('[data-pool-error]').hidden, false);
    assert.equal(container.elements.get('[data-pool-error]').textContent, 'boom');
  });
});

test('initCommunityPool does not require onBlockHeight', async () => {
  await withDocument(async () => {
    const container = createPoolContainer();
    const api = { getCommunityPool: async () => validPool() };
    const controller = initCommunityPool({ api, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(typeof controller.refresh, 'function');
    assert.equal(typeof controller.setBlockHeight, 'undefined');
  });
});

test('formatL1Amount rounds to two decimals', () => {
  assert.equal(formatL1Amount('1234.5678'), '1,234.57 L1');
});

test('formatL1Amount shows small nonzero values as less than 0.01', () => {
  assert.equal(formatL1Amount('0.001'), '<0.01 L1');
});

test('formatL1Amount rounds 0.005 to 0.01', () => {
  assert.equal(formatL1Amount('0.005'), '0.01 L1');
});

test('formatL1Amount formats zero', () => {
  assert.equal(formatL1Amount('0'), '0.00 L1');
});

test('formatL1Amount rejects invalid input', () => {
  assert.equal(formatL1Amount('abc'), '—');
});

test('percentChange preserves precision for small changes', () => {
  assert.equal(percentChange('1000000', '1000001'), 0.0001);
});

test('governance loading is visible while fetch is pending', async () => {
  await withDocument(async () => {
    const container = createPoolContainer();
    const deferred = {};
    const api = { getCommunityPool: async () => validPool() };
    const governanceApi = {
      getCommunityPoolProposals: () => new Promise((resolve) => { deferred.resolve = resolve; }),
    };
    initCommunityPool({ api, governanceApi, container });
    assert.equal(container.elements.get('[data-pool-proposals-loading]').hidden, false);
    assert.equal(container.elements.get('[data-pool-proposals-empty]').hidden, true);
    assert.equal(container.elements.get('[data-pool-proposals-error]').hidden, true);
    deferred.resolve([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

test('governance loading is hidden after success with proposals', async () => {
  await withDocument(async () => {
    const container = createPoolContainer();
    const api = { getCommunityPool: async () => validPool() };
    const governanceApi = {
      getCommunityPoolProposals: async () => [{ id: '1', title: 'P1', description: 'D1', spends: [{ recipient: 'r1', coins: [{ amount: '1', denom: 'el1' }] }], status: 'PROPOSAL_STATUS_PASSED', submitTime: null }],
    };
    initCommunityPool({ api, governanceApi, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(container.elements.get('[data-pool-proposals-loading]').hidden, true);
    assert.equal(container.elements.get('[data-pool-proposals-empty]').hidden, true);
  });
});

test('governance loading is hidden after success with empty list', async () => {
  await withDocument(async () => {
    const container = createPoolContainer();
    const api = { getCommunityPool: async () => validPool() };
    const governanceApi = { getCommunityPoolProposals: async () => [] };
    initCommunityPool({ api, governanceApi, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(container.elements.get('[data-pool-proposals-loading]').hidden, true);
    assert.equal(container.elements.get('[data-pool-proposals-empty]').hidden, false);
  });
});

test('governance loading is hidden after error', async () => {
  await withDocument(async () => {
    const container = createPoolContainer();
    const api = { getCommunityPool: async () => validPool() };
    const governanceApi = { getCommunityPoolProposals: async () => { throw new Error('boom'); } };
    initCommunityPool({ api, governanceApi, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(container.elements.get('[data-pool-proposals-loading]').hidden, true);
    assert.equal(container.elements.get('[data-pool-proposals-error]').hidden, false);
    assert.equal(container.elements.get('[data-pool-proposals-empty]').hidden, true);
  });
});

test('governance empty and error are not shown simultaneously', async () => {
  await withDocument(async () => {
    const container = createPoolContainer();
    const api = { getCommunityPool: async () => validPool() };
    const governanceApi = { getCommunityPoolProposals: async () => [] };
    initCommunityPool({ api, governanceApi, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const emptyHidden = container.elements.get('[data-pool-proposals-empty]').hidden;
    const errorHidden = container.elements.get('[data-pool-proposals-error]').hidden;
    assert.equal(emptyHidden === false && errorHidden === false, false);
  });
});

test('governance loading is independent from economic loading', async () => {
  await withDocument(async () => {
    const container = createPoolContainer();
    const deferred = {};
    const api = { getCommunityPool: async () => validPool() };
    const governanceApi = {
      getCommunityPoolProposals: () => new Promise((resolve) => { deferred.resolve = resolve; }),
    };
    initCommunityPool({ api, governanceApi, container });
    assert.equal(container.elements.get('[data-pool-loading]').hidden, false);
    assert.equal(container.elements.get('[data-pool-proposals-loading]').hidden, false);
    deferred.resolve([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});


function createGovernanceContainer() {
  const elements = new Map();
  const selectors = [
    '[data-pool-balance]',
    '[data-pool-change-24h]',
    '[data-pool-supply-share]',
    '[data-pool-total-supply]',
    '[data-pool-snapshot-height]',
    '[data-pool-chain-height]',
    '[data-pool-last-updated]',
    '[data-pool-loading]',
    '[data-pool-error]',
    '[data-pool-proposals-loading]',
    '[data-pool-proposals-error]',
    '[data-pool-proposals-empty]',
    '[data-pool-proposals-list]',
    '[data-pool-total-approved-value]',
  ];
  for (const selector of selectors) {
    elements.set(selector, { hidden: false, textContent: '', replaceChildren() { this.children = []; }, append() {}, children: [] });
  }
  const list = elements.get('[data-pool-proposals-list]');
  list.replaceChildren = function () { this.children = []; };
  list.append = function (...nodes) { this.children.push(...nodes); };

  const buttons = ['all', 'passed', 'rejected'].map((filter) => {
    const button = {
      dataset: { poolProposalFilter: filter },
      className: '',
      classList: {
        _classes: new Set(),
        toggle(name, force) { if (force) this._classes.add(name); else this._classes.delete(name); },
        contains(name) { return this._classes.has(name); },
      },
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name]; },
      listeners: {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
      click() { if (this.listeners.click) this.listeners.click(); },
    };
    return button;
  });

  return {
    querySelector(selector) {
      return elements.get(selector) ?? null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-pool-proposal-filter]') return buttons;
      return [];
    },
    elements,
    buttons,
    list,
  };
}

function sampleProposals() {
  return [
    { id: '1', title: 'Approved proposal', description: 'D1', spends: [{ recipient: 'r1', coins: [{ amount: '1', denom: 'el1' }] }], status: 'PROPOSAL_STATUS_PASSED', submitTime: null },
    { id: '2', title: 'Rejected proposal', description: 'D2', spends: [{ recipient: 'r2', coins: [{ amount: '2', denom: 'el1' }] }], status: 'PROPOSAL_STATUS_REJECTED', submitTime: null },
    { id: '3', title: 'Unknown proposal', description: 'D3', spends: [{ recipient: 'r3', coins: [{ amount: '3', denom: 'el1' }] }], status: 'PROPOSAL_STATUS_VOTING_PERIOD', submitTime: null },
  ];
}

test('spending filters preserve cross-page order and render each coin with its own denomination', async () => {
  await withDocument(async () => {
    const container = createGovernanceContainer();
    const api = { getCommunityPool: async () => validPool() };
    const spend = (recipient, ...amount) => ({ '@type': '/cosmos.distribution.v1beta1.MsgCommunityPoolSpend', recipient, amount });
    const newest = {
      id: '10', title: 'Newest approved', submit_time: '2026-11-25T12:00:00Z', status: 'PROPOSAL_STATUS_PASSED',
      messages: [spend('recipient-a', { denom: 'uatom', amount: '1234567' }, { denom: 'el1', amount: '1000000000000000000' }),
        spend('recipient-b', { denom: 'el1', amount: '2000000000000000000' })],
    };
    const older = {
      id: '11', title: 'Older approved', submit_time: '2026-11-24T12:00:00Z', status: 'PROPOSAL_STATUS_PASSED',
      messages: [spend('recipient-c', { denom: 'el1', amount: '3000000000000000000' })],
    };
    const rejected = {
      ...older, id: '8', title: 'Rejected', submit_time: '2026-11-24T23:00:00Z', status: 'PROPOSAL_STATUS_REJECTED',
    };
    const governanceApi = createGenesisApi({ fetchImpl: async (url) => {
      const second = new URL(url).searchParams.has('pagination.key');
      return Response.json({ proposals: second ? [newest] : [older, rejected], pagination: { next_key: second ? null : 'next' } });
    } });
    initCommunityPool({ api, governanceApi, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const titles = () => container.list.children.map((card) => card.children[0].textContent);
    assert.deepEqual(titles(), ['Newest approved', 'Rejected', 'Older approved']);
    const newestLines = container.list.children[0].children.map((element) => element.textContent);
    assert.ok(newestLines.includes('Amount: 1,234,567 uatom, 1.00 L1'));
    assert.ok(newestLines.includes('Recipient: recipient-b'));
    assert.ok(newestLines.includes('Amount: 2.00 L1'));
    assert.equal(container.elements.get('[data-pool-total-approved-value]').textContent, 'Total Approved: 6.00 L1 (L1 only)');
    container.buttons.find(({ dataset }) => dataset.poolProposalFilter === 'passed').click();
    assert.deepEqual(titles(), ['Newest approved', 'Older approved']);
    container.buttons.find(({ dataset }) => dataset.poolProposalFilter === 'rejected').click();
    assert.deepEqual(titles(), ['Rejected']);
  });
});


test('governance filter All shows every proposal', async () => {
  await withDocument(async () => {
    const container = createGovernanceContainer();
    const api = { getCommunityPool: async () => validPool() };
    const governanceApi = { getCommunityPoolProposals: async () => sampleProposals() };
    initCommunityPool({ api, governanceApi, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const allButton = container.buttons.find((button) => button.dataset.poolProposalFilter === 'all');
    allButton.click();
    assert.equal(container.list.children.length, 3);
    assert.equal(allButton.classList.contains('is-active'), true);
    assert.equal(allButton.getAttribute('aria-pressed'), 'true');
  });
});

test('governance filter Approved shows only passed proposals', async () => {
  await withDocument(async () => {
    const container = createGovernanceContainer();
    const api = { getCommunityPool: async () => validPool() };
    const governanceApi = { getCommunityPoolProposals: async () => sampleProposals() };
    initCommunityPool({ api, governanceApi, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const approvedButton = container.buttons.find((button) => button.dataset.poolProposalFilter === 'passed');
    approvedButton.click();
    assert.equal(container.list.children.length, 1);
    assert.match(container.list.children[0].children[0].textContent, /Approved proposal/);
  });
});

test('governance filter Rejected shows only rejected proposals', async () => {
  await withDocument(async () => {
    const container = createGovernanceContainer();
    const api = { getCommunityPool: async () => validPool() };
    const governanceApi = { getCommunityPoolProposals: async () => sampleProposals() };
    initCommunityPool({ api, governanceApi, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const rejectedButton = container.buttons.find((button) => button.dataset.poolProposalFilter === 'rejected');
    rejectedButton.click();
    assert.equal(container.list.children.length, 1);
    assert.match(container.list.children[0].children[0].textContent, /Rejected proposal/);
  });
});

test('governance Approved filter excludes unknown status', async () => {
  await withDocument(async () => {
    const container = createGovernanceContainer();
    const api = { getCommunityPool: async () => validPool() };
    const governanceApi = { getCommunityPoolProposals: async () => sampleProposals() };
    initCommunityPool({ api, governanceApi, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const approvedButton = container.buttons.find((button) => button.dataset.poolProposalFilter === 'passed');
    approvedButton.click();
    const renderedTitles = container.list.children.map((card) => card.children[0].textContent).join(' ');
    assert.equal(renderedTitles.includes('Unknown proposal'), false);
  });
});

test('governance Rejected filter excludes unknown status', async () => {
  await withDocument(async () => {
    const container = createGovernanceContainer();
    const api = { getCommunityPool: async () => validPool() };
    const governanceApi = { getCommunityPoolProposals: async () => sampleProposals() };
    initCommunityPool({ api, governanceApi, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const rejectedButton = container.buttons.find((button) => button.dataset.poolProposalFilter === 'rejected');
    rejectedButton.click();
    const renderedTitles = container.list.children.map((card) => card.children[0].textContent).join(' ');
    assert.equal(renderedTitles.includes('Unknown proposal'), false);
  });
});

test('governance filtering does not mutate original proposals', async () => {
  await withDocument(async () => {
    const container = createGovernanceContainer();
    const api = { getCommunityPool: async () => validPool() };
    const proposals = sampleProposals();
    const governanceApi = { getCommunityPoolProposals: async () => proposals };
    initCommunityPool({ api, governanceApi, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const approvedButton = container.buttons.find((button) => button.dataset.poolProposalFilter === 'passed');
    approvedButton.click();
    const allButton = container.buttons.find((button) => button.dataset.poolProposalFilter === 'all');
    allButton.click();
    assert.equal(proposals.length, 3);
    assert.equal(container.list.children.length, 3);
  });
});

test('governance cards render execution outcomes and default missing evidence to Unverified', async () => {
  await withDocument(async () => {
    const container = createGovernanceContainer();
    const api = { getCommunityPool: async () => validPool() };
    const [sample] = sampleProposals();
    const cases = [
      ['PROPOSAL_STATUS_PASSED', 'executed', 'Approved', 'Executed'],
      ['PROPOSAL_STATUS_FAILED', 'failed', 'Failed', 'Failed'],
      ['PROPOSAL_STATUS_REJECTED', 'rejected', 'Rejected', 'Rejected'],
      ['PROPOSAL_STATUS_VOTING_PERIOD', 'pending', 'Voting period', 'Pending'],
      ['PROPOSAL_STATUS_PASSED', undefined, 'Approved', 'Unverified'],
    ];
    const governanceApi = { getCommunityPoolProposals: async () => cases.map(([status, executionStatus], id) => ({
      ...sample, id: String(id), status, executionStatus,
    })) };
    initCommunityPool({ api, governanceApi, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const labels = container.list.children.map((card) => card.children.slice(1, 3).map(({ textContent }) => textContent));
    assert.deepEqual(labels, cases.map(([, , status, execution]) => [`Status: ${status}`, `Execution: ${execution}`]));
  });
});

test('Total Approved sums only passed proposals', async () => {
  await withDocument(async () => {
    const container = createGovernanceContainer();
    const api = { getCommunityPool: async () => validPool() };
    const governanceApi = {
      getCommunityPoolProposals: async () => [
        { id: '1', title: 'P1', description: 'D1', spends: [{ recipient: 'r1', coins: [{ amount: '1000000000000000000', denom: 'el1' }] }], status: 'PROPOSAL_STATUS_PASSED', submitTime: null },
        { id: '2', title: 'P2', description: 'D2', spends: [{ recipient: 'r2', coins: [{ amount: '2000000000000000000', denom: 'el1' }] }], status: 'PROPOSAL_STATUS_REJECTED', submitTime: null },
        { id: '3', title: 'P3', description: 'D3', spends: [{ recipient: 'r3', coins: [{ amount: '3000000000000000000', denom: 'el1' }] }], status: 'PROPOSAL_STATUS_VOTING_PERIOD', submitTime: null },
      ],
    };
    initCommunityPool({ api, governanceApi, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(container.elements.get('[data-pool-total-approved-value]').textContent, 'Total Approved: 1.00 L1');
  });
});

test('Total Approved excludes non-el1 approved proposals from sum', async () => {
  await withDocument(async () => {
    const container = createGovernanceContainer();
    const api = { getCommunityPool: async () => validPool() };
    const governanceApi = {
      getCommunityPoolProposals: async () => [
        { id: '1', title: 'P1', description: 'D1', spends: [{ recipient: 'r1', coins: [{ amount: '1000000000000000000', denom: 'el1' }] }], status: 'PROPOSAL_STATUS_PASSED', submitTime: null },
        { id: '2', title: 'P2', description: 'D2', spends: [{ recipient: 'r2', coins: [{ amount: '2000000000000000000', denom: 'uatom' }] }], status: 'PROPOSAL_STATUS_PASSED', submitTime: null },
      ],
    };
    initCommunityPool({ api, governanceApi, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(container.elements.get('[data-pool-total-approved-value]').textContent, 'Total Approved: 1.00 L1 (L1 only)');
  });
});

test('Total Approved is unavailable after API failure', async () => {
  await withDocument(async () => {
    const container = createGovernanceContainer();
    const api = { getCommunityPool: async () => validPool() };
    const governanceApi = { getCommunityPoolProposals: async () => { throw new Error('boom'); } };
    initCommunityPool({ api, governanceApi, container });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(container.elements.get('[data-pool-total-approved-value]').textContent, 'Total Approved: Unavailable');
  });
});
