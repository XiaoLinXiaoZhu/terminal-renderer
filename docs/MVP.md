# terminal-renderer MVP

## 概述

terminal-renderer 是一个基于虚拟网格的终端渲染引擎。核心模型：将终端尾部声明为一个动态管理区域，Widget 在虚拟网格中声明式绘制，Grid 通过 dirty tracking 精准上屏。

MVP 已完成并验收。本文档记录核心原语和已验证的用例。

---

## 核心原语

| 原语 | 类型 | 描述 |
|------|------|------|
| **Grid** | 数据+引擎 | 虚拟终端缓冲区。SoA 存储 + dirty tracking + flush（相对定位）|
| **Viewport** | 渲染管理 | 终端尾部动态区域。mount/render/commit/remount |
| **TextInput** | Widget | 多行文本输入。cursorOffset 光标 + 折行 + 滚动 + decorations |
| **Menu** | Widget | 列表选择器。items + selectedIndex + 高亮 |
| **parseKey** | 工具 | raw stdin → 结构化按键事件（含 Tab） |

---

## 已验证的用例

| # | 用例 | Demo | 核心能力 |
|---|------|------|----------|
| 1 | 多行文本编辑 | `demo/editor.ts` | 输入/删除/光标/折行/滚动/resize |
| 2 | @mention 菜单 | `demo/mention.ts` | ownership 动态切换，Menu 覆盖区域 |
| 3 | 文本环绕块 | `demo/wrap.ts` | 非连续 ownership，文本绕排 |
| 4 | 带装饰的输入 | `demo/styled.ts` | decorations 样式区间 |
| 5 | 历史保留输入 | `demo/history.ts` | Viewport.commit 固化到 scrollback |
| 6 | 全屏动画 | `demo/reactive.ts` | Viewport 全屏 = 动态区域为全高 |
| 7 | 分屏编辑预览 | `demo/split.ts` | 左右分区 ownership + Markdown 渲染 |
| 8 | Ghost text 补全 | `demo/ghost.ts` | 临时拼入建议文本 + Tab 接受 |
| 9 | 强化输入框 | `demo/enhanced.ts` | 滚动指示器 + 状态栏 + 带边框菜单 |

---

## 关键设计决策

### 终端尾部动态区域

需求本质是"在不干扰正常历史的情况下，在终端尾部渲染一个动态区域"。全屏渲染不过是动态区域为全高的特殊情况。Viewport 统一了这两种场景。

### flush 纯相对定位

Grid 完全不知道自己在终端的绝对位置。flush 使用相对移动（上/下/行首+右移），返回光标结束位置给 Viewport 层追踪。

### Ghost Text = 带预览的 insertChar

ghost text 和 mention 在"接受"这一步完全一样（insertChar）。显示上临时将建议文本拼入光标位置，用 DIM decoration 标记，后续文本自然被挤开。

### moveUp/moveDown 边界判断

垂直移动用 `rowHasOwner` 判断目标行是否有属于自己的 cells，而非假设 input 从 row 0 开始。支持 input 区域在 grid 中任意位置。

---

## 项目结构

```
src/
├── grid.ts              Grid 核心（SoA + dirty + flush）
├── viewport.ts          Viewport（终端尾部动态区域管理）
├── text-input.ts        TextInput Widget
├── menu.ts              Menu Widget
├── width.ts             charWidth（封装 string-width）
├── keys.ts              按键解析（raw stdin → KeyAction）
├── index.ts             公共导出
└── __tests__/
    ├── grid.test.ts
    ├── text-input.test.ts
    ├── menu.test.ts
    ├── style.test.ts
    ├── width.test.ts
    ├── wrap.test.ts
    ├── viewport.test.ts
    └── scroll-edge.test.ts

demo/
├── hello.ts             静态文本渲染
├── input.ts             交互式输入
├── editor.ts            全屏多行编辑器
├── mention.ts           @mention 菜单
├── wrap.ts              文本环绕 + resize
├── styled.ts            带样式的输入
├── history.ts           历史保留输入
├── reactive.ts          全屏响应式动画
├── split.ts             分屏 Markdown 编辑/预览
├── enhanced.ts          强化输入框（指示器+状态栏+边框菜单）
└── ghost.ts             ghost text 自动补全
```

---

## 依赖

- `@vue/reactivity` — 响应式状态管理
- `string-width` — CJK/emoji 可见宽度计算

---

## 测试

112 个单元测试，覆盖 Grid 存储/宽字符/flush、TextInput 编辑/导航/滚动/装饰、Menu、Viewport、边界滚动等。

运行：`bun test`
