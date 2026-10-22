'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const pluginSource = fs.readFileSync(path.join(__dirname, '../plugins/IdeWorkspaceLayout.plugin.js'), 'utf8');
const searchSource = fs.readFileSync(path.join(__dirname, '../public/js/modules/app-search.js'), 'utf8');

function setup({ thread = null, state = null, visibleContainer = false } = {}) {
  const events = [];
  let focusVisible = false;
  let mainHidden = thread != null;
  const elements = new Map();
  elements.set('search-container', { style: { display: visibleContainer ? 'flex' : 'none' } });
  elements.set('search-panel', { style: { display: 'none' } });
  elements.set('search-input', {
    value: state?.query || '',
    focus() {
      focusVisible = !mainHidden && elements.get('search-container').style.display === 'flex';
      events.push('focus');
    },
  });
  const context = vm.createContext({
    module: { exports: {} }, console,
    document: { getElementById: id => elements.get(id) || null },
  });
  vm.runInContext(pluginSource, context);
  vm.runInContext(searchSource.replace('export default {', 'globalThis.SearchMethods = {'), context);
  const plugin = new context.module.exports();
  const app = {
    channels: [{ code: 'general', name: 'General' }], currentChannel: 'general',
    _activeThreadParent: thread,
    _searchState: state ? { __public__: state } : {},
    _closeThread() { events.push('close-thread'); this._activeThreadParent = null; },
    _searchRestoreSidebar() { events.push('restore-sidebar'); },
    _sfpSync() { events.push('sync-filters'); },
    _searchRenderPanel() { events.push('render-search'); },
  };
  // Run the real native toggle/state accessors. A mistaken toggle closes the
  // search and clears its query, rather than a permissive mock hiding the bug.
  for (const name of ['_searchContextKey', '_searchGetState', '_searchSetState', '_searchClearContext', '_searchToggle', '_searchClose']) {
    app[name] = context.SearchMethods[name];
  }
  plugin._app = app;
  plugin._pending = { channel: 'general', parent: 99 };
  plugin._tabs = thread == null ? [] : [{ key: `general:${thread}`, channel: 'general', parent: thread }];
  plugin._cancelNavigation = () => { events.push('cancel-navigation'); plugin._pending = null; };
  plugin._sync = () => { events.push('sync-layout'); mainHidden = app._activeThreadParent != null; };
  plugin._toggleContext = on => { events.push(`context-${on}`); };
  return { plugin, app, elements, events, focusedVisible: () => focusVisible };
}

test('IDE Search exits the thread view, cancels pending navigation and focuses the visible native input', () => {
  const env = setup({ thread: 42 });
  const topicTab = env.plugin._tabs[0];
  env.plugin._searchMessages();
  assert.equal(env.plugin._pending, null);
  assert.equal(env.app._activeThreadParent, null);
  assert.equal(env.plugin._tabs[0], topicTab, 'the saved topic tab remains available');
  assert.deepEqual(env.events.slice(0, 4), ['cancel-navigation', 'close-thread', 'sync-layout', 'context-true']);
  assert.equal(env.app._searchState.__public__.open, true);
  assert.equal(env.focusedVisible(), true);
});

test('IDE Search keeps an already open empty-query search open when the results panel is hidden', () => {
  const state = { open: true, query: '', results: [], page: 1 };
  const env = setup({ state, visibleContainer: true });
  env.plugin._searchMessages();
  assert.equal(env.app._searchState.__public__, state, 'native search state is not cleared');
  assert.equal(env.elements.get('search-container').style.display, 'flex');
  assert.ok(env.events.includes('render-search'));
  assert.ok(!env.events.includes('restore-sidebar'));
  assert.equal(env.focusedVisible(), true);
});

test('IDE Search restores a hidden input container for an open search without losing the query', () => {
  const state = { open: true, query: 'saved query', results: [{ id: 1 }], page: 2 };
  const env = setup({ thread: 42, state });
  env.plugin._searchMessages();
  assert.equal(env.app._searchState.__public__, state);
  assert.equal(env.elements.get('search-input').value, 'saved query');
  assert.equal(state.page, 2);
  assert.equal(env.focusedVisible(), true);
});

test('IDE Search opens a closed native search with its saved query and leaves channel view intact', () => {
  const env = setup({ state: { open: false, query: 'previous query', results: [], page: 1 } });
  env.plugin._searchMessages();
  assert.equal(env.app._searchState.__public__.open, true);
  assert.equal(env.elements.get('search-input').value, 'previous query');
  assert.ok(env.events.includes('sync-filters'), 'native search toggle initializes filters');
  assert.ok(!env.events.includes('close-thread'));
  assert.equal(env.focusedVisible(), true);
});
