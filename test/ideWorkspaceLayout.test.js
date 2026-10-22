'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const IdeWorkspaceLayout = require('../plugins/IdeWorkspaceLayout.plugin.js');

// The plugin builds nodes without parsing HTML. This small DOM models moving
// the actual nodes, listener identity and insertion order so restoration can
// be checked without a browser dependency.
class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatchEvent(event) {
    for (const fn of [...(this.listeners.get(event.type) || [])]) fn.call(this, event);
  }
  listenerCount() { return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0); }
}

function matches(node, selector) {
  const parts = selector.trim().split(/\s+/);
  const simple = (element, part) => {
    if (!element) return false;
    if (part.startsWith('#')) return element.id === part.slice(1);
    if (part.startsWith('.')) return element.classList.contains(part.slice(1));
    const attr = part.match(/^\[([^=]+)="([^"]*)"\]$/);
    return attr ? element.getAttribute(attr[1]) === attr[2] : element.tagName.toLowerCase() === part;
  };
  if (!simple(node, parts.pop())) return false;
  let parent = node.parentNode;
  while (parts.length) {
    const part = parts.pop();
    while (parent && !simple(parent, part)) parent = parent.parentNode;
    if (!parent) return false;
    parent = parent.parentNode;
  }
  return true;
}

class Element extends Target {
  constructor(tag, document) {
    super();
    this.tagName = tag.toUpperCase();
    this.ownerDocument = document;
    this.parentNode = null;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this.value = '';
    this.id = '';
    this.open = false;
    this._text = '';
    this._classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => this._classes.add(name)),
      remove: (...names) => names.forEach(name => this._classes.delete(name)),
      contains: name => this._classes.has(name),
      toggle: (name, force) => {
        const on = force === undefined ? !this._classes.has(name) : !!force;
        if (on) this._classes.add(name); else this._classes.delete(name);
        return on;
      },
    };
  }
  get className() { return [...this._classes].join(' '); }
  set className(value) { this._classes = new Set(value.split(/\s+/).filter(Boolean)); }
  get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; }
  get isConnected() { return this.ownerDocument.documentElement.contains(this); }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  hasAttribute(key) { return this.attributes.has(key); }
  removeAttribute(key) { this.attributes.delete(key); }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  appendChild(node) { return this.insertBefore(node, null); }
  insertBefore(node, reference) {
    if (reference && reference.parentNode !== this) throw new Error('Insertion reference is not a child');
    node.remove();
    const index = reference ? this.children.indexOf(reference) : this.children.length;
    this.children.splice(index, 0, node);
    node.parentNode = this;
    return node;
  }
  remove() {
    if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
  replaceChildren(...nodes) { [...this.children].forEach(node => node.remove()); this.append(...nodes); }
  contains(node) {
    for (let current = node; current; current = current.parentNode) if (current === this) return true;
    return false;
  }
  querySelectorAll(selector) {
    const result = [];
    for (const child of this.children) {
      if (matches(child, selector)) result.push(child);
      result.push(...child.querySelectorAll(selector));
    }
    return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() { this.ownerDocument.activeElement = this; }
  click() { this.dispatchEvent({ type: 'click', target: this }); }
  getClientRects() { return this.isConnected && !this.hidden ? [{}] : []; }
  show() { this.open = true; }
  close() { this.open = false; }
}

function setup(t, { desktop = true, failObserver = false } = {}) {
  const document = new Target();
  document.documentElement = new Element('html', document);
  document.body = new Element('body', document);
  document.documentElement.appendChild(document.body);
  document.title = 'General · Haven';
  document.createElement = tag => new Element(tag, document);
  document.querySelectorAll = selector => document.documentElement.querySelectorAll(selector);
  document.querySelector = selector => document.documentElement.querySelector(selector);
  document.getElementById = id => document.querySelector('#' + id);
  const native = {};
  const add = (id, parent, tag = 'div', region = '') => {
    const node = document.createElement(tag);
    node.id = id;
    if (region) node.setAttribute('data-haven-region', region);
    parent.appendChild(node);
    native[id] = node;
    return node;
  };
  const appRoot = add('app', document.body);
  const appBody = add('app-body', appRoot);
  add('server-bar', appBody);
  const sidebar = add('sidebar', appBody, 'aside', 'navigation-sidebar');
  add('sidebar-header', sidebar);
  const split = add('sidebar-split', sidebar);
  const channels = add('channel-list', split);
  add('dm-list', split);
  const channelRow = add('general-row', channels);
  channelRow.className = 'channel-item';
  channelRow.textContent = 'General';
  add('sidebar-actions', sidebar);
  const main = add('main', appBody, 'main', 'main');
  const messages = add('messages', main);
  add('message-one', messages).textContent = 'Real message';
  add('message-input', main, 'textarea').value = 'Draft channel message';
  add('send-button', main, 'button');
  add('right-sidebar', appBody);
  const thread = add('thread-panel', appBody);
  add('thread-parent-preview', thread);
  add('thread-forum-bar', thread);
  add('thread-messages', thread);
  add('thread-input', thread, 'textarea').value = 'Draft forum reply';
  add('thread-send-button', thread, 'button');
  add('status-bar', appRoot);
  const initialOrder = new Map([document.body, appRoot, ...Object.values(native)].map(node => [node, [...node.children]]));

  const media = new Target();
  media.matches = desktop;
  const socket = new Target();
  socket.connected = true;
  socket.on = socket.addEventListener.bind(socket);
  socket.off = socket.removeEventListener.bind(socket);
  socket.emit = () => {};
  const app = {
    channels: [{ code: 'general', name: 'General' }], currentChannel: 'general',
    _lastRenderedMessages: [], _activeThreadParent: null, _forumTopics: new Map(), socket,
    switchChannel(code) { this.currentChannel = code; },
    _renderMessages() {}, _renderChannels() {}, _openThread(id) { this._activeThreadParent = id; },
    _closeThread() { this._activeThreadParent = null; }, _forumUpdateTopic() {},
    _updateTabTitle() { document.title = 'General · Haven'; }, _forumSyncThreadEdges() {},
  };
  const originals = new Map(Object.entries(app).filter(([, value]) => typeof value === 'function'));
  const data = new Map();
  const patches = new Map();
  const patch = (id, object, method, fn, before) => {
    if (typeof object[method] !== 'function') return;
    if (!patches.has(method)) patches.set(method, { id, object, original: object[method] });
    const current = object[method];
    object[method] = function (...args) {
      if (before) fn(args);
      const result = current.apply(this, args);
      if (!before) fn(args, result);
      return result;
    };
  };
  let owner = null;
  const HavenApi = {
    Data: { load: (id, key, fallback) => data.get(`${id}:${key}`) ?? fallback,
      save: (id, key, value) => data.set(`${id}:${key}`, value) },
    Patcher: {
      before: (id, object, method, fn) => patch(id, object, method, fn, true),
      after: (id, object, method, fn) => patch(id, object, method, fn, false),
      unpatchAll(id) {
        for (const [method, entry] of patches) if (entry.id === id) {
          entry.object[method] = entry.original;
          patches.delete(method);
        }
      },
    },
    Layout: {
      get owner() { return owner; },
      acquire(id) {
        if (owner && owner !== id) return false;
        if (owner === id) return true;
        owner = id;
        document.documentElement.setAttribute('data-haven-layout-owner', id);
        document.dispatchEvent({ type: 'haven:layout-owner-change', detail: { owner } });
        return true;
      },
      release(id) {
        if (owner !== id) return false;
        owner = null;
        document.documentElement.removeAttribute('data-haven-layout-owner');
        document.dispatchEvent({ type: 'haven:layout-owner-change', detail: { owner } });
        return true;
      },
    },
    UI: { showToast() {} },
  };
  const frames = new Map();
  let frameId = 0;
  const observers = [];
  class Observer {
    constructor(fn) { this.fn = fn; this.disconnected = false; observers.push(this); }
    observe() {
      if (failObserver) {
        failObserver = false;
        throw new Error('Synthetic observer failure');
      }
    }
    disconnect() { this.disconnected = true; }
  }
  const globals = { document, window: { app, matchMedia: () => media }, HavenApi, MutationObserver: Observer,
    requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame: id => frames.delete(id) };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
  Object.assign(global, globals);
  const plugin = new IdeWorkspaceLayout();
  t.after(() => {
    plugin.stop();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(global, key, descriptor); else delete global[key];
    }
  });
  function restored() {
    for (const [parent, children] of initialOrder) assert.deepEqual(parent.children, children, `${parent.id || parent.tagName}: native child order`);
    assert.equal(document.getElementById('ide-workspace-shell'), null);
    assert.equal(document.querySelector('.ide-controls-dialog'), null);
    assert.equal(document.documentElement.hasAttribute('data-ide-workspace'), false);
    for (const [method, original] of originals) assert.equal(app[method], original, `${method} hook restored`);
    assert.equal(frames.size, 0);
    assert.equal(socket.listenerCount(), 0);
  }
  return { plugin, document, native, media, socket, app, HavenApi, data, observers, restored, frames };
}

test('IDE layout moves the same native content and composers, preserving drafts and handlers on return', t => {
  const { plugin, document, native, HavenApi, restored } = setup(t);
  const sent = [];
  native['send-button'].addEventListener('click', () => sent.push(native['message-input'].value));
  native['thread-send-button'].addEventListener('click', () => sent.push(native['thread-input'].value));
  plugin.start();
  assert.equal(HavenApi.Layout.owner, IdeWorkspaceLayout.ID);
  assert.equal(document.getElementById('messages'), native.messages);
  assert.equal(document.getElementById('message-input'), native['message-input']);
  assert.equal(document.getElementById('thread-input'), native['thread-input']);
  assert.equal(native.main.parentNode.id, 'ide-editor-content');
  assert.equal(native['sidebar-split'].parentNode.className, 'ide-project-body');
  native['send-button'].click();
  native['thread-send-button'].click();
  native['message-input'].value += ' continued';
  native['thread-input'].value += ' continued';
  plugin.stop();
  restored();
  assert.equal(HavenApi.Layout.owner, null);
  assert.equal(document.title, 'General · Haven');
  native['send-button'].click();
  native['thread-send-button'].click();
  assert.deepEqual(sent, ['Draft channel message', 'Draft forum reply', 'Draft channel message continued', 'Draft forum reply continued']);
});

test('IDE start and stop are idempotent and release observers, socket listeners and permanent handlers', t => {
  const { plugin, document, media, socket, observers, restored } = setup(t);
  plugin.start();
  const shell = document.getElementById('ide-workspace-shell');
  const count = document.listenerCount();
  plugin.start();
  assert.equal(document.getElementById('ide-workspace-shell'), shell);
  assert.equal(document.listenerCount(), count);
  assert.equal(media.listenerCount(), 1);
  assert.equal(socket.listenerCount(), 3);
  plugin.stop();
  plugin.stop();
  restored();
  assert.equal(document.listenerCount(), 0);
  assert.equal(media.listenerCount(), 0);
  assert.ok(observers.every(observer => observer.disconnected));
  plugin.start();
  assert.ok(document.getElementById('ide-workspace-shell'));
  plugin.stop();
  restored();
});

test('the shared picker can disengage a loaded but never-started IDE instance', t => {
  const { plugin, document, HavenApi, data, restored } = setup(t);
  assert.doesNotThrow(() => plugin._disengage());
  restored();
  assert.equal(HavenApi.Layout.owner, null);
  assert.equal(data.get(`${IdeWorkspaceLayout.ID}:layoutOn`), '0');
  plugin.start();
  assert.equal(document.getElementById('ide-workspace-shell'), null);
  plugin._engage();
  assert.equal(HavenApi.Layout.owner, IdeWorkspaceLayout.ID);
  assert.equal(data.get(`${IdeWorkspaceLayout.ID}:layoutOn`), '1');
});

test('IDE waits while another structural layout owns the page and engages after release', t => {
  const { plugin, document, HavenApi, restored } = setup(t);
  HavenApi.Layout.acquire('ChromeLayout');
  plugin.start();
  assert.equal(plugin._engaged, true);
  assert.equal(HavenApi.Layout.owner, 'ChromeLayout');
  restored();
  HavenApi.Layout.release('ChromeLayout');
  assert.equal(HavenApi.Layout.owner, IdeWorkspaceLayout.ID);
  assert.ok(document.getElementById('ide-workspace-shell'));
  plugin.stop();
  restored();
});

test('Mod Mode restores native regions before editing and resumes the selected IDE afterward', t => {
  const { plugin, document, HavenApi, restored } = setup(t);
  plugin.start();
  document.documentElement.setAttribute('data-haven-layout-editing', '1');
  document.dispatchEvent({ type: 'haven:layout-editing', detail: { active: true } });
  restored();
  assert.equal(plugin._engaged, true);
  assert.equal(HavenApi.Layout.owner, null);
  document.documentElement.removeAttribute('data-haven-layout-editing');
  document.dispatchEvent({ type: 'haven:layout-editing', detail: { active: false } });
  assert.equal(HavenApi.Layout.owner, IdeWorkspaceLayout.ID);
  assert.ok(document.getElementById('ide-workspace-shell'));
});

test('a selected IDE uses original mobile regions and resumes desktop without losing a draft', t => {
  const { plugin, document, native, media, HavenApi, restored } = setup(t, { desktop: false });
  plugin.start();
  restored();
  assert.equal(plugin._engaged, true);
  assert.equal(HavenApi.Layout.owner, null);
  media.matches = true;
  media.dispatchEvent({ type: 'change' });
  assert.equal(HavenApi.Layout.owner, IdeWorkspaceLayout.ID);
  native['message-input'].value = 'Draft typed on desktop';
  media.matches = false;
  media.dispatchEvent({ type: 'change' });
  restored();
  assert.equal(plugin._engaged, true);
  assert.equal(HavenApi.Layout.owner, null);
  assert.equal(native['message-input'].value, 'Draft typed on desktop');
  media.matches = true;
  media.dispatchEvent({ type: 'change' });
  assert.ok(document.getElementById('ide-workspace-shell'));
  assert.equal(document.getElementById('message-input'), native['message-input']);
});

test('safe mode keeps the native workspace even when the plugin was selected', t => {
  const { plugin, document, HavenApi, restored } = setup(t);
  document.documentElement.setAttribute('data-haven-safe-mode', '1');
  plugin.start();
  restored();
  assert.equal(HavenApi.Layout.owner, null);
});

test('turning IDE off on mobile does not re-enable it when the window becomes desktop-sized', t => {
  const { plugin, document, media, HavenApi, data, restored } = setup(t, { desktop: false });
  plugin.start();
  plugin._disengage();
  assert.equal(plugin._engaged, false);
  assert.equal(data.get(`${IdeWorkspaceLayout.ID}:layoutOn`), '0');
  media.matches = true;
  media.dispatchEvent({ type: 'change' });
  restored();
  assert.equal(HavenApi.Layout.owner, null);
  assert.equal(document.getElementById('ide-workspace-shell'), null);
});

test('a partial startup failure restores moved nodes, methods and ownership and allows a clean retry', t => {
  const { plugin, document, media, HavenApi, observers, restored } = setup(t, { failObserver: true });
  assert.throws(() => plugin.start(), /Synthetic observer failure/);
  restored();
  assert.equal(HavenApi.Layout.owner, null);
  assert.equal(plugin._engaged, false);
  assert.equal(plugin._started, false, 'a failed start must permit retry');
  assert.equal(document.listenerCount(), 0);
  assert.equal(media.listenerCount(), 0);
  assert.ok(observers.every(observer => observer.disconnected));
  plugin.start();
  assert.equal(HavenApi.Layout.owner, IdeWorkspaceLayout.ID);
  assert.ok(document.getElementById('ide-workspace-shell'));
  plugin.stop();
  restored();
});
