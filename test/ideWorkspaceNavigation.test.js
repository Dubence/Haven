'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../plugins/IdeWorkspaceLayout.plugin.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const tab = (channel, parent = null) => ({ key: `${channel}:${parent ?? ''}`, channel, parent, title: `topic-${parent ?? channel}`, filename: `${parent ?? channel}.md` });

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function setup() {
  const listeners = new Map(), timers = new Map(), rows = new Set();
  const toasts = [], emitted = [], opened = [], switches = [], gates = new Map();
  let timerId = 0, running = 0, maxRunning = 0;
  const patch = (type, object, method, hook) => {
    const original = object[method];
    if (typeof original !== 'function') return;
    object[method] = function (...args) {
      if (type === 'before') hook(args);
      const result = original.apply(this, args);
      if (type === 'after') hook(args, result);
      return result;
    };
  };
  const context = vm.createContext({
    module: { exports: {} }, console,
    setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    document: {
      getElementById: () => null,
      querySelector(selector) {
        const match = selector.match(/^#messages \[data-msg-id="(\d+)"\]$/);
        return match && rows.has(Number(match[1])) ? { dataset: { msgId: match[1] } } : null;
      }
    },
    HavenApi: {
      UI: { showToast: (...args) => toasts.push(args) },
      Patcher: {
        before: (_, object, method, hook) => patch('before', object, method, hook),
        after: (_, object, method, hook) => patch('after', object, method, hook)
      }
    }
  });
  vm.runInContext(source, context, { filename: 'IdeWorkspaceLayout.plugin.js' });
  const plugin = new context.module.exports();
  const app = {
    currentChannel: 'a',
    channels: [{ code: 'a', name: 'a', is_forum: 1 }, { code: 'b', name: 'b', is_forum: 1 }, { code: 'c', name: 'c', is_forum: 1 }],
    _activeThreadParent: null,
    _lastRenderedMessages: [],
    _forumTopics: new Map(),
    socket: {
      emit: (event, data) => emitted.push({ event, data }),
      on(event, listener) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(listener); },
      off: (event, listener) => listeners.get(event)?.delete(listener)
    },
    async switchChannel(code) {
      switches.push(code);
      running++;
      maxRunning = Math.max(maxRunning, running);
      this.currentChannel = code;
      rows.clear();
      if (gates.has(code)) await gates.get(code).promise;
      this._closeThread();
      running--;
    },
    _renderMessages(messages) {
      this._lastRenderedMessages = messages;
      rows.clear();
      for (const message of messages) rows.add(message.id);
    },
    _openThread(parent) { this._activeThreadParent = parent; opened.push([this.currentChannel, parent]); },
    _closeThread() { this._activeThreadParent = null; },
    _forumTitleOf: topic => topic.title,
    _getMessagesParams: (code, extra) => ({ code, sort: 'created', tags: ['work'], ...extra })
  };
  Object.assign(plugin, {
    _app: app, _shell: {}, _tabs: [], _navigationId: 0, _navigationQueue: Promise.resolve(),
    _renderedChannel: 'a', _scheduleSync() {}
  });
  plugin._installHooks();
  function render(channel, messages, extra = {}) {
    const data = { channelCode: channel, messages, ...extra };
    // Native history processing awaits decryption. Socket listeners observe
    // the response before that handler calls _renderMessages with this array.
    for (const callback of listeners.get('message-history') || []) callback(data);
    if (app.currentChannel === channel) app._renderMessages(messages);
  }
  return { plugin, app, rows, toasts, emitted, opened, switches, gates, render, listeners, timers, maxRunning: () => maxRunning };
}

test('cross-channel thread navigation waits for both async switch and native rendering', async () => {
  for (const historyFirst of [true, false]) {
    const p = setup();
    const gate = deferred();
    p.gates.set('b', gate);
    const done = p.plugin._navigate(tab('b', 20));
    await tick();
    if (historyFirst) p.render('b', [{ id: 20 }]);
    assert.deepEqual(p.opened, []);
    gate.resolve();
    await done;
    if (!historyFirst) {
      assert.deepEqual(p.opened, []);
      p.render('b', [{ id: 20 }]);
    }
    assert.deepEqual(p.opened, [['b', 20]]);
    assert.equal(p.plugin._pending, null);
    assert.equal(p.timers.size, 0);
  }
});

test('the latest tab wins and async channel switches never overlap', async () => {
  const p = setup();
  const gate = deferred();
  p.gates.set('b', gate);
  const first = p.plugin._navigate(tab('b', 20));
  await tick();
  const latest = p.plugin._navigate(tab('c', 30));
  p.render('b', [{ id: 20 }]);
  assert.deepEqual(p.opened, []);
  gate.resolve();
  await Promise.all([first, latest]);
  p.render('c', [{ id: 30 }]);
  assert.deepEqual(p.switches, ['b', 'c']);
  assert.equal(p.maxRunning(), 1);
  assert.deepEqual(p.opened, [['c', 30]]);
});

test('a superseded queued navigation never switches channels', async () => {
  const p = setup();
  const first = p.plugin._navigate(tab('b'));
  const second = p.plugin._navigate(tab('c'));
  await Promise.all([first, second]);
  p.render('c', []);
  assert.deepEqual(p.switches, ['c']);
  assert.equal(p.plugin._pending, null);
});

test('off-page roots request one around snapshot and ignore duplicate cached renders', async () => {
  const p = setup();
  await p.plugin._navigate(tab('a', 10));
  assert.equal(p.emitted.length, 1);
  assert.equal(p.emitted[0].event, 'get-messages');
  assert.equal(p.emitted[0].data.around, 10);
  assert.equal(p.emitted[0].data.sort, 'created');
  p.app._renderMessages(p.app._lastRenderedMessages); // member-list refresh
  p.app._renderMessages(p.app._lastRenderedMessages);
  assert.deepEqual(p.toasts, []);
  assert.equal(p.emitted.length, 1);
  assert.deepEqual(p.opened, []);
  p.render('a', [{ id: 10 }], { around: 10 });
  assert.deepEqual(p.opened, [['a', 10]]);
  assert.equal(p.listeners.get('message-history').size, 0);
});

test('a deleted root retained by the forum cache is not reopened or retried forever', async () => {
  const p = setup();
  const target = tab('a', 10);
  p.plugin._tabs = [target];
  p.app._forumTopics.set(10, { id: 10, title: 'deleted' });
  await p.plugin._navigate(target);
  assert.deepEqual(p.opened, []);
  p.render('a', [{ id: 11 }], { around: 10 });
  assert.deepEqual(p.opened, []);
  assert.equal(p.plugin._pending, null);
  assert.equal(p.plugin._tabs.length, 0);
  assert.equal(p.toasts.length, 1);
  assert.equal(p.emitted.length, 1);
  assert.equal(p.listeners.get('message-history').size, 0);
});

test('channel removal before a queued switch prevents navigation', async () => {
  const p = setup();
  const target = tab('b', 20);
  p.plugin._tabs = [target];
  const done = p.plugin._navigate(target);
  p.app.channels = p.app.channels.filter(channel => channel.code !== 'b');
  await done;
  assert.deepEqual(p.switches, []);
  assert.deepEqual(p.opened, []);
  assert.equal(p.plugin._pending, null);
  assert.equal(p.plugin._tabs.length, 0);
});

test('channel removal while waiting for history also prevents opening its thread', async () => {
  const p = setup();
  await p.plugin._navigate(tab('b', 20));
  p.app.channels = p.app.channels.filter(channel => channel.code !== 'b');
  p.render('b', [{ id: 20 }]);
  assert.deepEqual(p.opened, []);
  assert.equal(p.plugin._pending, null);
});

test('closing a pending tab cancels its late history without reopening it', async () => {
  const p = setup();
  const target = tab('a', 10);
  p.plugin._tabs = [tab('a'), target];
  await p.plugin._navigate(target);
  p.plugin._closeTab(target);
  p.render('a', [{ id: 10 }], { around: 10 });
  assert.deepEqual(p.opened, []);
  assert.equal(p.plugin._pending, null);
  assert.equal(p.listeners.get('message-history').size, 0);
  assert.equal(p.timers.size, 0);
});

test('cancel or native channel navigation invalidates pending tab work', async () => {
  for (const kind of ['cancel', 'native']) {
    const p = setup();
    await p.plugin._navigate(tab('a', 10));
    if (kind === 'cancel') p.plugin._cancelNavigation();
    else await p.app.switchChannel('b');
    p.render('a', [{ id: 10 }], { around: 10 });
    assert.deepEqual(p.opened, [], kind);
    assert.equal(p.plugin._pending, null, kind);
    assert.equal(p.listeners.get('message-history').size, 0, kind);
  }
});

test('same-channel navigation with no render checkpoint requests fresh native history', async () => {
  const p = setup();
  p.plugin._renderedChannel = null;
  await p.plugin._navigate(tab('a', 10));
  assert.equal(p.emitted.length, 1);
  assert.equal(p.emitted[0].data.code, 'a');
  assert.equal(p.emitted[0].data.around, undefined);
  p.render('a', [{ id: 10 }]);
  assert.deepEqual(p.opened, [['a', 10]]);
});

test('invalid thread ids and stale or DM thread tabs never send navigation requests', async () => {
  for (const target of [tab('gone', 10), tab('a', 'bad'), tab('a', 0), tab('a', -1), tab('dm', 10)]) {
    const p = setup();
    p.app.channels.push({ code: 'dm', is_dm: 1 });
    await p.plugin._navigate(target);
    assert.deepEqual(p.opened, []);
    assert.deepEqual(p.switches, []);
    assert.deepEqual(p.emitted, []);
    assert.equal(p.plugin._pending, null);
    assert.equal(p.toasts.length, 1);
  }
});

test('native navigation closes the old forum thread before awaiting a DM key', async () => {
  const p = setup();
  const gate = deferred();
  p.app.channels.push({ code: 'dm', is_dm: 1 });
  p.gates.set('dm', gate);
  p.app._activeThreadParent = 10;
  const done = p.app.switchChannel('dm');
  assert.equal(p.app.currentChannel, 'dm');
  assert.equal(p.app._activeThreadParent, null);
  assert.equal(p.plugin._renderedChannel, null);
  assert.equal(p.plugin._descriptor('dm', p.app._activeThreadParent).parent, null);
  gate.resolve();
  await done;
});

test('closing the active thread tab selects an adjacent real tab', async () => {
  const p = setup();
  p.app._activeThreadParent = 10;
  p.plugin._tabs = [tab('a'), tab('a', 10)];
  p.plugin._closeTab(tab('a', 10));
  await p.plugin._navigationQueue;
  assert.equal(p.app._activeThreadParent, null);
  assert.equal(p.plugin._pending, null);
  assert.equal(p.plugin._tabs.length, 1);
});

test('native rendering records which channel owns the cached history', () => {
  const container = { innerHTML: '', classList: { remove() {} }, style: { removeProperty() {} }, dataset: {} };
  const context = vm.createContext({ module: { exports: {} }, document: { getElementById: () => container } });
  const messagesSource = fs.readFileSync(path.join(__dirname, '../public/js/modules/app-messages.js'), 'utf8');
  vm.runInContext(messagesSource.replace(/^export default/m, 'module.exports ='), context);
  const app = { currentChannel: 'a', _isForumChannel: () => true, _renderForum() {} };
  const render = context.module.exports._renderMessages;
  render.call(app, []);
  assert.equal(app._lastRenderedChannel, 'a');
  app.currentChannel = 'b';
  assert.equal(app._lastRenderedChannel, 'a', 'switching alone cannot mark old cached data as the new channel');
  render.call(app, []);
  assert.equal(app._lastRenderedChannel, 'b');
});
