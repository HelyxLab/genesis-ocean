import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenesisApi, GENESIS_API, formatL1 } from './genesis-api.js';

function jsonResponse(payload, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      Date: 'Wed, 11 Nov 2026 23:00:00 GMT',
      ETag: 'W/\"fixture\"',
      ...headers,
    },
  });
}


test('createGenesisApi validates required fetch dependency', () => {
  assert.throws(() => createGenesisApi({ fetchImpl: null }), Error);
});

test('GENESIS_API configuration is correct', () => {
  assert.equal(GENESIS_API.rest, 'https://1317.genesisl1.org');
  assert.equal(GENESIS_API.chainId, 'genesis_29-2');
  assert.equal(GENESIS_API.denom, 'el1');
  assert.equal(GENESIS_API.decimals, 18);
});

test('formatL1 handles integer atom strings', () => {
  const result = formatL1('1000000000000000000000');
  assert.equal(result, '1000 L1');
});

test('formatL1 returns null for invalid input', () => {
  assert.equal(formatL1(''), null);
  assert.equal(formatL1('abc'), null);
  assert.equal(formatL1('12.34'), null);
});

test('indexed sender summaries preserve bank-send arrays, denom boundaries, and message order', async () => {
  const native = { amount: '26000000000000000000000', denom: 'el1' };
  const other = { amount: '9007199254740993', denom: 'ibc/ABC' };
  const send = (...amount) => ({ '@type': '/cosmos.bank.v1beta1.MsgSend', amount });
  const transaction = (...messages) => ({ body: { messages } });
  const single = transaction(send(native));
  const mixed = transaction(send(native, other));
  const multi = transaction(send(native, other), send({ amount: '0', denom: 'el1' }));
  const api = createGenesisApi({ fetchImpl: async (input) => {
    assert.equal(new URL(input).searchParams.get('query'), "message.sender='genesis1fixture'");
    return jsonResponse({ txs: [multi, mixed, single], tx_responses: [
      { txhash: 'A', tx: single, height: '10', code: 0 },
      { txhash: 'B', height: '9', code: 0 },
      { txhash: 'C', tx: multi, height: '8', code: 0 },
    ] });
  } });

  const { transactions: [a, b, c] } = await api.getDelegatorTransactions('genesis1fixture');
  assert.deepEqual([a.amountAtoms, a.denom], [native.amount, 'el1']);
  assert.equal(b.amountAtoms, null);
  assert.deepEqual(b.messages[0].amounts, [{ integer: native.amount, denom: 'el1' }, { integer: other.amount, denom: 'ibc/ABC' }]);
  assert.equal(c.amountAtoms, null);
  assert.deepEqual(c.messages.map(({ amounts }) => amounts.map(({ integer }) => integer)), [[native.amount, other.amount], ['0']]);
});
test('getCommunityPoolProposals sorts all pages by submission time then numeric ID', async () => {
  const makeProposal = (id, submitTime) => ({
    id,
    title: `Proposal ${id}`,
    summary: 'Spending proposal',
    submit_time: submitTime,
    messages: [{
      '@type': '/cosmos.distribution.v1beta1.MsgCommunityPoolSpend',
      recipient: 'recipient',
      amount: [{ amount: '1', denom: 'el1' }, { amount: '200', denom: 'uatom' }],
    }],
  });
  const fetchImpl = async (url) => {
    const { searchParams } = new URL(url);
    assert.equal(searchParams.get('pagination.reverse'), 'true');
    if (searchParams.get('pagination.key') === 'cursor1') {
      return jsonResponse({ proposals: [makeProposal('2', '2026-11-25T10:00:00.000002Z'), makeProposal('12', '2026-11-24T10:00:00Z')], pagination: { next_key: '' } });
    }
    return jsonResponse({ proposals: [makeProposal('99', 'invalid'), makeProposal('30', '2026-11-25T10:00:00.000001Z'), makeProposal('9', '2026-11-24T10:00:00Z')], pagination: { next_key: 'cursor1' } });
  };
  const api = createGenesisApi({ fetchImpl });
  const result = await api.getCommunityPoolProposals();
  assert.deepEqual(result.map(({ id }) => id), ['2', '30', '12', '9', '99']);
  assert.equal(result[0].title, 'Proposal 2');
  assert.equal(result[0].description, 'Spending proposal');
  assert.deepEqual(result[0].spends, [{ recipient: 'recipient', coins: [{ amount: '1', denom: 'el1' }, { amount: '200', denom: 'uatom' }] }]);
});

test('getCommunityPoolProposals deduplicates proposals across pages', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('pagination.key=cursor1')) {
      return jsonResponse({ proposals: [{ id: '1', messages: [{ content: { '@type': '/cosmos.distribution.v1beta1.CommunityPoolSpendProposal', title: 'P1', description: 'D1', recipient: 'r1', amount: [{ amount: '1', denom: 'el1' }] } }], status: 'PROPOSAL_STATUS_PASSED' }], pagination: { next_key: '' } });
    }
    return jsonResponse({ proposals: [{ id: '1', messages: [{ content: { '@type': '/cosmos.distribution.v1beta1.CommunityPoolSpendProposal', title: 'P1', description: 'D1', recipient: 'r1', amount: [{ amount: '1', denom: 'el1' }] } }], status: 'PROPOSAL_STATUS_PASSED' }], pagination: { next_key: 'cursor1' } });
  };
  const api = createGenesisApi({ fetchImpl });
  const result = await api.getCommunityPoolProposals();
  assert.equal(result.length, 1);
});

test('getCommunityPoolProposals fails on intermediate page', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('pagination.key=cursor1')) {
      return jsonResponse({ proposals: [] }, { status: 500 });
    }
    return jsonResponse({ proposals: [{ id: '1', messages: [{ content: { '@type': '/cosmos.distribution.v1beta1.CommunityPoolSpendProposal', title: 'P1', description: 'D1', recipient: 'r1', amount: [{ amount: '1', denom: 'el1' }] } }], status: 'PROPOSAL_STATUS_PASSED' }], pagination: { next_key: 'cursor1' } });
  };
  const api = createGenesisApi({ fetchImpl });
  await assert.rejects(() => api.getCommunityPoolProposals(), Error);
});

test('getCommunityPoolProposals handles invalid payload', async () => {
  const fetchImpl = async () => jsonResponse({ proposals: 'bad' });
  const api = createGenesisApi({ fetchImpl });
  await assert.rejects(() => api.getCommunityPoolProposals(), Error);
});

test('getCommunityPoolProposals preserves unknown status', async () => {
  const fetchImpl = async () => jsonResponse({ proposals: [{ id: '1', messages: [{ content: { '@type': '/cosmos.distribution.v1beta1.CommunityPoolSpendProposal', title: 'P1', description: 'D1', recipient: 'r1', amount: [{ amount: '1', denom: 'el1' }] } }], status: 'PROPOSAL_STATUS_VOTING_PERIOD' }], pagination: { next_key: '' } });
  const api = createGenesisApi({ fetchImpl });
  const result = await api.getCommunityPoolProposals();
  assert.equal(result[0].status, 'PROPOSAL_STATUS_VOTING_PERIOD');
});

test('getCommunityPoolProposals rejects invalid amount', async () => {
  const fetchImpl = async () => jsonResponse({ proposals: [{ id: '1', messages: [{ content: { '@type': '/cosmos.distribution.v1beta1.CommunityPoolSpendProposal', title: 'P1', description: 'D1', recipient: 'r1', amount: [{ amount: '1.5', denom: 'el1' }] } }], status: 'PROPOSAL_STATUS_PASSED' }], pagination: { next_key: '' } });
  const api = createGenesisApi({ fetchImpl });
  const result = await api.getCommunityPoolProposals();
  assert.equal(result.length, 0);
});

test('getCommunityPoolProposals returns empty list', async () => {
  const fetchImpl = async () => jsonResponse({ proposals: [], pagination: { next_key: '' } });
  const api = createGenesisApi({ fetchImpl });
  const result = await api.getCommunityPoolProposals();
  assert.deepEqual(result, []);
});

test('getCommunityPoolProposals respects maxPages', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({ proposals: [{ id: String(calls), messages: [{ content: { '@type': '/cosmos.distribution.v1beta1.CommunityPoolSpendProposal', title: 'P', description: 'D', recipient: 'r', amount: [{ amount: '1', denom: 'el1' }] } }], status: 'PROPOSAL_STATUS_PASSED' }], pagination: { next_key: 'next' } });
  };
  const api = createGenesisApi({ fetchImpl });
  const result = await api.getCommunityPoolProposals({ maxPages: 2 });
  assert.equal(calls, 2);
  assert.equal(result.length, 2);
});

test('getCommunityPoolProposals unpacks MsgExecLegacyContent', async () => {
  const fetchImpl = async () => jsonResponse({ proposals: [{ id: '1', messages: [{ content: { '@type': '/cosmos.gov.v1.MsgExecLegacyContent', msg: { '@type': '/cosmos.distribution.v1beta1.CommunityPoolSpendProposal', title: 'P1', description: 'D1', recipient: 'r1', amount: [{ amount: '1', denom: 'el1' }] } } }], status: 'PROPOSAL_STATUS_PASSED' }], pagination: { next_key: '' } });
  const api = createGenesisApi({ fetchImpl });
  const result = await api.getCommunityPoolProposals();
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'P1');
  assert.equal(result[0].executionStatus, 'unverified');
});

test('only passed executable spending messages establish successful execution', async () => {
  const spend = { recipient: 'recipient', amount: [{ amount: '1', denom: 'el1' }] };
  const direct = { '@type': '/cosmos.distribution.v1beta1.MsgCommunityPoolSpend', ...spend };
  const legacyContent = { '@type': '/cosmos.distribution.v1beta1.CommunityPoolSpendProposal', ...spend };
  const legacy = { '@type': '/cosmos.gov.v1.MsgExecLegacyContent', content: legacyContent };
  const text = { '@type': '/cosmos.gov.v1.MsgExecLegacyContent', content: { '@type': '/cosmos.gov.v1beta1.TextProposal', ...spend } };
  const proposals = [
    { id: '1', status: 'PROPOSAL_STATUS_PASSED', messages: [direct] },
    { id: '2', status: 'PROPOSAL_STATUS_PASSED', messages: [legacy] },
    { id: '3', status: 'PROPOSAL_STATUS_PASSED', messages: [text] },
    { id: '4', status: 'PROPOSAL_STATUS_PASSED', messages: [{ '@type': '/custom.MsgUnknown', content: legacyContent }] },
    { id: '5', status: 'PROPOSAL_STATUS_FAILED', messages: [direct] },
    { id: '6', status: 'PROPOSAL_STATUS_REJECTED', messages: [legacy] },
    { id: '7', status: 'PROPOSAL_STATUS_DEPOSIT_PERIOD', messages: [direct] },
    { id: '8', status: 'PROPOSAL_STATUS_VOTING_PERIOD', messages: [legacy] },
    { id: '9', status: 'PROPOSAL_STATUS_UNSPECIFIED', messages: [direct] },
  ];
  let requests = 0;
  const api = createGenesisApi({ fetchImpl: async () => {
    requests += 1;
    return jsonResponse({ proposals, pagination: { next_key: null } });
  } });
  const result = await api.getCommunityPoolProposals();
  assert.deepEqual(Object.fromEntries(result.map(({ id, executionStatus }) => [id, executionStatus])), {
    1: 'executed', 2: 'executed', 4: 'unverified', 5: 'failed', 6: 'rejected', 7: 'pending', 8: 'pending', 9: 'unverified',
  });
  assert.equal(requests, 1);
});

const historicalPoolWire = 'CjIKA2VsMRIrNTY2NDk4OTA2ODcxNTgzMjc5NzA1NTEyMDAwNjQ5NjE2MTAyMzQzNTkzOQ==';

function createPoolHistoryFixture({ responseHeight = '4240', value = historicalPoolWire, chainId = GENESIS_API.chainId } = {}) {
  const blockHeights = [];
  const api = createGenesisApi({ fetchImpl: async (url) => {
    const request = new URL(url);
    const height = Number(request.searchParams.get('height'));
    if (request.pathname === '/block') {
      blockHeights.push(height);
      const time = new Date(Date.UTC(2026, 10, 25, 15, 30) + (height - 10000) * 15001);
      return jsonResponse({ result: { block: { header: { chain_id: chainId, height: String(height), time: time.toISOString() } } } });
    }
    assert.equal(request.pathname, '/abci_query');
    assert.equal(request.searchParams.get('path'), '"/cosmos.distribution.v1beta1.Query/CommunityPool"');
    assert.equal(request.searchParams.get('data'), '0x');
    assert.equal(height, 4240);
    return jsonResponse({ result: { response: { code: 0, height: responseHeight, value } } });
  } });
  return { api, blockHeights };
}

test('historical pool balance uses the last block at or before the snapshot cutoff and decodes the live wire format exactly', async () => {
  const { api, blockHeights } = createPoolHistoryFixture();
  assert.deepEqual(await api.getCommunityPoolBalance24h('10000'), {
    height: '4240',
    amountL1: '5664989.068715832797055120006496161023435939',
  });
  assert.equal(blockHeights[0], 10000);
  assert.ok(blockHeights.includes(4240) && blockHeights.includes(4241));
});

test('historical pool balance rejects an incorrect network, mismatched height or truncated amount', async () => {
  const mismatched = createPoolHistoryFixture({ responseHeight: '4241' });
  await assert.rejects(mismatched.api.getCommunityPoolBalance24h('10000'), /verify the historical/);
  const wrongChain = createPoolHistoryFixture({ chainId: 'wrong-chain' });
  await assert.rejects(wrongChain.api.getCommunityPoolBalance24h('10000'), /invalid pool reference block/);
  const truncated = createPoolHistoryFixture({ value: 'CjI=' });
  await assert.rejects(truncated.api.getCommunityPoolBalance24h('10000'), /Truncated/);
});
