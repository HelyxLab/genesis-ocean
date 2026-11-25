import test from 'node:test';
import assert from 'node:assert/strict';
import { initHelyx } from './helyx.js';

function createContainer(hidden = false) {
  const fields = ['moniker', 'address', 'status', 'stake', 'commission', 'delegators', 'note', 'explorer-link'];
  const elements = Object.fromEntries(fields.map((name) => [name, { textContent: '—', hidden: false }]));
  return {
    hidden,
    elements,
    querySelector(selector) { return elements[selector.slice('[data-validator-'.length, -1)]; },
  };
}

test('Helyx waits until needed and coalesces requests for the same validator', async () => {
  const container = createContainer(true);
  const calls = [];
  let resolve;
  const api = {
    getValidator(address) {
      calls.push(address);
      return new Promise((done) => { resolve = done; });
    },
  };
  const controller = initHelyx({ api, container });
  assert.deepEqual(calls, []);
  const request = controller.refresh();
  assert.equal(controller.refresh(), request);
  assert.equal(container.elements.stake.textContent, 'Loading…');
  resolve({
    data: {
      moniker: '✦Helyx✦', status: 'BOND_STATUS_BONDED', jailed: false,
      stakeAtoms: '531822233105591323104041', commissionRate: '0.100000000000000000',
      delegatorCount: 509,
    },
    meta: { freshness: { state: 'current' } },
  });
  await request;
  const { moniker, address, status, stake, commission, delegators, note } = container.elements;
  assert.deepEqual(calls, [address.textContent]);
  assert.deepEqual(
    [moniker.textContent, status.textContent, stake.textContent, commission.textContent, delegators.textContent],
    ['✦Helyx✦', 'Bonded', '531822.2331 L1', '10%', '509'],
  );
  assert.equal(note.hidden, true);
});

test('lookup failures settle all live fields and keep the operator link available', async () => {
  const container = createContainer();
  const api = { getValidator: async () => { throw new Error('lookup failed'); } };
  const controller = initHelyx({ api, container });
  await controller.refresh();
  for (const field of ['moniker', 'status', 'stake', 'commission', 'delegators']) {
    assert.equal(container.elements[field].textContent, 'Unavailable');
  }
  const { address, note, 'explorer-link': explorer } = container.elements;
  assert.match(address.textContent, /^genesisvaloper1/);
  assert.equal(explorer.href, `https://gl1x.com/validator/${address.textContent}`);
  assert.equal(note.hidden, false);
  assert.match(note.textContent, /unavailable from GL1X/);
});

test('Helyx distinguishes partial stale data, jailed status and actual zero values', async () => {
  const container = createContainer();
  const api = {
    getValidator: async () => ({
      data: { jailed: true, stakeAtoms: '0', delegatorCount: 0 },
      meta: { freshness: { state: 'stale' } },
    }),
  };
  const controller = initHelyx({ api, container });
  await controller.refresh();
  const { status, stake, commission, delegators, note } = container.elements;
  assert.deepEqual(
    [status.textContent, stake.textContent, commission.textContent, delegators.textContent],
    ['Jailed', '0 L1', 'Unavailable', '0'],
  );
  assert.equal(note.hidden, false);
  assert.match(note.textContent, /last available GL1X snapshot/);
});
