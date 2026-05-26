/**
 * Demo: 强化 history + 输入框
 *
 * 特性：
 * 1. 输入框上下显示滚动行数指示器（↑ N lines / ↓ N lines）
 * 2. 底部固定状态栏（字符数、光标位置、当前时间）
 * 3. @mention 菜单带外边框
 *
 * 运行: bun demo/enhanced.ts
 * 退出: Ctrl+C | 提交: Ctrl+D
 */

import { Grid, encodeStyle, sgrFromEncoded, BOLD, DIM, ITALIC } from '../src/grid.ts'
import { TextInput } from '../src/text-input.ts'
import { Menu } from '../src/menu.ts'
import { Viewport } from '../src/viewport.ts'
import { parseKey } from '../src/keys.ts'
import { charWidth } from '../src/width.ts'

const stream = process.stderr
const cols = stream.columns || 80

// 动态区域布局
const GRID_ROWS = 14
// Row 0: 滚动上指示器
// Rows 1..(GRID_ROWS-3): 输入区域
// Row (GRID_ROWS-2): 滚动下指示器
// Row (GRID_ROWS-1): 状态栏

const INPUT_START_ROW = 1
const INPUT_END_ROW = GRID_ROWS - 3 // inclusive
const INDICATOR_TOP_ROW = 0
const INDICATOR_BOT_ROW = GRID_ROWS - 2
const STATUS_ROW = GRID_ROWS - 1

const grid = Grid.create(cols, GRID_ROWS)
const vp = new Viewport(grid, stream)
const ti = new TextInput()
const menu = new Menu()

menu.items = ['Alice', 'Bob', 'Charlie', 'David', 'Eve', '你好世界']

let menuOpen = false
let promptCounter = 1

// Menu 带边框的尺寸
const MENU_ITEM_WIDTH = 18
const MENU_BOX_WIDTH = MENU_ITEM_WIDTH + 2 // +2 for left/right border
const MENU_BOX_HEIGHT = menu.items.length + 2 // +2 for top/bottom border

// --- Styles ---
const promptStyle = encodeStyle(3, 0, BOLD)     // green bold
const dimStyle = encodeStyle(0, 0, DIM)
const statusBgStyle = encodeStyle(8, 5, BOLD)   // white on blue
const statusDimStyle = encodeStyle(7, 5)        // cyan on blue
const indicatorStyle = encodeStyle(4, 0, DIM)   // yellow dim
const borderStyle = encodeStyle(6, 0)           // magenta
const menuHighlight = encodeStyle(1, 8, BOLD)   // black on white bold
const menuNormal = encodeStyle(8, 1)            // white on black
const inputPromptStyle = encodeStyle(5, 0, BOLD) // blue bold

// --- Helpers ---

function writeStr(row: number, col: number, text: string, style: number) {
  let c = col
  for (const ch of text) {
    if (c >= grid.cols) break
    const w = charWidth(ch)
    if (w === 2) {
      if (c + 1 < grid.cols) { grid.setWideChar(row, c, ch, style); c += 2 }
      else { grid.setChar(row, c, ' ', 0); c++ }
    } else {
      grid.setChar(row, c, ch, style)
      c++
    }
  }
}

function clearRow(row: number, style: number = 0) {
  for (let c = 0; c < cols; c++) grid.setChar(row, c, ' ', style)
}

// --- 计算滚动行数 ---

function countLinesAbove(): number {
  if (ti.scrollOffset === 0) return 0
  // 统计 scrollOffset 之前有多少个换行 + 自动折行的视觉行数
  const before = ti.text.slice(0, ti.scrollOffset)
  const newlines = (before.match(/\n/g) || []).length
  // 粗略估计：每行容量约 cols 字符
  const inputWidth = cols
  let lines = 0
  let lineStart = 0
  for (let i = 0; i <= before.length; i++) {
    if (i === before.length || before[i] === '\n') {
      const lineLen = i - lineStart
      lines += Math.max(1, Math.ceil(lineLen / inputWidth))
      lineStart = i + 1
    }
  }
  return Math.max(0, lines - 1)
}

function countLinesBelow(): number {
  // 模拟 paint 看在 input 区域底部之后还有多少内容
  let charIdx = ti.scrollOffset
  // 先走过 input 区域能显示的内容
  for (let row = INPUT_START_ROW; row <= INPUT_END_ROW; row++) {
    for (let col = 0; col < cols; col++) {
      if (grid.ownerAt(row, col) !== 'input') continue
      if (charIdx >= ti.text.length) return 0
      const ch = ti.text[charIdx]!
      if (ch === '\n') { charIdx++; break }
      const w = charWidth(ch)
      if (w === 2) {
        const nextCol = col + 1
        if (nextCol < cols && grid.ownerAt(row, nextCol) === 'input') {
          col++
          charIdx++
        }
      } else {
        charIdx++
      }
    }
  }
  // 计算剩余内容的行数
  if (charIdx >= ti.text.length) return 0
  const remaining = ti.text.slice(charIdx)
  const newlines = (remaining.match(/\n/g) || []).length
  const inputWidth = cols
  let lines = 0
  let lineStart = 0
  for (let i = 0; i <= remaining.length; i++) {
    if (i === remaining.length || remaining[i] === '\n') {
      const lineLen = i - lineStart
      lines += Math.max(1, Math.ceil(lineLen / inputWidth))
      lineStart = i + 1
    }
  }
  return lines
}

// --- Layout & Paint ---

function setupLayout() {
  // 清空所有 ownership
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      grid.setOwner(r, c, '')
    }
  }

  // 输入区域
  for (let r = INPUT_START_ROW; r <= INPUT_END_ROW; r++) {
    for (let c = 0; c < cols; c++) {
      grid.setOwner(r, c, 'input')
    }
  }
}

function setupMenuOwnership() {
  if (!menuOpen) return

  // 菜单锚定在光标下方，带边框
  const anchorRow = ti.cursorRow + 1
  const anchorCol = Math.min(Math.max(0, ti.cursorCol - 1), cols - MENU_BOX_WIDTH)

  // 确保菜单不超出 grid（不覆盖状态栏）
  const maxRow = Math.min(anchorRow + MENU_BOX_HEIGHT - 1, GRID_ROWS - 2)
  const actualHeight = maxRow - anchorRow + 1
  if (actualHeight < 3) { menuOpen = false; return } // 空间不够

  for (let r = anchorRow; r <= maxRow; r++) {
    for (let c = anchorCol; c < anchorCol + MENU_BOX_WIDTH && c < cols; c++) {
      grid.setOwner(r, c, 'menu')
    }
  }
}

function paintIndicators() {
  const above = countLinesAbove()
  const below = countLinesBelow()

  // 顶部指示器
  clearRow(INDICATOR_TOP_ROW)
  if (above > 0) {
    const text = `  ↑ ${above} line${above > 1 ? 's' : ''} above`
    writeStr(INDICATOR_TOP_ROW, 0, text, indicatorStyle)
    // 右侧填充虚线
    const dots = '·'.repeat(Math.max(0, cols - text.length - 2))
    writeStr(INDICATOR_TOP_ROW, text.length, dots.slice(0, cols - text.length), dimStyle)
  } else {
    const prompt = `[${promptCounter}]`
    writeStr(INDICATOR_TOP_ROW, 1, prompt, inputPromptStyle)
    const line = '─'.repeat(Math.max(0, cols - prompt.length - 3))
    writeStr(INDICATOR_TOP_ROW, prompt.length + 2, line, dimStyle)
  }

  // 底部指示器
  clearRow(INDICATOR_BOT_ROW)
  if (below > 0) {
    const text = `  ↓ ${below} line${below > 1 ? 's' : ''} below`
    writeStr(INDICATOR_BOT_ROW, 0, text, indicatorStyle)
    const dots = '·'.repeat(Math.max(0, cols - text.length - 2))
    writeStr(INDICATOR_BOT_ROW, text.length, dots.slice(0, cols - text.length), dimStyle)
  } else {
    const line = '─'.repeat(Math.max(0, cols - 2))
    writeStr(INDICATOR_BOT_ROW, 1, line, dimStyle)
  }
}

function paintStatusBar() {
  clearRow(STATUS_ROW, statusBgStyle)

  const totalChars = ti.text.length
  const cursorLine = ti.cursorRow - INPUT_START_ROW + 1 + countLinesAbove()
  const cursorCol = ti.cursorCol + 1
  const now = new Date()
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false })

  const left = ` Chars: ${totalChars} | Cursor: L${cursorLine}:C${cursorCol}`
  const right = `${timeStr} `
  const middle = ' '.repeat(Math.max(0, cols - left.length - right.length))

  writeStr(STATUS_ROW, 0, left, statusBgStyle)
  writeStr(STATUS_ROW, left.length, middle, statusBgStyle)
  writeStr(STATUS_ROW, cols - right.length, right, statusDimStyle)
}

function paintMenuWithBorder() {
  if (!menuOpen) return

  const anchorRow = ti.cursorRow + 1
  const anchorCol = Math.min(Math.max(0, ti.cursorCol - 1), cols - MENU_BOX_WIDTH)
  const maxRow = Math.min(anchorRow + MENU_BOX_HEIGHT - 1, GRID_ROWS - 2)

  // 绘制外边框
  const topRow = anchorRow
  const botRow = maxRow
  const leftCol = anchorCol
  const rightCol = Math.min(anchorCol + MENU_BOX_WIDTH - 1, cols - 1)

  // 顶边框
  grid.setChar(topRow, leftCol, '┌', borderStyle)
  grid.setChar(topRow, rightCol, '┐', borderStyle)
  for (let c = leftCol + 1; c < rightCol; c++) {
    grid.setChar(topRow, c, '─', borderStyle)
  }

  // 底边框
  if (botRow > topRow) {
    grid.setChar(botRow, leftCol, '└', borderStyle)
    grid.setChar(botRow, rightCol, '┘', borderStyle)
    for (let c = leftCol + 1; c < rightCol; c++) {
      grid.setChar(botRow, c, '─', borderStyle)
    }
  }

  // 侧边框 + 内部菜单项
  const visibleItems = Math.min(menu.items.length, botRow - topRow - 1)
  for (let i = 0; i < visibleItems; i++) {
    const row = topRow + 1 + i
    grid.setChar(row, leftCol, '│', borderStyle)
    grid.setChar(row, rightCol, '│', borderStyle)

    // 渲染菜单项
    const item = menu.items[i]!
    const isSelected = i === menu.selectedIndex
    const style = isSelected ? menuHighlight : menuNormal
    const chars = [...item]

    // 填充内部区域
    for (let c = leftCol + 1; c < rightCol; c++) {
      const idx = c - leftCol - 1
      if (idx < chars.length) {
        const ch = chars[idx]!
        const w = charWidth(ch)
        if (w === 2 && c + 1 < rightCol) {
          grid.setWideChar(row, c, ch, style)
          c++ // skip continuation
        } else if (w === 2) {
          grid.setChar(row, c, ' ', style) // 放不下
        } else {
          grid.setChar(row, c, ch, style)
        }
      } else {
        grid.setChar(row, c, ' ', style)
      }
    }
  }
}

// --- Render ---

function render() {
  setupLayout()
  ti.ensureCursorVisible(grid, 'input')
  ti.paint(grid, 'input')

  // 菜单 ownership 和绘制
  if (menuOpen) {
    setupMenuOwnership()
    ti.paint(grid, 'input') // repaint with reduced area
    paintMenuWithBorder()
  }

  paintIndicators()
  paintStatusBar()

  vp.render({ row: ti.cursorRow, col: ti.cursorCol })
}

// --- Submit ---

function submit() {
  if (ti.text.trim().length === 0) return

  const prompt = `[${promptCounter}]> `
  let output = sgrFromEncoded(promptStyle) + prompt + '\x1b[0m'

  const lines = ti.text.split('\n')
  output += lines[0]!
  for (let i = 1; i < lines.length; i++) {
    output += '\n' + ' '.repeat(prompt.length) + lines[i]
  }
  output += '\n'
  output += sgrFromEncoded(dimStyle) + '─'.repeat(Math.min(50, cols)) + '\x1b[0m\n'

  promptCounter++
  ti.text = ''
  ti.cursorOffset = 0
  ti.scrollOffset = 0
  menuOpen = false

  grid.resize(cols, GRID_ROWS)
  vp.commit(output)
  render()
}

// --- Init ---

stream.write('\x1b[?25l')

// 欢迎信息
stream.write(sgrFromEncoded(dimStyle) + '── enhanced input demo ──\x1b[0m\n')
stream.write(sgrFromEncoded(dimStyle) + '输入文本 | @ 触发菜单 | Ctrl+D 提交 | Ctrl+C 退出\x1b[0m\n')
stream.write(sgrFromEncoded(dimStyle) + '─'.repeat(Math.min(50, cols)) + '\x1b[0m\n')

vp.mount()
render()
stream.write('\x1b[?25h')

// --- 定时刷新状态栏 ---

const statusTimer = setInterval(() => {
  paintStatusBar()
  // 只刷新状态栏需要重新 render 整个 viewport
  vp.render({ row: ti.cursorRow, col: ti.cursorCol })
}, 1000)

// --- Input ---

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
}
process.stdin.resume()

process.stdin.on('data', (buf: Buffer) => {
  const key = parseKey(buf)

  if (menuOpen) {
    switch (key.type) {
      case 'up':
        menu.selectPrev()
        break
      case 'down':
        menu.selectNext()
        break
      case 'enter': {
        const selected = menu.items[menu.selectedIndex]!
        ti.insertChar(selected)
        menuOpen = false
        menu.selectedIndex = 0
        break
      }
      case 'escape':
        menuOpen = false
        menu.selectedIndex = 0
        break
      case 'ctrl':
        if (key.key === 'c') {
          clearInterval(statusTimer)
          vp.render({ row: GRID_ROWS - 1, col: 0 })
          stream.write('\n\x1b[?25h\x1b[0m')
          process.exit(0)
        }
        if (key.key === 'd') { submit(); return }
        break
      case 'backspace':
        ti.deleteBeforeCursor()
        menuOpen = false
        menu.selectedIndex = 0
        break
      default:
        break
    }
  } else {
    switch (key.type) {
      case 'ctrl':
        if (key.key === 'c') {
          clearInterval(statusTimer)
          vp.render({ row: GRID_ROWS - 1, col: 0 })
          stream.write('\n\x1b[?25h\x1b[0m')
          process.exit(0)
        }
        if (key.key === 'd') { submit(); return }
        break
      case 'char':
        ti.insertChar(key.char)
        if (key.char === '@') {
          menuOpen = true
          menu.selectedIndex = 0
        }
        break
      case 'backspace':
        ti.deleteBeforeCursor()
        break
      case 'enter':
        ti.insertChar('\n')
        break
      case 'left':
        ti.moveLeft()
        break
      case 'right':
        ti.moveRight()
        break
      case 'up':
        ti.paint(grid, 'input')
        ti.moveUp(grid, 'input')
        break
      case 'down':
        ti.paint(grid, 'input')
        ti.moveDown(grid, 'input')
        break
      default:
        break
    }
  }

  render()
})
