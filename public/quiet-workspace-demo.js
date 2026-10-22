// Standalone IDE design study. No network, persistence, code execution, or
// changes to Haven runtime. All replies live in this tab until it reloads.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  // Each line is a list of [text, syntax class] spans, rendered with textContent.
  const line = (text = '', color = '') => [[text, color]];
  const files = [
    { id: 'knowledge', name: 'knowledge_base.py', folder: 'discussions', type: 'py', title: '把零散笔记整理成一个长期可用的知识库', unread: true, lines: [
      line('# -*- coding: utf-8 -*-', 'comment'),
      line('"""', 'doc'),
      line('把零散笔记整理成一个长期可用的知识库', 'doc'),
      line('', 'doc'),
      line('最近重新整理了收藏夹和读书笔记。分享一个足够简单、', 'doc'),
      line('也能坚持下去的目录结构。', 'doc'),
      line('"""', 'doc'), line(),
      [['from ', 'keyword'], ['workspace ', ''], ['import ', 'keyword'], ['Discussion, Reply', '']], line(),
      [['TOPIC ', ''], ['= ', ''], ['"knowledge-management"', 'string']],
      [['AUTHOR ', ''], ['= ', ''], ['"林舟"', 'string']],
      [['UPDATED ', ''], ['= ', ''], ['"2026-10-22 10:24"', 'string']], line(),
      line('# ── 正文 ─────────────────────────────────────────', 'comment'), line(),
      [['class ', 'keyword'], ['KnowledgeBase', 'name'], ['(Discussion):', '']],
      line('    """先让记录变简单，再慢慢整理。"""', 'doc'), line(),
      [['    folders ', ''], ['= ', ''], ['[', '']],
      [['        "inbox",', 'string'], ['       # 临时收集，不急着分类', 'comment']],
      [['        "journal",', 'string'], ['     # 每天记录，留下当时的想法', 'comment']],
      [['        "reference",', 'string'], ['   # 整理后真正用得上的资料', 'comment']],
      [['        "archive",', 'string'], ['     # 暂时不用，但想保留的内容', 'comment']],
      line('    ]'), line(),
      [['    def ', 'keyword'], ['weekly_review', 'name'], ['(self):', '']],
      line('        """每周五只花一点时间，处理收集箱里的十条笔记。"""', 'doc'),
      [['        return ', 'keyword'], ['"不追求一次整理完，先让它容易坚持。"', 'string']], line(),
      line('# ── 回复 · 3 ─────────────────────────────────────', 'comment'), line(),
      line('# 陈默 · 10:26', 'comment'),
      line('# 给每条笔记留一句自己的总结，比加很多标签有用。', 'comment'), line(),
      line('# Alex · 10:29', 'comment'),
      line('# 我的目录也差不多。搜索比目录更常用，命名清楚就够了。', 'comment'), line(),
      line('# 小北 · 10:31', 'comment'),
      line('# 收藏的文章太多，过一周就不记得当时为什么收藏。这个方法可以试试。', 'comment'),
    ] },
    { id: 'focus', name: 'focus_time.py', folder: 'discussions', type: 'py', title: '你们是怎么安排每天的专注时间的？', lines: [
      line('"""你们是怎么安排每天的专注时间的？"""', 'doc'), line(),
      [['from ', 'keyword'], ['workspace ', ''], ['import ', 'keyword'], ['Discussion', '']], line(),
      [['AUTHOR = ', ''], ['"陈默"', 'string']], line(),
      line('# 消息太多的时候，很难完整读完一篇文章。', 'comment'),
      line('# 大家有什么实际有效的小习惯？', 'comment'), line(),
      [['class ', 'keyword'], ['FocusTime', 'name'], ['(Discussion):', '']],
      [['    duration = ', ''], ['25', 'number'], ['  # minutes', 'comment']],
      [['    break_time = ', ''], ['5', 'number']], line(),
      line('    """', 'doc'),
      line('    林舟：我把需要看的东西先放进一个列表，集中处理。', 'doc'),
      line('    Alex：可以留一个固定的时间段，让自己慢慢进入状态。', 'doc'),
      line('    小北：午饭后读十分钟，反而比晚上更容易坚持。', 'doc'),
      line('    """', 'doc'),
    ] },
    { id: 'weekend', name: 'weekend_walk.md', folder: 'discussions', type: 'md', title: '周末散步路线：沿河走到旧书店', lines: [
      line('# 周末散步路线：沿河走到旧书店', 'heading'), line(),
      line('> 小北 · 42 分钟前 · 5 条回复', 'comment'), line(),
      line('一条不赶时间的路线，路上有咖啡店、公园和几家书店。'), line(),
      line('## 路线', 'heading'), line(),
      line('1. 下午从河边步道出发。'),
      line('2. 穿过公园，在小咖啡店休息。'),
      line('3. 去旧书店找一本想读的书。'),
      line('4. 日落前沿原路慢慢走回来。'), line(),
      line('## 回复', 'heading'), line(),
      line('**林舟**：那家旧书店周日也开门吗？'), line(),
      line('**小北**：开，下午两点以后过去比较合适。'),
    ] },
    { id: 'general', name: 'general.log', folder: 'channels', type: 'log', title: '日常讨论', unread: true, lines: [] },
    { id: 'reading', name: 'reading_log.md', folder: 'notes', type: 'md', title: '十月阅读记录与摘抄', lines: [
      line('# 十月阅读记录', 'heading'), line(),
      line('> 每次留下几句话，就足够了。', 'comment'), line(),
      line('## 本周', 'heading'), line(),
      line('- [x] 整理上周留下的摘抄'),
      line('- [x] 读完床头放了很久的那本书'),
      line('- [ ] 把值得分享的段落贴到讨论区'), line(),
      line('## 随手记', 'heading'), line(),
      line('不需要每本书都做很完整的笔记。'),
      line('只记下自己真的想留下来的东西。'),
    ] },
    { id: 'readme', name: 'README.md', folder: '', type: 'md', title: '工作区说明', lines: [
      line('# Haven Workspace', 'heading'), line(),
      line('一个以 IDE 形式浏览讨论的界面原型。'), line(),
      line('## 内容映射', 'heading'), line(),
      line('discussions/  → 论坛帖子'),
      line('channels/     → 聊天频道'),
      line('notes/        → 阅读笔记'), line(),
      line('## 试一试', 'heading'), line(),
      line('- 点击左侧文件或顶部标签切换内容。'),
      line('- 按 Ctrl+K 搜索文件名或帖子关键词。'),
      line('- 在底部 Console 输入回复，按 Enter 添加到本地日志。'),
      line('- 点击左下角 Terminal 图标收起或展开讨论窗口。'), line(),
      line('## 演示范围', 'heading'), line(),
      line('这是本地交互原型，不是 PyCharm，也没有连接 Haven。'),
      line('输入不会发送到服务器，代码不会执行，刷新后回复会清空。'),
      line('完整 IDE 布局需要 CSS 与少量 JavaScript 配合。'),
    ] },
  ];
  const messages = [
    { time: '10:26:04', name: '陈默', text: '给每条笔记留一句自己的总结，比加很多标签有用。' },
    { time: '10:29:18', name: 'Alex', text: '我的目录也差不多，搜索比目录更常用。' },
    { time: '10:31:42', name: '小北', text: '这个可以试试。收藏太多，反而不知道从哪里开始。' },
  ];
  let active = 'knowledge';
  let opened = ['knowledge', 'general', 'readme'];
  let terminal = false;
  const folders = { discussions: 'discussion-files', channels: 'channel-files', notes: 'note-files', '': 'root-files' };
  const find = id => files.find(file => file.id === id);
  function icon(file) {
    const el = document.createElement('span');
    el.className = `file-icon ${file.type}`;
    el.textContent = { py: 'Py', md: 'M↓', log: '≡' }[file.type];
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
  function renderTree() {
    Object.values(folders).forEach(id => $(id).replaceChildren());
    files.forEach(file => {
      const button = document.createElement('button');
      button.className = `tree-file${file.id === active ? ' active' : ''}`;
      button.dataset.file = file.id;
      button.title = file.title;
      if (file.id === active) button.setAttribute('aria-current', 'page');
      const name = document.createElement('span');
      name.className = 'filename';
      name.textContent = file.name;
      button.append(icon(file), name);
      if (file.unread) {
        const dot = document.createElement('span');
        dot.className = 'file-dot';
        dot.title = '未读内容';
        button.append(dot);
      }
      button.addEventListener('click', () => openFile(file.id));
      $(folders[file.folder]).append(button);
    });
  }
  function renderTabs() {
    $('file-tabs').replaceChildren();
    opened.forEach(id => {
      const file = find(id);
      const wrap = document.createElement('div');
      wrap.className = `file-tab${id === active ? ' selected' : ''}`;
      const tab = document.createElement('button');
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(id === active));
      tab.setAttribute('aria-controls', 'editor-panel');
      tab.id = `tab-${id}`;
      tab.append(icon(file), document.createTextNode(file.name));
      tab.addEventListener('click', () => openFile(id));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const next = opened[(opened.indexOf(id) + (event.key === 'ArrowRight' ? 1 : opened.length - 1)) % opened.length];
        openFile(next);
        $(`tab-${next}`).focus();
      });
      const close = document.createElement('button');
      close.className = 'tab-close';
      close.textContent = '×';
      close.setAttribute('aria-label', `关闭 ${file.name}`);
      close.addEventListener('click', () => {
        opened = opened.filter(other => other !== id);
        if (!opened.length) opened = ['readme'];
        if (active === id) active = opened[opened.length - 1];
        renderAll();
      });
      wrap.append(tab, close);
      $('file-tabs').append(wrap);
    });
  }
  function renderEditor() {
    const file = find(active);
    const lines = file.id === 'general' ? [line('# 日常讨论 · 本地演示日志', 'comment'), line(), ...messages.map(message => [[`[${message.time}] `, 'comment'], [`${message.name.padEnd(6)} `, 'meta'], [message.text, '']])] : file.lines;
    $('code-lines').replaceChildren();
    lines.forEach((tokens, index) => {
      const row = document.createElement('div');
      row.className = `code-line${index === 0 ? ' current' : ''}`;
      const code = document.createElement('code');
      tokens.forEach(([text, color]) => {
        const span = document.createElement('span');
        span.textContent = text;
        if (color) span.className = `syn-${color}`;
        code.append(span);
      });
      row.append(code);
      row.addEventListener('click', () => {
        document.querySelector('.code-line.current')?.classList.remove('current');
        row.classList.add('current');
        $('caret-position').textContent = `${index + 1}:1`;
      });
      $('code-lines').append(row);
    });
    $('file-folder').textContent = file.folder || 'root';
    $('file-name').textContent = file.name;
    $('language-status').textContent = { py: 'Python', md: 'Markdown', log: 'Log' }[file.type];
    $('caret-position').textContent = '1:1';
    $('editor-panel').setAttribute('aria-labelledby', `tab-${file.id}`);
    document.title = `haven-workspace – ${file.name}`;
  }
  function renderAll() { renderTree(); renderTabs(); renderEditor(); }
  function openFile(id) {
    active = id;
    find(id).unread = false;
    if (!opened.includes(id)) opened.push(id);
    renderAll();
    $('editor-panel').scrollTop = 0;
    if (matchMedia('(max-width: 700px)').matches) setProject(false);
  }
  function renderConsole() {
    $('console-body').replaceChildren();
    const info = document.createElement('div');
    info.className = 'console-info';
    info.textContent = terminal ? '(haven) ~/workspace · 日常讨论 / local preview' : 'Python console · 日常讨论 / local preview';
    $('console-body').append(info);
    messages.forEach(message => {
      const row = document.createElement('div');
      row.className = 'console-line';
      const time = document.createElement('time');
      time.textContent = message.time;
      const name = document.createElement('span');
      name.className = 'log-name'; name.textContent = message.name;
      const text = document.createElement('span');
      text.className = 'log-message'; text.textContent = message.text;
      row.append(time, name, text); $('console-body').append(row);
    });
    $('console-body').scrollTop = $('console-body').scrollHeight;
    $('console-prompt').textContent = terminal ? '(haven) $' : '>>>';
    $('console-tab').setAttribute('aria-selected', String(!terminal));
    $('terminal-tab').setAttribute('aria-selected', String(terminal));
  }
  function setProject(show) {
    document.body.classList.toggle('project-hidden', !show);
    $('project-toggle').setAttribute('aria-expanded', String(show));
    $('project-tool').setAttribute('aria-pressed', String(show));
    $('project-tool').classList.toggle('active', show);
  }
  function setConsole(show) {
    document.body.classList.toggle('console-hidden', !show);
    $('terminal-tool').setAttribute('aria-pressed', String(show));
  }
  for (const id of ['project-toggle', 'project-tool']) $(id).addEventListener('click', () => setProject(document.body.classList.contains('project-hidden')));
  $('terminal-tool').addEventListener('click', () => setConsole(document.body.classList.contains('console-hidden')));
  $('hide-console').addEventListener('click', () => setConsole(false));
  for (const id of ['run', 'open-console']) $(id).addEventListener('click', () => { setConsole(true); $('reply-input').focus(); });
  $('collapse-project').addEventListener('click', () => {
    const groups = [...document.querySelectorAll('details')];
    const expand = groups.every(group => !group.open);
    groups.forEach(group => { group.open = expand; });
  });
  $('console-tab').addEventListener('click', () => { terminal = false; renderConsole(); });
  $('terminal-tab').addEventListener('click', () => { terminal = true; renderConsole(); });
  $('reply-form').addEventListener('submit', event => {
    event.preventDefault();
    const text = $('reply-input').value.trim();
    if (!text) return;
    messages.push({ time: new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Shanghai', hour12: false }), name: 'You', text });
    $('reply-input').value = '';
    renderConsole();
    if (active === 'general') renderEditor();
    $('status-message').textContent = '回复已添加到本地演示 · 未发送到服务器';
  });
  $('clear-console').addEventListener('click', () => {
    messages.length = 0;
    renderConsole();
    if (active === 'general') renderEditor();
    $('status-message').textContent = '本地演示日志已清空 · 刷新可恢复样例';
  });
  function searchResults() {
    const query = $('file-search').value.trim().toLowerCase();
    const matches = files.filter(file => `${file.name} ${file.title} ${file.lines.flat().map(token => token[0]).join(' ')}`.toLowerCase().includes(query));
    $('search-results').replaceChildren();
    matches.forEach(file => {
      const result = document.createElement('button');
      result.className = 'search-result';
      const folder = document.createElement('span'); folder.textContent = file.folder || 'root';
      result.append(icon(file), document.createTextNode(file.name), folder);
      result.title = file.title;
      result.addEventListener('click', () => { openFile(file.id); $('search-dialog').close(); });
      $('search-results').append(result);
    });
    if (!matches.length) {
      const empty = document.createElement('p'); empty.className = 'empty-search'; empty.textContent = '没有匹配的文件'; $('search-results').append(empty);
    }
  }
  function showSearch() { $('file-search').value = ''; searchResults(); $('search-dialog').showModal(); $('file-search').focus(); }
  for (const id of ['search-toggle', 'find-tool']) $(id).addEventListener('click', showSearch);
  $('file-search').addEventListener('input', searchResults);
  $('file-search').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); $('search-results').querySelector('button')?.click(); }
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (!$('search-dialog').open) showSearch(); }
  });
  $('about-toggle').addEventListener('click', () => $('about-dialog').showModal());
  const compactViewport = matchMedia('(max-width: 700px)');
  compactViewport.addEventListener('change', () => setProject(!compactViewport.matches));
  if (compactViewport.matches) setProject(false);
  renderAll();
  renderConsole();
})();
