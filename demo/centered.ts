/**
 * Demo: Max-width 居中输入框
 *
 * 输入框有最大宽度限制。当终端宽于 max-width 时，输入框居中显示，
 * 左右两侧用制表符花纹填充。终端窄于 max-width 时输入框占满全宽。
 *
 * 运行: bun demo/centered.ts
 * 退出: Ctrl+C | 提交: Ctrl+D
 */

import { Grid, encodeStyle, sgrFromEncoded, BOLD, DIM } from '../src/grid.ts'
import { TextInput } from '../src/text-input.ts'
import { Viewport, debounce } from '../src/viewport.ts'
import { parseKey } from '../src/keys.ts'
import { charWidth } from '../src/width.ts'

const stream = process.stderr
let cols = stream.columns || 80

const MAX_WIDTH = 60
const GRID_ROWS = 14

// Layout rows
const HEADER_ROW = 0
const INPUT_START = 1
const INPUT_END = GRID_ROWS - 3
const BORDER_BOT_ROW = GRID_ROWS - 2
const STATUS_ROW = GRID_ROWS - 1

let grid = Grid.create(cols, GRID_ROWS)
let vp = new Viewport(grid, stream)
const ti = new TextInput()

let promptCounter = 1

// --- Styles ---
const patternStyle = encodeStyle(6, 0, DIM)   // magenta dim
const borderStyle = encodeStyle(4, 0, DIM)     // yellow dim
const headerStyle = encodeStyle(5, 0, BOLD)    // blue bold
const statusStyle = encodeStyle(7, 5)          // cyan on blue
const promptStyle = encodeStyle(3, 0, BOLD)    // green bold
const dimStyle = encodeStyle(0, 0, DIM)

// --- 花纹字符 ---
const PATTERNS = ['░', '▒', '░', '▒']

function getPattern(row: number, col: number): string {
  return PATTERNS[(row + col) % PATTERNS.length]!
}

// --- Layout ---

function getMargin(): number {
  const effectiveWidth = Math.min(cols, MAX_WIDTH)
  return Math.floor((cols - effectiveWidth) / 2)
}

function getInputWidth(): number {
  return Math.min(cols, MAX_WIDTH)
}

function setupLayout() {
  const margin = getMargin()
  const inputWidth = getInputWidth()

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      grid.setOwner(r, c, '')
    }
  }

  // 输入区域：居中的 inputWidth 列
  for (let r = INPUT_START; r <= INPUT_END; r++) {
    for (let c = margin; c < margin + inputWidth && c < cols; c++) {
      grid.setOwner(r, c, 'input')
    }
  }
}

// --- Paint ---

function paintPattern() {
  const margin = getMargin()
  const inputWidth = getInputWidth()
  const rightStart = margin + inputWidth

  for (let r = 0; r < GRID_ROWS; r++) {
    // 左侧花纹
    for (let c = 0; c < margin; c++) {
      grid.setChar(r, c, getPattern(r, c), patternStyle)
    }
    // 右侧花纹
    for (let c = rightStart; c < cols; c++) {
      grid.setChar(r, c, getPattern(r, c), patternStyle)
    }
  }
}

function paintHeader() {
  const margin = getMargin()
  const inputWidth = getInputWidth()

  // 顶部边框
  for (let c = margin; c < margin + inputWidth && c < cols; c++) {
    if (c === margin) grid.setChar(HEADER_ROW, c, '┌', borderStyle)
    else if (c === margin + inputWidth - 1) grid.setChar(HEADER_ROW, c, '┐', borderStyle)
    else grid.setChar(HEADER_ROW, c, '─', borderStyle)
  }

  // 标题覆盖在边框上
  const title = ` [${promptCounter}] `
  const titleStart = margin + 2
  for (let i = 0; i < title.length && titleStart + i < margin + inputWidth - 1; i++) {
    grid.setChar(HEADER_ROW, titleStart + i, title[i]!, headerStyle)
  }

  // 宽度信息
  const info = ` ${inputWidth}cols `
  const infoStart = margin + inputWidth - info.length - 1
  if (infoStart > titleStart + title.length) {
    for (let i = 0; i < info.length; i++) {
      grid.setChar(HEADER_ROW, infoStart + i, info[i]!, dimStyle)
    }
  }
}

function paintBorderBottom() {
  const margin = getMargin()
  const inputWidth = getInputWidth()

  for (let c = margin; c < margin + inputWidth && c < cols; c++) {
    if (c === margin) grid.setChar(BORDER_BOT_ROW, c, '└', borderStyle)
    else if (c === margin + inputWidth - 1) grid.setChar(BORDER_BOT_ROW, c, '┘', borderStyle)
    else grid.setChar(BORDER_BOT_ROW, c, '─', borderStyle)
  }
}

function paintStatus() {
  const margin = getMargin()
  const inputWidth = getInputWidth()

  // 状态栏在输入框宽度内居中
  const info = ` Chars:${ti.text.length} | Max:${MAX_WIDTH} | Term:${cols} | Ctrl+D submit `
  const truncated = info.slice(0, inputWidth)

  for (let c = margin; c < margin + inputWidth && c < cols; c++) {
    const idx = c - margin
    const ch = idx < truncated.length ? truncated[idx]! : ' '
    grid.setChar(STATUS_ROW, c, ch, statusStyle)
  }
}

// --- 侧边框 ---

function paintSideBorders() {
  const margin = getMargin()
  const inputWidth = getInputWidth()

  for (let r = INPUT_START; r <= INPUT_END; r++) {
    if (margin > 0) {
      grid.setChar(r, margin - 1, '│', borderStyle)
    }
    if (margin + inputWidth < cols) {
      grid.setChar(r, margin + inputWidth, '│', borderStyle)
    }
  }
}

// --- Render ---

function render() {
  setupLayout()
  ti.ensureCursorVisible(grid, 'input')
  ti.paint(grid, 'input')
  paintPattern()
  paintHeader()
  paintBorderBottom()
  paintSideBorders()
  paintStatus()
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
  output += sgrFromEncoded(dimStyle) + '─'.repeat(Math.min(40, cols)) + '\x1b[0m\n'

  promptCounter++
  ti.text = ''
  ti.cursorOffset = 0
  ti.scrollOffset = 0

  grid.resize(cols, GRID_ROWS)
  vp.commit(output)
  render()
}

// --- Init ---

stream.write('\x1b[?25l')
stream.write(sgrFromEncoded(dimStyle) + '── centered input demo (max-width: ' + MAX_WIDTH + ') ──\x1b[0m\n')
stream.write(sgrFromEncoded(dimStyle) + 'Ctrl+D 提交 | Ctrl+C 退出 | 试试调整终端宽度\x1b[0m\n')
stream.write(sgrFromEncoded(dimStyle) + '─'.repeat(Math.min(50, cols)) + '\x1b[0m\n')

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
      if (key.key === 'd') { submit(); return }
      break
    case 'char':
      ti.insertChar(key.char)
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

  render()
})

// --- Resize ---

process.stderr.on('resize', debounce(() => {
  cols = process.stderr.columns || 80
  vp.remount(cols, GRID_ROWS)
  render()
}, 16))
