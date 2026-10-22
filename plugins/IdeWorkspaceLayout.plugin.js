/**
 * @name IDE Workspace Layout
 * @description PyCharm-inspired workspace for real channels, forum topics and replies. Keeps Haven's native messages, permissions and composers.
 * @author Dubence
 * @version 1.0.0
 */
class IdeWorkspaceLayout {
  static ID = 'IdeWorkspaceLayout';

  start() {
    if (this._started) return;
    this._started = true;
    this._engaged = false;
    this._listeners = [];
    this._placements = [];
    this._tabs = [];
    this._navigationId = 0;
    this._navigationQueue = Promise.resolve();
    try {
      this._media = window.matchMedia('(min-width: 901px)');
      this._listen(this._media, 'change', () => this._syncDesktop());
      this._listen(document, 'haven:layout-editing', () => this._syncDesktop());
      this._listen(document, 'haven:layout-owner-change', () => {
        if (!this._restoring) this._syncDesktop();
      });
      if (this._load('layoutOn', '1') !== '0') this._engage(false);
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  stop() {
    if (!this._started) return;
    this._disengage(false);
    for (const [target, type, fn, options] of this._listeners) target.removeEventListener(type, fn, options);
    this._listeners = [];
    this._started = false;
  }

  _load(key, fallback) {
    try { return HavenApi.Data.load(IdeWorkspaceLayout.ID, key, fallback); }
    catch { return fallback; }
  }

  _save(key, value) {
    try { HavenApi.Data.save(IdeWorkspaceLayout.ID, key, value); }
    catch { /* The live layout still works when storage is unavailable. */ }
  }

  _listen(target, type, fn, options) {
    target?.addEventListener(type, fn, options);
    this._listeners.push([target, type, fn, options]);
  }

  _engage(persist = true) {
    this._engaged = true;
    try { this._syncDesktop(); }
    catch (error) { this._engaged = false; this._restoreDesktop(); throw error; }
    if (persist) this._save('layoutOn', '1');
  }

  _disengage(persist = true) {
    this._engaged = false;
    if (this._started) this._restoreDesktop();
    if (persist) this._save('layoutOn', '0');
  }

  _syncDesktop() {
    if (this._building || this._restoring) return;
    const root = document.documentElement;
    if (!this._engaged || !this._media?.matches || root.hasAttribute('data-haven-layout-editing')
        || root.hasAttribute('data-haven-safe-mode')) {
      this._restoreDesktop();
      return;
    }
    if (this._shell || (HavenApi.Layout.owner && HavenApi.Layout.owner !== IdeWorkspaceLayout.ID)) return;
    this._building = true;
    try {
      if (!HavenApi.Layout.acquire(IdeWorkspaceLayout.ID)) return;
      this._buildWorkspace();
    } catch (error) {
      this._restoreDesktop();
      throw error;
    } finally { this._building = false; }
  }

  _node(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  _button(text, label, action, className = 'ide-action') {
    const button = this._node('button', className, text);
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', action);
    return button;
  }

  _move(node, parent) {
    if (!node?.parentNode) return;
    this._placements.push([node, node.parentNode, node.nextSibling]);
    parent.appendChild(node);
  }

  _buildWorkspace() {
    const app = window.app;
    const body = document.getElementById('app-body');
    const main = document.querySelector('[data-haven-region="main"]');
    const sidebar = document.querySelector('[data-haven-region="navigation-sidebar"]');
    const split = document.getElementById('sidebar-split');
    const thread = document.getElementById('thread-panel');
    if (!app || !body || !main || !sidebar || !split || !thread) throw new Error('Haven workspace is not ready');
    this._app = app;
    this._desktopListenerStart = this._listeners.length;
    this._originalTitle = document.title;
    this._renderedChannel = app._lastRenderedChannel === app.currentChannel ? app.currentChannel : null;
    const shell = this._node('div');
    shell.id = 'ide-workspace-shell';
    this._shell = shell;
    const titlebar = this._node('header', 'ide-titlebar');
    titlebar.append(this._node('span', 'ide-brand', 'QW'));
    this._projectButton = this._button('☰', 'Project · 项目目录', () => this._toggleProject());
    this._projectButton.setAttribute('aria-pressed', 'true');
    titlebar.append(this._projectButton, this._node('span', 'ide-project-name', 'haven-workspace'),
      this._node('span', 'ide-branch', '⑂ workspace'), this._node('span', 'ide-spacer'));
    titlebar.append(this._button('⌕ Search', '搜索真实消息', () => this._searchMessages()),
      this._button('>_ Console', '聚焦当前频道或帖子的真实输入框', () => this._focusComposer()),
      this._button('Tools', '频道管理、账号和设置', () => this._toggleControls()),
      this._button('Exit IDE', '返回普通界面', () => this._exit()));
    const workspace = this._node('div', 'ide-workspace');
    const activity = this._node('nav', 'ide-activity-bar');
    activity.setAttribute('aria-label', '工具窗口');
    activity.append(this._button('▤', 'Project · 项目目录', () => this._toggleProject(), 'ide-activity'),
      this._button('⌕', '搜索消息', () => this._searchMessages(), 'ide-activity'),
      this._node('span', 'ide-spacer'),
      this._button('>_', 'Console · 输入消息', () => this._focusComposer(), 'ide-activity'),
      this._button('⚙', 'Tools · 设置与频道管理', () => this._toggleControls(), 'ide-activity'));
    const project = this._node('aside', 'ide-project-panel');
    project.setAttribute('aria-label', 'Project · 频道与私信');
    const heading = this._node('div', 'ide-panel-heading', 'Project');
    heading.append(this._button('+', '加入或创建频道', () => this._toggleControls(true)));
    this._filter = this._node('input', 'ide-project-search');
    this._filter.type = 'search';
    this._filter.placeholder = '查找频道 / Ctrl+K';
    this._filter.setAttribute('aria-label', '筛选频道和私信');
    this._filter.addEventListener('input', () => this._filterTree());
    const projectBody = this._node('div', 'ide-project-body');
    project.append(heading, this._filter, projectBody);
    const editor = this._node('section', 'ide-editor-workspace');
    this._tabBar = this._node('div', 'ide-file-tabs');
    this._tabBar.setAttribute('role', 'tablist');
    this._tabBar.setAttribute('aria-label', '已打开的频道与帖子');
    this._breadcrumb = this._node('div', 'ide-breadcrumb');
    const editorContent = this._node('div', 'ide-editor-content');
    editorContent.id = 'ide-editor-content';
    editorContent.setAttribute('role', 'tabpanel');
    editorContent.setAttribute('aria-label', '当前频道或帖子内容');
    editor.append(this._tabBar, this._breadcrumb, editorContent);
    const context = this._node('aside', 'ide-context-panel');
    context.setAttribute('aria-label', '搜索、成员与语音');
    this._contextButton = this._button('◫', '切换搜索、成员和语音面板', () => this._toggleContext(), 'ide-activity');
    activity.append(this._contextButton);
    workspace.append(activity, project, editor, context);
    const status = this._node('footer', 'ide-statusbar');
    this._status = this._node('span', 'ide-status-message');
    status.append(this._status, this._node('span', 'ide-spacer'),
      this._node('span', '', 'UTF-8'), this._node('span', '', 'Markdown'));
    shell.append(titlebar, workspace, status);
    body.appendChild(shell);

    // A non-modal tool window lets Haven's own dialogs stay on top.
    this._controls = this._node('dialog', 'ide-controls-dialog');
    this._controls.setAttribute('aria-label', 'Tools · 原生频道与账号操作');
    const controlsHeading = this._node('div', 'ide-controls-heading', 'Tools');
    controlsHeading.append(this._button('Settings', '打开 Haven 设置', () => {
      this._controls.close();
      document.getElementById('open-settings-btn')?.click();
    }));
    controlsHeading.append(this._button('×', '关闭工具窗口', () => this._controls.close()));
    const controlsBody = this._node('div', 'ide-controls-body');
    this._controls.append(controlsHeading, controlsBody);
    document.body.appendChild(this._controls);
    this._move(split, projectBody);
    this._move(sidebar, controlsBody);
    this._move(document.getElementById('server-bar'), controlsBody);
    this._move(main, editorContent);
    this._move(thread, editorContent);
    this._move(document.getElementById('right-sidebar'), context);
    this._move(document.getElementById('status-bar'), status);
    document.documentElement.setAttribute('data-ide-workspace', '1');
    this._installHooks();
    this._observer = new MutationObserver(() => this._scheduleSync());
    for (const id of ['channel-list', 'dm-list', 'thread-parent-preview', 'thread-forum-bar', 'thread-messages']) {
      const node = document.getElementById(id);
      if (node) this._observer.observe(node, { childList: true, subtree: true, characterData: true });
    }
    this._listen(document, 'keydown', event => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault(); event.stopPropagation();
        shell.classList.remove('ide-project-hidden');
        this._projectButton.setAttribute('aria-pressed', 'true');
        this._filter.focus();
      } else if (event.key === 'Escape' && this._controls.open) this._controls.close();
    }, true);
    this._listen(this._controls, 'click', event => {
      // Native dialogs (settings, profile, add server) must not be obscured.
      if (event.target.closest?.('#open-settings-btn, #mobile-settings-btn, #rename-btn, #logout-btn, #add-server-btn, #manage-servers-btn')) this._controls.close();
    });
    for (const event of ['connect', 'disconnect', 'connect_error']) {
      const callback = () => this._scheduleSync();
      app.socket?.on(event, callback);
      (this._socketListeners ||= []).push([event, callback]);
    }
    this._sync();
  }

  _installHooks() {
    const api = HavenApi.Patcher;
    const id = IdeWorkspaceLayout.ID;
    api.before(id, this._app, 'switchChannel', args => {
      if (args[0] === this._app.currentChannel) return;
      if (this._app._activeThreadParent != null) this._app._closeThread();
      this._renderedChannel = null;
      if (this._pending && this._pending.channel !== args[0]) this._cancelNavigation();
    });
    api.after(id, this._app, '_renderMessages', () => {
      this._renderedChannel = this._app.currentChannel;
      this._flushNavigation();
      this._scheduleSync();
    });
    for (const method of ['switchChannel', '_renderChannels', '_openThread', '_closeThread', '_forumUpdateTopic', '_updateTabTitle']) {
      api.after(id, this._app, method, () => { this._scheduleSync(); });
    }
  }

  _scheduleSync() {
    if (!this._shell || this._frame != null) return;
    this._frame = requestAnimationFrame(() => { this._frame = null; this._sync(); });
  }

  _descriptor(channel, parent = null) {
    const row = this._app.channels.find(item => item.code === channel);
    if (!row) return null;
    let name = row.is_dm ? (row.is_group ? this._app._groupName(row) : row.dm_target?.username || row.name) : row.name;
    let suffix = row.is_forum ? '.md' : '.log';
    if (parent != null) {
      const topic = this._app._forumTopics?.get(Number(parent));
      const known = this._tabs.find(tab => tab.channel === channel && String(tab.parent) === String(parent));
      name = topic ? this._app._forumTitleOf(topic) : known?.title
        || document.getElementById('thread-parent-preview')?.textContent?.trim() || 'thread-' + parent;
      suffix = '.md';
    }
    const title = String(name || channel).replace(/[\r\n\t]+/g, ' ').slice(0, 80);
    return { key: channel + ':' + (parent ?? ''), channel, parent, title, filename: title + suffix };
  }

  _remember(tab) {
    if (!tab) return;
    const existing = this._tabs.findIndex(item => item.key === tab.key);
    if (existing >= 0) this._tabs[existing] = tab;
    else this._tabs.push(tab);
    if (this._tabs.length > 12) this._tabs.shift();
  }

  _sync() {
    if (!this._shell) return;
    const app = this._app;
    if (this._pending && !app.channels.some(channel => channel.code === this._pending.channel)) this._cancelNavigation();
    this._tabs = this._tabs.filter(tab => app.channels.some(channel => channel.code === tab.channel));
    const selected = this._descriptor(app.currentChannel, app._activeThreadParent);
    if (!this._pending) this._remember(selected);
    this._shell.classList.toggle('ide-thread-open', app._activeThreadParent != null);
    this._breadcrumb.textContent = selected
      ? 'haven-workspace  ›  ' + (app._activeThreadParent != null ? 'discussions' : 'channels') + '  ›  ' + selected.filename
      : 'haven-workspace  ›  从 Project 选择一个频道';
    const online = app.socket?.connected === true;
    this._status.textContent = (online ? '● Connected' : '○ Disconnected · 等待重连')
      + (this._pending ? ' · Loading…' : selected ? ' · ' + selected.filename : '');
    this._status.setAttribute('role', 'status');
    document.title = 'haven-workspace' + (selected ? ' — ' + selected.filename : '');
    const signature = JSON.stringify([this._tabs, selected?.key]);
    if (signature !== this._tabSignature) {
      const focusedKey = this._tabBar.contains(document.activeElement) ? document.activeElement?.dataset?.tabKey : null;
      this._tabSignature = signature;
      this._tabBar.replaceChildren();
      for (const tab of this._tabs) {
        const wrap = this._node('div', 'ide-tab-wrap');
        const button = this._button(tab.filename, tab.title, () => this._navigate(tab), 'ide-tab');
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', String(selected?.key === tab.key));
        button.setAttribute('aria-controls', 'ide-editor-content');
        button.dataset.tabKey = tab.key;
        button.tabIndex = selected?.key === tab.key ? 0 : -1;
        button.addEventListener('keydown', event => this._tabKey(event, tab));
        const close = this._button('×', '关闭 ' + tab.title, () => this._closeTab(tab), 'ide-tab-close');
        wrap.append(button, close);
        this._tabBar.append(wrap);
        if (focusedKey === tab.key) button.focus();
      }
    }
    this._filterTree();
  }

  _tabKey(event, tab) {
    const index = this._tabs.findIndex(item => item.key === tab.key);
    let target;
    if (event.key === 'ArrowRight') target = this._tabs[(index + 1) % this._tabs.length];
    if (event.key === 'ArrowLeft') target = this._tabs[(index + this._tabs.length - 1) % this._tabs.length];
    if (event.key === 'Home') target = this._tabs[0];
    if (event.key === 'End') target = this._tabs[this._tabs.length - 1];
    if (target) { event.preventDefault(); this._navigate(target); }
    if (event.key === 'Delete') { event.preventDefault(); this._closeTab(tab); }
  }

  _navigate(tab) {
    this._cancelNavigation();
    if (!this._shell || !tab) return Promise.resolve();
    const channel = this._app.channels.find(item => item.code === tab.channel);
    if (!channel || (tab.parent != null && (channel.is_dm || !Number.isSafeInteger(Number(tab.parent)) || Number(tab.parent) <= 0))) {
      this._tabs = this._tabs.filter(item => item.key !== tab.key);
      HavenApi.UI.showToast('该频道或帖子已不可访问。', 'warning');
      return Promise.resolve();
    }
    const serial = this._navigationId;
    this._pending = { ...tab, serial, switchDone: false, aroundRequested: false };
    clearTimeout(this._navigationTimeout);
    this._navigationTimeout = setTimeout(() => {
      if (this._pending?.serial === serial) {
        this._cancelNavigation();
        HavenApi.UI.showToast('内容加载超时，请检查连接后重试。', 'warning');
      }
    }, 15000);
    // Keep asynchronous DM key fetches ordered, while the latest click wins.
    this._navigationQueue = this._navigationQueue.catch(() => {}).then(async () => {
      if (serial !== this._navigationId || !this._shell) return;
      if (!this._app.channels.some(item => item.code === tab.channel)) {
        this._tabs = this._tabs.filter(item => item.channel !== tab.channel);
        this._cancelNavigation();
        HavenApi.UI.showToast('该频道已不可访问。', 'warning');
        return;
      }
      const sameChannel = this._app.currentChannel === tab.channel;
      if (!sameChannel) await this._app.switchChannel(tab.channel);
      if (serial !== this._navigationId || !this._pending || !this._shell) return;
      this._pending.switchDone = true;
      // Enabling the layout during a native channel load may leave it without
      // a render checkpoint. Request one instead of waiting on a lost event.
      if (sameChannel && this._renderedChannel !== tab.channel) {
        this._app.socket.emit('get-messages', this._app._getMessagesParams?.(tab.channel) || { code: tab.channel });
      }
      this._flushNavigation();
      this._scheduleSync();
    }).catch(error => {
      if (serial === this._navigationId) {
        this._cancelNavigation();
        HavenApi.UI.showToast('无法打开该频道或帖子，请重试。', 'warning');
      }
      console.warn('[IDE Workspace] Navigation failed', error);
    });
    this._scheduleSync();
    return this._navigationQueue;
  }

  _flushNavigation() {
    const pending = this._pending;
    if (pending && !this._app.channels.some(item => item.code === pending.channel)) {
      this._tabs = this._tabs.filter(item => item.channel !== pending.channel);
      this._cancelNavigation();
      HavenApi.UI.showToast('该频道已不可访问。', 'warning');
      return;
    }
    if (!pending?.switchDone || pending.channel !== this._app.currentChannel || this._renderedChannel !== pending.channel) return;
    // Member updates also re-render cached history. Only the requested around
    // snapshot can decide that an off-page root has disappeared.
    if (pending.aroundRequested && (!pending.aroundMessages || this._app._lastRenderedMessages !== pending.aroundMessages)) return;
    if (pending.parent != null) {
      const parent = Number(pending.parent);
      // The forum map can retain a topic after its deletion event removes the
      // row. Use the actual native view, including its visibility filters.
      const visible = document.querySelector('#messages [data-msg-id="' + parent + '"]');
      if (!visible) {
        if (!pending.aroundRequested) {
          pending.aroundRequested = true;
          pending.aroundListener = data => {
            if (this._pending === pending && data?.channelCode === pending.channel && Number(data.around) === parent) {
              pending.aroundMessages = data.messages;
            }
          };
          this._app.socket.on('message-history', pending.aroundListener);
          this._renderedChannel = null;
          const params = this._app._getMessagesParams?.(pending.channel, { around: parent }) || { code: pending.channel, around: parent };
          this._app.socket.emit('get-messages', params);
          return;
        }
        this._tabs = this._tabs.filter(item => item.key !== pending.key);
        this._cancelNavigation();
        HavenApi.UI.showToast('该帖子已删除或当前不可见。', 'warning');
        return;
      }
    }
    if (pending.aroundListener) this._app.socket.off('message-history', pending.aroundListener);
    this._pending = null;
    clearTimeout(this._navigationTimeout);
    if (pending.parent != null) this._app._openThread(Number(pending.parent));
    else this._app._closeThread();
    this._scheduleSync();
  }

  _cancelNavigation() {
    if (this._pending?.aroundListener) this._app.socket.off('message-history', this._pending.aroundListener);
    this._navigationId = (this._navigationId || 0) + 1;
    this._pending = null;
    clearTimeout(this._navigationTimeout);
    this._scheduleSync();
  }

  _closeTab(tab) {
    const index = this._tabs.findIndex(item => item.key === tab.key);
    if (this._pending?.key === tab.key) this._cancelNavigation();
    this._tabs = this._tabs.filter(item => item.key !== tab.key);
    const active = this._descriptor(this._app.currentChannel, this._app._activeThreadParent);
    if (active?.key === tab.key) {
      const next = this._tabs[Math.max(0, index - 1)];
      if (next) this._navigate(next);
      else if (tab.parent != null) this._app._closeThread();
      // Haven always has a current channel; keep its sole tab available.
    }
    this._scheduleSync();
  }

  _filterTree() {
    const query = this._filter?.value.trim().toLocaleLowerCase() || '';
    for (const row of document.querySelectorAll('#sidebar-split .channel-item')) {
      row.classList.toggle('ide-filtered', !!query && !row.textContent.toLocaleLowerCase().includes(query));
    }
  }

  _toggleProject() {
    const hidden = this._shell.classList.toggle('ide-project-hidden');
    this._projectButton.setAttribute('aria-pressed', String(!hidden));
  }

  _toggleContext(force) {
    const open = typeof force === 'boolean' ? force : this._shell.dataset.contextOpen !== 'true';
    this._shell.dataset.contextOpen = String(open);
    this._contextButton.setAttribute('aria-pressed', String(open));
  }

  _searchMessages() {
    // Search belongs to the native main header, which the IDE hides while a
    // thread is open. Return to the channel without discarding its topic tab.
    this._cancelNavigation();
    if (this._app._activeThreadParent != null) {
      this._app._closeThread();
      this._sync();
    }
    this._toggleContext(true);
    const container = document.getElementById('search-container');
    const key = this._app._searchContextKey?.();
    const state = this._app._searchGetState?.(key) || this._app._searchState?.[key];
    const open = state ? state.open === true : container?.style.display === 'flex';
    // An empty query can hide the results panel while search is still open.
    // Toggling based on that panel would close search and clear its state.
    if (!open) this._app._searchToggle();
    else {
      if (container) container.style.display = 'flex';
      this._app._searchRenderPanel();
    }
    document.getElementById('search-input')?.focus();
  }

  _focusComposer() {
    const id = this._app._activeThreadParent != null ? 'thread-input' : 'message-input';
    const input = document.getElementById(id);
    if (input && input.getClientRects().length && !input.disabled) input.focus();
    else HavenApi.UI.showToast('当前频道或帖子不可回复。', 'info');
  }

  _toggleControls(force) {
    if (this._controls.open && force !== true) this._controls.close();
    else this._controls.show();
  }

  _exit() {
    if (window.HavenIdeWorkspace) window.HavenIdeWorkspace.setEnabled(false);
    else this._disengage();
  }

  _restoreDesktop() {
    if (this._restoring) return;
    this._restoring = true;
    try {
      this._cancelNavigation();
      if (this._frame != null) cancelAnimationFrame(this._frame);
      this._frame = null;
      this._observer?.disconnect();
      this._observer = null;
      HavenApi.Patcher.unpatchAll(IdeWorkspaceLayout.ID);
      for (const [event, callback] of this._socketListeners || []) this._app?.socket?.off(event, callback);
      this._socketListeners = [];
      if (this._desktopListenerStart != null) {
        for (const [target, type, fn, options] of this._listeners.splice(this._desktopListenerStart)) target.removeEventListener(type, fn, options);
        this._desktopListenerStart = null;
      }
      for (const row of document.querySelectorAll('.ide-filtered')) row.classList.remove('ide-filtered');
      this._controls?.close();
      for (const [node, parent, sibling] of [...this._placements].reverse()) {
        parent.insertBefore(node, sibling?.parentNode === parent ? sibling : null);
      }
      this._placements = [];
      this._controls?.remove();
      this._shell?.remove();
      this._controls = this._shell = null;
      this._tabSignature = null;
      document.documentElement.removeAttribute('data-ide-workspace');
      if (this._originalTitle != null) document.title = this._originalTitle;
      this._app?._updateTabTitle?.();
      this._app?._forumSyncThreadEdges?.();
      HavenApi.Layout.release(IdeWorkspaceLayout.ID);
    } finally { this._restoring = false; }
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = IdeWorkspaceLayout;
if (typeof _win !== 'undefined') _win.IdeWorkspaceLayout = IdeWorkspaceLayout;
