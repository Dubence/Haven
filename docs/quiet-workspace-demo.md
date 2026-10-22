# Quiet Workspace 使用说明

Quiet Workspace 提供受 PyCharm 界面启发的真实 IDE 工作区。频道、帖子和回复使用 Haven 的原生功能。之前的静态原型和纯 CSS 主题也保留在仓库中，三者的入口和用途如下。

| 形式 | 入口 | 数据与操作 |
| --- | --- | --- |
| IDE 工作区 | 当前服务器的 `/app?workspace=ide` | 登录后的真实频道、帖子、消息和回复 |
| 静态原型 | `/quiet-workspace-demo.html`，或本机预览服务器 | 演示样例；回复只保留在当前页面 |
| 纯 CSS 主题 | 主题选择器中的 Quiet Workspace | 原生 Haven 布局；调整配色、间距和图片大小 |

## 使用真实 IDE 工作区

服务器部署本版本后，在服务器地址后加上 `/app?workspace=ide`。未登录时先完成登录。页面会记住本次打开 IDE 工作区的请求，在登录后应用。

已经进入 Haven 的用户，也可以点击左侧栏底部的 **IDE** 按钮。另一个入口是“设置 → 布局与密度（Layout & Density）→ 侧栏布局（Sidebar Layout）”，选择“IDE Workspace Layout”。这些入口选择的是同一个布局插件。

布局选择保存在当前浏览器中，不会强制其他用户切换，也不会同步到其他设备。IDE 布局需要窗口宽度至少为 901 px。宽度小于 901 px 时，页面恢复原生布局；选择状态继续保留。在同一浏览器中重新扩大窗口，IDE 布局会恢复。手机上选择 IDE 后仍显示原生移动界面。

常用界面操作如下。

| 位置 | 操作 |
| --- | --- |
| 左侧 Project | 点击频道或私信，打开对应的真实内容。搜索框筛选频道名称；`Ctrl+K` 或 `Cmd+K` 聚焦搜索框。 |
| 文件标签 | 切换已打开的频道和帖子。关闭标签只移除标签，不会删除频道或帖子。 |
| 中间编辑区 | 显示真实消息或帖子正文。聊天消息带编号，作者和时间显示为注释样式；编号表示消息顺序。 |
| 底部 Console | 使用原生输入框发送消息或回复。发送后内容写入当前服务器，继续受频道权限和帖子关闭状态限制。 |
| Search | 打开 Haven 的消息搜索。Project 搜索框只筛选频道，顶部 Search 搜索消息内容。 |
| Tools | 打开原生账号、加入频道、创建频道和主题等控件。设置弹窗继续使用 Haven 的原生界面。 |
| 左侧成员面板按钮 | 展开搜索结果、成员和语音侧栏。 |
| Exit IDE | 恢复普通界面，并取消当前浏览器的 IDE 布局选择。 |

帖子列表显示为文件行，点击后在编辑区打开真实帖子。创建帖子、上传附件、编辑消息和表情操作继续使用 Haven 的原生控件。Console 是消息输入区，不会执行 Python 或终端命令。IDE 模式收起了线程的独立浮窗按钮，线程统一在编辑区打开。

也可以访问 `/app?workspace=original`，或在布局设置中选择 Original，恢复普通界面。切换布局会把原生控件放回原位。原先选择的 CSS 主题继续保留。

## 启动 IDE 原型

在仓库根目录运行：

```sh
node scripts/quiet-workspace-preview.js
```

打开 <http://127.0.0.1:4173/>。预览服务器只监听本机地址，不需要安装项目依赖，也不启动 Haven 后端。如需更换端口：

```sh
node scripts/quiet-workspace-preview.js 4174
```

原型支持以下操作：

- 点击项目树或文件标签切换帖子、笔记和聊天日志。
- 按 `Ctrl+K`（macOS 上为 `Cmd+K`）搜索文件名、帖子标题或正文。
- 在底部 Console 输入回复，按 Enter 添加到本地日志。
- 使用工具栏按钮展开或收起项目目录和讨论窗口。
- 点击右上角的说明按钮查看原型范围和上一版主题预览。

所有内容都是演示样例。回复只存在于当前页面，刷新后清空。原型不会发送消息、执行代码，也没有接入 Haven 的真实数据。要操作真实论坛，请使用上文的 IDE 工作区入口。

## 使用纯 CSS 主题

主题文件为 `themes/quiet-workspace.theme.css`，声明了 Theme API v1。主题提供深灰配色、文档式论坛列表、低调的聊天排版和较小的图片预览。

预览服务器运行后，可直接打开：

```text
http://127.0.0.1:4173/theme-preview.html?theme=../themes/quiet-workspace.theme.css
```

在真实 Haven 服务器中，按 [主题开发文档](theme-authoring.md) 安装并发布该文件。纯 CSS 主题保留原生布局，不包含 IDE 原型中的项目树、文件标签和 Console 交互。部分样式依赖 Haven 4.27 的内部组件类名，升级后需要检查显示效果。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `plugins/IdeWorkspaceLayout.plugin.js` | 真实 IDE 布局；移动原生控件、切换频道和帖子标签、恢复普通布局 |
| `public/css/ide-workspace.css` | 真实 IDE 工作区样式；只在桌面 IDE 模式生效 |
| `public/js/ide-workspace-entry.js` | IDE 按钮、链接参数和登录后的布局选择 |
| `public/app.html` | 加载 IDE 样式和入口脚本，提供侧栏按钮 |
| `public/quiet-workspace-demo.html` | IDE 原型结构 |
| `public/quiet-workspace-demo.css` | 静态原型的外观和响应式布局 |
| `public/quiet-workspace-demo.js` | 演示数据、文件切换、搜索和本地回复 |
| `scripts/quiet-workspace-preview.js` | 无依赖的本机预览服务器 |
| `themes/quiet-workspace.theme.css` | 可安装的纯 CSS 主题 |
| `test/ideWorkspaceLayout.test.js` | 布局挂载、控件恢复和生命周期测试 |
| `test/ideWorkspaceEntry.test.js` | 入口选择、移动界面回退和安全模式测试 |
| `test/ideWorkspaceNavigation.test.js` | 频道与帖子标签导航测试 |
| `test/ideThreadNavigation.test.js` | 线程加载和跨频道响应测试 |

## 验证范围

真实模式已在隔离数据的 Haven 服务上完成浏览器验证：从 Tools 创建聊天和论坛频道、发布帖子、通过 Console 发送聊天消息和帖子回复、跨频道标签切换、刷新后读取已保存内容、帖子内搜索，以及退出和重开 IDE 时保留输入草稿。

静态原型曾检查桌面和窄屏布局、文件搜索、标签切换、本地回复和工具窗口切换。这些结果只适用于演示页面，不能代替真实 IDE 工作区的验收。

真实 IDE 工作区的自动化回归命令如下：

```sh
node --test test/ideWorkspaceLayout.test.js test/ideWorkspaceEntry.test.js test/ideWorkspaceNavigation.test.js test/ideThreadNavigation.test.js
```

发布前还需在测试服务器检查真实发送、刷新后读取、跨频道打开帖子、搜索、权限限制、Tools 弹窗和布局恢复。自动化测试覆盖界面逻辑，浏览器验收负责确认实际布局和服务器交互。
