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

function page({ search = '', stored = new Map(), safe = false, recovery = false, owner = '', fail = false, editing = false, missing = false, desktop = true, serverDefault = '' } = {}) {
  const events = new Map();
  const attrs = new Map();
  if (safe) attrs.set('data-haven-safe-mode', '1');
  if (editing) attrs.set('data-haven-layout-editing', '1');
  if (owner) attrs.set('data-haven-layout-owner', owner);
  if (serverDefault) attrs.set('data-haven-default-workspace', serverDefault);
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
  const plugin = { instance: { _engaged: owner === ID }, enabled: owner === ID, suppressed: safe || recovery };
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
      suppressed: safe || recovery,
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
  assert.equal(p.window.HavenIdeWorkspace.hasStartupChoice(), false);
  p.emit('DOMContentLoaded');
  p.emit('haven:plugins-loaded');
  assert.deepEqual(p.selections, []);
  assert.equal(p.attrs.get('data-haven-layout-owner'), 'ChromeLayout');
  assert.equal(p.button.disabled, false);
  assert.equal(p.buttonAttrs.get('aria-pressed'), 'false');
  assert.equal(p.window.HavenIdeWorkspace.hasStartupChoice(), false);
});

test('IDE button uses the shared selector and can return to the original layout', () => {
  const p = page({ owner: 'ChromeLayout' });
  p.emit('DOMContentLoaded');
  p.emit('haven:plugins-loaded');
  p.buttonEvents.get('click')();
  assert.deepEqual(p.selections, [ID]);
  assert.equal(p.attrs.get('data-haven-layout-owner'), ID);
  assert.equal(p.buttonAttrs.get('aria-pressed'), 'true');
  assert.equal(p.window.HavenIdeWorkspace.hasStartupChoice(), false, 'a later manual toggle is not a startup override');
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
  assert.equal(signedIn.window.HavenIdeWorkspace.hasStartupChoice(), true);
  signedIn.emit('haven:plugins-loaded');
  assert.deepEqual(signedIn.selections, [ID]);
  assert.equal(stored.has(PENDING_KEY), false);
  assert.equal(signedIn.window.HavenIdeWorkspace.hasStartupChoice(), true, 'account defaults must still respect the consumed explicit choice');
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

test('the server IDE default activates a new visitor without a query parameter', () => {
  const p = page({ serverDefault: 'ide' });
  assert.equal(p.window.HavenIdeWorkspace.hasStartupChoice(), true, 'visible synchronously before account defaults arrive');
  p.emit('DOMContentLoaded');
  assert.deepEqual(p.selections, [], 'selection waits until layout plugins have loaded');
  p.emit('haven:plugins-loaded');
  assert.deepEqual(p.selections, [ID]);
  assert.equal(p.attrs.get('data-haven-layout-owner'), ID);
  assert.equal(p.plugin.enabled, true);
  assert.equal(p.buttonAttrs.get('aria-pressed'), 'true');
  assert.equal(p.window.HavenIdeWorkspace.hasStartupChoice(), true);
});

test('the server IDE default replaces a returning visitor\'s other local layout', () => {
  const p = page({ serverDefault: 'ide', owner: 'ChromeLayout' });
  p.emit('haven:plugins-loaded');
  assert.deepEqual(p.selections, [ID], 'the shared selector resolves competing layouts');
  assert.equal(p.attrs.get('data-haven-layout-owner'), ID);
  assert.equal(p.warnings.length, 0);
});

test('without a server IDE default the original layout and an invalid default remain unchanged', () => {
  for (const serverDefault of ['', 'original', 'IDE', 'unknown']) {
    const p = page({ serverDefault });
    p.emit('haven:plugins-loaded');
    assert.deepEqual(p.selections, [], `default ${JSON.stringify(serverDefault)} must not opt in`);
    assert.equal(p.attrs.has('data-haven-layout-owner'), false);
    assert.equal(p.plugin.enabled, false);
    assert.equal(p.window.HavenIdeWorkspace.hasStartupChoice(), false);
  }
});

test('an explicit original-layout link overrides the server IDE default for the current visit', () => {
  const p = page({ serverDefault: 'ide', search: '?workspace=original&channel=abcd1234', owner: ID });
  p.emit('haven:plugins-loaded');
  assert.deepEqual(p.selections, ['']);
  assert.equal(p.attrs.has('data-haven-layout-owner'), false);
  assert.equal(p.plugin.enabled, false);
  assert.equal(p.stored.has(PENDING_KEY), false);
  assert.equal(p.urls.at(-1), '/app?channel=abcd1234');
  assert.equal(p.window.HavenIdeWorkspace.hasStartupChoice(), true, 'the original override outlives query cleanup');
  p.emit('haven:plugins-loaded');
  assert.deepEqual(p.selections, [''], 'metadata refresh must not replace the explicit original choice');
});

test('an explicit IDE link works with the server default and is not reapplied after Exit', () => {
  const p = page({ serverDefault: 'ide', search: '?workspace=ide', owner: 'ChromeLayout' });
  p.emit('haven:plugins-loaded');
  assert.deepEqual(p.selections, [ID]);
  assert.equal(p.stored.has(PENDING_KEY), false);
  assert.equal(p.window.HavenIdeWorkspace.setEnabled(false), true);
  p.emit('haven:plugins-loaded');
  assert.deepEqual(p.selections, [ID, '']);
  assert.equal(p.attrs.has('data-haven-layout-owner'), false);
  assert.equal(p.window.HavenIdeWorkspace.hasStartupChoice(), true, 'late member defaults cannot reclaim this visit after Exit');
});

test('an original-layout choice captured before login takes precedence over the server default afterward', () => {
  const stored = new Map();
  page({ search: '?workspace=original', stored, serverDefault: 'ide' });
  assert.equal(stored.get(PENDING_KEY), 'original');
  const signedIn = page({ stored, serverDefault: 'ide', owner: ID });
  signedIn.emit('haven:plugins-loaded');
  assert.deepEqual(signedIn.selections, ['']);
  assert.equal(stored.has(PENDING_KEY), false);
  signedIn.emit('haven:plugins-loaded');
  assert.deepEqual(signedIn.selections, ['']);
});

test('a same-visit Exit survives plugin refreshes but the next normal visit uses the server default again', () => {
  const p = page({ serverDefault: 'ide' });
  p.emit('haven:plugins-loaded');
  p.emit('haven:plugins-loaded');
  assert.deepEqual(p.selections, [ID], 'duplicate ready events are idempotent');
  p.buttonEvents.get('click')();
  assert.equal(p.plugin.enabled, false);
  p.emit('haven:plugins-loaded');
  p.emit('haven:plugins-loaded');
  assert.deepEqual(p.selections, [ID, '']);
  assert.equal(p.attrs.has('data-haven-layout-owner'), false);
  const nextVisit = page({ serverDefault: 'ide', owner: '' });
  nextVisit.emit('haven:plugins-loaded');
  assert.deepEqual(nextVisit.selections, [ID], 'a returning original-layout user receives the server default');
});

test('safe mode and pending customization recovery both suppress the server IDE default', () => {
  for (const options of [{ safe: true }, { recovery: true }]) {
    const p = page({ serverDefault: 'ide', search: '?workspace=ide', ...options });
    p.emit('haven:plugins-loaded');
    p.emit('haven:plugins-loaded');
    assert.deepEqual(p.selections, []);
    assert.equal(p.window.HavenIdeWorkspace.setEnabled(true), false);
    assert.equal(p.button.disabled, true);
    assert.equal(p.stored.has(PENDING_KEY), false);
    assert.equal(p.attrs.has('data-haven-layout-owner'), false);
    assert.equal(p.window.HavenIdeWorkspace.hasStartupChoice(), true, 'recovery stays protected from late legacy member defaults');
  }
});

test('a failed server-default activation restores the prior layout without retrying on metadata refresh', () => {
  const p = page({ serverDefault: 'ide', owner: 'ChromeLayout', fail: true });
  p.emit('haven:plugins-loaded');
  assert.deepEqual(p.selections, [ID, 'ChromeLayout']);
  assert.deepEqual(p.disabled, [FILE]);
  assert.deepEqual(p.saves, [[ID, 'layoutOn', '0']]);
  assert.equal(p.attrs.get('data-haven-layout-owner'), 'ChromeLayout');
  assert.equal(p.warnings.length, 1);
  p.emit('haven:plugins-loaded');
  assert.deepEqual(p.selections, [ID, 'ChromeLayout']);
  assert.equal(p.warnings.length, 1, 'failure must not trap the visitor in repeated activation attempts');
});

test('the server default keeps the mobile fallback and permits a same-visit Exit', () => {
  const p = page({ serverDefault: 'ide', desktop: false });
  p.emit('haven:plugins-loaded');
  assert.deepEqual(p.selections, [ID]);
  assert.equal(p.plugin.enabled, true);
  assert.equal(p.plugin.instance._engaged, true);
  assert.equal(p.attrs.has('data-haven-layout-owner'), false);
  assert.match(p.button.title, /original layout on mobile/);
  p.buttonEvents.get('click')();
  p.emit('haven:plugins-loaded');
  assert.deepEqual(p.selections, [ID, '']);
  assert.equal(p.plugin.enabled, false);
});
