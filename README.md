# @xlxz/terminal-renderer

基于虚拟网格的终端渲染引擎。在终端尾部声明一个动态管理区域，通过 Grid + dirty tracking 实现高效增量渲染。

核心特性：

- **虚拟缓冲区** — Grid 作为唯一渲染状态源，cell 粒度 dirty tracking，flush 只上屏变化部分
- **CJK 宽字符** — 完整的双宽字符支持，自动处理行尾溢出、continuation cell
- **Ownership 模型** — 每个格子有归属标识，多个 Widget 互不干扰地共享同一 Grid
- **Viewport 管理** — 封装终端尾部动态区域的完整生命周期（mount/render/commit/resize）
- **内置 Widget** — TextInput（多行输入、滚动、垂直导航）、Menu（列表选择器）
- **按键解析** — 将 raw stdin 解析为结构化 KeyAction

## 安装

```bash
npm install @xlxz/terminal-renderer
# 或
bun add @xlxz/terminal-renderer
```

## 快速开始

```typescript
import { Grid, Viewport, encodeStyle, BOLD } from '@xlxz/terminal-renderer'
import { charWidth } from '@xlxz/terminal-renderer'

const cols = process.stderr.columns || 80
const rows = process.stderr.rows || 24
const grid = Grid.create(cols, rows)
const vp = new Viewport(grid, process.stderr)

// 写入内容
let col = 2
for (const ch of 'Hello, 世界!') {
  const w = charWidth(ch)
  if (w === 2) {
    grid.setWideChar(0, col, ch, encodeStyle(3, 0, BOLD))
    col += 2
  } else {
    grid.setChar(0, col, ch, encodeStyle(3, 0, BOLD))
    col += 1
  }
}

// 渲染
vp.mount()
vp.render()
```

## 交互式输入

```typescript
import { Grid, Viewport, TextInput, parseKey } from '@xlxz/terminal-renderer'

const grid = Grid.create(80, 24)
const vp = new Viewport(grid, process.stderr)
const ti = new TextInput()

grid.setOwnerAll('input')
vp.mount()

function render() {
  ti.ensureCursorVisible(grid, 'input')
  ti.paint(grid, 'input')
  vp.render({ row: ti.cursorRow, col: ti.cursorCol })
}

process.stdin.setRawMode(true)
process.stdin.on('data', (buf) => {
  const key = parseKey(buf)
  switch (key.type) {
    case 'char': ti.insertChar(key.char); break
    case 'backspace': ti.deleteBeforeCursor(); break
    case 'enter': ti.insertChar('\n'); break
    case 'left': ti.moveLeft(); break
    case 'right': ti.moveRight(); break
    case 'up': ti.paint(grid, 'input'); ti.moveUp(grid, 'input'); break
    case 'down': ti.paint(grid, 'input'); ti.moveDown(grid, 'input'); break
    case 'ctrl': if (key.key === 'c') process.exit(0); break
  }
  render()
})

render()
```

## 架构

```
应用层
  │
  ▼
┌──────────────────────────────────┐
│        Paint Cycle               │
│  textInput.paint(grid, 'input')  │
│  menu.paint(grid, 'menu')        │
└──────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────┐
│        Grid (虚拟缓冲区)          │
│  chars[][] styles[][] owners[][] │
│  setChar() → 值比较 → 标记 dirty │
│  flush()   → 输出 dirty → ANSI  │
└──────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────┐
│     Viewport (动态区域管理)       │
│  mount → render → commit/resize  │
└──────────────────────────────────┘
  │
  ▼
终端 (stderr)
```

**Paint 全量，flush 精准** — 每次重绘所有内容到 Grid，但只有实际变化的 cell 产生 ANSI 输出。

## API

### Grid

```typescript
// 创建
const grid = Grid.create(cols, rows)

// 写入
grid.setChar(row, col, char, style)
grid.setWideChar(row, col, char, style)  // CJK 双宽字符
grid.setOwner(row, col, ownerId)
grid.setOwnerAll(ownerId)

// 读取
grid.charAt(row, col)
grid.styleAt(row, col)
grid.ownerAt(row, col)

// 上屏（返回光标结束位置）
grid.flush(stream)

// 生命周期
grid.resize(newCols, newRows)
```

### Viewport

```typescript
const vp = new Viewport(grid, stream)

vp.mount()                    // 在终端尾部预留空间
vp.render(cursorTarget?)      // 完整渲染周期
vp.clear()                    // 清除动态区域
vp.commit(output)             // 固化内容到历史，重新预留
vp.remount(newCols, newRows?) // resize 后重新挂载
```

### TextInput

```typescript
const ti = new TextInput()

ti.text = ''
ti.cursorOffset = 0
ti.decorations = [{ start: 0, end: 5, style: myStyle }]

ti.paint(grid, ownerId)       // 将文本灌入 owned cells
ti.insertChar(ch)
ti.deleteBeforeCursor()
ti.moveLeft() / ti.moveRight()
ti.moveUp(grid, ownerId) / ti.moveDown(grid, ownerId)
ti.ensureCursorVisible(grid, ownerId)

// paint 后可读取光标网格位置
ti.cursorRow
ti.cursorCol
```

### Menu

```typescript
const menu = new Menu()

menu.items = ['Option A', 'Option B', 'Option C']
menu.selectedIndex = 0

menu.paint(grid, ownerId)
menu.selectNext()
menu.selectPrev()
```

### 样式

```typescript
import { encodeStyle, BOLD, DIM, ITALIC, UNDERLINE } from '@xlxz/terminal-renderer'

// fg: 0=默认, 1=黑, 2=红, 3=绿, 4=黄, 5=蓝, 6=品红, 7=青, 8=白
// bg: 同上
const style = encodeStyle(fg, bg, flags)
const boldGreen = encodeStyle(3, 0, BOLD)
const dimItalic = encodeStyle(0, 0, DIM | ITALIC)
```

### 按键解析

```typescript
import { parseKey } from '@xlxz/terminal-renderer'

const key = parseKey(buf)
// key.type: 'char' | 'backspace' | 'delete' | 'left' | 'right'
//         | 'up' | 'down' | 'enter' | 'escape' | 'tab' | 'ctrl' | 'unknown'
```

## Demo

安装后可在 `node_modules/@xlxz/terminal-renderer/demo/` 中找到示例源码，也可以克隆仓库运行：

| 示例 | 说明 | 运行 |
|------|------|------|
| hello | Grid 基础渲染、样式、宽字符 | `bun demo/hello.ts` |
| input | 交互式文本输入 | `bun demo/input.ts` |
| editor | 多行编辑器 | `bun demo/editor.ts` |
| mention | @mention 弹出菜单 | `bun demo/mention.ts` |
| reactive | 响应式动画（时钟、进度条、弹跳球） | `bun demo/reactive.ts` |
| ghost | Ghost text 自动补全预览 | `bun demo/ghost.ts` |
| styled | 样式装饰示例 | `bun demo/styled.ts` |
| split | 分屏布局 | `bun demo/split.ts` |
| wrap | 非连续 ownership 区域文本环绕 | `bun demo/wrap.ts` |
| centered | 居中布局 | `bun demo/centered.ts` |
| enhanced | 综合功能展示 | `bun demo/enhanced.ts` |
| history | 命令历史（commit 固化） | `bun demo/history.ts` |

## 核心概念

**Grid 是唯一状态源** — 所有渲染内容写入 Grid，flush 负责转换为 ANSI 序列。Grid 使用纯相对定位，不依赖终端绝对坐标。

**Ownership 决定一切** — 每个 cell 有归属标识。Widget paint 时只写入属于自己的格子。应用层通过设置 ownership 来声明空间分配。

**光标是文本偏移** — TextInput 的 cursorOffset 是 primary state，网格坐标 (cursorRow, cursorCol) 是 paint 过程中自然推导的 derived state。

**Viewport 管理终端交互** — 在终端尾部预留空间，处理渲染周期和 resize，不干扰已有的 scrollback 历史。

## 文档

详细设计文档位于 `docs/` 目录：

- [SPEC.md](docs/SPEC.md) — 完整设计规格
- [GLOSSARY.md](docs/GLOSSARY.md) — 术语定义
- [ROADMAP.md](docs/ROADMAP.md) — 开发路线
- [MVP.md](docs/MVP.md) — MVP 实现记录

## 依赖

- [`@vue/reactivity`](https://github.com/vuejs/core) — 响应式状态管理（用于 watchEffect 驱动渲染循环）
- [`string-width`](https://github.com/sindresorhus/string-width) — 字符可见宽度计算（CJK/emoji）

## License

MIT
