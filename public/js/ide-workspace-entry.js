// Select the server's startup workspace or an explicit personal override.
// Haven still owns channels, messages and permissions.
(() => {
  'use strict';

  const ID = 'IdeWorkspaceLayout';
  const FILE = `${ID}.plugin.js`;
  const PENDING_KEY = 'haven_pending_workspace';
  let requested = null;
  let startupHandled = false;

  // This script runs before HavenApp's authentication redirect. Remember a
  // deep link through sign-in without changing the account's theme preference.
  try {
    const value = new URLSearchParams(window.location.search).get('workspace');
    if (value === 'ide' || value === 'original') {
      requested = value;
      sessionStorage.setItem(PENDING_KEY, value);
    } else {
      requested = sessionStorage.getItem(PENDING_KEY);
    }
  } catch {
    // A direct link still works in this page when browser storage is blocked.
  }

  const startupChoice = requested === 'ide' || requested === 'original'
    ? requested
    : document.documentElement.getAttribute('data-haven-default-workspace') === 'ide' ? 'ide' : null;

  function clearRequest() {
    requested = null;
    try { sessionStorage.removeItem(PENDING_KEY); } catch { /* storage unavailable */ }
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('workspace');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch { /* a restricted history does not prevent switching layouts */ }
  }

  function suppressed() {
    return window.HavenPluginLoader?.suppressed === true
      || document.documentElement.hasAttribute('data-haven-safe-mode');
  }

  function record() {
    return window.HavenPluginLoader?.loadedPlugins?.get(FILE);
  }

  function active() {
    return document.documentElement.getAttribute('data-haven-layout-owner') === ID;
  }

  function mobileFallback() {
    const plugin = record();
    return window.matchMedia?.('(min-width: 901px)').matches === false
      && !document.documentElement.getAttribute('data-haven-layout-owner')
      && plugin?.enabled === true && plugin.instance?._engaged === true;
  }

  function selected() {
    return active() || mobileFallback();
  }

  function notify(message) {
    window.HavenApi?.UI?.showToast?.(message, 'warning');
  }

  function sync() {
    const button = document.getElementById('ide-workspace-toggle');
    if (!button) return;
    const on = selected();
    button.disabled = suppressed() || record()?.suppressed === true || !record()?.instance;
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on
      ? '恢复普通界面 / Return to original layout'
      : '启用 IDE 工作区 / Enable IDE workspace');
    button.title = mobileFallback()
      ? 'IDE 已选择；手机使用普通界面 / IDE selected; original layout on mobile'
      : on ? '恢复普通界面 / Original layout' : 'IDE 工作区 / IDE workspace';
    button.classList.toggle('active', on);
  }

  function setEnabled(on) {
    const loader = window.HavenPluginLoader;
    const plugin = record();
    if (suppressed() || plugin?.suppressed || !plugin?.instance || typeof window._setLayout !== 'function') {
      sync();
      return false;
    }
    if (document.documentElement.hasAttribute('data-haven-layout-editing')) {
      notify('请先退出布局编辑，再切换 IDE 工作区。 / Exit layout editing before switching.');
      return false;
    }

    const previous = typeof window._activeLayoutKey === 'function' ? window._activeLayoutKey() : '';
    if (on && selected()) {
      clearRequest();
      sync();
      return true;
    }
    try {
      // Use the built-in selector so other structural layouts are disengaged
      // and their saved layoutOn state agrees with this choice.
      window._setLayout(on ? ID : '');
      if (on && (!selected() || plugin.instance._engaged !== true)) {
        throw new Error('IDE layout did not acquire the workspace');
      }
      if (!on && active()) throw new Error('IDE layout did not release the workspace');
      clearRequest();
      return true;
    } catch (error) {
      // The plugin loader catches start() errors. Check the real owner above,
      // and undo a failed selection instead of remembering a broken layout.
      try {
        loader.disablePlugin(FILE);
        window.HavenApi?.Data?.save(ID, 'layoutOn', '0');
        window._setLayout(previous === ID ? '' : previous);
      } catch (restoreError) {
        console.warn('[IDE workspace] Could not restore the previous layout', restoreError);
      }
      clearRequest();
      console.warn('[IDE workspace] Could not switch layouts', error);
      notify('IDE 工作区未能启动，已尝试恢复原布局。 / Could not start IDE workspace; restoring the previous layout.');
      return false;
    } finally {
      sync();
    }
  }

  function toggle() {
    return setEnabled(!selected());
  }

  function bind() {
    const button = document.getElementById('ide-workspace-toggle');
    if (button && !button.dataset.ideBound) {
      button.dataset.ideBound = '1';
      button.addEventListener('click', toggle);
    }
    sync();
  }

  window.HavenIdeWorkspace = { setEnabled, toggle, hasStartupChoice: () => startupChoice != null };
  window.addEventListener('resize', sync);
  document.addEventListener('haven:layout-owner-change', sync);
  document.addEventListener('haven:plugins-loaded', () => {
    bind();
    // Refreshing plugins must not undo a manual Exit IDE in this document.
    if (startupHandled) return;
    startupHandled = true;
    if (suppressed()) {
      // A recovery visit must not queue a layout to reappear after recovery.
      clearRequest();
      return;
    }
    if (startupChoice != null) setEnabled(startupChoice === 'ide');
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
