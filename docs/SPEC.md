# terminal-renderer 设计规格

基于虚拟网格的终端渲染引擎。

---

## 核心原则

1. **Grid 是 SSOT** — 虚拟网格是唯一的渲染状态来源
2. **Ownership 决定一切** — 每个格子有归属，Widget 只写自己的格子
3. **Paint 全量，flush 精准** — 每次重绘所有内容，但只上屏变化的部分
4. **终端完全虚拟化** — Grid 和物理终端解耦，上屏是唯一耦合点
5. **不做自动布局** — 空间分配由应用层响应式声明，Grid 不干预
6. **光标是文本偏移** — charIndex 是 primary state，网格坐标是 derived

---

## 架构

```
@vue/reactivity (watchEffect)
          │
          ▼
┌─────────────────────────────────────┐
│         Paint Cycle                  │
│                                      │
│  textInput.paint(grid, 'input')      │
│  menu.paint(grid, 'menu')            │
│  ...                                 │
│                                      │
│  grid.flush(stream)                  │
└─────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│         Grid (GridStore)             │
│                                      │
│  chars[][]  styles[][]  owners[][]   │
│  flags[][]  dirty[][]                │
│                                      │
│  setChar() → 值比较 → 标记 dirty     │
│  flush()   → 输出 dirty cells → ANSI │
└─────────────────────────────────────┘
          │
          ▼
      stderr (终端)
```

---

## Grid 规格

### 存储模型 (SoA)

```typescript
class Grid {
  readonly rows: number
  readonly cols: number
  
  // 多表格并行数组
  private chars: string[][]      // 字符内容
  private styles: number[][]     // 样式编码 (uint32)
  private owners: string[][]     // 归属标识
  private flags: number[][]      // bit flags
  private dirty: boolean[][]     // 脏标记
  
  // 写入（含 dirty tracking）
  setChar(row: number, col: number, char: string, style: number): void
  setOwner(row: number, col: number, owner: string): void
  
  // 读取
  charAt(row: number, col: number): string
  styleAt(row: number, col: number): number
  ownerAt(row: number, col: number): string
  flagsAt(row: number, col: number): number
  
  // 上屏
  flush(stream: NodeJS.WritableStream): void
  
  // 重建（resize 时）
  static create(cols: number, rows: number): Grid
}
```

### setChar 的行为

```typescript
setChar(row, col, char, style) {
  if (this.chars[row][col] === char && this.styles[row][col] === style) return
  this.chars[row][col] = char
  this.styles[row][col] = style
  this.dirty[row][col] = true
}
```

值相同 → 不标记 dirty → 不上屏。这使得全量 paint 的性能开销降到最低。

### 宽字符写入

```typescript
// 写入宽字符 '你' 到 (row, col)：
setChar(row, col, '你', style)        // 主 cell
setChar(row, col + 1, '', style)      // continuation cell
setFlags(row, col + 1, IS_CONTINUATION)

// 如果 col+1 已有内容（被覆盖）：
// 如果 col+1 本身是某个宽字符的主 cell → 需要清除 col+2 的 continuation
// 如果 col 本身是某个宽字符的 continuation → 需要清除 col-1 的主 cell
// 这些边界处理在写入工具函数中统一处理
```

### flush 的行为

```typescript
flush(stream) {
  let lastRow = -1, lastCol = -1
  let currentStyle = 0
  
  for (let row = 0; row < this.rows; row++) {
    for (let col = 0; col < this.cols; col++) {
      if (!this.dirty[row][col]) continue
      if (this.flags[row][col] & IS_CONTINUATION) continue  // 跳过 continuation
      
      // 移动光标（优化：连续 cell 不需要移动）
      if (row !== lastRow || col !== lastCol + 1) {
        stream.write(cursorTo(row, col))
      }
      
      // 设置样式（优化：样式相同不重复输出）
      if (this.styles[row][col] !== currentStyle) {
        currentStyle = this.styles[row][col]
        stream.write(sgrFromEncoded(currentStyle))
      }
      
      // 写入字符
      stream.write(this.chars[row][col])
      lastRow = row
      lastCol = col
      
      this.dirty[row][col] = false
    }
  }
  
  // 定位终端光标到 focused widget 的光标位置
  stream.write(cursorTo(focusCursorRow, focusCursorCol))
}
```

---

## Widget 规格

### 通用接口

```typescript
interface Widget {
  paint(grid: Grid, ownerId: string): void
}
```

Widget 没有统一基类，只需实现 paint。paint 时：
1. 遍历 Grid 的所有 (row, col)
2. 检查 `grid.ownerAt(row, col) === ownerId`
3. 如果是自己的格子 → 写入内容
4. 如果不是 → 跳过

### TextInput

```typescript
class TextInput implements Widget {
  // reactive state
  text: string                    // 文本内容
  cursorOffset: number            // 光标位置（charIndex）
  scrollOffset: number            // 滚动偏移
  stickyCol: number | null        // 垂直移动记忆列
  
  // computed (derived)
  cursorRow: number               // 光标网格行（paint 后更新）
  cursorCol: number               // 光标网格列（paint 后更新）
  
  paint(grid: Grid, ownerId: string): void {
    let charIdx = this.scrollOffset  // 从 scrollOffset 开始灌入
    
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        if (grid.ownerAt(row, col) !== ownerId) continue
        
        // 记录光标网格位置
        if (charIdx === this.cursorOffset) {
          this.cursorRow = row
          this.cursorCol = col
        }
        
        // 写入字符
        if (charIdx < this.text.length) {
          const ch = this.text[charIdx]
          const w = charWidth(ch)
          
          if (w === 2) {
            // 检查当前行剩余连续空间是否 >= 2
            if (col + 1 < grid.cols && grid.ownerAt(row, col + 1) === ownerId) {
              grid.setChar(row, col, ch, this.style)
              grid.setChar(row, col + 1, '', this.style)
              grid.setFlags(row, col + 1, IS_CONTINUATION)
              col++  // 跳过 continuation
            } else {
              // 放不下 → 当前格子留空格，继续到下一个位置
              grid.setChar(row, col, ' ', 0)
              continue  // 不递增 charIdx，下一个格子再试
            }
          } else {
            grid.setChar(row, col, ch, this.style)
          }
          charIdx++
        } else {
          // 文本已结束，剩余格子写空格
          grid.setChar(row, col, ' ', 0)
        }
      }
    }
    
    // 如果光标在文本末尾且未在遍历中定位到
    if (this.cursorOffset >= this.text.length) {
      // cursorRow/cursorCol 在最后一个字符之后的位置
    }
  }
  
  // 编辑操作
  insertChar(ch: string): void {
    this.text = this.text.slice(0, this.cursorOffset) + ch + this.text.slice(this.cursorOffset)
    this.cursorOffset++
    this.stickyCol = null
  }
  
  deleteBeforeCursor(): void {
    if (this.cursorOffset === 0) return
    this.text = this.text.slice(0, this.cursorOffset - 1) + this.text.slice(this.cursorOffset)
    this.cursorOffset--
    this.stickyCol = null
  }
  
  moveLeft(): void {
    if (this.cursorOffset > 0) this.cursorOffset--
    this.stickyCol = null
  }
  
  moveRight(): void {
    if (this.cursorOffset < this.text.length) this.cursorOffset++
    this.stickyCol = null
  }
  
  moveUp(grid: Grid, ownerId: string): void {
    // 用当前 cursorRow/cursorCol 找上一行同 col 的 charIndex
    const targetRow = this.cursorRow - 1
    const targetCol = this.stickyCol ?? this.cursorCol
    if (this.stickyCol === null) this.stickyCol = this.cursorCol
    
    // 遍历 Grid，找 (targetRow, targetCol) 处对应的 charIndex
    this.cursorOffset = this.resolveCharIndex(grid, ownerId, targetRow, targetCol)
  }
  
  moveDown(grid: Grid, ownerId: string): void {
    // 类似 moveUp，targetRow = cursorRow + 1
  }
  
  // 辅助：从 (targetRow, targetCol) 反查 charIndex
  private resolveCharIndex(grid: Grid, ownerId: string, targetRow: number, targetCol: number): number {
    let charIdx = this.scrollOffset
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        if (grid.ownerAt(row, col) !== ownerId) continue
        if (grid.flagsAt(row, col) & IS_CONTINUATION) continue
        if (row === targetRow && col >= targetCol) return charIdx
        if (row > targetRow) return charIdx  // 过了目标行，取该行首个
        charIdx++
      }
    }
    return charIdx
  }
}
```

### Menu

```typescript
class Menu implements Widget {
  items: string[]
  selectedIndex: number
  
  paint(grid: Grid, ownerId: string): void {
    let itemIdx = 0
    let colInItem = 0
    
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        if (grid.ownerAt(row, col) !== ownerId) continue
        
        if (itemIdx >= this.items.length) {
          grid.setChar(row, col, ' ', 0)
          continue
        }
        
        const item = this.items[itemIdx]
        const style = itemIdx === this.selectedIndex ? HIGHLIGHT_STYLE : NORMAL_STYLE
        
        if (colInItem < item.length) {
          grid.setChar(row, col, item[colInItem], style)
          colInItem++
        } else {
          grid.setChar(row, col, ' ', style)  // 填充行尾
        }
      }
      // 每行结束换到下一个 item
      itemIdx++
      colInItem = 0
    }
  }
}
```

---

## 响应式驱动

```typescript
import { ref, computed, watchEffect } from '@vue/reactivity'

// 创建 Grid
const cols = ref(process.stderr.columns)
const rows = ref(process.stderr.rows)
const grid = Grid.create(cols.value, rows.value)

// 声明 ownership（响应式）
const menuOpen = ref(false)
const menuHeight = 5

watchEffect(() => {
  // 重置所有 ownership
  grid.setOwnerAll('textInput')
  
  // 如果菜单打开，分配菜单区域
  if (menuOpen.value) {
    const anchorRow = textInput.cursorRow + 1
    for (let r = anchorRow; r < anchorRow + menuHeight && r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        grid.setOwner(r, c, 'menu')
      }
    }
  }
})

// Paint cycle
watchEffect(() => {
  textInput.paint(grid, 'textInput')
  if (menuOpen.value) menu.paint(grid, 'menu')
  grid.flush(process.stderr)
})
```

---

## Resize 处理

```typescript
process.stderr.on('resize', () => {
  const newCols = process.stderr.columns
  const newRows = process.stderr.rows
  
  // 1. 计算旧内容在新宽度下占多少行（预测终端 reflow）
  const reflowedHeight = grid.computeReflowHeight(newCols)
  
  // 2. 清除旧内容（基于新宽度下的行数）
  grid.clearFromTerminal(process.stderr, reflowedHeight)
  
  // 3. 重建 Grid
  grid.resize(newCols, newRows)
  
  // 4. 更新 reactive 的 cols/rows → 触发 ownership 重算 + repaint
  cols.value = newCols
  rows.value = newRows
})
```

---

## 样式编码

样式用 `uint32` 编码，避免对象分配和 GC 压力：

```typescript
// 编码方案（32 bit）:
// bits  0-3:  fg color (0=default, 1-8=基本色, 9-15=保留)
// bits  4-7:  bg color
// bits  8-11: flags (bold=0x01, dim=0x02, italic=0x04, underline=0x08)
// bits 12-31: 保留（未来扩展 256 色/true color）

const BOLD = 1 << 8
const DIM = 1 << 9
const ITALIC = 1 << 10
const UNDERLINE = 1 << 11

function encodeStyle(fg: number, bg: number, flags: number): number {
  return (fg & 0xF) | ((bg & 0xF) << 4) | (flags & 0xF00)
}

function sgrFromEncoded(style: number): string {
  // 解码 → 生成 SGR 序列
}
```

---

## 依赖

- `@vue/reactivity` — 响应式状态管理
- `string-width` — CJK/emoji 可见宽度计算
