const MESSAGE_TYPES = Object.freeze({
  '/cosmos.bank.v1beta1.MsgSend': 'transfer',
  'cosmos.bank.v1beta1.MsgSend': 'transfer',
  '/cosmos.staking.v1beta1.MsgDelegate': 'delegate',
  'cosmos.staking.v1beta1.MsgDelegate': 'delegate',
  'cosmos.staking.v1beta1.MsgUndelegate': 'undelegate',
  'cosmos.staking.v1beta1.MsgUndelegate': 'undelegate',
  'cosmos.staking.v1beta1.MsgBeginRedelegate': 'redelegate',
  'cosmos.staking.v1beta1.MsgBeginRedelegate': 'redelegate',
  '/ibc.applications.transfer.v1.MsgTransfer': 'ibc_transfer',
  'ibc.applications.transfer.v1.MsgTransfer': 'ibc_transfer',
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseIndex(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function getAttributeValue(event, key) {
  if (!Array.isArray(event?.attributes)) return undefined;
  const attribute = event.attributes.find((item) => isRecord(item) && item.key === key);
  return attribute ? attribute.value : undefined;
}

function getAttribute(event, key) {
  return nonEmptyString(getAttributeValue(event, key));
}

function getCompletionTime(events, expectedEventType) {
  for (const event of events) {
    if (event.type !== expectedEventType) continue;
    const value = getAttribute(event.raw, 'completion_time');
    if (value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      && !Number.isNaN(Date.parse(value))) {
      return value;
    }
  }
  return null;
}

function getEventMsgIndexRaw(event) {
  if (Object.hasOwn(event, 'msg_index')) return event.msg_index;
  return getAttributeValue(event, 'msg_index');
}

function getEventIndexRaw(event) {
  if (Object.hasOwn(event, 'event_index')) return event.event_index;
  return getAttributeValue(event, 'event_index');
}

function normalizeAmount(value) {
  if (!isRecord(value) || typeof value.amount !== 'string' || !/^\d+$/.test(value.amount)) return null;
  const denom = nonEmptyString(value.denom);
  if (!denom) return null;
  return { integer: value.amount, denom };
}

export function normalizeCosmosMessageAmounts(message, type = MESSAGE_TYPES[nonEmptyString(message?.['@type'])?.replace(/^\//, '')]) {
  if (!['transfer', 'delegate', 'undelegate', 'redelegate', 'ibc_transfer'].includes(type)) {
    return { amounts: [], issues: [], complete: null };
  }
  const rawAmount = type === 'ibc_transfer' ? message.token : message.amount;
  const isList = type === 'transfer';
  const source = isList && Array.isArray(rawAmount) ? rawAmount : [rawAmount];
  const issues = [];

  if (isList && !Array.isArray(rawAmount)) {
    issues.push({ field: 'amount', reason: 'expected_coin_array', raw: rawAmount ?? null });
  }
  if (source.length === 0) {
    issues.push({ field: 'amount', reason: 'empty_coin_array', raw: rawAmount });
  }

  const amounts = [];
  source.forEach((item, index) => {
    const normalized = normalizeAmount(item);
    if (normalized) amounts.push(normalized);
    else issues.push({ field: isList ? 'amount' : type === 'ibc_transfer' ? 'token' : 'amount', index, reason: 'invalid_coin', raw: item ?? null });
  });
  return { amounts, issues, complete: issues.length === 0 && amounts.length > 0 };
}

function normalizeEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.flatMap((event, eventPosition) => {
    if (!isRecord(event) || typeof event.type !== 'string') return [];
    const rawMsgIndex = getEventMsgIndexRaw(event);
    const parsedMsgIndex = parseIndex(rawMsgIndex);
    const rawEventIndex = getEventIndexRaw(event);
    return [{
      type: event.type,
      msgIndex: rawMsgIndex ?? null,
      parsedMsgIndex,
      msgIndexStatus: rawMsgIndex === undefined ? 'absent' : parsedMsgIndex === null ? 'invalid' : 'valid',
      eventIndex: parseIndex(rawEventIndex),
      rawEventIndex,
      eventPosition,
      raw: event,
    }];
  });
}

function normalizeExecution(raw) {
  const code = Number.isSafeInteger(raw.code) && raw.code >= 0 ? raw.code : null;
  let status = 'unknown';
  if (raw.success === false || (code !== null && code !== 0)) status = 'failed';
  else if (raw.success === true && code === 0) status = 'success';
  return {
    status,
    code,
    codespace: nonEmptyString(raw.codespace),
  };
}

function amountMatches(event, amounts) {
  const eventAmount = getAttribute(event.raw, 'amount');
  if (!eventAmount || !amounts.length) return false;
  // Cosmos event amounts are concatenated coin strings, for example 123el1.
  // Exact string matching avoids numeric conversion and floating-point loss.
  const expected = amounts.map(({ integer, denom }) => `${integer}${denom}`).sort();
  return eventAmount.split(',').map((value) => value.trim()).sort().join(',') === expected.join(',');
}

// Event attribute keys are matched exactly to the observed GL1X fields below.
// No aliases are accepted until verified against real GL1X payloads.
function eventMatches(event, { types, participants, amounts }) {
  if (!types.includes(event.type)) return false;
  for (const [role, address] of Object.entries(participants)) {
    if (address && getAttribute(event.raw, role) !== address) return false;
  }
  return !amounts.length || amountMatches(event, amounts);
}

function hasMatchingEvent(events, criteria) {
  return events.some((event) => eventMatches(event, criteria));
}

function matchingRedelegationEvents(events, message, amounts) {
  const { delegator_address: delegator, validator_src_address: source, validator_dst_address: destination } = message;
  if (![delegator, source, destination].every(nonEmptyString) || !amounts.length) return [];

  const types = ['redelegate'];
  return events.filter((event) => {
    // The scoped chain event omits the delegator. The message identifies it;
    // any explicit event delegator must still agree with the message.
    const eventDelegator = getAttributeValue(event.raw, 'delegator');
    if (eventDelegator !== undefined && eventDelegator !== delegator) return false;
    return eventMatches(event, { types, participants: { source_validator: source, destination_validator: destination }, amounts })
      || eventMatches(event, { types, participants: { delegator, src_validator: source, dst_validator: destination }, amounts });
  });
}

function operationData(message, type) {
  const normalizedAmountData = normalizeCosmosMessageAmounts(message, type);
  const participants = [];
  const addParticipant = (role, value) => {
    const address = nonEmptyString(value);
    if (address) participants.push({ role, address });
  };

  if (type === 'transfer') {
    addParticipant('sender', message.from_address);
    addParticipant('recipient', message.to_address);
  } else if (type === 'delegate' || type === 'undelegate') {
    addParticipant('delegator', message.delegator_address);
    addParticipant('validator', message.validator_address);
  } else if (type === 'redelegate') {
    addParticipant('delegator', message.delegator_address);
    addParticipant('source_validator', message.validator_src_address);
    addParticipant('destination_validator', message.validator_dst_address);
  } else if (type === 'ibc_transfer') {
    addParticipant('sender', message.sender);
    addParticipant('recipient', message.receiver);
  }
  return { participants, ...normalizedAmountData };
}

function evidenceForMessage(message, msgIndex, events, messageSource) {
  return [
    { source: messageSource, msgIndex, eventIndex: null, eventPosition: null, message },
    ...events.map((event) => ({
      source: 'transaction.events',
      msgIndex: event.msgIndex,
      msgIndexStatus: event.msgIndexStatus,
      eventIndex: event.eventIndex,
      rawEventIndex: event.rawEventIndex,
      eventPosition: event.eventPosition,
      eventType: event.type,
      event: event.raw,
    })),
  ];
}

function classifyOperationStatus({ executionStatus, type, message, events, amounts, amountIssues }) {
  // GL1X reports transaction execution status, not a per-message result. A
  // failed transaction therefore cannot identify which operation failed.
  if (executionStatus === 'failed') return 'unknown';
  if (executionStatus !== 'success') return 'unknown';
  if (amountIssues.length > 0) return 'unknown';

  if (type === 'transfer') {
    const participants = { sender: message.from_address, recipient: message.to_address };
    return participants.sender && participants.recipient && amounts.length
      && hasMatchingEvent(events, { types: ['transfer'], participants, amounts }) ? 'confirmed' : 'unknown';
  }
  if (type === 'delegate') {
    const participants = { delegator: message.delegator_address, validator: message.validator_address };
    return participants.delegator && participants.validator && amounts.length
      && hasMatchingEvent(events, { types: ['delegate'], participants, amounts }) ? 'confirmed' : 'unknown';
  }
  if (type === 'undelegate') {
    const participants = { delegator: message.delegator_address, validator: message.validator_address };
    return participants.delegator && participants.validator && amounts.length
      && hasMatchingEvent(events, { types: ['unbond'], participants, amounts }) ? 'awaiting_completion' : 'unknown';
  }
  if (type === 'redelegate') {
    return events.length ? 'awaiting_completion' : 'unknown';
  }
  if (type === 'ibc_transfer') return 'unknown';
  return 'unknown';
}

/**
 * Converts a GL1X Cosmos transaction detail into conservative, evidence-backed
 * operation records. Raw integer amounts and the source payload are preserved.
 */
export function normalizeCosmosTransaction(raw) {
  if (!isRecord(raw)) throw new TypeError('A Cosmos transaction object is required.');

  const hash = nonEmptyString(raw.hash);
  const bodyMessages = raw.tx?.body?.messages;
  const messageSource = Array.isArray(bodyMessages) ? 'transaction.tx.body.messages' : 'transaction.messages';
  const messages = Array.isArray(bodyMessages)
    ? bodyMessages
    : Array.isArray(raw.messages)
      ? raw.messages.map((messageType) => typeof messageType === 'string' ? { '@type': messageType } : messageType)
      : [];
  const events = normalizeEvents(raw.events);
  const execution = normalizeExecution(raw);
  const operations = messages.map((message, msgIndex) => {
    const safeMessage = isRecord(message) ? message : {};
    const messageType = nonEmptyString(typeof message === 'string' ? message : safeMessage['@type']);
    const type = messageType ? (MESSAGE_TYPES[messageType.replace(/^\//, '')] ?? 'other') : 'unknown';
    const { participants, amounts, issues: amountIssues, complete: amountsComplete } = operationData(safeMessage, type);
    const associatedEvents = events.filter((event) => event.msgIndexStatus === 'valid' && event.parsedMsgIndex === msgIndex);
    const operationEvents = type === 'redelegate' ? matchingRedelegationEvents(associatedEvents, safeMessage, amounts) : associatedEvents;
    const status = classifyOperationStatus({ executionStatus: execution.status, type, message: safeMessage, events: operationEvents, amounts, amountIssues });
    const isIbcMessageComplete = type === 'ibc_transfer'
      && Boolean(nonEmptyString(safeMessage.source_port) && nonEmptyString(safeMessage.source_channel)
        && nonEmptyString(safeMessage.sender) && nonEmptyString(safeMessage.receiver)
        && amounts.length === 1 && amountIssues.length === 0);
    const completionTime = type === 'undelegate'
      ? getCompletionTime(associatedEvents, 'unbond')
      : type === 'redelegate' && status === 'awaiting_completion'
        ? getCompletionTime(operationEvents, 'redelegate')
        : null;
    return {
      id: hash ? `${hash}:msg:${msgIndex}` : `msg:${msgIndex}`,
      transactionHash: hash,
      type,
      messageType,
      msgIndex,
      status,
      ...(execution.status === 'failed' ? { statusReason: 'transaction_failed_operation_result_unavailable' } : {}),
      participants,
      amounts,
      amountIssues,
      amountsComplete,
      ...(type === 'ibc_transfer' ? {
        status: execution.status === 'success' && isIbcMessageComplete ? 'initiated' : 'unknown',
        statusScope: 'local_submission_only',
        remoteReceipt: 'unverified',
      } : {}),
      completionTime,
      evidence: evidenceForMessage(message, msgIndex, associatedEvents, messageSource),
    };
  });

  return {
    chainId: nonEmptyString(raw.chain_id),
    hash,
    height: raw.height === undefined || raw.height === null ? null : String(raw.height),
    timestamp: nonEmptyString(raw.timestamp),
    execution,
    operations,
    unscopedEvents: events.filter((event) => event.msgIndexStatus !== 'valid' || event.parsedMsgIndex >= messages.length).map((event) => ({
      source: 'transaction.events',
      msgIndex: event.msgIndex,
      msgIndexStatus: event.msgIndexStatus === 'valid' ? 'unmatched' : event.msgIndexStatus,
      eventIndex: event.eventIndex,
      rawEventIndex: event.rawEventIndex,
      eventPosition: event.eventPosition,
      eventType: event.type,
      event: event.raw,
    })),
    source: 'gl1x-cosmos-transaction',
  };
}
