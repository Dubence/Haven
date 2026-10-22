'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function setup() {
  const handlers = new Map();
  const effects = [];
  const replies = [];
  const requests = [];
  const elements = {
    'thread-panel': { style: {}, dataset: {} },
    'thread-panel-title': { textContent: '' },
    'thread-parent-preview': { textContent: 'existing preview' },
    'thread-input': { focus() {} },
    'thread-messages': {
      set innerHTML(value) { assert.equal(value, ''); replies.length = 0; effects.push('clear'); }
    }
  };
  const crypto = { isEncrypted: value => value.startsWith('encrypted:') };
  const context = vm.createContext({
    module: { exports: {} },
    console,
    window: { HavenE2E: crypto },
    HavenE2E: crypto,
    document: { getElementById: id => elements[id] || null, querySelector: () => null },
    localStorage: { getItem: () => null },
    t: key => key
  });
  const methods = {};
  for (const file of ['app-socket-events.js', 'app-socket-channels.js', 'app-threads.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/modules', file), 'utf8');
    vm.runInContext(source.replace(/^export default/m, 'module.exports ='), context, { filename: file });
    Object.assign(methods, context.module.exports);
  }
  const app = Object.assign({}, methods, {
    currentChannel: 'channel-a',
    channels: [],
    _activeThreadParent: 10,
    _threadNavigationEpoch: 1,
    _voiceRosterWatchdog: true,
    socket: {
      on: (event, handler) => handlers.set(event, handler),
      emit: (event, data) => requests.push({ event, data })
    },
    _decryptMessages: async () => {},
    _applyThreadClosed: closed => effects.push(['closed', closed]),
    _setThreadParentHeader: header => effects.push(['header', header.username]),
    _threadRootPreview: content => content,
    _forumThreadRenderTopic: () => effects.push('topic'),
    _forumBlogPrepareThread: () => effects.push('blog'),
    _appendThreadMessage: (message, options) => { replies.push(message.id); effects.push(['reply', message.id, !!options?.live]); },
    _resetThreadJump: () => effects.push('jump'),
    _clearThreadMentionsForParent() {},
    _clearThreadReply() {},
    _setThreadPiPEnabled() {}
  });
  app._listenFeatureEvents();
  app._listenChannelsAndMessages();
  return { app, effects, replies, elements, requests, receive: (event, data) => handlers.get(event)(data) };
}

const history = (patch = {}) => ({
  parentId: 10,
  parentUsername: 'author',
  parentContent: 'real topic body',
  closed: false,
  messages: [{ id: 11, content: 'real reply' }],
  ...patch
});

test('the current server thread snapshot renders the real parent and replies', async () => {
  const { receive, replies, effects, elements } = setup();
  // The server supplies parentId, but no channelCode, in this response.
  await receive('thread-messages', history());
  assert.deepEqual(replies, [11]);
  assert.equal(elements['thread-parent-preview'].textContent, 'real topic body');
  assert.deepEqual(effects.slice(0, 2), [['closed', false], ['header', 'author']]);
});

test('a response for another thread, another channel, or a closed panel has no side effects', async () => {
  for (const kind of ['parent', 'channel', 'closed']) {
    const { app, receive, effects } = setup();
    let decrypts = 0;
    app._decryptMessages = async () => { decrypts++; };
    if (kind === 'closed') app._closeThread();
    effects.length = 0;
    await receive('thread-messages', history(kind === 'parent' ? { parentId: 20 }
      : kind === 'channel' ? { channelCode: 'channel-b' } : {}));
    assert.deepEqual(effects, [], kind);
    assert.equal(decrypts, 0, kind);
  }
});

test('changing tabs during parent decryption does not update the new thread header or load old replies', async () => {
  const { app, receive, effects, elements } = setup();
  const pending = deferred();
  let decrypts = 0;
  app._decryptMessages = () => { decrypts++; return pending.promise; };
  const done = receive('thread-messages', history({ parentContent: 'encrypted:old topic' }));
  app._openThread(20);
  const newPreview = elements['thread-parent-preview'].textContent;
  effects.length = 0;
  pending.resolve();
  await done;
  assert.equal(decrypts, 1);
  assert.deepEqual(effects, []);
  assert.equal(elements['thread-parent-preview'].textContent, newPreview);
});

test('history decryption cannot redraw after close, channel switch, or reopening the same thread', async () => {
  for (const kind of ['close', 'channel', 'reopen']) {
    const { app, receive, effects, replies } = setup();
    const pending = deferred();
    app._decryptMessages = () => pending.promise;
    const done = receive('thread-messages', history());
    if (kind === 'channel') app.currentChannel = 'channel-b';
    else {
      app._closeThread();
      if (kind === 'reopen') app._openThread(10);
    }
    effects.length = 0;
    pending.resolve();
    await done;
    assert.deepEqual(effects, [], kind);
    assert.deepEqual(replies, [], kind);
  }
});

test('a newer snapshot of the same thread wins when older decryption finishes last', async () => {
  const { app, receive, replies, elements } = setup();
  const older = deferred();
  app._decryptMessages = messages => messages[0].id === 11 ? older.promise : Promise.resolve();
  const oldResponse = receive('thread-messages', history());
  await receive('thread-messages', history({ parentContent: 'updated topic', messages: [{ id: 12, content: 'new reply' }] }));
  older.resolve();
  await oldResponse;
  assert.deepEqual(replies, [12]);
  assert.equal(elements['thread-parent-preview'].textContent, 'updated topic');
});

test('a rejected stale snapshot does not cancel current history decryption', async () => {
  const { app, receive, replies } = setup();
  const pending = deferred();
  app._decryptMessages = () => pending.promise;
  const current = receive('thread-messages', history());
  await receive('thread-messages', history({ parentId: 20 }));
  pending.resolve();
  await current;
  assert.deepEqual(replies, [11]);
});

test('live replies finish decryption only into the same open view', async () => {
  for (const kind of ['current', 'parent', 'channel', 'reopen']) {
    const { app, receive, replies } = setup();
    const pending = deferred();
    app._decryptMessages = () => pending.promise;
    const done = receive('new-thread-message', { parentId: 10, channelCode: 'channel-a', message: { id: 12 } });
    if (kind === 'parent') app._openThread(20);
    else if (kind === 'channel') app.currentChannel = 'channel-b';
    else if (kind === 'reopen') { app._closeThread(); app._openThread(10); }
    pending.resolve();
    await done;
    assert.deepEqual(replies, kind === 'current' ? [12] : [], kind);
  }
});

test('opening and closing advance the navigation identity even for the same parent', () => {
  const { app, requests } = setup();
  const first = app._threadNavigationEpoch;
  app._openThread(10);
  assert.ok(app._threadNavigationEpoch > first);
  const opened = app._threadNavigationEpoch;
  app._closeThread();
  assert.ok(app._threadNavigationEpoch > opened);
  assert.equal(app._activeThreadParent, null);
  assert.deepEqual(requests.map(({ event, data }) => [event, data.parentId]), [['get-thread-messages', 10]]);
});

test('channel history cannot render or change pagination after navigating during decryption', async () => {
  const { app, receive } = setup();
  const pending = deferred();
  const renders = [];
  app._decryptMessages = () => pending.promise;
  app._renderMessages = messages => renders.push(messages);
  const oldHistory = receive('message-history', { channelCode: 'channel-a', messages: [{ id: 1 }] });
  app.currentChannel = 'channel-b';
  app._oldestMsgId = 20;
  app._newestMsgId = 30;
  pending.resolve();
  await oldHistory;
  assert.deepEqual(renders, []);
  assert.equal(app._oldestMsgId, 20);
  assert.equal(app._newestMsgId, 30);

  await receive('message-history', { channelCode: 'channel-b', messages: [{ id: 31 }] });
  assert.deepEqual(renders, [[{ id: 31 }]]);
  assert.equal(app._oldestMsgId, 31);
});

test('member updates cannot repaint the previous channel cache while new history loads', async () => {
  const { app, receive } = setup();
  const renders = [];
  app._renderMessages = (messages, lastRead) => renders.push([messages, lastRead]);
  app._lastRenderedMessages = [{ id: 10 }];
  app._lastRenderedReadId = 10;
  app._lastRenderedChannel = 'channel-a';
  app.currentChannel = 'channel-b';
  app.channelMembers = [];
  await receive('channel-members', { channelCode: 'channel-b', members: [{ id: 2 }] });
  assert.deepEqual(renders, []);
  assert.equal(app.channelMembers[0].id, 2);

  app.channelMembers = [];
  app._lastRenderedChannel = 'channel-b';
  await receive('channel-members', { channelCode: 'channel-b', members: [{ id: 2 }] });
  assert.deepEqual(renders, [[[{ id: 10 }], 10]]);
});
