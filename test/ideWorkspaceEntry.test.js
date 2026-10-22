'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/js/ide-workspace-entry.js'), 'utf8');
const ID = 'IdeWorkspaceLayout';
const FILE = `${ID}.plugin.js`;
const PENDING_KEY = 'haven_pending_workspace';

function page({ search = '', stored = new Map(), safe = false, owner = '', fail = false, editing = false, missing = false, desktop = true } = {}) {
  const events = new Map();
  const attrs = new Map();
  if (safe) attrs.set('data-haven-safe-mode', '1');
  if (editing) attrs.set('data-haven-layout-editing', '1');
  if (owner) attrs.set('data-haven-layout-owner', owner);
  const buttonEvents = new Map();
  const buttonAttrs = new Map();
  const button = {
    dataset: {}, disabled: true,
    setAttribute: (key, value) => buttonAttrs.set(key, value),
    classList: { toggle() {} },
    addEventListener: (event, listener) => buttonEvents.set(event, listener),
  };
  const document = {
    readyState: 'loading',
    documentElement: {
      hasAttribute: key => attrs.has(key),
      getAttribute: key => attrs.get(key) || null,
    },
    getElementById: id => id === 'ide-workspace-toggle' ? button : null,
    addEventListener(event, listener) {
      if (!events.has(event)) events.set(event, []);
      events.get(event).push(listener);
    },
  };
  const emit = event => (events.get(event) || []).forEach(listener => listener());
  const selections = [], disabled = [], saves = [], warnings = [], urls = [];
  const plugin = { instance: { _engaged: owner === ID }, enabled: owner === ID, suppressed: safe };
  let selection = owner;
  const window = {
    location: { search, href: `https://haven.test/app${search}` },
    history: { state: null, replaceState: (_, __, url) => urls.push(url) },
    matchMedia: () => ({ matches: desktop }),
    addEventListener() {},
    HavenApi: {
      Data: { save: (...args) => saves.push(args) },
      UI: { showToast: (...args) => warnings.push(args) },
    },
    HavenPluginLoader: {
      suppressed: safe,
      loadedPlugins: new Map(missing ? [] : [[FILE, plugin]]),
      disablePlugin(file) {
        disabled.push(file);
        plugin.enabled = false;
        plugin.instance._engaged = false;
        if (attrs.get('data-haven-layout-owner') === ID) attrs.delete('data-haven-layout-owner');
      },
    },
    _activeLayoutKey: () => selection,
    _setLayout(key) {
      selections.push(key);
      selection = key;
      attrs.delete('data-haven-layout-owner');
      plugin.enabled = key === ID;
      plugin.instance._engaged = key === ID && !fail;
      if (key && !(key === ID && (fail || !desktop))) attrs.set('data-haven-layout-owner', key);
      emit('haven:layout-owner-change');
    },
  };
  const sessionStorage = {
    getItem: key => stored.get(key) || null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: key => stored.delete(key),
  };
  vm.runInNewContext(source, {
    document, window, sessionStorage, URL, URLSearchParams,
    console: { warn() {} },
  });
  return { window, stored, attrs, button, buttonAttrs, buttonEvents, emit, selections, disabled, saves, warnings, urls, plugin };
}

test('IDE entry leaves an existing user layout unchanged until explicitly selected', () => {
  const p = page({ owner: 'ChromeLayout' });
  p.emit('DOMContentLoaded');
  p.emit('haven:plugins-loaded');
  assert.deepEqual(p.selections, []);
  assert.equal(p.attrs.get('data-haven-layout-owner'), 'ChromeLayout');
  assert.equal(p.button.disabled, false);
  assert.equal(p.buttonAttrs.get('aria-pressed'), 'false');
});

test('IDE button uses the shared selector and can return to the original layout', () => {
  const p = page({ owner: 'ChromeLayout' });
  p.emit('DOMContentLoaded');
  p.emit('haven:plugins-loaded');
  p.buttonEvents.get('click')();
  assert.deepEqual(p.selections, [ID]);
  assert.equal(p.attrs.get('data-haven-layout-owner'), ID);
  assert.equal(p.buttonAttrs.get('aria-pressed'), 'true');
  p.buttonEvents.get('click')();
  assert.deepEqual(p.selections, [ID, '']);
  assert.equal(p.attrs.has('data-haven-layout-owner'), false);
  assert.equal(p.buttonAttrs.get('aria-pressed'), 'false');
});

test('IDE link is captured before authentication redirect and consumed after sign-in', () => {
  const stored = new Map();
  const signedOut = page({ search: '?workspace=ide', stored });
  assert.equal(stored.get(PENDING_KEY), 'ide', 'captured synchronously before app boots');
  assert.deepEqual(signedOut.selections, []);
  const signedIn = page({ stored });
  signedIn.emit('haven:plugins-loaded');
  assert.deepEqual(signedIn.selections, [ID]);
  assert.equal(stored.has(PENDING_KEY), false);
});

test('IDE link consumes only its query parameter after successful startup', () => {
  const p = page({ search: '?workspace=ide&channel=abcd1234#message' });
  p.emit('haven:plugins-loaded');
  assert.equal(p.urls.at(-1), '/app?channel=abcd1234#message');
  assert.equal(p.attrs.get('data-haven-layout-owner'), ID);
});

test('safe mode suppresses IDE requests and does not leave a request queued for recovery', () => {
  const p = page({ search: '?workspace=ide&haven-safe-mode=1', safe: true });
  p.emit('haven:plugins-loaded');
  assert.deepEqual(p.selections, []);
  assert.equal(p.window.HavenIdeWorkspace.setEnabled(true), false);
  assert.equal(p.stored.has(PENDING_KEY), false);
  assert.equal(p.button.disabled, true);
  assert.equal(p.urls.at(-1), '/app?haven-safe-mode=1');
});

test('a plugin start failure restores the previous layout instead of persisting an enabled but inactive IDE', () => {
  const p = page({ owner: 'ChromeLayout', fail: true });
  assert.equal(p.window.HavenIdeWorkspace.setEnabled(true), false);
  assert.deepEqual(p.selections, [ID, 'ChromeLayout']);
  assert.deepEqual(p.disabled, [FILE]);
  assert.deepEqual(p.saves, [[ID, 'layoutOn', '0']]);
  assert.equal(p.attrs.get('data-haven-layout-owner'), 'ChromeLayout');
  assert.equal(p.plugin.enabled, false);
  assert.equal(p.buttonAttrs.get('aria-pressed'), 'false');
  assert.equal(p.warnings.length, 1);
});

test('IDE selection waits for layout editing to finish and leaves the current layout intact', () => {
  const p = page({ owner: 'ChromeLayout', editing: true });
  assert.equal(p.window.HavenIdeWorkspace.setEnabled(true), false);
  assert.deepEqual(p.selections, []);
  assert.equal(p.attrs.get('data-haven-layout-owner'), 'ChromeLayout');
  assert.equal(p.warnings.length, 1);
});

test('missing or suppressed plugin cannot be selected even if an external caller invokes the API', () => {
  const p = page({ missing: true });
  p.emit('haven:plugins-loaded');
  assert.equal(p.window.HavenIdeWorkspace.setEnabled(true), false);
  assert.equal(p.button.disabled, true);
  assert.deepEqual(p.selections, []);
});

test('the entry reflects a persisted active IDE without starting another instance', () => {
  const p = page({ owner: ID, search: '?workspace=ide' });
  p.emit('haven:plugins-loaded');
  assert.equal(p.buttonAttrs.get('aria-pressed'), 'true');
  assert.equal(p.window.HavenIdeWorkspace.setEnabled(true), true);
  assert.deepEqual(p.selections, []);
  assert.equal(p.stored.has(PENDING_KEY), false);
  assert.equal(p.urls.at(-1), '/app');
});

test('a mobile IDE selection is retained without claiming the desktop layout is visible', () => {
  const p = page({ search: '?workspace=ide', desktop: false });
  p.emit('haven:plugins-loaded');
  assert.deepEqual(p.selections, [ID]);
  assert.equal(p.plugin.enabled, true);
  assert.equal(p.plugin.instance._engaged, true);
  assert.equal(p.attrs.has('data-haven-layout-owner'), false);
  assert.equal(p.buttonAttrs.get('aria-pressed'), 'true');
  assert.match(p.button.title, /original layout on mobile/);
  assert.equal(p.warnings.length, 0);
  assert.equal(p.stored.has(PENDING_KEY), false);
  p.buttonEvents.get('click')();
  assert.deepEqual(p.selections, [ID, '']);
  assert.equal(p.plugin.enabled, false);
  assert.equal(p.buttonAttrs.get('aria-pressed'), 'false');
});

test('mobile fallback does not hide a real plugin startup failure', () => {
  const p = page({ desktop: false, fail: true });
  assert.equal(p.window.HavenIdeWorkspace.setEnabled(true), false);
  assert.deepEqual(p.disabled, [FILE]);
  assert.equal(p.warnings.length, 1);
  assert.equal(p.buttonAttrs.get('aria-pressed'), 'false');
});
