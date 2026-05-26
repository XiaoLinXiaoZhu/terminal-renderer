# terminal-renderer 设计规格

基于虚拟网格的终端渲染引擎。核心思想：在终端尾部声明一个动态管理区域，通过虚拟网格 + dirty tracking 实现高效增量渲染。

---

## 核心原则

1. **Grid 是 SSOT** — 虚拟网格是唯一的渲染状态来源
2. **Ownership 决定一切** — 每个格子有归属，Widget 只写自己的格子
3. **Paint 全量，flush 精准** — 每次重绘所有内容，但只上屏变化的部分
4. **终端尾部动态区域** — Grid 不知道自己在终端哪个绝对位置，通过 Viewport 在尾部管理动态区域
5. **不做自动布局** — 空间分配由应用层声明，Grid 不干预
6. **光标是文本偏移** — cursorOffset 是 primary state，网格坐标是 derived

---

## 架构

```
应用层 (demo / 业务代码)
          │
          ▼
┌─────────────────────────────────────┐
│         Paint Cycle                  │
│                                      │
│  textInput.paint(grid, 'input')      │
│  menu.paint(grid, 'menu')            │
│  ...                                 │
└─────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│         Grid (虚拟缓冲区)            │
│                                      │
│  chars[][]  styles[][]  owners[][]   │
│  flags[][]  dirty[][]                │
│                                      │
│  setChar() → 值比较 → 标记 dirty     │
│  flush()   → 输出 dirty cells → ANSI │
│             → 返回光标结束位置        │
└─────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│         Viewport (动态区域管理)       │
│                                      │
│  mount()   → 在终端尾部预留空间      │
│  render()  → home → flush → 定位光标 │
│  commit()  → 固化到历史 + 重新预留    │
│  remount() → resize 后重新挂载       │
└─────────────────────────────────────┘
          │
          ▼
      终端 (stderr)
```

---

## Grid 规格

### 存储模型 (SoA)

```typescript
class Grid {
  readonly rows: number
  readonly cols: number

  private chars: string[][]
  private styles: number[][]
  private owners: string[][]
  private flags: number[][]
  private dirty: boolean[][]

  // 写入（含 dirty tracking）
  setChar(row, col, char, style): void
  setWideChar(row, col, char, style): void
  setOwner(row, col, owner): void
  setOwnerAll(owner): void

  // 读取
  charAt(row, col): string
  styleAt(row, col): number
  ownerAt(row, col): string
  flagsAt(row, col): number

  // 上屏 — 返回光标结束位置
  flush(stream): { row: number; col: number }

  // 生命周期
  static create(cols, rows): Grid
  resize(cols, rows): void
}
```

### flush 的行为

flush 使用**纯相对定位**。调用者必须在调用前将终端光标定位到 Grid 的 home（左上角）。flush 内部追踪当前行列，通过 `\x1b[nA`/`\x1b[nB`（上/下）和 `\r` + `\x1b[nC`（行首+右移）定位。

```typescript
flush(stream): { row: number; col: number } {
  let curRow = 0, curCol = 0

  for each dirty cell (row, col):
    // 相对移动到目标位置
    // 输出样式 + 字符
    // 更新 curRow, curCol

  return { row: curRow, col: curCol }
}
```

不使用绝对定位（`\x1b[r;cH`），Grid 完全不依赖终端绝对坐标。

---

## Viewport 规格

Viewport 封装"在终端尾部渲染动态区域"的完整生命周期。全屏渲染只是动态区域高度等于终端高度的特殊情况。

```typescript
class Viewport {
  readonly grid: Grid
  private stream: { write(s: string): void }
  private cursorRow: number  // 光标相对于 grid home 的行位置

  // 在终端尾部预留 grid.rows 行空间
  mount(): void

  // 完整渲染周期：回到 home → flush → 定位光标到目标
  render(cursorTarget?: { row: number; col: number }): void

  // 清除动态区域
  clear(): void

  // 固化内容到历史，重新预留空间
  commit(output: string): void

  // resize 后重新挂载
  remount(oldRows?: number): void
}
```

### 渲染周期

`render(cursorTarget)` 的内部流程：
1. 从当前 cursorRow 相对移动到 row 0（grid home）
2. 调用 `grid.flush(stream)` → 获取 endPos
3. 输出 `\x1b[0m` 重置样式
4. 从 endPos 相对移动到 cursorTarget
5. 更新 cursorRow = cursorTarget.row

---

## Widget 规格

### 通用接口

```typescript
interface Widget {
  paint(grid: Grid, ownerId: string): void
}
```

Widget 没有统一基类，只需实现 paint。paint 时遍历 Grid，只写入 `ownerAt(row, col) === ownerId` 的格子。

### TextInput

多行文本输入 Widget。核心状态：

```typescript
class TextInput {
  text: string              // 文本内容
  cursorOffset: number      // 光标位置（charIndex）
  scrollOffset: number      // 滚动偏移
  stickyCol: number | null  // 垂直移动记忆列
  decorations: Decoration[] // 样式区间

  // paint 后更新
  cursorRow: number
  cursorCol: number

  paint(grid, ownerId): void
  insertChar(ch): void
  deleteBeforeCursor(): void
  moveLeft/Right/Up/Down(): void
  ensureCursorVisible(grid, ownerId): boolean
}
```

关键行为：
- paint 从 scrollOffset 开始，按 row-major 顺序将文本灌入 owned cells
- 遇到 `\n` 跳到下一行
- CJK 字符需要 2 列，放不下时留空格
- moveUp/moveDown 检测目标行是否有 owned cells，无则触发滚动

### Menu

列表选择器 Widget。每行一个 item，selectedIndex 高亮。

---

## 样式编码

样式用 `number` 编码（16 bit 实际使用）：

```
bits  0-3:  fg color (0=default, 1-8=基本色)
bits  4-7:  bg color (0=default, 1-8=基本色)
bits  8-11: flags (BOLD=0x100, DIM=0x200, ITALIC=0x400, UNDERLINE=0x800)
```

---

## 按键解析

`parseKey(buf: Buffer): KeyAction` 将 raw stdin 解析为结构化按键事件：

- 单字节控制字符：Ctrl+C, Ctrl+D, Enter, Escape, Tab, Backspace
- ANSI 转义序列：↑↓←→, Delete
- UTF-8 字符：普通输入

---

## 依赖

- `@vue/reactivity` — 响应式状态管理（用于 demo 中的 watchEffect 驱动）
- `string-width` — CJK/emoji 可见宽度计算
