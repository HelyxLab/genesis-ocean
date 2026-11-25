import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APPS_DIRECTORY, VALID_CATEGORIES, initApps } from './apps.js';

test('APPS_DIRECTORY contains 27 ecosystem apps and tools', () => {
  assert.equal(APPS_DIRECTORY.length, 27);
  assert.ok(Object.isFrozen(APPS_DIRECTORY));
});

test('every directory entry has valid required fields and HTTPS URL', () => {
  const allowedCategories = new Set(VALID_CATEGORIES.filter((category) => category !== 'all'));

  for (const app of APPS_DIRECTORY) {
    assert.ok(typeof app.id === 'string' && app.id.length > 0, `Missing id on ${app.name}`);
    assert.ok(typeof app.name === 'string' && app.name.length > 0, `Missing name on ${app.id}`);
    assert.ok(allowedCategories.has(app.category), `Invalid category "${app.category}" on ${app.id}`);
    assert.ok(typeof app.categoryLabel === 'string' && app.categoryLabel.length > 0);
    assert.ok(typeof app.badge === 'string' && app.badge.length > 0);
    assert.ok(typeof app.description === 'string' && app.description.length > 15);
    assert.ok(typeof app.endpoint === 'string' && app.endpoint.length > 0);
    assert.ok(app.url.startsWith('https://'), `URL must be HTTPS: ${app.url}`);
    assert.doesNotThrow(() => new URL(app.url), `Invalid URL: ${app.url}`);
    assert.ok(Object.isFrozen(app));
  }
});

test('strictly prohibits the removed historical Hell Protocol game', () => {
  for (const app of APPS_DIRECTORY) {
    const combined = `${app.id} ${app.name} ${app.description} ${app.url}`.toLowerCase();
    assert.ok(!combined.includes('hell protocol'), `Banned keyword found in app ${app.id}`);
  }
});

test('category distribution matches expected ecosystem domains', () => {
  const counts = APPS_DIRECTORY.reduce((acc, app) => {
    acc[app.category] = (acc[app.category] || 0) + 1;
    return acc;
  }, {});

  assert.equal(counts.explore, 3);
  assert.equal(counts.wallets, 3);
  assert.equal(counts.defi, 2);
  assert.equal(counts.dev, 7);
  assert.equal(counts.ecosystem, 3);
  assert.equal(counts['dapps-science'], 6);
  assert.equal(counts['network-tools'], 3);
});

test('static Apps cards and category counts match the JavaScript catalog', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const apps = html.match(/<section\b[^>]*\bdata-view="apps"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(apps, 'Missing Apps section');
  const textContent = (text) => text?.trim().replaceAll('&amp;', '&');

  const filters = [...apps.matchAll(/<button\b[^>]*\bdata-apps-filter="([^"]+)"[^>]*>([^<]*)<span class="apps-filter-count">(\d+)<\/span>/g)];
  assert.deepEqual(filters.map(([, category]) => category).sort(), [...VALID_CATEGORIES].sort());
  const labels = new Map();
  for (const [, category, label, count] of filters) {
    labels.set(category, textContent(label));
    const total = APPS_DIRECTORY.filter((app) => category === 'all' || app.category === category).length;
    assert.equal(Number(count), total, `Incorrect static count for ${category}`);
  }

  const cards = [...apps.matchAll(/<article\b([^>]*\bdata-app-card\b[^>]*)>([\s\S]*?)<\/article>/g)];
  const directory = cards.map(([, attrs, card]) => {
    const id = attrs.match(/\bdata-app-id="([^"]+)"/)?.[1];
    const category = attrs.match(/\bdata-category="([^"]+)"/)?.[1];
    const field = (name) => textContent(card.match(new RegExp(`class="app-card-${name}">([^<]*)<`))?.[1]);
    const url = card.match(/<a\b[^>]*\bclass="app-card-action"[^>]*\bhref="([^"]+)"/)?.[1];
    return {
      id, name: field('title'), category, categoryLabel: labels.get(category),
      badge: field('badge'), description: field('description'), endpoint: field('endpoint'), url,
    };
  });
  assert.deepEqual(directory, APPS_DIRECTORY);
  assert.equal(new Set(directory.map(({ id }) => id)).size, directory.length, 'Duplicate directory ID');
  assert.equal(new Set(directory.map(({ url }) => new URL(url).href)).size, directory.length, 'Duplicate directory URL');
});

test('APPS_DIRECTORY does not include the deprecated Genesis L1 Explorer destination', () => {
  for (const app of APPS_DIRECTORY) {
    assert.notEqual(app.url, 'https://explorer.genesisl1.org');
    assert.notEqual(app.endpoint, 'explorer.genesisl1.org');
  }
});

test('initApps returns null safely when container is not found', () => {
  const controller = initApps({ container: null });
  assert.equal(controller, null);
});

test('initApps controls category filtering and updates element states', () => {
  const makeButton = (filter, isActive = false) => {
    const listeners = {};
    return {
      dataset: { appsFilter: filter },
      classList: {
        toggle(cls, val) {
          if (val) this.classes.add(cls);
          else this.classes.delete(cls);
        },
        contains(cls) { return this.classes.has(cls); },
        classes: new Set(isActive ? ['is-active'] : []),
      },
      attributes: { 'aria-pressed': isActive ? 'true' : 'false' },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k]; },
      addEventListener(evt, fn) { listeners[evt] = fn; },
      click() { if (listeners.click) listeners.click(); },
    };
  };

  const makeCard = (category) => ({
    dataset: { category },
    hidden: false,
  });

  const buttons = [
    makeButton('all', true),
    makeButton('explore'),
    makeButton('wallets'),
    makeButton('dev'),
  ];

  const cards = [
    makeCard('explore'),
    makeCard('explore'),
    makeCard('wallets'),
    makeCard('dev'),
  ];

  const emptyState = { hidden: true };

  const container = {
    querySelectorAll(selector) {
      if (selector === '[data-apps-filter]') return buttons;
      if (selector === '[data-app-card]') return cards;
      return [];
    },
    querySelector(selector) {
      if (selector === '[data-apps-empty]') return emptyState;
      return null;
    },
  };

  const controller = initApps({ container });
  assert.ok(controller);
  assert.equal(controller.getActiveCategory(), 'all');
  assert.equal(controller.getVisibleCount(), 4);

  // Switch to 'explore'
  const visibleExplore = controller.setCategory('explore');
  assert.equal(visibleExplore, 2);
  assert.equal(controller.getActiveCategory(), 'explore');
  assert.equal(buttons[0].attributes['aria-pressed'], 'false');
  assert.equal(buttons[0].classList.contains('is-active'), false);
  assert.equal(buttons[1].attributes['aria-pressed'], 'true');
  assert.equal(buttons[1].classList.contains('is-active'), true);
  assert.equal(cards[0].hidden, false);
  assert.equal(cards[1].hidden, false);
  assert.equal(cards[2].hidden, true);
  assert.equal(cards[3].hidden, true);
  assert.equal(emptyState.hidden, true);

  // Click on 'wallets' button
  buttons[2].click();
  assert.equal(controller.getActiveCategory(), 'wallets');
  assert.equal(controller.getVisibleCount(), 1);
  assert.equal(cards[2].hidden, false);
  assert.equal(cards[0].hidden, true);

  // Switch to empty category
  const visibleNone = controller.setCategory('defi');
  assert.equal(visibleNone, 0);
  assert.equal(emptyState.hidden, false);

  // Switch back to 'all'
  controller.setCategory('all');
  assert.equal(controller.getVisibleCount(), 4);
  assert.equal(emptyState.hidden, true);
});
