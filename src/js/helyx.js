import { formatL1 } from './data/genesis-api.js';

const HELYX_OPERATOR_ADDRESS = 'genesisvaloper1tzqmp8ed3e6rgqrfscekg87pe5hd90n0ax4ghd';
const BOND_STATUS_LABELS = Object.freeze({
  BOND_STATUS_BONDED: 'Bonded',
  BOND_STATUS_UNBONDING: 'Unbonding',
  BOND_STATUS_UNBONDED: 'Unbonded',
});

function formatCommission(rate) {
  if (typeof rate !== 'string' || !/^\d+(?:\.\d+)?$/.test(rate)) return null;
  const [whole, fraction = ''] = rate.split('.');
  const position = whole.length + 2;
  const digits = `${whole}${fraction}`.padEnd(position, '0');
  const percent = digits.slice(0, position).replace(/^0+(?=\d)/, '') || '0';
  const decimal = digits.slice(position).replace(/0+$/, '');
  return `${percent}${decimal ? `.${decimal}` : ''}%`;
}

export function initHelyx({ api, container, operatorAddress = HELYX_OPERATOR_ADDRESS } = {}) {
  if (!container || typeof api?.getValidator !== 'function') return null;

  const fields = ['moniker', 'status', 'stake', 'commission', 'delegators']
    .map((field) => [field, container.querySelector(`[data-validator-${field}]`)]);
  const address = container.querySelector('[data-validator-address]');
  const note = container.querySelector('[data-validator-note]');
  const explorer = container.querySelector('[data-validator-explorer-link]');
  if (address) address.textContent = operatorAddress;
  if (explorer) explorer.href = `https://gl1x.com/validator/${encodeURIComponent(operatorAddress)}`;

  let request = null;
  let loaded = false;

  function renderFields(values = {}, empty = 'Unavailable') {
    for (const [field, element] of fields) {
      if (element) element.textContent = values[field] ?? empty;
    }
  }

  function showNote(message = '') {
    if (!note) return;
    note.textContent = message;
    note.hidden = !message;
  }

  async function loadValidator() {
    try {
      const { data, meta } = await api.getValidator(operatorAddress);
      const bondStatus = Object.hasOwn(BOND_STATUS_LABELS, data.status) ? BOND_STATUS_LABELS[data.status] : null;
      renderFields({
        moniker: data.moniker,
        status: data.jailed === true ? 'Jailed' : bondStatus,
        stake: formatL1(data.stakeAtoms),
        commission: formatCommission(data.commissionRate),
        delegators: data.delegatorCount?.toLocaleString('en-US'),
      });
      if (meta.freshness.state === 'stale') showNote('Showing the last available GL1X snapshot.');
      else if (meta.freshness.state === 'unknown') showNote('GL1X did not confirm snapshot freshness.');
      loaded = true;
    } catch {
      renderFields();
      showNote('Validator data is currently unavailable from GL1X.');
      loaded = false;
    }
  }

  function refresh() {
    if (request) return request;
    renderFields({}, 'Loading…');
    showNote();
    request = loadValidator().finally(() => { request = null; });
    return request;
  }

  function loadWhenVisible() {
    if (!container.hidden && !loaded) void refresh();
  }

  if (typeof MutationObserver === 'function') {
    new MutationObserver(loadWhenVisible).observe(container, { attributes: true, attributeFilter: ['hidden'] });
  }
  loadWhenVisible();

  return Object.freeze({ refresh });
}
