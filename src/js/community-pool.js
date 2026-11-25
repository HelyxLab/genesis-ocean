/**
 * Genesis Ocean — Community Pool Module
 */

import { GENESIS_API } from './data/genesis-api.js';

const POOL_BALANCE_DECIMALS = GENESIS_API.decimals + 18;
const POOL_EXECUTION_LABELS = Object.freeze({
  executed: 'Executed',
  failed: 'Failed',
  rejected: 'Rejected',
  pending: 'Pending',
  unverified: 'Unverified',
});

function formatL1Decimal(amountString) {
  if (typeof amountString !== 'string' || amountString.length === 0) return null;
  if (!/^\d+(\.\d+)?$/.test(amountString)) return null;

  const atoms = decimalToAtoms(amountString);
  if (atoms === null) return null;

  const scale = 10n ** 16n;
  const rounded = (atoms + scale / 2n) / scale;
  const whole = rounded / 100n;
  const fraction = (rounded % 100n).toString().padStart(2, '0').replace(/0+$/, '');

  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function formatL1Amount(amountL1, decimals = GENESIS_API.decimals) {
  if (typeof amountL1 !== 'string' || amountL1.length === 0) return '—';
  if (!/^\d+(\.\d+)?$/.test(amountL1)) return '—';

  const atoms = decimalToAtoms(amountL1, decimals);
  if (atoms === null) return '—';

  const scale = 10n ** BigInt(decimals - 2);
  const rounded = (atoms + scale / 2n) / scale;

  if (rounded === 0n && atoms !== 0n) return '<0.01 L1';

  const whole = rounded / 100n;
  const fraction = (rounded % 100n).toString().padStart(2, '0');
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return `${wholeText}.${fraction} L1`;
}

function atomsToL1(atoms) {
  if (typeof atoms !== 'string' || !/^\d+$/.test(atoms)) return null;
  const scale = 10n ** 18n;
  const value = BigInt(atoms);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(18, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
function decimalToAtoms(decimalString, decimals = GENESIS_API.decimals) {
  if (typeof decimalString !== 'string' || decimalString.length === 0) return null;
  if (!/^\d+(\.\d+)?$/.test(decimalString)) return null;

  const [wholePart, fractionPart = ''] = decimalString.split('.');
  const paddedFraction = fractionPart.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(wholePart + paddedFraction);
}

function formatChange(amountL1, previousL1) {
  if (!amountL1 || !previousL1) return null;
  const a = decimalToAtoms(amountL1, POOL_BALANCE_DECIMALS);
  const b = decimalToAtoms(previousL1, POOL_BALANCE_DECIMALS);
  if (a === null || b === null) return null;
  const abs = a - b;
  let absText;
  if (abs === 0n) {
    absText = '0 L1';
  } else {
    const negative = abs < 0n;
    const magnitude = negative ? -abs : abs;
    const scale = 10n ** BigInt(POOL_BALANCE_DECIMALS);
    const whole = magnitude / scale;
    const frac = (magnitude % scale).toString().padStart(POOL_BALANCE_DECIMALS, '0').replace(/0+$/, '');
    const absL1 = frac ? `${whole}.${frac}` : whole.toString();
    absText = `${negative ? '-' : '+'}${formatL1Amount(absL1, POOL_BALANCE_DECIMALS)}`;
  }
  const pct = percentChange(previousL1, amountL1);
  const pctText = pct !== null ? ` (${pct.toFixed(2)}%)` : '';
  return { abs: absText, pct: pctText };
}

export function formatCompactNumber(value) {
  let bigintValue = null;

  if (typeof value === 'bigint') {
    bigintValue = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^-?\d+$/.test(trimmed)) {
      bigintValue = BigInt(trimmed);
    } else {
      const numeric = Number(trimmed);
      if (!Number.isFinite(numeric)) return '0';
      if (Math.abs(numeric) > Number.MAX_SAFE_INTEGER) {
        bigintValue = BigInt(Math.trunc(numeric));
      } else {
        const n = numeric;
        const abs = Math.abs(n);
        if (abs < 1000) {
          if (Number.isInteger(n)) return String(n);
          return String(Math.round(n * 100) / 100).replace(/\.?0+$/, '');
        }
        const units = [
          { threshold: 1e12, suffix: 'T' },
          { threshold: 1e9, suffix: 'B' },
          { threshold: 1e6, suffix: 'M' },
          { threshold: 1e3, suffix: 'K' },
        ];
        for (const { threshold, suffix } of units) {
          if (abs >= threshold) {
            const scaled = n / threshold;
            const rounded = Math.round(scaled * 10) / 10;
            const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
            return `${text}${suffix}`;
          }
        }
        return String(Math.trunc(n));
      }
    }
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '0';
    if (Math.abs(value) > Number.MAX_SAFE_INTEGER) {
      bigintValue = BigInt(Math.trunc(value));
    } else {
      const n = value;
      const abs = Math.abs(n);
      if (abs < 1000) {
        if (Number.isInteger(n)) return String(n);
        return String(Math.round(n * 100) / 100).replace(/\.?0+$/, '');
      }
      const units = [
        { threshold: 1e12, suffix: 'T' },
        { threshold: 1e9, suffix: 'B' },
        { threshold: 1e6, suffix: 'M' },
        { threshold: 1e3, suffix: 'K' },
      ];
      for (const { threshold, suffix } of units) {
        if (abs >= threshold) {
          const scaled = n / threshold;
          const rounded = Math.round(scaled * 10) / 10;
          const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
          return `${text}${suffix}`;
        }
      }
      return String(Math.trunc(n));
    }
  } else {
    return '0';
  }

  if (bigintValue === null) return '0';

  const negative = bigintValue < 0n;
  const magnitude = negative ? -bigintValue : bigintValue;
  if (magnitude < 1000n) return `${negative ? '-' : ''}${magnitude.toString()}`;

  const units = [
    { threshold: 10n ** 12n, suffix: 'T' },
    { threshold: 10n ** 9n, suffix: 'B' },
    { threshold: 10n ** 6n, suffix: 'M' },
    { threshold: 10n ** 3n, suffix: 'K' },
  ];

  for (const { threshold, suffix } of units) {
    if (magnitude >= threshold) {
      const scaledTenths = (magnitude * 10n + threshold / 2n) / threshold;
      const whole = scaledTenths / 10n;
      const tenth = scaledTenths % 10n;
      const numberText = tenth === 0n ? whole.toString() : `${whole}.${tenth}`;
      return `${negative ? '-' : ''}${numberText}${suffix}`;
    }
  }

  return `${negative ? '-' : ''}${magnitude.toString()}`;
}

function toDisplayL1(amountL1) {
  const formatted = formatL1Decimal(amountL1);
  if (formatted === null) return 'Unavailable';
  return `${formatted} L1`;
}

function formatL1Whole(amountL1) {
  if (typeof amountL1 !== 'string' || amountL1.length === 0) return '—';
  if (!/^\d+(\.\d+)?$/.test(amountL1)) return '—';

  const atoms = decimalToAtoms(amountL1);
  if (atoms === null) return '—';

  const scale = 10n ** 18n;
  const wholeL1 = atoms / scale;
  const wholeText = wholeL1.toString();

  return wholeText.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' L1';
}

function formatL1Abbreviated(amountL1) {
  let negative = false;
  let magnitudeText = null;

  if (typeof amountL1 === 'bigint') {
    negative = amountL1 < 0n;
    magnitudeText = (negative ? -amountL1 : amountL1).toString();
  } else if (typeof amountL1 === 'number') {
    if (!Number.isFinite(amountL1)) return '0 L1';
    negative = amountL1 < 0;
    magnitudeText = String(Math.abs(amountL1));
  } else if (typeof amountL1 === 'string') {
    const trimmed = amountL1.trim();
    negative = trimmed.startsWith('-');
    magnitudeText = negative ? trimmed.slice(1) : trimmed;
    if (!/^\d+(\.\d+)?$/.test(magnitudeText)) return '0 L1';
  } else {
    return '0 L1';
  }

  const atoms = decimalToAtoms(magnitudeText);
  if (atoms === null) return '0 L1';
  if (atoms === 0n) negative = false;

  const scale = 10n ** 18n;
  const wholeL1 = atoms / scale;

  const thresholds = [
    { value: 10n ** 12n, suffix: 'T' },
    { value: 10n ** 9n, suffix: 'B' },
    { value: 10n ** 6n, suffix: 'M' },
    { value: 10n ** 3n, suffix: 'K' },
  ];

  for (const { value: threshold, suffix } of thresholds) {
    if (wholeL1 >= threshold) {
      const scaledTenths = (wholeL1 * 10n + threshold / 2n) / threshold;
      const whole = scaledTenths / 10n;
      const tenth = scaledTenths % 10n;
      const numberText = `${whole}.${tenth}`;
      return `${negative ? '-' : ''}${numberText}${suffix} L1`;
    }
  }

  const wholeText = wholeL1.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${wholeText} L1`;
}

function percentChange(previous, current) {
  if (!previous || !current) return null;
  const prevAtoms = decimalToAtoms(previous, POOL_BALANCE_DECIMALS);
  const currAtoms = decimalToAtoms(current, POOL_BALANCE_DECIMALS);
  if (!prevAtoms || currAtoms === null) return null;
  const scale = 1000000n;
  const scaled = ((currAtoms - prevAtoms) * 100n * scale) / prevAtoms;
  const result = Number(scaled) / Number(scale);
  if (!Number.isFinite(result)) return null;
  return result;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return '—';
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '—';
  }
}

export { percentChange, formatChange, decimalToAtoms, formatL1Abbreviated, formatL1Decimal, formatL1Whole, formatL1Amount };

export function initCommunityPool({ api, governanceApi = null, container, blockHeight = null } = {}) {
  if (!api || typeof api.getCommunityPool !== 'function') return null;
  if (!container) return null;

  const balanceEl = container.querySelector('[data-pool-balance]');
  const change24hEl = container.querySelector('[data-pool-change-24h]');
  const supplyShareEl = container.querySelector('[data-pool-supply-share]');
  const totalSupplyEl = container.querySelector('[data-pool-total-supply]');
  const snapshotHeightEl = container.querySelector('[data-pool-snapshot-height]');
  const chainHeightEl = container.querySelector('[data-pool-chain-height]');
  const lastUpdatedEl = container.querySelector('[data-pool-last-updated]');
  const loadingEl = container.querySelector('[data-pool-loading]');
  const errorEl = container.querySelector('[data-pool-error]');
  const proposalsErrorEl = container.querySelector('[data-pool-proposals-error]');
  const proposalsLoadingEl = container.querySelector('[data-pool-proposals-loading]');
  const proposalsEmptyEl = container.querySelector('[data-pool-proposals-empty]');
  const proposalsListEl = container.querySelector('[data-pool-proposals-list]');
  const totalApprovedValueEl = container.querySelector('[data-pool-total-approved-value]');
  const proposalFilterButtons = typeof container.querySelectorAll === 'function'
    ? [...container.querySelectorAll('[data-pool-proposal-filter]')]
    : [];

  if (proposalsLoadingEl) proposalsLoadingEl.hidden = true;

  let currentBalance = null;
  let changeBalance = null;
  let refreshing = false;
  let proposals = [];
  let activeProposalFilter = 'all';
  let proposalsRefreshing = false;

  function showState(state) {
    if (loadingEl) loadingEl.hidden = state !== 'loading';
    if (errorEl) errorEl.hidden = state !== 'error';
    [balanceEl, change24hEl, supplyShareEl, totalSupplyEl, snapshotHeightEl, lastUpdatedEl]
      .filter(Boolean)
      .forEach((el) => { el.hidden = state !== 'ready'; });
  }

  function setError(message) {
    showState('error');
    if (errorEl) errorEl.textContent = message;
  }

  function updateIndicators() {
    if (!currentBalance) return;

    if (balanceEl) balanceEl.textContent = formatL1Amount(currentBalance.amountL1);
    if (supplyShareEl) supplyShareEl.textContent = `${Number(currentBalance.percent).toFixed(2)}%`;
    if (totalSupplyEl) totalSupplyEl.textContent = formatL1Amount(currentBalance.totalSupply);
    if (snapshotHeightEl) snapshotHeightEl.textContent = BigInt(currentBalance.snapshotHeight).toLocaleString('en-US');
    if (lastUpdatedEl) lastUpdatedEl.textContent = currentBalance.updatedAt ? formatTimestamp(currentBalance.updatedAt) : '—';
  }

  async function updateChange() {
    if (!change24hEl || !currentBalance || currentBalance === changeBalance || container.hidden) return;
    const snapshot = currentBalance;
    changeBalance = snapshot;
    change24hEl.textContent = 'Unavailable';
    if (typeof governanceApi?.getCommunityPoolBalance24h !== 'function') return;

    change24hEl.textContent = 'Loading…';
    try {
      const previous = await governanceApi.getCommunityPoolBalance24h(snapshot.snapshotHeight);
      if (currentBalance !== snapshot) return;
      const change = formatChange(snapshot.amountL1, previous.amountL1);
      change24hEl.textContent = change ? change.abs + change.pct : 'Unavailable';
    } catch {
      if (currentBalance === snapshot) change24hEl.textContent = 'Unavailable';
    }
  }

  if (change24hEl && typeof MutationObserver === 'function') {
    new MutationObserver(updateChange).observe(container, { attributes: true, attributeFilter: ['hidden'] });
  }

  function proposalStatusLabel(status) {
    if (status === 'PROPOSAL_STATUS_PASSED') return 'Approved';
    if (status === 'PROPOSAL_STATUS_REJECTED') return 'Rejected';
    if (status === 'PROPOSAL_STATUS_FAILED') return 'Failed';
    if (status === 'PROPOSAL_STATUS_DEPOSIT_PERIOD') return 'Deposit period';
    if (status === 'PROPOSAL_STATUS_VOTING_PERIOD') return 'Voting period';
    return 'Unknown';
  }

  function renderProposals() {
    if (!proposalsListEl) return;
    if (typeof proposalsListEl.replaceChildren === 'function') proposalsListEl.replaceChildren();

    const filtered = proposals.filter((proposal) => {
      if (activeProposalFilter === 'all') return true;
      if (activeProposalFilter === 'passed') return proposal.status === 'PROPOSAL_STATUS_PASSED';
      if (activeProposalFilter === 'rejected') return proposal.status === 'PROPOSAL_STATUS_REJECTED';
      return true;
    });

    if (proposalsEmptyEl) proposalsEmptyEl.hidden = filtered.length !== 0;

    for (const proposal of filtered) {
      const card = document.createElement('article');
      card.className = 'pool-proposal-card';

      const title = document.createElement('h3');
      title.textContent = proposal.title;
      card.append(title);

      const status = document.createElement('p');
      status.textContent = `Status: ${proposalStatusLabel(proposal.status)}`;
      card.append(status);

      const execution = document.createElement('p');
      execution.textContent = `Execution: ${POOL_EXECUTION_LABELS[proposal.executionStatus] ?? POOL_EXECUTION_LABELS.unverified}`;
      card.append(execution);

      for (const spend of proposal.spends) {
        const recipient = document.createElement('p');
        recipient.textContent = `Recipient: ${spend.recipient}`;
        card.append(recipient);

        const amount = document.createElement('p');
        const coins = spend.coins.map(({ amount, denom }) => denom === GENESIS_API.denom
          ? formatL1Amount(atomsToL1(amount))
          : `${BigInt(amount).toLocaleString('en-US')} ${denom}`);
        amount.textContent = `Amount: ${coins.join(', ')}`;
        card.append(amount);
      }

      const dates = document.createElement('p');
      dates.textContent = `Submitted: ${proposal.submitTime ? formatTimestamp(proposal.submitTime) : '—'}`;
      card.append(dates);

      const description = document.createElement('p');
      description.textContent = proposal.description;
      card.append(description);

      proposalsListEl.append(card);
    }
  }

  function updateTotalApproved() {
    if (!totalApprovedValueEl) return;

    const approvedCoins = proposals.filter((proposal) => proposal.status === 'PROPOSAL_STATUS_PASSED')
      .flatMap((proposal) => proposal.spends.flatMap((spend) => spend.coins));
    const mixedDenominations = approvedCoins.some((coin) => coin.denom !== GENESIS_API.denom);

    let totalAtoms = 0n;
    for (const coin of approvedCoins) {
      if (coin.denom === GENESIS_API.denom) totalAtoms += BigInt(coin.amount);
    }

    const totalL1 = atomsToL1(totalAtoms.toString());
    const formatted = totalL1 === null ? '—' : formatL1Amount(totalL1);
    totalApprovedValueEl.textContent = mixedDenominations
      ? `Total Approved: ${formatted} (L1 only)`
      : `Total Approved: ${formatted}`;
  }

  async function refreshProposals() {
    if (!governanceApi || typeof governanceApi.getCommunityPoolProposals !== 'function') {
      if (proposalsLoadingEl) proposalsLoadingEl.hidden = true;
      proposals = [];
      renderProposals();
      if (totalApprovedValueEl) totalApprovedValueEl.textContent = 'Total Approved: 0.00 L1';
      return;
    }
    proposalsRefreshing = true;
    if (proposalsLoadingEl) proposalsLoadingEl.hidden = false;
    if (proposalsErrorEl) proposalsErrorEl.hidden = true;
    if (proposalsEmptyEl) proposalsEmptyEl.hidden = true;

    try {
      const result = await governanceApi.getCommunityPoolProposals();
      proposals = Array.isArray(result) ? result : [];
      renderProposals();
      updateTotalApproved();
    } catch (cause) {
      proposals = [];
      if (proposalsListEl && typeof proposalsListEl.replaceChildren === 'function') proposalsListEl.replaceChildren();
      if (totalApprovedValueEl) totalApprovedValueEl.textContent = 'Total Approved: Unavailable';
      if (proposalsErrorEl) {
        proposalsErrorEl.hidden = false;
        proposalsErrorEl.textContent = cause?.message || 'Failed to load governance proposals.';
      }
      if (proposalsEmptyEl) proposalsEmptyEl.hidden = true;
    } finally {
      if (proposalsLoadingEl) proposalsLoadingEl.hidden = true;
      proposalsRefreshing = false;
    }
  }

  async function refresh() {
    if (refreshing || document.hidden) return;
    refreshing = true;
    showState('loading');

    try {
      const pool = await api.getCommunityPool();
      if (change24hEl && currentBalance !== pool) change24hEl.textContent = '—';
      currentBalance = pool;

      showState('ready');
      updateIndicators();
      void updateChange();
    } catch (cause) {
      console.error('Community Pool refresh failed:', cause);
      setError(cause.message || 'Failed to load community pool data.');
    } finally {
      refreshing = false;
    }
  }

  proposalFilterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeProposalFilter = button.dataset.poolProposalFilter || 'all';
      proposalFilterButtons.forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      renderProposals();
    });
  });

  function setLiveBlockHeight(height) {
    if (!chainHeightEl || !/^\d+$/.test(String(height))) return;
    chainHeightEl.textContent = BigInt(height).toLocaleString('en-US');
  }

  if (blockHeight && typeof blockHeight.getLatestBlockHeight === 'function') {
    const initial = blockHeight.getLatestBlockHeight();
    if (initial) setLiveBlockHeight(initial);
  }
  blockHeight?.subscribeBlockHeight?.(setLiveBlockHeight);

  refresh();
  refreshProposals();
  updateTotalApproved();

  return Object.freeze({
    refresh,
    getCurrentBalance: () => currentBalance ? { ...currentBalance } : null,
  });
}
