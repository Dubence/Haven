# Quiet Workspace 演示

Quiet Workspace 提供一个受 PyCharm 界面启发的 Haven 交互原型，以及一份独立的深灰色 CSS 主题。

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

所有内容都是演示样例。回复只存在于当前页面，刷新后清空。原型不会发送消息、执行代码，也没有接入 Haven 的真实数据。实现完整 IDE 布局需要 CSS 与 JavaScript 配合。

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
| `public/quiet-workspace-demo.html` | IDE 原型结构 |
| `public/quiet-workspace-demo.css` | IDE 外观和响应式布局 |
| `public/quiet-workspace-demo.js` | 演示数据、文件切换、搜索和本地回复 |
| `scripts/quiet-workspace-preview.js` | 无依赖的本机预览服务器 |
| `themes/quiet-workspace.theme.css` | 可安装的纯 CSS 主题 |

## 验证范围

已检查桌面和窄屏布局、文件搜索、标签切换、本地回复及工具窗口切换。JavaScript 语法检查和现有的 9 项主题契约测试通过。需要 `better-sqlite3` 的完整兼容性测试尚未运行。
