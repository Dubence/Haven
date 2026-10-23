'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/js/modules/app-member-defaults.js'), 'utf8');

function client({ startupChoice, layout = '', pluginsReady = true, previousRecord } = {}) {
  const stored = new Map();
  const changes = [], emitted = [];
  if (previousRecord) stored.set('haven_member_defaults_7', JSON.stringify(previousRecord));
  let currentLayout = layout;
  const window = {
    _activeLayoutKey: () => currentLayout,
    _layoutPluginFiles: () => [{ key: 'BraidLayout' }, { key: 'IdeWorkspaceLayout' }],
    _setLayout(value) { currentLayout = value; changes.push(value); }
  };
  if (startupChoice !== undefined) window.HavenIdeWorkspace = { hasStartupChoice: () => startupChoice };
  const context = vm.createContext({
    module: { exports: {} }, window, console,
    localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    document: {
      querySelectorAll: selector => selector === '#density-picker [data-density]' ? [{
        getAttribute: () => 'compact', click: () => stored.set('haven-density', 'compact')
      }] : [],
      getElementById: () => null
    }
  });
  vm.runInContext(source.replace(/^export default/m, 'module.exports ='), context, { filename: 'app-member-defaults.js' });
  const app = Object.assign({}, context.module.exports, {
    user: { id: 7 },
    _prefsReceived: true,
    _memberDefaultsSettingsIn: true,
    _memberDefaultsPluginsIn: pluginsReady,
    _memberDefaultsPluginWaiters: [],
    _userPrefs: {},
    serverSettings: { member_defaults: JSON.stringify({ v: 2, s: { layout: 'BraidLayout', density: 'compact', theme: 'nord' } }) },
    socket: { emit: (...args) => emitted.push(args) }
  });
  return {
    app, stored, changes, emitted,
    layout: () => currentLayout,
    manualLayout: value => { currentLayout = value; },
    pluginsLoaded() {
      app._memberDefaultsPluginsIn = true;
      app._memberDefaultsPluginWaiters.splice(0).forEach(callback => callback());
    }
  };
}

test('workspace startup priority blocks only shared layout defaults, before or after plugins load', () => {
  for (const pluginsReady of [false, true]) {
    const p = client({ startupChoice: true, layout: '', pluginsReady });
    p.app._maybeApplyMemberDefaults();
    p.pluginsLoaded();
    assert.deepEqual(p.changes, []);
    assert.equal(p.layout(), '', 'an explicit original workspace is respected');
    assert.equal(p.stored.get('haven-density'), 'compact', 'other device defaults still apply');
    assert.deepEqual(p.emitted, [['apply-member-defaults']], 'account defaults keep their original path');
    const record = JSON.parse(p.stored.get('haven_member_defaults_7'));
    assert.deepEqual(record, { v: 2, a: { density: 'compact' } });
  }
});

test('a prior shared IDE record cannot allow a newer shared layout to undo the startup choice', () => {
  const p = client({ startupChoice: true, layout: 'IdeWorkspaceLayout', previousRecord: { v: 1, a: { layout: 'IdeWorkspaceLayout' } } });
  p.app._maybeApplyMemberDefaults();
  assert.equal(p.layout(), 'IdeWorkspaceLayout');
  assert.deepEqual(p.changes, []);
});

test('manual exit while defaults await plugins is not reversed later in the page', () => {
  const p = client({ startupChoice: true, layout: 'IdeWorkspaceLayout', pluginsReady: false });
  p.app._maybeApplyMemberDefaults();
  p.manualLayout('');
  p.pluginsLoaded();
  assert.equal(p.layout(), '');
  assert.deepEqual(p.changes, []);
});

test('without a startup choice, existing shared layout behavior is unchanged', () => {
  for (const startupChoice of [undefined, false]) {
    const p = client({ startupChoice });
    p.app._maybeApplyMemberDefaults();
    assert.equal(p.layout(), 'BraidLayout');
    assert.deepEqual(p.changes, ['BraidLayout']);
    assert.equal(JSON.parse(p.stored.get('haven_member_defaults_7')).a.layout, 'BraidLayout');
  }
});

test('without startup priority, a new shared version still updates an untouched previous layout', () => {
  const p = client({ startupChoice: false, layout: 'IdeWorkspaceLayout', previousRecord: { v: 1, a: { layout: 'IdeWorkspaceLayout' } } });
  p.app._maybeApplyMemberDefaults();
  assert.equal(p.layout(), 'BraidLayout');
});
