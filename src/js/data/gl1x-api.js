export const GL1X_API_BASE_URL = 'https://gl1x.com';
export const GL1X_CHAIN_ID = 'genesis_29-2';
export const GL1X_EVM_CHAIN_ID = 'eip155:29';

const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_PAGES = 10;
const MAX_PAGES = 100;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, description) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Gl1xApiError('invalid_payload', `GL1X returned an incomplete ${description}.`);
  }
  return value;
}

function requirePage(value, description) {
  if (!isRecord(value) || !Array.isArray(value.items) || !Object.hasOwn(value, 'next_page_params')) {
    throw new Gl1xApiError('invalid_payload', `GL1X returned an incomplete ${description} page.`);
  }
  if (value.next_page_params !== null && !isValidPageCursor(value.next_page_params)) {
    throw new Gl1xApiError('invalid_payload', `GL1X returned an invalid ${description} cursor.`);
  }
  for (const item of value.items) {
    if (!isRecord(item) || typeof item.hash !== 'string' || item.hash.length === 0) {
      throw new Gl1xApiError('invalid_payload', `GL1X returned an incomplete ${description} item.`);
    }
  }
  return value;
}

function requireTokenTransferPage(value) {
  if (!isRecord(value) || !Array.isArray(value.items) || !Object.hasOwn(value, 'next_page_params')
    || (value.next_page_params !== null && !isValidPageCursor(value.next_page_params))) {
    throw new Gl1xApiError('invalid_payload', 'GL1X returned an incomplete EVM token transfer response.');
  }
  for (const item of value.items) {
    if (!isRecord(item) || (typeof item.transaction_hash !== 'string' && typeof item.tx_hash !== 'string')) {
      throw new Gl1xApiError('invalid_payload', 'GL1X returned an incomplete EVM token transfer.');
    }
  }
  return value;
}

function requireTransaction(value, description) {
  if (!isRecord(value) || typeof value.hash !== 'string' || value.hash.length === 0) {
    throw new Gl1xApiError('invalid_payload', `GL1X returned an incomplete ${description}.`);
  }
  return value;
}

function getHeader(headers, name) {
  try {
    return headers?.get?.(name) ?? null;
  } catch {
    return null;
  }
}

function toIsoString(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseRetryAfter(value, nowMs) {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Math.max(0, Math.ceil(Number(value) * 1000));
  const retryAt = Date.parse(value);
  return Number.isNaN(retryAt) ? null : Math.max(0, retryAt - nowMs);
}

function serializeError(error) {
  if (error instanceof Gl1xApiError) {
    return {
      type: error.type,
      message: error.message,
      status: error.status,
      retryAfterMs: error.retryAfterMs,
    };
  }
  return { type: 'unknown', message: 'An unexpected GL1X client error occurred.', status: null, retryAfterMs: null };
}

function isDnsFailure(error) {
  const dnsCodes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_NONAME', 'ENODATA', 'ERR_NAME_NOT_RESOLVED']);
  const visited = new Set();
  let current = error;
  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current);
    if (dnsCodes.has(current.code)) return true;
    if (typeof current.message === 'string' && /getaddrinfo|name not resolved|could not resolve host|name resolution/i.test(current.message)) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

function appendQuery(url, params) {
  if (!params) return url;
  if (!isRecord(params)) throw new TypeError('GL1X query parameters must be an object.');
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new TypeError(`GL1X query parameter ${key} must be a scalar value.`);
    }
    url.searchParams.append(key, String(value));
  }
  return url;
}

function validateCursor(cursor) {
  if (cursor !== null && cursor !== undefined && !isValidPageCursor(cursor)) {
    throw new TypeError('The GL1X cursor must be a valid next_page_params object returned by the API.');
  }
  return cursor ?? null;
}

function isValidPageCursor(cursor) {
  if (!isRecord(cursor) || Object.keys(cursor).length === 0) return false;
  return Object.values(cursor).every((value) => (
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  ));
}

function getCosmosFreshness(data) {
  const reported = isRecord(data?.freshness) ? data.freshness : {};
  let state = 'unknown';
  if (reported.stalled === true || Number(reported.behind_chain) > 0 || Number(data?.indexer?.lag) > 0) {
    state = 'stale';
  } else if (reported.current === true && reported.stalled === false) {
    state = 'current';
  }
  return {
    state,
    chainHead: data?.node?.latest_height ?? reported.chain_head ?? null,
    indexedHeight: data?.indexer?.head ?? null,
    reportedAt: data?.indexer?.updated_at ?? reported.head_updated_at ?? null,
  };
}

function getEvmIndexingFreshness(data) {
  const flagKeys = ['finished_indexing', 'finished_indexing_blocks'];
  const ratioKeys = ['indexed_blocks_ratio', 'indexed_internal_transactions_ratio'];
  let incomplete = false;
  let invalid = false;

  for (const key of flagKeys) {
    if (!Object.hasOwn(data, key)) continue;
    if (typeof data[key] !== 'boolean') invalid = true;
    else if (data[key] === false) incomplete = true;
  }

  for (const key of ratioKeys) {
    if (!Object.hasOwn(data, key)) continue;
    const value = data[key];
    if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') {
      invalid = true;
      continue;
    }
    const ratio = Number(value);
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) invalid = true;
    else if (ratio < 1) incomplete = true;
  }

  let state = 'unknown';
  if (incomplete) state = 'partial';
  else if (!invalid && flagKeys.every((key) => data[key] === true)) state = 'current';
  return {
    state,
    chainHead: null,
    indexedHeight: null,
    reportedAt: null,
  };
}

export class Gl1xApiError extends Error {
  constructor(type, message, { status = null, retryAfterMs = null, cause = undefined } = {}) {
    super(message, { cause });
    this.name = 'Gl1xApiError';
    this.type = type;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Creates a read-only GL1X HTTP client. Successful calls return { data, meta }.
 * A failed refresh returns the last validated response marked stale, when one
 * exists for the same resource and cursor; otherwise it throws Gl1xApiError.
 */
function atomsToL1(atoms) {
  const negative = atoms.startsWith('-');
  const source = negative ? atoms.slice(1) : atoms;
  const [whole, fraction = ''] = source.split('.');
  const digits = (whole + fraction).replace(/^0+(?=\d)/, '') || '0';
  const totalFractionDigits = fraction.length + 18;
  const padded = digits.padStart(totalFractionDigits + 1, '0');
  const integerPart = padded.slice(0, padded.length - totalFractionDigits);
  const fractionalPart = padded.slice(padded.length - totalFractionDigits).replace(/0+$/, '');
  const result = fractionalPart ? `${integerPart}.${fractionalPart}` : integerPart;
  return negative ? `-${result}` : result;
}

export function createGl1xApi({
  baseUrl = GL1X_API_BASE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
  now = () => new Date(),
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is not available in this environment.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs must be a positive number.');
  const normalizedBase = String(baseUrl).replace(/\/+$/, '');
  const lastValidResponses = new Map();

  function currentTime() {
    const value = now();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new TypeError('The GL1X client clock returned an invalid time.');
    return date;
  }

  async function fetchJson(url) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response?.ok) {
        const responseTime = currentTime().getTime();
        const retryAfter = parseRetryAfter(getHeader(response?.headers, 'Retry-After'), responseTime);
        throw new Gl1xApiError(
          'http',
          `GL1X request failed with HTTP ${response?.status ?? 'unknown'}.`,
          { status: Number.isInteger(response?.status) ? response.status : null, retryAfterMs: retryAfter },
        );
      }

      let data;
      try {
        data = await response.json();
      } catch (error) {
        throw new Gl1xApiError('invalid_json', 'GL1X returned invalid JSON.', { cause: error });
      }
      return {
        data,
        http: {
          status: response.status,
          serverTime: toIsoString(getHeader(response.headers, 'Date')),
          etag: getHeader(response.headers, 'ETag'),
          lastModified: getHeader(response.headers, 'Last-Modified'),
        },
      };
    } catch (error) {
      if (error instanceof Gl1xApiError) throw error;
      if (timedOut || error?.name === 'AbortError') {
        throw new Gl1xApiError(
          timedOut ? 'timeout' : 'aborted',
          timedOut ? 'The GL1X request timed out.' : 'The GL1X request was aborted.',
          { cause: error },
        );
      }
      if (isDnsFailure(error)) {
        throw new Gl1xApiError('dns', 'The GL1X hostname could not be resolved.', { cause: error });
      }
      throw new Gl1xApiError('network', 'The GL1X request could not reach the service.', { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function readResource(endpoint, path, query, validate, freshness = () => ({ state: 'unknown' })) {
    const url = appendQuery(new URL(`${normalizedBase}${path}`), query).toString();
    const resourceKey = `${endpoint}:${url}`;
    try {
      const response = await fetchJson(url);
      const data = validate(response.data);
      const receivedAt = currentTime().toISOString();
      const lastValidResponse = {
        receivedAt,
        serverTime: response.http.serverTime,
        etag: response.http.etag,
        lastModified: response.http.lastModified,
      };
      const result = {
        data,
        meta: {
          source: 'gl1x-http',
          endpoint,
          queriedAt: receivedAt,
          serverTime: response.http.serverTime,
          httpStatus: response.http.status,
          etag: response.http.etag,
          lastModified: response.http.lastModified,
          queryParameters: Object.keys(query ?? {}),
          filterApplication: ['kind', 'type', 'filter', 'method'].some((key) => Object.hasOwn(query ?? {}, key))
            ? 'unverified'
            : 'not-applicable',
          emptyResultMeaning: Array.isArray(data?.items) && data.items.length === 0 ? 'inconclusive' : null,
          freshness: freshness(data),
          lastError: null,
          lastValidResponse,
        },
      };
      lastValidResponses.set(resourceKey, result);
      return result;
    } catch (error) {
      const apiError = error instanceof Gl1xApiError
        ? error
        : new Gl1xApiError('request', 'The GL1X request could not be completed.', { cause: error });
      const lastValid = lastValidResponses.get(resourceKey);
      if (!lastValid) throw apiError;
      const queriedAt = currentTime().toISOString();
      return {
        data: lastValid.data,
        meta: {
          ...lastValid.meta,
          queriedAt,
          freshness: { ...lastValid.meta.freshness, state: 'stale' },
          lastError: serializeError(apiError),
          lastValidResponse: lastValid.meta.lastValidResponse,
        },
      };
    }
  }

  function queryForPage(filters, cursor) {
    const nextCursor = validateCursor(cursor);
    // A returned cursor is passed through as its own query object, without
    // mixing it with filters or adding a page-size parameter.
    return nextCursor ?? filters;
  }

  function getValidator(operatorAddress) {
    if (typeof operatorAddress !== 'string' || !/^genesisvaloper1[023456789acdefghjklmnpqrstuvwxyz]{38}$/.test(operatorAddress)) {
      throw new TypeError('A Genesis L1 validator operator address is required.');
    }
    return readResource('validator', `/api/validators/${operatorAddress}`, { limit: 1 }, (data) => {
      if (!isRecord(data) || data.operator_address !== operatorAddress) {
        throw new Gl1xApiError('invalid_payload', 'GL1X returned a mismatched validator record.');
      }

      return {
        operatorAddress,
        moniker: typeof data.moniker === 'string' ? data.moniker.trim() || null : null,
        status: typeof data.status === 'string' ? data.status : null,
        jailed: typeof data.jailed === 'boolean' ? data.jailed : null,
        stakeAtoms: typeof data.tokens === 'string' && /^\d+$/.test(data.tokens) ? data.tokens : null,
        commissionRate: typeof data.commission_rate === 'string' && /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(data.commission_rate)
          ? data.commission_rate : null,
        delegatorCount: Number.isSafeInteger(data.delegator_count) && data.delegator_count >= 0 ? data.delegator_count : null,
        snapshotCurrent: typeof data.snapshot_current === 'boolean' ? data.snapshot_current : null,
      };
    }, ({ snapshotCurrent }) => ({ state: snapshotCurrent === true ? 'current' : snapshotCurrent === false ? 'stale' : 'unknown' }));
  }

  async function getCommunityPool() {
    const response = await readResource(
      'community-pool',
      '/api/community-pool',
      null,
      (data) => {
        if (!isRecord(data) || !Array.isArray(data.balances)) {
          throw new Gl1xApiError('invalid_payload', 'GL1X returned an incomplete community pool response.');
        }

        const balance = data.balances.find(
          (item) => isRecord(item) && item.denom === 'el1',
        );

        if (!balance || typeof balance.amount !== 'string') {
          throw new Gl1xApiError('invalid_payload', 'GL1X returned an incomplete community pool balance.');
        }

        if (!/^\d+(\.\d+)?$/.test(balance.amount)) {
          throw new Gl1xApiError('invalid_payload', 'GL1X returned an invalid community pool amount.');
        }

        if (typeof data.percent_of_total_supply !== 'number' || !Number.isFinite(data.percent_of_total_supply)) {
          throw new Gl1xApiError('invalid_payload', 'GL1X returned an invalid community pool percentage.');
        }

        if (typeof data.total_supply !== 'string' || !/^\d+(\.\d+)?$/.test(data.total_supply)) {
          throw new Gl1xApiError('invalid_payload', 'GL1X returned an invalid community pool total supply.');
        }

        if (!Number.isInteger(data.snapshot_height) || data.snapshot_height < 0) {
          throw new Gl1xApiError('invalid_payload', 'GL1X returned an invalid community pool snapshot height.');
        }

        if (typeof data.updated_at !== 'string' || data.updated_at.length === 0) {
          throw new Gl1xApiError('invalid_payload', 'GL1X returned an invalid community pool update time.');
        }

        return {
          denom: 'el1',
          amountL1: atomsToL1(balance.amount),
          percent: data.percent_of_total_supply,
          totalSupply: atomsToL1(data.total_supply),
          snapshotHeight: String(data.snapshot_height),
          updatedAt: data.updated_at,
        };
      },
    );

    return response.data;
  }

  function getCosmosStatus() {
    return readResource('cosmos-status', '/api/cosmos/status', null, (data) => {
      if (!isRecord(data) || !isRecord(data.freshness) || !isRecord(data.indexer) || !isRecord(data.node)) {
        throw new Gl1xApiError('invalid_payload', 'GL1X returned an incomplete Cosmos status response.');
      }
      return data;
    }, getCosmosFreshness);
  }
  function getEvmIndexingStatus() {
    return readResource('evm-indexing-status', '/api/v2/main-page/indexing-status', null, (data) => {
      if (!isRecord(data)) {
        throw new Gl1xApiError('invalid_payload', 'GL1X returned an incomplete EVM indexing status response.');
      }
      return data;
    }, getEvmIndexingFreshness);
  }

  function listCosmosTransactions({ kind, type, cursor = null } = {}) {
    const filters = {};
    if (kind !== undefined) {
      if (!['cosmos', 'evm', 'all'].includes(kind)) throw new TypeError('kind must be cosmos, evm, or all.');
      filters.kind = kind;
    }
    if (type !== undefined) filters.type = requireString(type, 'Cosmos transaction type');
    return readResource(
      'cosmos-transactions',
      '/api/cosmos/txs',
      queryForPage(filters, cursor),
      (data) => requirePage(data, 'Cosmos transaction'),
    );
  }

  function getCosmosTransaction(hash) {
    const transactionHash = requireString(hash, 'Cosmos transaction hash');
    return readResource(
      'cosmos-transaction-detail',
      `/api/cosmos/txs/${encodeURIComponent(transactionHash)}`,
      null,
      (data) => {
        const transaction = requireTransaction(data, 'Cosmos transaction detail');
        if (!Array.isArray(transaction.messages) || !Array.isArray(transaction.events)
          || typeof transaction.success !== 'boolean' || typeof transaction.code !== 'number') {
          throw new Gl1xApiError('invalid_payload', 'GL1X returned an incomplete Cosmos transaction detail.');
        }
        return transaction;
      },
    );
  }

  function getCosmosAccountTransactions(address, { cursor = null } = {}) {
    const accountAddress = requireString(address, 'Cosmos account address');
    return readResource(
      'cosmos-account-transactions',
      `/api/cosmos/accounts/${encodeURIComponent(accountAddress)}/txs`,
      queryForPage({}, cursor),
      (data) => requirePage(data, 'Cosmos account transaction'),
    );
  }

  function listEvmTransactions({ filter, type, method, cursor = null } = {}) {
    const filters = {};
    if (filter !== undefined) {
      if (!['validated', 'pending'].includes(filter)) throw new TypeError('filter must be validated or pending.');
      filters.filter = filter;
    }
    if (type !== undefined) filters.type = requireString(type, 'EVM transaction type');
    if (method !== undefined) filters.method = requireString(method, 'EVM transaction method');
    return readResource(
      'evm-transactions',
      '/api/v2/transactions',
      queryForPage(filters, cursor),
      (data) => requirePage(data, 'EVM transaction'),
    );
  }

  function getEvmTransaction(hash) {
    const transactionHash = requireString(hash, 'EVM transaction hash');
    return readResource(
      'evm-transaction-detail',
      `/api/v2/transactions/${encodeURIComponent(transactionHash)}`,
      null,
      (data) => {
        const transaction = requireTransaction(data, 'EVM transaction detail');
        if (typeof transaction.status !== 'string' || typeof transaction.result !== 'string') {
          throw new Gl1xApiError('invalid_payload', 'GL1X returned an incomplete EVM transaction detail.');
        }
        return transaction;
      },
    );
  }

  function getEvmTransactionTokenTransfers(hash) {
    const transactionHash = requireString(hash, 'EVM transaction hash');
    return readResource(
      'evm-transaction-token-transfers',
      `/api/v2/transactions/${encodeURIComponent(transactionHash)}/token-transfers`,
      null,
      requireTokenTransferPage,
    );
  }

  function getEvmTransactionLogs(hash) {
    const transactionHash = requireString(hash, 'EVM transaction hash');
    return readResource(
      'evm-transaction-logs',
      `/api/v2/transactions/${encodeURIComponent(transactionHash)}/logs`,
      null,
      (data) => {
        if (!isRecord(data) || !Array.isArray(data.items)
          || !Object.hasOwn(data, 'next_page_params')
          || (data.next_page_params !== null && !isValidPageCursor(data.next_page_params))) {
          throw new Gl1xApiError('invalid_payload', 'GL1X returned an incomplete EVM transaction logs response.');
        }
        return data;
      },
    );
  }

  function getEvmAddressTransactions(address, { filter, cursor = null } = {}) {
    const accountAddress = requireString(address, 'EVM account address');
    const filters = {};
    if (filter !== undefined) {
      if (!['from', 'to'].includes(filter)) throw new TypeError('filter must be from or to.');
      filters.filter = filter;
    }
    return readResource(
      'evm-address-transactions',
      `/api/v2/addresses/${encodeURIComponent(accountAddress)}/transactions`,
      queryForPage(filters, cursor),
      (data) => requirePage(data, 'EVM address transaction'),
    );
  }

  async function paginateCosmosTransactions(options = {}) {
    return paginateGl1xPages(
      (cursor) => {
        if (cursor === null) {
          return listCosmosTransactions({ kind: options.kind, type: options.type });
        }
        return listCosmosTransactions({ cursor });
      },
      {
        chainId: 'cosmos:genesis_29-2',
        maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
        startCursor: options.startCursor ?? options.cursor ?? null,
      },
    );
  }

  async function paginateCosmosAccountTransactions(address, options = {}) {
    return paginateGl1xPages(
      (cursor) => {
        if (cursor === null) {
          return getCosmosAccountTransactions(address);
        }
        return getCosmosAccountTransactions(address, { cursor });
      },
      {
        chainId: 'cosmos:genesis_29-2',
        maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
        startCursor: options.startCursor ?? options.cursor ?? null,
      },
    );
  }

  async function paginateEvmTransactions(options = {}) {
    return paginateGl1xPages(
      (cursor) => {
        if (cursor === null) {
          return listEvmTransactions({ filter: options.filter, type: options.type, method: options.method });
        }
        return listEvmTransactions({ cursor });
      },
      {
        chainId: GL1X_EVM_CHAIN_ID,
        maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
        startCursor: options.startCursor ?? options.cursor ?? null,
      },
    );
  }

  async function paginateEvmAddressTransactions(address, options = {}) {
    return paginateGl1xPages(
      (cursor) => {
        if (cursor === null) {
          return getEvmAddressTransactions(address, { filter: options.filter });
        }
        return getEvmAddressTransactions(address, { cursor });
      },
      {
        chainId: GL1X_EVM_CHAIN_ID,
        maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
        startCursor: options.startCursor ?? options.cursor ?? null,
      },
    );
  }

  return Object.freeze({
    getValidator,
    getCommunityPool,
    getCosmosStatus,
    getEvmIndexingStatus,
    listCosmosTransactions,
    getCosmosTransaction,
    getCosmosAccountTransactions,
    listEvmTransactions,
    getEvmTransaction,
    getEvmTransactionTokenTransfers,
    getEvmTransactionLogs,
    getEvmAddressTransactions,
    paginateCosmosTransactions,
    paginateCosmosAccountTransactions,
    paginateEvmTransactions,
    paginateEvmAddressTransactions,
  });
}

function cursorSignature(cursor) {
  if (!isRecord(cursor)) return null;
  return JSON.stringify(Object.keys(cursor).sort().map((key) => [key, cursor[key]]));
}

function transactionKey(chainId, transaction) {
  if (!isRecord(transaction) || typeof transaction.hash !== 'string') return null;
  return `${chainId}:${transaction.hash.toLowerCase()}`;
}

/**
 * Traverses a bounded number of pages. A missing cursor only means that the
 * endpoint ended this result set; it does not establish complete chain history.
 */
export async function paginateGl1xPages(fetchPage, {
  chainId = GL1X_CHAIN_ID,
  maxPages = DEFAULT_MAX_PAGES,
  startCursor = null,
} = {}) {
  if (typeof fetchPage !== 'function') throw new TypeError('fetchPage must be a function.');
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > MAX_PAGES) {
    throw new RangeError(`maxPages must be an integer from 1 to ${MAX_PAGES}.`);
  }

  const items = [];
  const seenTransactions = new Set();
  const seenCursors = new Set();
  const pageMeta = [];
  let duplicateCount = 0;
  let pagesFetched = 0;
  let finalCursor = null;
  let reason = 'page-limit';
  let error = null;
  let cursor = validateCursor(startCursor);
  let pagingFinished = false;

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const signature = cursorSignature(cursor);
    if (signature !== null && seenCursors.has(signature)) {
      reason = 'repeated-cursor';
      finalCursor = cursor;
      break;
    }
    if (signature !== null) seenCursors.add(signature);

    let response;
    try {
      response = await fetchPage(cursor);
    } catch (cause) {
      reason = 'request-error';
      finalCursor = cursor;
      error = serializeError(cause);
      break;
    }

    if (!isRecord(response) || !isRecord(response.meta) || !isRecord(response.data)
      || !Array.isArray(response.data.items) || !Object.hasOwn(response.data, 'next_page_params')) {
      reason = 'invalid-page';
      finalCursor = cursor;
      error = { type: 'invalid_payload', message: 'A paginated GL1X response had an unexpected shape.', status: null, retryAfterMs: null };
      break;
    }

    if (response.meta.freshness?.state === 'stale') {
      reason = 'stale-page';
      finalCursor = cursor;
      error = response.meta.lastError ?? null;
      break;
    }

    pagesFetched += 1;
    pageMeta.push(response.meta);
    for (const item of response.data.items) {
      const key = transactionKey(chainId, item);
      if (key === null) {
        reason = 'invalid-page';
        error = { type: 'invalid_payload', message: 'A GL1X page item did not contain a transaction hash.', status: null, retryAfterMs: null };
        finalCursor = cursor;
        break;
      }
      if (seenTransactions.has(key)) {
        duplicateCount += 1;
        continue;
      }
      seenTransactions.add(key);
      items.push(item);
    }
    if (reason === 'invalid-page') break;

    const nextCursor = response.data.next_page_params;
    if (nextCursor !== null && !isValidPageCursor(nextCursor)) {
      reason = 'invalid-page';
      finalCursor = cursor;
      error = { type: 'invalid_payload', message: 'A GL1X page returned an invalid next_page_params value.', status: null, retryAfterMs: null };
      break;
    }
    if (nextCursor === null) {
      reason = 'cursor-exhausted';
      finalCursor = null;
      pagingFinished = true;
      break;
    }
    const nextSignature = cursorSignature(nextCursor);
    if (nextSignature !== null && seenCursors.has(nextSignature)) {
      reason = 'repeated-cursor';
      finalCursor = nextCursor;
      break;
    }
    cursor = nextCursor;
    finalCursor = nextCursor;
  }

  return {
    items,
    coverage: {
      pagingFinished,
      historyComplete: false,
      reason,
      pagesFetched,
      itemCount: items.length + duplicateCount,
      uniqueItemCount: items.length,
      duplicateCount,
      finalCursor,
    },
    meta: {
      source: 'gl1x-http',
      chainId,
      freshness: pageMeta.some((entry) => entry.freshness?.state === 'partial') ? 'partial' : 'unknown',
      responses: pageMeta,
      lastError: error,
      lastValidResponse: pageMeta.at(-1)?.lastValidResponse ?? null,
    },
  };
}
