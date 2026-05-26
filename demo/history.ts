/**
 * Demo: 历史保留测试
 *
 * Grid 只管理底部的小输入区域（10 行）。历史通过终端自身的 scrollback 积累。
 * 提交时将内容作为普通终端输出"固化"，然后在新位置重建 Grid。
 *
 * 关键技术点：Grid.flush 的 rowOffset 参数，使 Grid 能在非 row-0 的终端位置渲染。
 *
 * 运行: bun demo/history.ts
 * 退出: Ctrl+C
 */

import { Grid, encodeStyle, sgrFromEncoded, BOLD, DIM } from '../src/grid.ts'
import { TextInput } from '../src/text-input.ts'
import { parseKey } from '../src/keys.ts'

const stream = process.stderr
const cols = stream.columns || 80
const termRows = stream.rows || 24

// Grid 只占底部固定行数
const GRID_ROWS = 10

const grid = Grid.create(cols, GRID_ROWS)
const ti = new TextInput()
let promptCounter = 1

// Grid 在终端中的起始行（0-based terminal row）
// 用 DSR (Device Status Report) 太复杂，这里通过跟踪输出行数来计算
let gridTermRow = 0 // 会在 init 时设置

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

function render() {
  setupGrid()
  ti.ensureCursorVisible(grid, 'input')
  ti.paint(grid, 'input')
  grid.flush(stream, gridTermRow)
  // 移动终端光标到 TextInput 光标位置
  stream.write(`\x1b[${ti.cursorRow + 1 + gridTermRow};${ti.cursorCol + 1}H`)
}

// --- Submit ---

function submit() {
  if (ti.text.trim().length === 0) return

  // 1. 移动到 Grid 起始位置并清除 Grid 区域
  stream.write(`\x1b[${gridTermRow + 1};1H`) // 移到 grid 起始行
  stream.write('\x1b[J') // 清除到屏幕底部

  // 2. 输出固化内容（带样式）
  const prompt = `[${promptCounter}]> `
  stream.write(sgrFromEncoded(promptStyle) + prompt + '\x1b[0m')

  // 输出文本内容（处理换行：每行带缩进）
  const lines = ti.text.split('\n')
  stream.write(lines[0]!)
  for (let i = 1; i < lines.length; i++) {
    stream.write('\n' + ' '.repeat(prompt.length) + lines[i])
  }
  stream.write('\n')

  // 3. 分隔线
  stream.write(sgrFromEncoded(dimStyle) + '─'.repeat(Math.min(40, cols)) + '\x1b[0m\n')

  // 4. 计算输出占了多少行
  let outputLines = 1 // prompt + first line
  for (let i = 1; i < lines.length; i++) outputLines++
  outputLines++ // separator

  // 5. 重置输入状态
  promptCounter++
  ti.text = ''
  ti.cursorOffset = 0
  ti.scrollOffset = 0

  // 6. 为新 Grid 腾出空间
  //    当前光标在固化输出之后。如果距离终端底部不够 GRID_ROWS 行，需要滚动。
  //    策略：输出 GRID_ROWS 个换行来确保空间，然后回退
  for (let i = 0; i < GRID_ROWS; i++) stream.write('\n')
  stream.write(`\x1b[${GRID_ROWS}A`)

  // 7. 新的 Grid 起始位置 = 终端行数 - GRID_ROWS（滚动后固定在底部）
  //    由于我们刚输出了 GRID_ROWS 个换行并回退，当前位置就是新 grid 顶部
  //    使用 CSI 6n 太复杂，简化：假设当前位置是 termRows - GRID_ROWS
  gridTermRow = termRows - GRID_ROWS

  // 8. 重建并渲染
  grid.resize(cols, GRID_ROWS)
  render()
}

// --- Init ---

// 隐藏光标，滚动到底部确保有空间
stream.write('\x1b[?25l')

// 输出欢迎信息
stream.write(sgrFromEncoded(dimStyle) + '── history demo ──\x1b[0m\n')
stream.write(sgrFromEncoded(dimStyle) + '输入文本后按 Ctrl+D 提交 | Ctrl+C 退出\x1b[0m\n')
stream.write(sgrFromEncoded(dimStyle) + '─'.repeat(Math.min(40, cols)) + '\x1b[0m\n')

// 为 Grid 预留空间
for (let i = 0; i < GRID_ROWS; i++) stream.write('\n')
stream.write(`\x1b[${GRID_ROWS}A`)

// Grid 起始于终端底部
gridTermRow = termRows - GRID_ROWS

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
        stream.write(`\x1b[${gridTermRow + GRID_ROWS + 1};1H`)
        stream.write('\x1b[?25h\x1b[0m\n')
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
