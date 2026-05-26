# 术语表

精确的术语定义。每个术语有且仅有一个含义。

---

## 网格模型

### Grid

虚拟终端。一个 `rows × cols` 的二维格子缓冲区，内部用多表格存储（SoA）。包含 dirty tracking 和上屏（flush）逻辑。是整个系统的核心数据结构和 SSOT。

### Cell

Grid 中的一个格子。由多表格中同一个 `(row, col)` 索引处的字段组成：`char`、`style`、`owner`、`flags`。不是一个独立的对象——只是概念上的称呼。

### Owner

格子的归属标识，类型为 `string`。标记这个格子"属于"哪个 Widget。Widget paint 时只写入 owner 等于自己 id 的格子。

### Ownership

整个 Grid 的 owners 表格。描述"谁拥有哪些格子"。由应用层响应式声明和管理。

### Continuation Cell

宽字符（CJK/emoji）占据 2 列。第一列存放实际字符，第二列标记为 continuation（`flags |= IS_CONTINUATION`）。continuation cell 的 `char` 为空字符串，不参与文本位置计数。

### Dirty

一个 Cell 被写入了与之前不同的值（char 或 style 变化）。Grid 的 setter 内部做值比较，不同时标记为 dirty。flush 时只输出 dirty cells。

---

## Widget 模型

### Widget

能在 Grid 上绘制内容的组件。拿到 Grid 引用和自己的 ownerId，遍历 Grid 找到属于自己的格子，填入内容。

### Paint

Widget 向 Grid 写入内容的过程。每次 paint 是全量的（遍历所有属于自己的格子重新写入），但由于 dirty tracking 的存在，只有真正变化的 cell 会触发上屏。

### charIndex

TextInput 中光标的 primary state。表示"文本中第几个字符之后"（0-based）。`charIndex = 0` 在最前，`charIndex = text.length` 在最后。

### 光标网格位置

charIndex 对应的 `(row, col)` 坐标。通过 paint 遍历自然定位：遍历到第 charIndex 个属于自己的格子时，当前 (row, col) 就是光标位置。作为 computed 暴露给外部（供菜单/补全定位）。

### scrollOffset

Widget 内部维护的滚动偏移。当内容超出分配的格子数量时，Widget 从 scrollOffset 开始填充，实现滚动效果。

---

## 响应式

### reactive state

使用 `@vue/reactivity` 的响应式状态（ref、reactive、computed）。Widget 的文本内容、光标位置、Grid 的 ownership 等都可以是 reactive 的。

### watchEffect

驱动整个 paint cycle 的机制。任何 reactive 状态变化 → watchEffect 重执行 → 全量 paint → flush 输出变化。

### computed

派生状态。如光标的 `(row, col)` 是从 charIndex + Grid ownership 派生的。补全框/选择框读取这个 computed 来定位自己。

---

## 上屏

### flush

Grid 的上屏操作。遍历所有 dirty cells，生成最小的 ANSI 序列写入输出流（stderr）。连续的 dirty cells 批量输出，孤立的 dirty cell 单独移动光标后写入。

### ANSI escape code

控制终端行为的转义序列。以 `\x1b[` 开头。

### SGR (Select Graphic Rendition)

ANSI 中控制文本样式的子集：颜色、粗体、斜体等。

### reflow

终端 resize 时的文本重排。旧的宽行在新的窄终端中自动折成多行。Grid 需要预测 reflow 结果来正确 clear 旧内容。

---

## 文本处理

### 可见宽度 (visual width)

一个字符在终端上占据的列数。ASCII = 1，CJK = 2，部分 emoji = 2。由 `string-width` 库计算。

### 折行

在 Grid ownership 模型中不是一个显式的算法步骤。文本按 row-major 顺序灌入属于自己的格子，一行格子用完后自然流到下一行——这就是折行。

### stickyCol

垂直光标移动时记住的列位置（可见宽度）。首次按 ↑/↓ 时记录当前光标的 col，连续垂直移动时保持。非垂直操作（左右、输入、删除）重置为 null。

---

## 约定

- **0-based**：所有索引从 0 开始（row, col, charIndex）
- **LTR only**：仅从左到右文本
- **string-width**：所有宽度计算使用 `string-width`
- **row-major**：遍历顺序永远是从上到下、从左到右
