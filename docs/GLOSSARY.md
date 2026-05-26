# 术语表

精确的术语定义，减少沟通歧义。每个术语有且仅有一个含义。

---

## 终端基础

### cols
终端宽度，单位是字符列。80 列终端 → `cols = 80`。
一个中文字符占 2 列（`string-width` 计量），一个 ASCII 字符占 1 列。

### rows
终端高度，单位是字符行。24 行终端 → `rows = 24`。

### ANSI escape code
控制终端行为的转义序列。以 `\x1b[` 开头。

### SGR (Select Graphic Rendition)
ANSI 中控制文本样式的子集：颜色（`\x1b[31m`）、粗体（`\x1b[1m`）、斜体（`\x1b[3m`）、下划线（`\x1b[4m`）、重置（`\x1b[0m`）等。

### CSI (Control Sequence Introducer)
ANSI 控制序列的起始标记，即 `\x1b[`。

---

## 行模型（核心，易混淆）

> 以下 5 个术语描述不同抽象层的"行"，是沟通中最容易混淆的概念。

### 文本行 (text line)
用户输入的、由 `\n` 分隔的逻辑行。
- 例如：`"hello\nworld"` 包含 2 个文本行
- own by TextInput

### 输入行 (input line)
一个文本行按 cols 折行后产生的渲染行。一个文本行可能对应多个输入行。
- 例如：80 列终端中，120 个字符的文本行产生 2 个输入行（80 + 40）
- derived by Layout

### 终端行 (terminal row)
Flow 布局引擎产出的、准备写入终端的行。包含文本内容 + StyleRange[]。
- `TerminalRow { text: string, styles: StyleRange[] }`
- 是 Screen 的输入

### 物理行 (physical row)
Screen 的 own 状态，精确记录终端上当前显示的内容。
- `physicalRows: string[]`
- diff 时与新的 terminalRows 逐行比较
- 每个元素是一行已渲染的文本（不含 ANSI？含 ANSI？见下方"ANSI 输出会统一"）

### 渲染行
口语化术语，一般指 terminal row 或 physical row，根据上下文判断。
在"按渲染行跳转"中，指输入行（即屏幕上可见的一行），光标按此粒度上下移动。

---

## 光标与位置

### TextPosition
光标的逻辑位置，own by TextInput。
```typescript
{ line: number, offset: number }
```
- `line`: 第几个文本行（0-based）
- `offset`: 在该文本行中的字符偏移（0-based，位于字符之间，不是字符上）

### ScreenPosition
光标的屏幕位置，derived。
```typescript
{ row: number, col: number }
```
- `row`: 屏幕上的第几行（相对 live zone 顶部）
- `col`: 屏幕上的第几列（0-based）

### stickyCol
垂直光标移动时记住的列位置。
- 首次按 ↑/↓ 时记录当前列的可见宽度位置
- 连续垂直移动时保持，确保光标不会因为跨行长度不同而跳跃
- 任何非垂直操作（左右移动、插入、删除）重置为 null

### 可见宽度 (visual width)
一个字符在终端上占据的列数。ASCII = 1，CJK = 2，emoji = 1 或 2。
由 `string-width` 库计算。

---

## ownflow 核心

### own
响应式状态原语。数据的唯一真相来源，只有一个模块能写入。
类比 Vue 的 `ref` / `reactive`，或 Elm 的 model。

### derived
派生状态。从 own 或其他 derived 计算而来，只读。
类比 Vue 的 `computed`。

### watch
声明式依赖关系：A watch B 表示 A 在 B 变化时重新计算或被通知。
ownflow 中，watch 建立响应式管道。

---

## 布局与渲染

### 折行 (wrap)
将超长的文本按 cols 拆分为多个终端行的过程。
- 优先在单词边界折行（如有空格）
- 否则在 cols 位置硬截断
- CJK 字符可以在任意位置折行

### 换行 (line break)
由用户主动插入 `\n` 产生的逻辑断行。与折行（宽度不够被动拆分）区分。

### VNode
虚拟节点。UI 树的节点类型。包含 tag（6 种）、attrs（属性）、children（子节点）。
类比 HTML 的 Element。

### h()
VNode 工厂函数。`h('textinput', { focus: true }, [])` → VNode。
命名来自 hyperscript 惯例。

### Segment
Flow 引擎 expand 阶段的产物。平坦的、按顺序排列的行内单元。
- `TextSegment { content: string, style?: StyleRange }`
- `BlockSegment { width: number, children: VNode[] }`

### InlineBlock
行内块级元素。一个固定宽度的矩形，参与文本流的折行计算。
文本在其左右绕排——block 左侧的文本靠左排，右侧继续在 block 下方排。

### GhostText
光标后出现的灰显建议文本。不是 TextInput 的 own 内容，只是视觉叠加。
Tab 接受时，ghost text 被写入 TextInput.textLines。

---

## Screen 操作

### diff
比较 `physicalRows[i]` 和 `newTerminalRow[i]`。只重写内容变化的行，跳过相同的行。
纯字符串比较（`!==`），不涉及语义分析。

### 全量重写
当所有行都变化时（如 resize），diff 退化为全量写入。

### live zone
Screen 在终端上管理的活跃渲染区域。高度 = liveHeight，底部与光标齐平。

### liveHeight
`liveHeight = min(rows, contentRequiredHeight, maxHeight)`
live zone 占用的行数。内容不够时缩小，超限时以 maxHeight 为上限。

### freeze
释放 live zone，将当前内容固化为 scrollback，清空 physicalRows。
用于"提交后清屏，展示下一轮输入"的场景。

---

## 输入

### bracketed paste
终端协议：粘贴文本时，终端在文本前后包裹 `\x1b[200~` ... `\x1b[201~`。
KeyParser 利用此标记区分手动输入和粘贴，做出不同处理。

### keyEvent
KeyParser 产出的结构化输入事件。
```typescript
{ seq: number, actions: Action[] }
```
- `char`: 可打印字符
- `arrow`: 方向键（上/下/左/右）
- `submit`: Enter
- `abort`: Esc / Ctrl+C
- `paste`: 粘贴文本块
- `tab`: Tab 键
```

---

## 约定

- **0-based**: 所有位置索引从 0 开始（line, offset, row, col）
- **LTR only**: 仅处理从左到右文本
- **string-width**: 所有宽度计算统一使用 `string-width`，不使用 `.length`
- **ANSI 输出统一**: 所有 ANSI 写入通过 Screen 模块，禁止其他地方直接写 stderr