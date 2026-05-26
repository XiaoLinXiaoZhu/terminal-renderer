/**
 * Demo: 历史保留测试
 *
 * Grid 只管理底部的小输入区域（10 行）。历史通过终端自身的 scrollback 积累。
 * 提交时将内容作为普通终端输出"固化"，然后在新位置重建 Grid。
 *
 * 运行: bun demo/history.ts
 * 退出: Ctrl+C
 */

import { Grid, encodeStyle, sgrFromEncoded, BOLD, DIM } from '../src/grid.ts'
import { TextInput } from '../src/text-input.ts'
import { parseKey } from '../src/keys.ts'

const stream = process.stderr
const cols = stream.columns || 80

// Grid 只占底部固定行数
const GRID_ROWS = 10

const grid = Grid.create(cols, GRID_ROWS)
const ti = new TextInput()
let promptCounter = 1

// 终端光标当前在 grid 内的行位置（相对于 grid home）
let cursorAtRow = 0

// --- Styles ---
const promptStyle = encodeStyle(3, 0, BOLD) // green bold
const dimStyle = encodeStyle(0, 0, DIM)
const inputPromptStyle = encodeStyle(5, 0, BOLD) // blue bold

// --- Grid Layout ---

function setupGrid() {
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      grid.setOwner(r, c, '')
      grid.setChar(r, c, ' ', 0)
    }
  }

  // Prompt 标签
  const prompt = `[${promptCounter}]> `
  let col = 0
  for (const ch of prompt) {
    if (col >= cols) break
    grid.setChar(0, col, ch, inputPromptStyle)
    col++
  }

  // Prompt 行剩余 + 下方行全部归 input
  for (let c = col; c < cols; c++) grid.setOwner(0, c, 'input')
  for (let r = 1; r < GRID_ROWS; r++) {
    for (let c = 0; c < cols; c++) grid.setOwner(r, c, 'input')
  }
}



// render 使用 save/restore
function render() {
  setupGrid()
  ti.ensureCursorVisible(grid, 'input')
  ti.paint(grid, 'input')

  // 从当前 cursor 位置移到 grid home
  if (cursorAtRow > 0) stream.write(`\x1b[${cursorAtRow}A`)
  stream.write('\r')
  // 现在在 grid home

  // Save position (at grid home), flush, restore to grid home
  stream.write('\x1b7') // save
  grid.flush(stream)
  stream.write('\x1b8') // restore to grid home

  // 从 grid home 定位到 TextInput cursor
  if (ti.cursorRow > 0) stream.write(`\x1b[${ti.cursorRow}B`)
  stream.write('\r')
  if (ti.cursorCol > 0) stream.write(`\x1b[${ti.cursorCol}C`)
  cursorAtRow = ti.cursorRow
}

// --- Submit ---

function submit() {
  if (ti.text.trim().length === 0) return

  // 从当前位置移到 grid home
  if (cursorAtRow > 0) stream.write(`\x1b[${cursorAtRow}A`)
  stream.write('\r')

  // 清除 grid 区域
  stream.write('\x1b[J')

  // 输出固化内容（带样式）
  const prompt = `[${promptCounter}]> `
  stream.write(sgrFromEncoded(promptStyle) + prompt + '\x1b[0m')

  const lines = ti.text.split('\n')
  stream.write(lines[0]!)
  for (let i = 1; i < lines.length; i++) {
    stream.write('\n' + ' '.repeat(prompt.length) + lines[i])
  }
  stream.write('\n')

  // 分隔线
  stream.write(sgrFromEncoded(dimStyle) + '─'.repeat(Math.min(40, cols)) + '\x1b[0m\n')

  // 重置输入状态
  promptCounter++
  ti.text = ''
  ti.cursorOffset = 0
  ti.scrollOffset = 0

  // 为新 Grid 腾出空间（GRID_ROWS 个换行确保空间）
  for (let i = 0; i < GRID_ROWS; i++) stream.write('\n')
  stream.write(`\x1b[${GRID_ROWS}A`)

  // 现在 cursor 在新 grid 的 home 位置
  cursorAtRow = 0
  grid.resize(cols, GRID_ROWS)
  render()
}

// --- Init ---

stream.write('\x1b[?25l')

// 欢迎信息
stream.write(sgrFromEncoded(dimStyle) + '── history demo ──\x1b[0m\n')
stream.write(sgrFromEncoded(dimStyle) + '输入文本后按 Ctrl+D 提交 | Ctrl+C 退出\x1b[0m\n')
stream.write(sgrFromEncoded(dimStyle) + '─'.repeat(Math.min(40, cols)) + '\x1b[0m\n')

// 为 Grid 预留空间
for (let i = 0; i < GRID_ROWS; i++) stream.write('\n')
stream.write(`\x1b[${GRID_ROWS}A`)

// 现在 cursor 在 grid home
cursorAtRow = 0
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
        // 移到 grid 底部下方退出
        const downNeeded = GRID_ROWS - 1 - cursorAtRow
        if (downNeeded > 0) stream.write(`\x1b[${downNeeded}B`)
        stream.write('\n\x1b[?25h\x1b[0m')
        process.exit(0)
      }
      if (key.key === 'd') {
        submit()
        return
      }
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
