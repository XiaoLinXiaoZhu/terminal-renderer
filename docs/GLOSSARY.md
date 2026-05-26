# 术语表

精确的术语定义。每个术语有且仅有一个含义。

---

## 网格模型

### Grid

虚拟终端缓冲区。一个 `rows × cols` 的二维格子，内部用多表格存储（SoA）。包含 dirty tracking 和 flush 上屏逻辑。flush 使用纯相对定位，返回光标结束位置 `{row, col}`。

### Cell

Grid 中的一个格子。由 `(row, col)` 索引处的多表格字段组成：char、style、owner、flags、dirty。概念称呼，非独立对象。

### Owner

格子的归属标识（string）。Widget paint 时只写入 owner 等于自己 id 的格子。

### Ownership

整个 Grid 的 owners 表格。描述"谁拥有哪些格子"。由应用层声明和管理。

### Continuation Cell

宽字符（CJK）占据 2 列。第一列存放实际字符（主 cell），第二列标记为 continuation（`flags |= IS_CONTINUATION`，char 为空字符串）。

### Dirty

Cell 被写入了与之前不同的值。Grid 的 setter 内部做值比较，不同时标记为 dirty。flush 只输出 dirty cells。

---

## 渲染模型

### Viewport

终端尾部动态区域管理器。封装"在终端尾部渲染一个不干扰历史的动态区域"的完整生命周期。全屏渲染是动态区域高度等于终端高度的特殊情况。

核心方法：mount（预留空间）、render（完整渲染周期）、commit（固化到历史）、remount（resize 后重建）。

### Mount

Viewport 在终端尾部预留空间的操作。输出 N 个换行确保终端滚动出足够空间，然后上移 N 行回到动态区域起始位置。

### Render

Viewport 的完整渲染周期：回到 grid home → flush dirty cells → 定位光标到目标位置。调用者只需传入 cursorTarget。

### Commit

将动态区域的当前内容固化为终端历史的一部分。清除动态区域，输出固定文本，重新预留空间。用于"提交输入后保留在 scrollback 中"的场景。

---

## Widget 模型

### Widget

能在 Grid 上绘制内容的组件。实现 `paint(grid, ownerId)` 方法，遍历 Grid 找到属于自己的格子并填入内容。

### Paint

Widget 向 Grid 写入内容的过程。每次 paint 是全量的（遍历所有属于自己的格子重新写入），由于 dirty tracking，只有真正变化的 cell 会触发上屏。

### cursorOffset

TextInput 中光标的 primary state。表示光标在文本中的位置（0 = 最前，text.length = 最后）。

### 光标网格位置 (cursorRow, cursorCol)

cursorOffset 对应的 (row, col) 坐标。通过 paint 遍历自然定位——遍历到 cursorOffset 对应的字符时记录当前位置。是 derived state。

### scrollOffset

TextInput 的滚动偏移。内容超出可见区域时，从 scrollOffset 开始填充文本。

### Decorations

TextInput 的样式区间列表。每个 decoration 指定 `{start, end, style}`，paint 时落在区间内的字符使用指定样式。用于语法高亮、ghost text 等。

### Ghost Text

自动补全建议的视觉预览。渲染时临时将建议文本拼入光标位置（后续文本被挤开），用 DIM 样式标记。接受（Tab）时实际执行 insertChar。

---

## 上屏

### flush

Grid 的上屏操作。遍历所有 dirty cells，生成最小的 ANSI 序列写入输出流。使用纯相对定位（不依赖绝对坐标）。返回 `{row, col}` 表示光标结束位置。

### SGR (Select Graphic Rendition)

ANSI 中控制文本样式的转义序列：颜色、粗体、斜体等。

### 相对定位

flush 中的光标移动策略。使用 `\x1b[nA`/`\x1b[nB`（上/下移）和 `\r` + `\x1b[nC`（行首+右移）。Grid 完全不知道自己在终端的绝对位置。

---

## 文本处理

### 可见宽度 (visual width)

字符在终端占据的列数。ASCII = 1，CJK = 2。由 string-width 库计算。

### 折行

文本按 row-major 顺序灌入 owned cells，一行用完后自然流到下一行。不是显式算法，而是 ownership 遍历的自然结果。

### stickyCol

垂直光标移动时记住的列位置。首次按 ↑/↓ 时记录，连续垂直移动时保持。非垂直操作重置为 null。

---

## 约定

- **0-based** — 所有索引从 0 开始
- **LTR only** — 仅从左到右文本
- **row-major** — 遍历顺序永远从上到下、从左到右
- **相对定位** — 渲染不依赖终端绝对坐标
