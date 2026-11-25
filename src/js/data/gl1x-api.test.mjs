import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGl1xApi,
  Gl1xApiError,
  paginateGl1xPages,
} from './gl1x-api.js';

const cosmosPage = {
  items: [{ hash: 'COSMOS_A', height: 140, index: 0, success: true, messages: ['/cosmos.bank.v1beta1.MsgSend'] }],
  next_page_params: null,
};
const evmPage = {
  items: [{ hash: '0xEVM_A', block_number: 140, position: 0, status: 'ok', result: 'success' }],
  next_page_params: null,
};

function jsonResponse(payload, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', Date: 'Wed, 11 Nov 2026 23:00:00 GMT', ETag: 'W/"fixture"', ...headers },
  });
}

function createApi(fetchImpl, options = {}) {
  return createGl1xApi({ fetchImpl, timeoutMs: 100, now: () => new Date('2026-11-11T23:00:01.000Z'), ...options });
}

test('accepts a valid Cosmos page and exposes HTTP freshness metadata', async () => {
  let request;
  const api = createApi(async (url, init) => {
    request = { url: new URL(url), init };
    return jsonResponse(cosmosPage);
  });

  const response = await api.listCosmosTransactions({ kind: 'cosmos' });
  assert.equal(response.data.items[0].hash, 'COSMOS_A');
  assert.equal(response.meta.source, 'gl1x-http');
  assert.equal(response.meta.etag, 'W/"fixture"');
  assert.equal(response.meta.serverTime, '2026-11-11T23:00:00.000Z');
  assert.equal(response.meta.filterApplication, 'unverified');
  assert.equal(request.init.method, 'GET');
  assert.equal(request.url.pathname, '/api/cosmos/txs');
  assert.equal(request.url.searchParams.get('kind'), 'cosmos');
  assert.equal(request.url.searchParams.has('limit'), false);
});

test('accepts an EVM page without coercing the result into Cosmos fields', async () => {
  const api = createApi(async () => jsonResponse(evmPage));
  const response = await api.listEvmTransactions({ filter: 'validated' });
  assert.equal(response.data.items[0].status, 'ok');
  assert.equal(response.data.items[0].result, 'success');
  assert.equal(response.meta.freshness.state, 'unknown');
});

test('queries Cosmos and EVM transaction detail routes with their observed payload shapes', async () => {
  const paths = [];
  const api = createApi(async (url) => {
    const parsed = new URL(url);
    paths.push(parsed.pathname);
    if (parsed.pathname.startsWith('/api/cosmos/txs/')) {
      return jsonResponse({ hash: 'COSMOS_A', code: 0, success: true, messages: ['/cosmos.bank.v1beta1.MsgSend'], events: [] });
    }
    return jsonResponse({ hash: '0xEVM_A', status: 'ok', result: 'success', block_number: 140 });
  });
  assert.equal((await api.getCosmosTransaction('COSMOS_A')).data.success, true);
  assert.equal((await api.getEvmTransaction('0xEVM_A')).data.result, 'success');
  assert.deepEqual(paths, ['/api/cosmos/txs/COSMOS_A', '/api/v2/transactions/0xEVM_A']);
});

test('queries account, token-transfer, log, and address transaction routes', async () => {
  const paths = [];
  const api = createApi(async (url) => {
    const parsed = new URL(url);
    paths.push(parsed.pathname);
    if (parsed.pathname.endsWith('/token-transfers')) {
      return jsonResponse({ items: [{ tx_hash: '0xEVM_A', log_index: 0 }], next_page_params: null });
    }
    if (parsed.pathname.endsWith('/logs')) {
      return jsonResponse({ items: [{ tx_hash: '0xEVM_A', index: 0 }], next_page_params: null });
    }
    return jsonResponse({ items: [{ hash: 'TX_A' }], next_page_params: null });
  });

  await api.getCosmosAccountTransactions('genesis1fixture');
  await api.getEvmTransactionTokenTransfers('0xEVM_A');
  await api.getEvmTransactionLogs('0xEVM_A');
  await api.getEvmAddressTransactions('0xwalletfixture', { filter: 'to' });
  assert.deepEqual(paths, [
    '/api/cosmos/accounts/genesis1fixture/txs',
    '/api/v2/transactions/0xEVM_A/token-transfers',
    '/api/v2/transactions/0xEVM_A/logs',
    '/api/v2/addresses/0xwalletfixture/transactions',
  ]);
});

test('queries Cosmos status and reports current height and freshness', async () => {
  const status = {
    freshness: { current: true, stalled: false, behind_chain: 0, chain_head: 123 },
    indexer: { head: 123, lag: 0, updated_at: '2026-11-11T22:59:59Z' },
    node: { latest_height: '123' },
  };
  const api = createApi(async () => jsonResponse(status));
  const response = await api.getCosmosStatus();
  assert.equal(response.meta.freshness.state, 'current');
  assert.equal(response.meta.freshness.chainHead, '123');
  assert.equal(response.meta.freshness.indexedHeight, 123);
});

test('queries EVM indexing status and marks unfinished indexing partial', async () => {
  const status = { finished_indexing: false, finished_indexing_blocks: true, indexed_blocks_ratio: '1.0000', indexed_internal_transactions_ratio: '0.9999' };
  const api = createApi(async () => jsonResponse(status));
  const response = await api.getEvmIndexingStatus();
  assert.equal(response.meta.freshness.state, 'partial');
});

const evmIndexingFreshnessCases = [
  ['unfinished block indexing is partial', {
    finished_indexing: true,
    finished_indexing_blocks: false,
    indexed_blocks_ratio: '1.0000',
    indexed_internal_transactions_ratio: '1.0000',
  }, 'partial'],
  ['block ratio below one is partial', {
    finished_indexing: true,
    finished_indexing_blocks: true,
    indexed_blocks_ratio: '0.9999',
    indexed_internal_transactions_ratio: '1.0000',
  }, 'partial'],
  ['internal transaction ratio below one is partial', {
    finished_indexing: true,
    finished_indexing_blocks: true,
    indexed_blocks_ratio: '1.0000',
    indexed_internal_transactions_ratio: '0.9999',
  }, 'partial'],
  ['all supplied completion indicators are current', {
    finished_indexing: true,
    finished_indexing_blocks: true,
    indexed_blocks_ratio: '1.0000',
    indexed_internal_transactions_ratio: '1.0000',
  }, 'current'],
  ['missing indicators are unknown', {}, 'unknown'],
  ['invalid indicators are unknown', {
    finished_indexing: true,
    finished_indexing_blocks: true,
    indexed_blocks_ratio: 'not-a-ratio',
    indexed_internal_transactions_ratio: null,
  }, 'unknown'],
];

for (const [description, status, expectedState] of evmIndexingFreshnessCases) {
  test(`classifies EVM index freshness when ${description}`, async () => {
    const api = createApi(async () => jsonResponse(status));
    const response = await api.getEvmIndexingStatus();
    assert.equal(response.meta.freshness.state, expectedState);
    assert.deepEqual(response.data, status);
  });
}

const invalidPageCursors = [
  ['empty object', {}],
  ['array', []],
  ['nested object value', { height: { nested: true } }],
  ['null value', { height: null }],
  ['scalar cursor', 'not-a-cursor'],
];
const directPageMethods = [
  ['Cosmos transaction list', (api) => api.listCosmosTransactions({ kind: 'cosmos' })],
  ['EVM token transfers', (api) => api.getEvmTransactionTokenTransfers('EVM_HASH')],
  ['EVM transaction logs', (api) => api.getEvmTransactionLogs('EVM_HASH')],
];

for (const [cursorDescription, cursor] of invalidPageCursors) {
  for (const [routeDescription, call] of directPageMethods) {
    test(`rejects ${cursorDescription} next_page_params from ${routeDescription}`, async () => {
      const api = createApi(async () => jsonResponse({ items: [], next_page_params: cursor }));
      await assert.rejects(call(api), (error) => error instanceof Gl1xApiError && error.type === 'invalid_payload');
    });
  }
}

test('paginates three pages using returned cursor objects as-is', async () => {
  const cursorOne = { height: 139, index: 2, items_count: 50, kind: 'cosmos' };
  const cursorTwo = { height: 138, index: 1, items_count: 100, kind: 'cosmos' };
  const calls = [];
  const pages = [
    { items: [{ hash: 'A' }], next_page_params: cursorOne },
    { items: [{ hash: 'B' }], next_page_params: cursorTwo },
    { items: [{ hash: 'C' }], next_page_params: null },
  ];
  const api = createApi(async (url) => {
    calls.push(new URL(url));
    return jsonResponse(pages[calls.length - 1]);
  });

  const result = await api.paginateCosmosTransactions({ kind: 'cosmos', maxPages: 3 });
  assert.deepEqual(result.items.map((item) => item.hash), ['A', 'B', 'C']);
  assert.equal(result.coverage.pagesFetched, 3);
  assert.equal(result.coverage.reason, 'cursor-exhausted');
  assert.equal(result.coverage.pagingFinished, true);
  assert.equal(result.coverage.historyComplete, false);
  assert.deepEqual(Object.fromEntries(calls[1].searchParams.entries()), Object.fromEntries(Object.entries(cursorOne).map(([key, value]) => [key, String(value)])));
  assert.deepEqual(Object.fromEntries(calls[2].searchParams.entries()), Object.fromEntries(Object.entries(cursorTwo).map(([key, value]) => [key, String(value)])));
});

test('deduplicates composite chain and transaction hashes across pages', async () => {
  let page = 0;
  const result = await paginateGl1xPages(async () => {
    page += 1;
    return {
      data: page === 1
        ? { items: [{ hash: 'ABC' }], next_page_params: { height: 1 } }
        : { items: [{ hash: 'abc' }, { hash: 'DEF' }], next_page_params: null },
      meta: { freshness: { state: 'unknown' }, lastValidResponse: null },
    };
  }, { chainId: 'cosmos:genesis_29-2', maxPages: 3 });

  assert.deepEqual(result.items.map((item) => item.hash), ['ABC', 'DEF']);
  assert.equal(result.coverage.duplicateCount, 1);
  assert.equal(result.coverage.itemCount, 3);
  assert.equal(result.coverage.uniqueItemCount, 2);
});

test('stops after a duplicate-only page when its cursor repeats', async () => {
  const cursor = { height: 1, index: 0 };
  let calls = 0;
  const result = await paginateGl1xPages(async () => {
    calls += 1;
    return {
      data: calls === 1
        ? { items: [{ hash: 'SAME' }], next_page_params: cursor }
        : { items: [{ hash: 'same' }], next_page_params: cursor },
      meta: { freshness: { state: 'unknown' } },
    };
  }, { maxPages: 5 });

  assert.equal(calls, 2);
  assert.equal(result.coverage.reason, 'repeated-cursor');
  assert.equal(result.coverage.duplicateCount, 1);
  assert.deepEqual(result.items.map((item) => item.hash), ['SAME']);
  assert.deepEqual(result.coverage.finalCursor, cursor);
});

test('continues after a duplicate-only page when the cursor advances', async () => {
  const cursorOne = { height: 1 };
  const cursorTwo = { height: 0 };
  let calls = 0;
  const result = await paginateGl1xPages(async () => {
    calls += 1;
    return {
      data: calls === 1
        ? { items: [{ hash: 'SAME' }], next_page_params: cursorOne }
        : calls === 2
          ? { items: [{ hash: 'same' }], next_page_params: cursorTwo }
          : { items: [{ hash: 'NEXT' }], next_page_params: null },
      meta: { freshness: { state: 'unknown' } },
    };
  }, { maxPages: 5 });

  assert.equal(calls, 3);
  assert.equal(result.coverage.reason, 'cursor-exhausted');
  assert.equal(result.coverage.duplicateCount, 1);
  assert.deepEqual(result.items.map((item) => item.hash), ['SAME', 'NEXT']);
});

test('continues after an empty page when its cursor advances', async () => {
  const cursorOne = { height: 1 };
  const cursorTwo = { height: 0 };
  let calls = 0;
  const result = await paginateGl1xPages(async () => {
    calls += 1;
    const data = calls === 1
      ? { items: [{ hash: 'FIRST' }], next_page_params: cursorOne }
      : calls === 2
        ? { items: [], next_page_params: cursorTwo }
        : { items: [{ hash: 'AFTER_EMPTY' }], next_page_params: null };
    return { data, meta: { freshness: { state: 'unknown' } } };
  }, { maxPages: 4 });

  assert.equal(calls, 3);
  assert.equal(result.coverage.reason, 'cursor-exhausted');
  assert.deepEqual(result.items.map((item) => item.hash), ['FIRST', 'AFTER_EMPTY']);
});

test('continues normally while pages contain new transactions', async () => {
  let calls = 0;
  const result = await paginateGl1xPages(async () => {
    calls += 1;
    return {
      data: calls === 1
        ? { items: [{ hash: 'FIRST' }], next_page_params: { height: 1 } }
        : { items: [{ hash: 'SECOND' }], next_page_params: null },
      meta: { freshness: { state: 'unknown' } },
    };
  }, { maxPages: 3 });

  assert.equal(calls, 2);
  assert.equal(result.coverage.reason, 'cursor-exhausted');
  assert.deepEqual(result.items.map((item) => item.hash), ['FIRST', 'SECOND']);
});

test('stops on an invalid next cursor', async () => {
  const result = await paginateGl1xPages(async () => ({
    data: { items: [{ hash: 'FIRST' }], next_page_params: { height: { nested: true } } },
    meta: { freshness: { state: 'unknown' } },
  }));

  assert.equal(result.coverage.reason, 'invalid-page');
  assert.equal(result.coverage.pagesFetched, 1);
  assert.equal(result.meta.lastError.type, 'invalid_payload');
});

test('an absent next cursor ends paging but does not claim complete history', async () => {
  const result = await paginateGl1xPages(async () => ({
    data: cosmosPage,
    meta: { freshness: { state: 'unknown' } },
  }));
  assert.equal(result.coverage.reason, 'cursor-exhausted');
  assert.equal(result.coverage.pagingFinished, true);
  assert.equal(result.coverage.historyComplete, false);
  assert.equal(result.coverage.finalCursor, null);
});

test('can resume pagination from the exact stored cursor', async () => {
  const cursor = { block_number: 100, filter: 'validated', index: 0, items_count: 50 };
  let receivedCursor;
  const result = await paginateGl1xPages(async (nextCursor) => {
    receivedCursor = nextCursor;
    return {
      data: { items: [{ hash: 'RESUMED' }], next_page_params: null },
      meta: { freshness: { state: 'unknown' } },
    };
  }, { startCursor: cursor, maxPages: 1 });
  assert.equal(receivedCursor, cursor);
  assert.equal(result.coverage.pagesFetched, 1);
  assert.equal(result.items[0].hash, 'RESUMED');
});

test('preserves a valid response as stale after a network error', async () => {
  let calls = 0;
  const api = createApi(async () => {
    calls += 1;
    if (calls === 2) throw new TypeError('Network failure');
    return jsonResponse(cosmosPage);
  });
  await api.listCosmosTransactions({ kind: 'cosmos' });
  const stale = await api.listCosmosTransactions({ kind: 'cosmos' });
  assert.equal(stale.data.items[0].hash, 'COSMOS_A');
  assert.equal(stale.meta.freshness.state, 'stale');
  assert.equal(stale.meta.lastError.type, 'network');
  assert.equal(stale.meta.lastValidResponse.etag, 'W/"fixture"');
});

test('classifies network failures when no valid response is cached', async () => {
  const api = createApi(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(api.getCosmosStatus(), (error) => error instanceof Gl1xApiError && error.type === 'network');
});

test('classifies DNS failures when the runtime exposes a resolver error code', async () => {
  const cause = new Error('getaddrinfo ENOTFOUND gl1x.com');
  cause.code = 'ENOTFOUND';
  const api = createApi(async () => { throw new TypeError('fetch failed', { cause }); });
  await assert.rejects(api.getCosmosStatus(), (error) => error instanceof Gl1xApiError && error.type === 'dns');
});

test('classifies request timeout', async () => {
  const api = createApi((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  }), { timeoutMs: 5 });
  await assert.rejects(api.getCosmosStatus(), (error) => error instanceof Gl1xApiError && error.type === 'timeout');
});

for (const status of [400, 429, 500, 502, 503]) {
  test(`classifies HTTP ${status} and retains Retry-After when present`, async () => {
    const api = createApi(async () => new Response('{}', { status, headers: { 'Retry-After': '7' } }));
    await assert.rejects(api.getCosmosStatus(), (error) => (
      error instanceof Gl1xApiError && error.type === 'http' && error.status === status && error.retryAfterMs === 7000
    ));
  });
}

test('classifies invalid JSON', async () => {
  const api = createApi(async () => new Response('{', { status: 200 }));
  await assert.rejects(api.getCosmosStatus(), (error) => error instanceof Gl1xApiError && error.type === 'invalid_json');
});

test('classifies an incomplete payload', async () => {
  const api = createApi(async () => jsonResponse({ items: [] }));
  await assert.rejects(api.listCosmosTransactions(), (error) => error instanceof Gl1xApiError && error.type === 'invalid_payload');
});

test('does not accept a page-size parameter or invalid filters as client defaults', async () => {
  const api = createApi(async () => jsonResponse(cosmosPage));
  assert.throws(() => api.listCosmosTransactions({ kind: 'invalid' }), TypeError);
  assert.throws(() => api.listEvmTransactions({ filter: 'invalid' }), TypeError);
  assert.throws(() => api.getEvmAddressTransactions('0xPUBLIC', { filter: 'invalid' }), TypeError);
});

const helyxOperatorAddress = 'genesisvaloper1tzqmp8ed3e6rgqrfscekg87pe5hd90n0ax4ghd';

test('getValidator fetches one compact record and keeps the indexed delegator count', async () => {
  let requests = 0;
  const api = createApi(async (input) => {
    requests += 1;
    const url = new URL(input);
    assert.equal(url.pathname, `/api/validators/${helyxOperatorAddress}`);
    assert.equal(url.searchParams.get('limit'), '1');
    return jsonResponse({
      operator_address: helyxOperatorAddress, moniker: '✦Helyx✦', status: 'BOND_STATUS_BONDED', jailed: false,
      tokens: '531822233105591323104041', commission_rate: '0.100000000000000000', delegator_count: 509,
      delegations: { items: [{}] }, snapshot_current: true,
    });
  });

  const { data, meta } = await api.getValidator(helyxOperatorAddress);
  assert.equal(requests, 1);
  assert.deepEqual(data, {
    operatorAddress: helyxOperatorAddress, moniker: '✦Helyx✦', status: 'BOND_STATUS_BONDED', jailed: false,
    stakeAtoms: '531822233105591323104041', commissionRate: '0.100000000000000000', delegatorCount: 509,
    snapshotCurrent: true,
  });
  assert.equal(meta.freshness.state, 'current');
});

test('getValidator keeps missing metrics unknown and rejects mismatched validator data', async () => {
  const partial = createApi(async () => jsonResponse({
    operator_address: helyxOperatorAddress, tokens: 'bad', commission_rate: '2', delegator_count: 0, snapshot_current: false,
  }));
  const { data, meta } = await partial.getValidator(helyxOperatorAddress);
  assert.deepEqual([data.moniker, data.status, data.stakeAtoms, data.commissionRate, data.delegatorCount], [null, null, null, null, 0]);
  assert.equal(meta.freshness.state, 'stale');

  const wrong = createApi(async () => jsonResponse({ operator_address: 'another-validator' }));
  await assert.rejects(wrong.getValidator(helyxOperatorAddress), /mismatched validator record/);
});

test('getCommunityPool returns balance from valid API response', async () => {
  const api = createApi(async () => jsonResponse({ balances: [{ denom: 'el1', amount: '1000000000000000000000' }], percent_of_total_supply: 10, total_supply: '10000000000000000000000', snapshot_height: 123, updated_at: '2026-01-01T00:00:00.000Z' }));
  const pool = await api.getCommunityPool();
  assert.equal(pool.denom, 'el1');
  assert.equal(pool.amountL1, '1000');
  assert.equal(pool.percent, 10);
  assert.equal(pool.totalSupply, '10000');
  assert.equal(pool.snapshotHeight, '123');
  assert.equal(pool.updatedAt, '2026-01-01T00:00:00.000Z');
});

test('getCommunityPool preserves decimal amount values exactly', async () => {
  const api = createApi(async () => jsonResponse({ balances: [{ denom: 'el1', amount: '5640826085750621737405369.279382947184666240' }], percent_of_total_supply: 11.5, total_supply: '48229033212914850144633449', snapshot_height: 14043539, updated_at: '2026-11-17T02:01:58.877Z' }));
  const pool = await api.getCommunityPool();
  assert.equal(pool.denom, 'el1');
  assert.equal(pool.amountL1, '5640826.08575062173740536927938294718466624');
  assert.equal(pool.percent, 11.5);
  assert.equal(pool.totalSupply, '48229033.212914850144633449');
  assert.equal(pool.snapshotHeight, '14043539');
  assert.equal(pool.updatedAt, '2026-11-17T02:01:58.877Z');
});

test('getCommunityPool throws on unexpected response structure', async () => {
  const api = createApi(async () => jsonResponse({ not_balances: [] }));
  await assert.rejects(api.getCommunityPool(), /incomplete community pool response/);
});

test('getCommunityPool throws when balances is not an array', async () => {
  const api = createApi(async () => jsonResponse({ balances: 'not-an-array' }));
  await assert.rejects(api.getCommunityPool(), /incomplete community pool response/);
});

test('getCommunityPool throws when el1 denom is missing', async () => {
  const api = createApi(async () => jsonResponse({ balances: [{ denom: 'stake', amount: '100' }] }));
  await assert.rejects(api.getCommunityPool(), /incomplete community pool balance/);
});

test('getCommunityPool throws on invalid amount value', async () => {
  const api = createApi(async () => jsonResponse({ balances: [{ denom: 'el1', amount: 'not-a-number' }] }));
  await assert.rejects(api.getCommunityPool(), /invalid community pool amount/);
});

test('getCommunityPool throws on amount with invalid characters', async () => {
  const api = createApi(async () => jsonResponse({ balances: [{ denom: 'el1', amount: '12.34.56' }] }));
  await assert.rejects(api.getCommunityPool(), /invalid community pool amount/);
});

test('getCommunityPool propagates HTTP errors', async () => {
  const api = createApi(async () => jsonResponse({ error: 'not found' }, { status: 404 }));
  await assert.rejects(api.getCommunityPool());
});

test('getCommunityPool handles network failure', async () => {
  const api = createApi(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(api.getCommunityPool(), /could not reach/);
});

test('getCommunityPool handles timeout', async () => {
  const api = createApi((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  }), { timeoutMs: 5 });
  await assert.rejects(api.getCommunityPool(), /timed out/);
});

test('getCommunityPool throws when percent_of_total_supply is missing', async () => {
  const api = createApi(async () => jsonResponse({ balances: [{ denom: 'el1', amount: '1000000000000000000000' }], total_supply: '10000000000000000000000', snapshot_height: 123, updated_at: '2026-01-01T00:00:00.000Z' }));
  await assert.rejects(api.getCommunityPool(), /invalid community pool percentage/);
});

test('getCommunityPool throws when percent_of_total_supply is invalid', async () => {
  const api = createApi(async () => jsonResponse({ balances: [{ denom: 'el1', amount: '1000000000000000000000' }], percent_of_total_supply: 'bad', total_supply: '10000000000000000000000', snapshot_height: 123, updated_at: '2026-01-01T00:00:00.000Z' }));
  await assert.rejects(api.getCommunityPool(), /invalid community pool percentage/);
});

test('getCommunityPool throws when total_supply is missing', async () => {
  const api = createApi(async () => jsonResponse({ balances: [{ denom: 'el1', amount: '1000000000000000000000' }], percent_of_total_supply: 10, snapshot_height: 123, updated_at: '2026-01-01T00:00:00.000Z' }));
  await assert.rejects(api.getCommunityPool(), /invalid community pool total supply/);
});

test('getCommunityPool throws when total_supply is invalid', async () => {
  const api = createApi(async () => jsonResponse({ balances: [{ denom: 'el1', amount: '1000000000000000000000' }], percent_of_total_supply: 10, total_supply: 'bad', snapshot_height: 123, updated_at: '2026-01-01T00:00:00.000Z' }));
  await assert.rejects(api.getCommunityPool(), /invalid community pool total supply/);
});

test('getCommunityPool throws when snapshot_height is missing', async () => {
  const api = createApi(async () => jsonResponse({ balances: [{ denom: 'el1', amount: '1000000000000000000000' }], percent_of_total_supply: 10, total_supply: '10000000000000000000000', updated_at: '2026-01-01T00:00:00.000Z' }));
  await assert.rejects(api.getCommunityPool(), /invalid community pool snapshot height/);
});

test('getCommunityPool throws when snapshot_height is invalid', async () => {
  const api = createApi(async () => jsonResponse({ balances: [{ denom: 'el1', amount: '1000000000000000000000' }], percent_of_total_supply: 10, total_supply: '10000000000000000000000', snapshot_height: 'bad', updated_at: '2026-01-01T00:00:00.000Z' }));
  await assert.rejects(api.getCommunityPool(), /invalid community pool snapshot height/);
});

test('getCommunityPool throws when updated_at is missing', async () => {
  const api = createApi(async () => jsonResponse({ balances: [{ denom: 'el1', amount: '1000000000000000000000' }], percent_of_total_supply: 10, total_supply: '10000000000000000000000', snapshot_height: 123 }));
  await assert.rejects(api.getCommunityPool(), /invalid community pool update time/);
});

test('getCommunityPool throws when updated_at is invalid', async () => {
  const api = createApi(async () => jsonResponse({ balances: [{ denom: 'el1', amount: '1000000000000000000000' }], percent_of_total_supply: 10, total_supply: '10000000000000000000000', snapshot_height: 123, updated_at: '' }));
  await assert.rejects(api.getCommunityPool(), /invalid community pool update time/);
});
