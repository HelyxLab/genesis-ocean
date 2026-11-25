/**
 * Pure transaction view model shared by the Universe transaction records and
 * the contextual transaction card.
 *
 * This module deliberately performs no network access and imports no client or
 * normalizer. It composes the existing Genesis discovery summary with a safe
 * projection of the existing Cosmos normalized detail. Raw provider messages,
 * events, and top-level `raw` payloads are never stored in a record.
 */

/**
 * Coverage of the current Genesis discovery query. It is explicit because the
 * query uses `message.sender` and is capped at 50 records; it is not a complete
 * account history.
 */
export const GENESIS_TRANSACTION_COVERAGE = Object.freeze({
  direction: 'outgoing',
  limit: 50,
  complete: false,
});

/**
 * Detail states:
 * - `not-loaded`: the record exists but no Cosmos request has started.
 * - `loading`: a request is in flight; any previous normalized detail is kept.
 * - `available`: the normalized result and metadata are current.
 * - `stale`: the normalized result is last-valid; provider error is retained.
 * - `unavailable`: GL1X explicitly returned no transaction for the hash.
 * - `error`: the request failed; previous last-valid detail is retained.
 */
export const TRANSACTION_DETAIL_STATES = Object.freeze({
  NOT_LOADED: 'not-loaded',
  LOADING: 'loading',
  AVAILABLE: 'available',
  STALE: 'stale',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error',
});

const DISCOVERY_SOURCE = 'genesis-l1';
const DISCOVERY_ENDPOINT = '/cosmos/tx/v1beta1/txs';
const DISCOVERY_QUERY = 'message.sender';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function integerCode(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function atomString(value) {
  return typeof value === 'string' && /^\d+$/.test(value) ? value : null;
}

function copyCoverage() {
  return { ...GENESIS_TRANSACTION_COVERAGE };
}

function emptyDetail(state = TRANSACTION_DETAIL_STATES.NOT_LOADED) {
  return {
    state,
    normalized: null,
    meta: null,
    error: null,
  };
}

function requireRecord(record) {
  if (!isRecord(record) || !nonEmptyString(record.hash)) {
    throw new TypeError('A TransactionRecord with a non-empty hash is required.');
  }
  if (!isRecord(record.detail)) {
    throw new TypeError('A TransactionRecord must contain a detail object.');
  }
  return record;
}

function replaceDetail(record, detail) {
  return deepFreeze({
    ...record,
    block: { ...record.block },
    discovery: {
      ...record.discovery,
      coverage: { ...record.discovery.coverage },
    },
    detail,
  });
}

function errorSnapshot(error) {
  if (!error) return null;
  return {
    type: nonEmptyString(error.type) ?? nonEmptyString(error.name) ?? 'unknown',
    message: nonEmptyString(error.message) ?? 'Unknown error',
    status: Number.isInteger(error.status) ? error.status : null,
    retryAfterMs: Number.isFinite(error.retryAfterMs) ? error.retryAfterMs : null,
  };
}

const EVIDENCE_FIELDS = Object.freeze([
  'source',
  'msgIndex',
  'msgIndexStatus',
  'eventIndex',
  'rawEventIndex',
  'eventPosition',
  'eventType',
]);

function projectParticipant(value) {
  if (!isRecord(value)) throw new TypeError('An invalid normalized participant was returned.');
  return {
    role: nonEmptyString(value.role),
    address: nonEmptyString(value.address),
  };
}

function projectAmount(value) {
  if (!isRecord(value)) throw new TypeError('An invalid normalized amount was returned.');
  return {
    integer: typeof value.integer === 'string' ? value.integer : null,
    denom: nonEmptyString(value.denom),
  };
}

function projectAmountIssue(value) {
  if (!isRecord(value)) throw new TypeError('An invalid normalized amount issue was returned.');
  return {
    field: nonEmptyString(value.field),
    reason: nonEmptyString(value.reason),
    index: Number.isInteger(value.index) ? value.index : null,
  };
}

function projectEvidence(value) {
  if (!isRecord(value)) throw new TypeError('An invalid normalized evidence entry was returned.');
  const projected = {};
  for (const field of EVIDENCE_FIELDS) {
    if (!Object.hasOwn(value, field)) continue;
    if (['source', 'msgIndexStatus', 'eventType'].includes(field)) {
      const text = nonEmptyString(value[field]);
      if (text) projected[field] = text;
    } else if (field === 'msgIndex' || field === 'rawEventIndex') {
      const scalar = value[field];
      if (typeof scalar === 'string' || Number.isSafeInteger(scalar)) projected[field] = scalar;
    } else if (Number.isInteger(value[field])) {
      projected[field] = value[field];
    }
  }
  return projected;
}

function projectExecution(value) {
  if (!isRecord(value)) throw new TypeError('An invalid normalized execution was returned.');
  return {
    status: nonEmptyString(value.status),
    code: Number.isSafeInteger(value.code) && value.code >= 0 ? value.code : null,
    codespace: nonEmptyString(value.codespace),
  };
}

function projectOperation(value) {
  if (!isRecord(value)) throw new TypeError('An invalid normalized operation was returned.');
  if (!Array.isArray(value.participants)
    || !Array.isArray(value.amounts)
    || !Array.isArray(value.amountIssues)
    || !Array.isArray(value.evidence)) {
    throw new TypeError('A normalized operation has an invalid collection field.');
  }
  const operation = {
    id: nonEmptyString(value.id),
    transactionHash: nonEmptyString(value.transactionHash),
    type: nonEmptyString(value.type),
    messageType: nonEmptyString(value.messageType),
    msgIndex: Number.isInteger(value.msgIndex) ? value.msgIndex : null,
    status: nonEmptyString(value.status),
    participants: value.participants.map(projectParticipant),
    amounts: value.amounts.map(projectAmount),
    amountIssues: value.amountIssues.map(projectAmountIssue),
    amountsComplete: typeof value.amountsComplete === 'boolean' ? value.amountsComplete : null,
    completionTime: nonEmptyString(value.completionTime),
    evidence: value.evidence.map(projectEvidence),
  };
  if (Object.hasOwn(value, 'statusReason')) operation.statusReason = nonEmptyString(value.statusReason);
  if (Object.hasOwn(value, 'statusScope')) operation.statusScope = nonEmptyString(value.statusScope);
  if (Object.hasOwn(value, 'remoteReceipt')) operation.remoteReceipt = nonEmptyString(value.remoteReceipt);
  return operation;
}

/**
 * Projects the normalizer output into plain, useful data. The projection
 * deliberately drops raw message/event objects, nested `raw` fields in amount
 * issues, and any other object reference from the provider payload.
 */
function projectNormalized(normalized) {
  if (!isRecord(normalized)
    || !isRecord(normalized.execution)
    || !Array.isArray(normalized.operations)
    || !Array.isArray(normalized.unscopedEvents)) {
    throw new TypeError('A structurally valid normalized Cosmos transaction is required.');
  }
  return {
    chainId: nonEmptyString(normalized.chainId),
    hash: nonEmptyString(normalized.hash),
    height: nonEmptyString(normalized.height),
    timestamp: nonEmptyString(normalized.timestamp),
    execution: projectExecution(normalized.execution),
    operations: normalized.operations.map(projectOperation),
    unscopedEvents: normalized.unscopedEvents.map(projectEvidence),
    source: nonEmptyString(normalized.source),
  };
}

function copyPlain(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const copy = [];
    seen.set(value, copy);
    for (const item of value) copy.push(copyPlain(item, seen));
    return copy;
  }
  const copy = {};
  seen.set(value, copy);
  for (const key of Object.keys(value)) {
    Object.defineProperty(copy, key, {
      value: copyPlain(value[key], seen),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return copy;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

/**
 * Creates the initial record from a Genesis LCD transaction summary.
 *
 * The summary is preserved as discovery evidence. Missing or malformed fields
 * become null; in particular, a coin array passed as `amountAtoms` is not
 * converted into a synthetic single amount. The hash is the stable identity and
 * is therefore required.
 *
 * @param {object} genesisTransaction Summary from genesis-api.getDelegatorTransactions().
 * @returns {object} TransactionRecord in the `not-loaded` detail state.
 */
export function createTransactionRecord(genesisTransaction) {
  if (!isRecord(genesisTransaction)) {
    throw new TypeError('A Genesis transaction summary object is required.');
  }
  const hash = nonEmptyString(genesisTransaction.hash);
  if (!hash) {
    throw new TypeError('A Genesis transaction summary must include a non-empty hash.');
  }

  return deepFreeze({
    hash,
    block: {
      height: nonEmptyString(genesisTransaction.height),
      timestamp: nonEmptyString(genesisTransaction.timestamp),
    },
    discovery: {
      source: DISCOVERY_SOURCE,
      endpoint: DISCOVERY_ENDPOINT,
      query: DISCOVERY_QUERY,
      typeLabel: nonEmptyString(genesisTransaction.type),
      amountAtoms: atomString(genesisTransaction.amountAtoms),
      denom: nonEmptyString(genesisTransaction.denom),
      code: integerCode(genesisTransaction.code),
      coverage: copyCoverage(),
    },
    detail: emptyDetail(),
  });
}

/**
 * Marks an in-flight detail request while retaining any previously available
 * normalized detail and metadata. This keeps last-valid data distinguishable
 * from a first load without fabricating missing fields.
 *
 * @param {object} record Existing TransactionRecord.
 * @returns {object} New record in the `loading` detail state.
 */
export function markTransactionDetailLoading(record) {
  requireRecord(record);
  return replaceDetail(record, {
    ...record.detail,
    state: TRANSACTION_DETAIL_STATES.LOADING,
    error: null,
  });
}

/**
 * Enriches a record with the result returned by the existing Cosmos adapter.
 *
 * The normalized object is projected into plain data and the metadata is
 * deep-copied, so the record shares no mutable references with the adapter
 * result. Raw messages, events, and top-level `raw` payloads are not retained.
 * A stale metadata freshness marks the record as `stale` and preserves the
 * provider's last error, if present. Operation statuses are copied unchanged,
 * including `unknown`.
 *
 * @param {object} record Existing TransactionRecord.
 * @param {{ normalized: object, meta: object }} result Cosmos adapter result.
 * @returns {object} New record in the `available` or `stale` detail state.
 */
export function enrichTransactionRecord(record, result) {
  requireRecord(record);
  if (!isRecord(result) || !isRecord(result.normalized) || !isRecord(result.meta)) {
    throw new TypeError('A normalized Cosmos transaction result and its metadata are required.');
  }
  if (result.normalized.hash !== record.hash) {
    throw new TypeError('The normalized transaction hash does not match the record hash.');
  }

  const normalized = projectNormalized(result.normalized);
  const meta = copyPlain(result.meta);
  const isStale = meta.freshness?.state === 'stale';
  return replaceDetail(record, {
    state: isStale ? TRANSACTION_DETAIL_STATES.STALE : TRANSACTION_DETAIL_STATES.AVAILABLE,
    normalized,
    meta,
    error: isStale ? errorSnapshot(meta.lastError) : null,
  });
}

/**
 * Marks the hash as unavailable (for example, a GL1X 404). No normalized detail
 * is retained because the provider explicitly did not return a transaction.
 *
 * @param {object} record Existing TransactionRecord.
 * @param {unknown} error Provider error.
 * @returns {object} New record in the `unavailable` detail state.
 */
export function markTransactionDetailUnavailable(record, error = null) {
  requireRecord(record);
  return replaceDetail(record, {
    state: TRANSACTION_DETAIL_STATES.UNAVAILABLE,
    normalized: null,
    meta: null,
    error: errorSnapshot(error),
  });
}

/**
 * Marks a failed detail request while retaining any previously available
 * normalized detail and metadata as last-valid data.
 *
 * @param {object} record Existing TransactionRecord.
 * @param {unknown} error Provider/normalizer error.
 * @returns {object} New record in the `error` detail state.
 */
export function markTransactionDetailError(record, error = null) {
  requireRecord(record);
  return replaceDetail(record, {
    ...record.detail,
    state: TRANSACTION_DETAIL_STATES.ERROR,
    error: errorSnapshot(error),
  });
}
