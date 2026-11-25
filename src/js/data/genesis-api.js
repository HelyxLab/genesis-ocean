import { normalizeCosmosMessageAmounts } from './cosmos-normalizer.js';

export const GENESIS_API = Object.freeze({
  rest: 'https://1317.genesisl1.org',
  rpc: 'https://26657.genesisl1.org',
  chainId: 'genesis_29-2',
  denom: 'el1',
  decimals: 18,
});

const REQUEST_TIMEOUT_MS = 10_000;
const VALIDATOR_PAGE_SIZE = 200;
const MAX_VALIDATOR_PAGES = 50;
const DELEGATION_PAGE_SIZE = 200;
const MAX_DELEGATION_PAGES = 40;
const MAX_DELEGATOR_TRANSACTIONS = 50;
const BLOCK_WEBSOCKET_URL = 'wss://26657.genesisl1.org/websocket';
const BLOCK_SUBSCRIPTION_ID = 1;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const INITIAL_DAY_BLOCK_LOOKBACK = 7_200;
const COMMUNITY_POOL_QUERY = '/cosmos.distribution.v1beta1.Query/CommunityPool';
const POOL_SPEND_MESSAGE = '/cosmos.distribution.v1beta1.MsgCommunityPoolSpend';
const LEGACY_POOL_SPEND = '/cosmos.distribution.v1beta1.CommunityPoolSpendProposal';
const EXEC_LEGACY_CONTENT = '/cosmos.gov.v1.MsgExecLegacyContent';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, description) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Genesis L1 returned an incomplete ${description}.`);
  }
  return value;
}

function* readPoolProtoFields(bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const tag = bytes[offset++];
    if (tag < 10 || tag >= 128 || tag % 8 !== 2) throw new Error('Invalid community pool protobuf field.');

    let length = 0;
    for (let shift = 0; ; shift += 7) {
      if (offset >= bytes.length || shift > 28) throw new Error('Invalid community pool protobuf length.');
      const byte = bytes[offset++];
      length += (byte & 127) * 2 ** shift;
      if (byte < 128) break;
    }
    const end = offset + length;
    if (end > bytes.length) throw new Error('Truncated community pool protobuf field.');
    yield [tag >> 3, bytes.subarray(offset, end)];
    offset = end;
  }
}

function decodeCommunityPoolBalance(value) {
  const bytes = Uint8Array.from(atob(requireString(value, 'community pool balance')), (byte) => byte.charCodeAt(0));
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let poolAmount = null;
  // QueryCommunityPoolResponse.pool is a repeated DecCoin. A LegacyDec on the
  // wire is an integer scaled by 10^18 before applying the el1-to-L1 conversion.
  for (const [field, coin] of readPoolProtoFields(bytes)) {
    if (field !== 1) continue;
    const fields = new Map();
    for (const [coinField, data] of readPoolProtoFields(coin)) {
      if (fields.has(coinField)) throw new Error('Duplicate community pool coin field.');
      fields.set(coinField, decoder.decode(data));
    }
    const denom = fields.get(1);
    const amount = fields.get(2);
    if (!denom || !/^\d+$/.test(amount ?? '')) throw new Error('Invalid community pool coin.');
    if (denom !== GENESIS_API.denom) continue;
    if (poolAmount !== null) throw new Error('Duplicate Genesis L1 community pool balance.');
    poolAmount = amount;
  }
  if (poolAmount === null) throw new Error('Genesis L1 community pool balance is missing.');

  const decimals = 18 + GENESIS_API.decimals;
  const digits = poolAmount.replace(/^0+(?=\d)/, '').padStart(decimals + 1, '0');
  const fraction = digits.slice(-decimals).replace(/0+$/, '');
  return digits.slice(0, -decimals) + (fraction ? `.${fraction}` : '');
}

function comparePoolProposals(left, right) {
  const leftTime = Date.parse(left.submitTime ?? '');
  const rightTime = Date.parse(right.submitTime ?? '');
  if (Number.isNaN(leftTime) !== Number.isNaN(rightTime)) return Number.isNaN(leftTime) ? 1 : -1;
  if (leftTime !== rightTime && Number.isFinite(leftTime)) return rightTime - leftTime;
  if (Number.isFinite(leftTime)) {
    const subsecond = (time) => /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/i.exec(time)?.[1].padEnd(9, '0') ?? '';
    const leftFraction = subsecond(left.submitTime);
    const rightFraction = subsecond(right.submitTime);
    if (leftFraction !== rightFraction) return leftFraction > rightFraction ? -1 : 1;
  }
  const leftId = BigInt(left.id);
  const rightId = BigInt(right.id);
  return leftId === rightId ? 0 : leftId > rightId ? -1 : 1;
}

function getPoolSpendExecutionStatus({ status, messages }) {
  switch (status) {
    case 'PROPOSAL_STATUS_PASSED':
      // The Genesis SDK persists PASSED only after successful governance handlers
      // commit. Legacy migration wraps the original spend and preserves its status.
      return messages.some((message) => message?.['@type'] === POOL_SPEND_MESSAGE
        || (message?.['@type'] === EXEC_LEGACY_CONTENT && message.content?.['@type'] === LEGACY_POOL_SPEND))
        ? 'executed' : 'unverified';
    case 'PROPOSAL_STATUS_FAILED': return 'failed';
    case 'PROPOSAL_STATUS_REJECTED': return 'rejected';
    case 'PROPOSAL_STATUS_DEPOSIT_PERIOD':
    case 'PROPOSAL_STATUS_VOTING_PERIOD': return 'pending';
    default: return 'unverified';
  }
}

export function formatL1(amount) {
  if (typeof amount !== 'string' || !/^\d+$/.test(amount)) return null;
  const atoms = BigInt(amount);
  const scale = 10n ** BigInt(GENESIS_API.decimals);
  const displayScale = 10_000n;
  const rounded = (atoms * displayScale + scale / 2n) / scale;
  if (atoms > 0n && rounded === 0n) return '<0.0001 L1';
  const whole = rounded / displayScale;
  const fraction = (rounded % displayScale).toString().padStart(4, '0').replace(/0+$/, '');
  const wholeText = whole.toString();
  return `${wholeText}${fraction ? `.${fraction}` : ''} L1`;
}

export function createGenesisApi({ fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is not available in this browser.');

  async function getJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Genesis L1 request failed (${response.status}) at ${new URL(url).host}.`);
      try {
        return await response.json();
      } catch {
        throw new Error(`Genesis L1 returned invalid JSON from ${new URL(url).host}.`);
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`Genesis L1 request timed out at ${new URL(url).host}.`);
      if (error instanceof TypeError) {
        throw new Error(`Genesis L1 request could not reach ${new URL(url).host}; the endpoint may be offline or blocked by browser CORS.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function getNetworkIdentity() {
    const [restInfo, rpcStatus] = await Promise.all([
      getJson(`${GENESIS_API.rest}/cosmos/base/tendermint/v1beta1/node_info`),
      getJson(`${GENESIS_API.rpc}/status`),
    ]);
    const restChainId = restInfo?.default_node_info?.network;
    const rpcResult = rpcStatus?.result;
    const rpcChainId = rpcResult?.node_info?.network;
    const chainId = requireString(restChainId, 'Cosmos chain ID');
    if (chainId !== GENESIS_API.chainId || rpcChainId !== chainId) {
      throw new Error(`Unexpected or inconsistent chain ID (Cosmos REST: ${chainId}; Consensus RPC: ${rpcChainId ?? 'missing'}).`);
    }

    const syncInfo = rpcResult?.sync_info;
    const height = requireString(syncInfo?.latest_block_height, 'latest block height');
    if (!/^\d+$/.test(height)) throw new Error('Genesis L1 returned an invalid latest block height.');
    const time = requireString(syncInfo?.latest_block_time, 'latest block time');
    if (Number.isNaN(Date.parse(time))) throw new Error('Genesis L1 returned an invalid latest block time.');

    return { chainId, height, time };
  }


  function getPoolSpendContent(message) {
    if (!isRecord(message)) return null;
    if (message['@type'] === POOL_SPEND_MESSAGE) return message;
    const isLegacySpend = (content) => content?.['@type'] === LEGACY_POOL_SPEND;
    const content = message.content;
    if (isLegacySpend(content)) return content;
    if (typeof content?.['@type'] !== 'string' || !content['@type'].includes('MsgExecLegacyContent')) return null;
    return [content.msg, content.legacy_content, content.content, content.legacyContent].find(isLegacySpend) ?? null;
  }

  function normalizeCommunityPoolProposal(proposal) {
    if (!isRecord(proposal) || !Array.isArray(proposal.messages)) return null;
    const id = String(proposal.id ?? '');
    if (!/^\d+$/.test(id)) return null;

    const contents = proposal.messages.map(getPoolSpendContent).filter(Boolean);
    if (!contents.length) return null;
    const spends = [];
    for (const content of contents) {
      if (typeof content.recipient !== 'string' || !content.recipient || !Array.isArray(content.amount) || !content.amount.length
        || !content.amount.every((coin) => isRecord(coin) && typeof coin.denom === 'string' && coin.denom
          && typeof coin.amount === 'string' && /^\d+$/.test(coin.amount))) return null;
      spends.push({ recipient: content.recipient, coins: content.amount.map(({ amount, denom }) => ({ amount, denom })) });
    }
    const title = proposal.title || contents[0].title;
    const description = proposal.summary || contents[0].description;

    return {
      id,
      title: typeof title === 'string' && title.length > 0 ? title : 'Untitled proposal',
      description: typeof description === 'string' ? description : '',
      spends,
      status: typeof proposal.status === 'string' && proposal.status.length > 0 ? proposal.status : 'UNKNOWN',
      executionStatus: getPoolSpendExecutionStatus(proposal),
      submitTime: typeof proposal.submit_time === 'string' ? proposal.submit_time : null,
      depositEndTime: typeof proposal.deposit_end_time === 'string' ? proposal.deposit_end_time : null,
      votingStartTime: typeof proposal.voting_start_time === 'string' ? proposal.voting_start_time : null,
      votingEndTime: typeof proposal.voting_end_time === 'string' ? proposal.voting_end_time : null,
      yesCount: proposal.final_tally_result?.yes_count ?? null,
      noCount: proposal.final_tally_result?.no_count ?? null,
      abstainCount: proposal.final_tally_result?.abstain_count ?? null,
      vetoCount: proposal.final_tally_result?.no_with_veto_count ?? null,
    };
  }

  async function getCommunityPoolProposals({ maxPages = 10 } = {}) {
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 50) {
      throw new Error('maxPages must be an integer from 1 to 50.');
    }

    const proposals = [];
    const seenIds = new Set();
    let nextKey = null;
    let pagesFetched = 0;

    while (pagesFetched < maxPages) {
      const url = new URL(`${GENESIS_API.rest}/cosmos/gov/v1/proposals`);
      url.searchParams.set('pagination.limit', '100');
      url.searchParams.set('pagination.reverse', 'true');
      if (nextKey) url.searchParams.set('pagination.key', nextKey);

      const data = await getJson(url.toString());
      if (!isRecord(data) || !Array.isArray(data.proposals)) {
        throw new Error('Genesis L1 returned an incomplete governance proposal response.');
      }
      if (data.pagination !== undefined && data.pagination !== null && !isRecord(data.pagination)) {
        throw new Error('Genesis L1 returned an invalid governance proposal pagination cursor.');
      }

      for (const proposal of data.proposals) {
        const normalized = normalizeCommunityPoolProposal(proposal);
        if (normalized && !seenIds.has(normalized.id)) {
          seenIds.add(normalized.id);
          proposals.push(normalized);
        }
      }

      const cursor = isRecord(data.pagination) ? data.pagination.next_key : null;
      pagesFetched += 1;
      if (typeof cursor !== 'string' || cursor.length === 0) break;
      nextKey = cursor;
    }

    return proposals.sort(comparePoolProposals);
  }

  async function getPoolBlock(height) {
    const data = await getJson(`${GENESIS_API.rpc}/block?height=${height}`);
    const header = data?.result?.block?.header;
    const time = Date.parse(header?.time);
    if (header?.chain_id !== GENESIS_API.chainId || header.height !== String(height) || !Number.isFinite(time)) {
      throw new Error('Genesis L1 returned an invalid pool reference block.');
    }
    return { height, time };
  }

  async function getCommunityPoolBalance24h(snapshotHeight) {
    const height = Number(snapshotHeight);
    if (!/^\d+$/.test(String(snapshotHeight)) || !Number.isSafeInteger(height) || height < 2) {
      throw new Error('Invalid community pool snapshot height.');
    }

    const snapshot = await getPoolBlock(height);
    const cutoff = snapshot.time - DAY_MS;
    let newer = snapshot;
    let lookback = INITIAL_DAY_BLOCK_LOOKBACK;
    let older = await getPoolBlock(Math.max(1, height - lookback));
    while (older.time > cutoff && older.height > 1) {
      newer = older;
      lookback *= 2;
      older = await getPoolBlock(Math.max(1, height - lookback));
      if (older.time >= newer.time) throw new Error('Genesis L1 pool reference times are inconsistent.');
    }
    if (older.time > cutoff || newer.time <= cutoff) throw new Error('No block brackets the pool comparison time.');

    while (newer.height - older.height > 1) {
      const middle = await getPoolBlock(older.height + Math.floor((newer.height - older.height) / 2));
      if (middle.time <= older.time || middle.time >= newer.time) {
        throw new Error('Genesis L1 pool reference times are inconsistent.');
      }
      if (middle.time <= cutoff) older = middle;
      else newer = middle;
    }

    const params = new URLSearchParams({ path: JSON.stringify(COMMUNITY_POOL_QUERY), data: '0x', height: String(older.height) });
    const data = await getJson(`${GENESIS_API.rpc}/abci_query?${params}`);
    const response = data?.result?.response;
    if (response?.code !== 0 || response.height !== String(older.height)) {
      throw new Error('Genesis L1 could not verify the historical community pool balance.');
    }
    return { height: String(older.height), amountL1: decodeCommunityPoolBalance(response.value) };
  }

  function subscribeNewBlocks({ onBlock = () => {}, onStatus = () => {}, onGap = () => {} } = {}) {
    const WebSocketImpl = globalThis.WebSocket;
    const pageWindow = globalThis.window ?? globalThis;
    const pageDocument = globalThis.document;
    let stopped = false;
    let socket = null;
    let reconnectTimer = 0;
    let handshakeTimer = 0;
    let reconnectAttempt = 0;
    let connectionGeneration = 0;
    let lastHeight = null;
    let stableTimer = 0;

    const isOnline = () => globalThis.navigator?.onLine !== false;
    const isVisible = () => !pageDocument?.hidden;
    const canConnect = () => !stopped && isOnline() && isVisible();

    function setStatus(state, detail = null) {
      try { onStatus({ state, detail }); } catch (error) { console.error('Genesis block status callback failed.', error); }
    }

    function reportGap(fromHeight, toHeight, reason) {
      if (BigInt(toHeight) < BigInt(fromHeight)) return;
      const gap = { fromHeight, toHeight, count: (BigInt(toHeight) - BigInt(fromHeight) + 1n).toString(), reason };
      try { onGap(gap); } catch (error) { console.error('Genesis block gap callback failed.', error); }
    }

    function notifyBlock(block, pulse, source) {
      try { onBlock({ ...block, pulse, source }); } catch (error) { console.error('Genesis block callback failed.', error); }
    }

    function parseHeight(value) {
      if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
      if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
      return null;
    }

    function clearReconnectTimer() {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = 0;
    }

    function scheduleReconnect() {
      if (!canConnect() || reconnectTimer) return;
      setStatus('reconnecting');
      const ceiling = Math.min(RECONNECT_BASE_MS * (2 ** Math.min(reconnectAttempt, 5)), RECONNECT_MAX_MS);
      const delay = Math.round(ceiling * (0.8 + Math.random() * 0.4));
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = 0;
        connect();
      }, delay);
    }

    function applyLiveBlock(block) {
      const height = BigInt(block.height);
      if (lastHeight !== null && height <= lastHeight) return;
      if (lastHeight !== null && height > lastHeight + 1n) {
        reportGap((lastHeight + 1n).toString(), (height - 1n).toString(), 'websocket-height-gap');
      }
      lastHeight = height;
      notifyBlock(block, true, 'websocket');
    }

    function connect() {
      if (!canConnect() || socket) return;
      clearReconnectTimer();
      if (typeof WebSocketImpl !== 'function') {
        setStatus('unavailable', new Error('The browser does not provide the WebSocket API.'));
        scheduleReconnect();
        return;
      }

      const generation = ++connectionGeneration;
      let subscriptionAccepted = false;
      let baselineReady = false;
      let queuedBlocks = [];
      let ws;
      setStatus(lastHeight === null ? 'connecting' : 'reconnecting');

      try {
        ws = new WebSocketImpl(BLOCK_WEBSOCKET_URL);
      } catch (error) {
        setStatus('unavailable', error);
        scheduleReconnect();
        return;
      }
      socket = ws;

      const isCurrent = () => !stopped && generation === connectionGeneration && socket === ws;
      const closeFailedConnection = (error) => {
        if (!isCurrent()) return;
        if (error) console.warn('Genesis block WebSocket will reconnect.', error);
        try { ws.close(); } catch { /* The close event or reconnect timer will handle recovery. */ }
      };
      handshakeTimer = window.setTimeout(() => closeFailedConnection(new Error('WebSocket connection or height baseline timed out.')), REQUEST_TIMEOUT_MS);

      function activateIfReady() {
        if (!isCurrent() || !subscriptionAccepted || !baselineReady) return;
        if (handshakeTimer) clearTimeout(handshakeTimer);
        handshakeTimer = 0;
        if (!stableTimer) {
          stableTimer = window.setTimeout(() => {
            reconnectAttempt = 0;
            stableTimer = 0;
          }, 30_000);
        }
        setStatus('live');
        const pending = queuedBlocks;
        queuedBlocks = [];
        pending.sort((a, b) => (BigInt(a.height) < BigInt(b.height) ? -1 : BigInt(a.height) > BigInt(b.height) ? 1 : 0));
        for (const block of pending) applyLiveBlock(block);
      }

      ws.onopen = () => {
        if (!isCurrent()) return;
        try {
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'subscribe',
            id: BLOCK_SUBSCRIPTION_ID,
            params: { query: "tm.event='NewBlock'" },
          }));
        } catch (error) {
          closeFailedConnection(error);
          return;
        }

        getNetworkIdentity().then((identity) => {
          if (!isCurrent()) return;
          const baseline = parseHeight(identity.height);
          if (identity.chainId !== GENESIS_API.chainId || baseline === null) {
            closeFailedConnection(new Error('Genesis L1 returned an invalid WebSocket height baseline.'));
            return;
          }
          let baselineChanged = false;
          if (lastHeight === null) {
            lastHeight = baseline;
            baselineChanged = true;
          } else if (baseline > lastHeight) {
            reportGap((lastHeight + 1n).toString(), baseline.toString(), 'websocket-reconnect');
            lastHeight = baseline;
            baselineChanged = true;
          }
          baselineReady = true;
          if (baselineChanged) notifyBlock({ ...identity, height: lastHeight.toString() }, false, 'rpc-baseline');
          activateIfReady();
        }).catch(closeFailedConnection);
      };

      ws.onmessage = (event) => {
        if (!isCurrent()) return;
        let message;
        try {
          if (typeof event.data !== 'string') throw new Error('Expected a text WebSocket frame.');
          message = JSON.parse(event.data);
        } catch (error) {
          console.warn('Ignoring an invalid Genesis WebSocket message.', error);
          return;
        }

        if (message?.id === BLOCK_SUBSCRIPTION_ID && message.error) {
          closeFailedConnection(new Error(message.error.message || 'Genesis L1 rejected the NewBlock subscription.'));
          return;
        }
        if (message?.id === BLOCK_SUBSCRIPTION_ID && isRecord(message.result) && message.result.data === undefined) {
          subscriptionAccepted = true;
          activateIfReady();
          return;
        }

        const result = message?.result;
        const value = result?.data?.type === 'tendermint/event/NewBlock' ? result?.data?.value : null;
        if (!isRecord(value)) return;
        const header = value.block?.header;
        if (!isRecord(header)) return;
        const height = parseHeight(header.height);
        if (height === null) {
          console.warn('Ignoring a Genesis NewBlock event with an invalid height.');
          return;
        }
        if (header.chain_id && header.chain_id !== GENESIS_API.chainId) {
          closeFailedConnection(new Error(`Unexpected WebSocket chain ID: ${header.chain_id}.`));
          return;
        }
        const block = {
          chainId: header.chain_id || GENESIS_API.chainId,
          height: height.toString(),
          time: typeof header.time === 'string' && !Number.isNaN(Date.parse(header.time)) ? header.time : null,
        };
        if (!baselineReady || !subscriptionAccepted) {
          queuedBlocks.push(block);
          if (queuedBlocks.length > 1_000) queuedBlocks.shift();
          return;
        }
        applyLiveBlock(block);
      };

      ws.onerror = () => {
        if (isCurrent()) closeFailedConnection(new Error('Genesis block WebSocket connection failed.'));
      };

      ws.onclose = () => {
        if (socket === ws) socket = null;
        if (handshakeTimer) clearTimeout(handshakeTimer);
        if (stableTimer) clearTimeout(stableTimer);
        handshakeTimer = 0;
        stableTimer = 0;
        if (stopped) return;
        if (!isOnline()) setStatus('offline');
        else if (!isVisible()) setStatus('paused');
        else scheduleReconnect();
      };
    }

    function handleOffline() {
      clearReconnectTimer();
      setStatus('offline');
      if (socket) socket.close();
    }

    function handleOnline() {
      if (canConnect()) connect();
    }

    function handleVisibilityChange() {
      if (!isVisible()) {
        clearReconnectTimer();
        setStatus('paused');
        if (socket) socket.close();
      } else if (canConnect()) {
        connect();
      }
    }

    pageWindow.addEventListener?.('offline', handleOffline);
    pageWindow.addEventListener?.('online', handleOnline);
    pageDocument?.addEventListener('visibilitychange', handleVisibilityChange);
    if (!isOnline()) setStatus('offline');
    else if (!isVisible()) setStatus('paused');
    else connect();

    return () => {
      if (stopped) return;
      stopped = true;
      connectionGeneration += 1;
      clearReconnectTimer();
      if (handshakeTimer) clearTimeout(handshakeTimer);
      handshakeTimer = 0;
      if (stableTimer) clearTimeout(stableTimer);
      pageWindow.removeEventListener?.('offline', handleOffline);
      pageWindow.removeEventListener?.('online', handleOnline);
      pageDocument?.removeEventListener('visibilitychange', handleVisibilityChange);
      if (socket) {
        const activeSocket = socket;
        socket = null;
        activeSocket.onopen = null;
        activeSocket.onmessage = null;
        activeSocket.onerror = null;
        activeSocket.onclose = null;
        activeSocket.close(1000, 'Genesis Ocean closed the block stream.');
      }
    };
  }

  async function getValidators() {
    const validators = [];
    let nextKey = null;
    let page = 0;
    do {
      if (page >= MAX_VALIDATOR_PAGES) throw new Error('Genesis L1 validator pagination exceeded the safety limit.');
      const params = new URLSearchParams({ 'pagination.limit': String(VALIDATOR_PAGE_SIZE) });
      if (nextKey) params.set('pagination.key', nextKey);
      const response = await getJson(`${GENESIS_API.rest}/cosmos/staking/v1beta1/validators?${params}`);
      if (!isRecord(response) || !Array.isArray(response.validators) || !isRecord(response.pagination)
        || !Object.hasOwn(response.pagination, 'next_key')) {
        throw new Error('Genesis L1 returned an incomplete validator response.');
      }
      for (const validator of response.validators) {
        if (!isRecord(validator) || typeof validator.operator_address !== 'string'
          || typeof validator.status !== 'string' || typeof validator.jailed !== 'boolean') {
          throw new Error('Genesis L1 returned an incomplete validator record.');
        }
        if (validator.status !== 'BOND_STATUS_BONDED' || validator.jailed) continue;
        const tokens = typeof validator.tokens === 'string' && /^\d+$/.test(validator.tokens)
          ? validator.tokens
          : null;
        validators.push({
          operatorAddress: validator.operator_address,
          moniker: typeof validator.description?.moniker === 'string' ? validator.description.moniker : '',
          bondedAtoms: tokens,
          status: validator.status,
          jailed: validator.jailed,
          commissionRate: typeof validator.commission?.commission_rates?.rate === 'string'
            ? validator.commission.commission_rates.rate
            : null,
        });
      }
      nextKey = response.pagination.next_key;
      if (nextKey !== null && typeof nextKey !== 'string') {
        throw new Error('Genesis L1 returned an invalid validator pagination key.');
      }
      page += 1;
    } while (nextKey);

    return validators;
  }

  async function getValidatorDelegations(validatorAddress) {
    if (typeof validatorAddress !== 'string' || !validatorAddress.startsWith('genesisvaloper1')) {
      throw new Error('Invalid Genesis validator address.');
    }
    const delegations = [];
    let nextKey = null;
    let page = 0;
    do {
      if (page >= MAX_DELEGATION_PAGES) throw new Error('Genesis L1 delegation pagination exceeded the safety limit.');
      const params = new URLSearchParams({ 'pagination.limit': String(DELEGATION_PAGE_SIZE) });
      if (nextKey) params.set('pagination.key', nextKey);
      const response = await getJson(`${GENESIS_API.rest}/cosmos/staking/v1beta1/validators/${encodeURIComponent(validatorAddress)}/delegations?${params}`);
      if (!isRecord(response) || !Array.isArray(response.delegation_responses) || !isRecord(response.pagination)
        || !Object.hasOwn(response.pagination, 'next_key')) {
        throw new Error('Genesis L1 returned an incomplete delegation response.');
      }
      for (const entry of response.delegation_responses) {
        const delegation = entry?.delegation;
        const balance = entry?.balance;
        if (!isRecord(delegation) || typeof delegation.delegator_address !== 'string'
          || delegation.validator_address !== validatorAddress || !isRecord(balance)
          || balance.denom !== GENESIS_API.denom || typeof balance.amount !== 'string' || !/^\d+$/.test(balance.amount)) {
          throw new Error('Genesis L1 returned an incomplete or unexpected delegation record.');
        }
        if (BigInt(balance.amount) === 0n) continue;
        delegations.push({
          delegatorAddress: delegation.delegator_address,
          validatorAddress: delegation.validator_address,
          shares: typeof delegation.shares === 'string' ? delegation.shares : null,
          amountAtoms: balance.amount,
          denom: balance.denom,
        });
      }
      nextKey = response.pagination.next_key;
      if (nextKey !== null && typeof nextKey !== 'string') {
        throw new Error('Genesis L1 returned an invalid delegation pagination key.');
      }
      page += 1;
    } while (nextKey);
    return delegations;
  }

  async function getDelegatorTransactions(delegatorAddress) {
    if (typeof delegatorAddress !== 'string' || !delegatorAddress.startsWith('genesis1')) {
      throw new Error('Invalid Genesis delegator address.');
    }
    const params = new URLSearchParams({
      query: `message.sender='${delegatorAddress}'`,
      'pagination.limit': String(MAX_DELEGATOR_TRANSACTIONS),
      order_by: 'ORDER_BY_DESC',
    });
    const response = await getJson(`${GENESIS_API.rest}/cosmos/tx/v1beta1/txs?${params}`);
    if (!isRecord(response) || !Array.isArray(response.txs) || !Array.isArray(response.tx_responses)) {
      throw new Error('Genesis L1 returned an incomplete transaction response.');
    }
    const transactions = response.tx_responses.slice(0, MAX_DELEGATOR_TRANSACTIONS).map((result, index) => {
      if (!isRecord(result) || typeof result.txhash !== 'string' || typeof result.height !== 'string') {
        throw new Error('Genesis L1 returned an incomplete transaction record.');
      }
      const messages = result.tx?.body?.messages ?? response.txs[index]?.body?.messages;
      if (!Array.isArray(messages)) throw new Error('Genesis L1 returned a transaction without its message data.');
      const messageSummaries = messages.map((message) => {
        const { amounts, complete } = normalizeCosmosMessageAmounts(message);
        return { messageType: typeof message?.['@type'] === 'string' ? message['@type'] : null, amounts, amountsComplete: complete };
      });
      const types = [...new Set(messageSummaries.map(({ messageType }) => messageType?.split('.').at(-1).replace(/^Msg/, '')).filter(Boolean))];
      const typeLabels = { Delegate: 'Delegation', Undelegate: 'Undelegation', BeginRedelegate: 'Redelegation', Send: 'Transfer' };
      const single = messageSummaries.length === 1 ? messageSummaries[0] : null;
      const amount = single?.amountsComplete && single.amounts.length === 1 ? single.amounts[0] : null;
      return {
        hash: result.txhash,
        height: result.height,
        timestamp: typeof result.timestamp === 'string' ? result.timestamp : null,
        type: types.map((type) => typeLabels[type] || type).join(' + ') || 'Transaction',
        messages: messageSummaries,
        amountAtoms: amount?.denom === GENESIS_API.denom ? amount.integer : null,
        denom: amount?.denom === GENESIS_API.denom ? amount.denom : null,
        code: Number.isSafeInteger(result.code) && result.code >= 0 ? result.code : null,
      };
    });
    return {
      transactions,
      total: typeof response.total === 'string' && /^\d+$/.test(response.total) ? response.total : null,
    };
  }

  return Object.freeze({ getNetworkIdentity, subscribeNewBlocks, getValidators, getValidatorDelegations, getDelegatorTransactions, getCommunityPoolProposals, getCommunityPoolBalance24h });
}
