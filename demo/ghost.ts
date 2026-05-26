/**
 * Demo: Ghost Text 自动补全
 *
 * 在光标位置显示 DIM 样式的建议文本（ghost text）。
 * 按 Tab 接受建议（等价于 insertChar），其他按键清除建议。
 *
 * 实现方式：渲染时临时将 ghost text 拼入显示文本，
 * 用 decoration 标记为 DIM 样式。实际 text 不变。
 *
 * 运行: bun demo/ghost.ts
 * 退出: Ctrl+C
 */

import { Grid, encodeStyle, DIM, BOLD } from '../src/grid.ts'
import { TextInput } from '../src/text-input.ts'
import { Viewport } from '../src/viewport.ts'
import { parseKey } from '../src/keys.ts'

const stream = process.stderr
const cols = stream.columns || 80
const rows = stream.rows || 24

const GRID_ROWS = 12
const INPUT_START_ROW = 1
const INPUT_END_ROW = GRID_ROWS - 2
const STATUS_ROW = GRID_ROWS - 1
const HEADER_ROW = 0

const grid = Grid.create(cols, GRID_ROWS)
const vp = new Viewport(grid, stream)
const ti = new TextInput()

// --- Ghost Text State ---

let ghostText = ''

// 简单的补全词典
const COMPLETIONS = [
  'Hello, World!',
  'Hello, terminal-renderer!',
  'function ',
  'const ',
  'console.log(',
  'import { } from ',
  'export default ',
  'return ',
  'typescript',
  'terminal-renderer',
  '你好世界',
  '你好，欢迎使用终端渲染器！',
]

/** 根据光标前的文本生成 ghost text */
function updateGhostText() {
  // 取光标前最后一个"词"（从最近的空格/换行之后）
  const before = ti.text.slice(0, ti.cursorOffset)
  const lastLineStart = Math.max(before.lastIndexOf('\n') + 1, 0)
  const currentLine = before.slice(lastLineStart)

  if (currentLine.length === 0) {
    ghostText = ''
    return
  }

  // 找到匹配的补全
  for (const completion of COMPLETIONS) {
    if (completion.startsWith(currentLine) && completion.length > currentLine.length) {
      ghostText = completion.slice(currentLine.length)
      return
    }
  }
  ghostText = ''
}

// --- Styles ---

const ghostStyle = encodeStyle(0, 0, DIM)
const headerStyle = encodeStyle(5, 0, BOLD) // blue bold
const statusStyle = encodeStyle(7, 5)       // cyan on blue
const dimStyle = encodeStyle(0, 0, DIM)

// --- Layout ---

function setupLayout() {
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      grid.setOwner(r, c, '')
    }
  }
  for (let r = INPUT_START_ROW; r <= INPUT_END_ROW; r++) {
    for (let c = 0; c < cols; c++) {
      grid.setOwner(r, c, 'input')
    }
  }
}

function paintHeader() {
  const text = ' Ghost Text Demo — 输入触发建议，Tab 接受'
  for (let c = 0; c < cols; c++) {
    const ch = c < text.length ? text[c]! : ' '
    grid.setChar(HEADER_ROW, c, ch, headerStyle)
  }
}

function paintStatus() {
  const ghost = ghostText ? `Ghost: "${ghostText.slice(0, 30)}${ghostText.length > 30 ? '…' : ''}"` : 'Ghost: (none)'
  const info = ` ${ghost} | Chars: ${ti.text.length} | Tab=accept Ctrl+C=quit`
  for (let c = 0; c < cols; c++) {
    const ch = c < info.length ? info[c]! : ' '
    grid.setChar(STATUS_ROW, c, ch, statusStyle)
  }
}

// --- Render ---

function render() {
  setupLayout()

  // 渲染时临时拼入 ghost text
  const realText = ti.text
  const realCursorOffset = ti.cursorOffset
  const realDecorations = ti.decorations

  if (ghostText.length > 0) {
    // 构造显示文本：在光标位置插入 ghost text
    ti.text = realText.slice(0, realCursorOffset) + ghostText + realText.slice(realCursorOffset)
    // 标记 ghost 区间为 DIM
    ti.decorations = [
      ...realDecorations,
      { start: realCursorOffset, end: realCursorOffset + ghostText.length, style: ghostStyle }
    ]
    // 光标位置不变（仍在 ghost text 之前）
  }

  ti.ensureCursorVisible(grid, 'input')
  ti.paint(grid, 'input')

  // 恢复真实状态
  ti.text = realText
  ti.cursorOffset = realCursorOffset
  ti.decorations = realDecorations

  paintHeader()
  paintStatus()

  vp.render({ row: ti.cursorRow, col: ti.cursorCol })
}

// --- Init ---

stream.write('\x1b[?25l')
stream.write(encodeStyle(0, 0, DIM) ? '' : '')

vp.mount()
render()
stream.write('\x1b[?25h')

// --- Input ---

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
}
process.stdin.resume()

process.stdin.on('data', (buf: Buffer) => {
  const key = parseKey(buf)

  switch (key.type) {
    case 'ctrl':
      if (key.key === 'c') {
        vp.render({ row: GRID_ROWS - 1, col: 0 })
        stream.write('\n\x1b[?25h\x1b[0m')
        process.exit(0)
      }
      break
    case 'tab':
      // 接受 ghost text
      if (ghostText.length > 0) {
        ti.insertChar(ghostText)
        ghostText = ''
      }
      break
    case 'char':
      ti.insertChar(key.char)
      updateGhostText()
      break
    case 'backspace':
      ti.deleteBeforeCursor()
      updateGhostText()
      break
    case 'enter':
      ti.insertChar('\n')
      ghostText = ''
      break
    case 'left':
      ti.moveLeft()
      ghostText = ''
      break
    case 'right':
      ti.moveRight()
      ghostText = ''
      break
    case 'up':
      ti.paint(grid, 'input')
      ti.moveUp(grid, 'input')
      ghostText = ''
      break
    case 'down':
      ti.paint(grid, 'input')
      ti.moveDown(grid, 'input')
      ghostText = ''
      break
    case 'escape':
      ghostText = ''
      break
    default:
      break
  }

  render()
})
