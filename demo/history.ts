/**
 * Demo: 历史保留测试
 *
 * 输入内容后按 Ctrl+D 提交为历史。历史变为静态区域（不可编辑），
 * 新的输入区域出现在底部。模拟终端 REPL 行为。
 * 运行: bun demo/history.ts
 * 退出: Ctrl+C
 */

import { Grid, encodeStyle, BOLD, DIM } from '../src/grid.ts'
import { TextInput } from '../src/text-input.ts'
import { parseKey } from '../src/keys.ts'
import { charWidth } from '../src/width.ts'

const stream = process.stderr
const cols = stream.columns || 80
const rows = stream.rows || 24

const grid = Grid.create(cols, rows)

// --- State ---

interface HistoryEntry {
  prompt: string
  text: string
}

const history: HistoryEntry[] = []
const ti = new TextInput()
let promptCounter = 1

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

// --- Layout ---

const promptStyle = encodeStyle(3, 0, BOLD) // green bold
const historyStyle = encodeStyle(0, 0, DIM)
const separatorStyle = encodeStyle(0, 0, DIM)
const inputLabelStyle = encodeStyle(5, 0, BOLD) // blue bold

function layout() {
  // 计算历史占多少行
  let historyRows = 0
  for (const entry of history) {
    // prompt 行
    historyRows++
    // 内容行（简化：按 cols 折行）
    const lines = entry.text.split('\n')
    for (const line of lines) {
      let visualWidth = 0
      for (const ch of line) visualWidth += charWidth(ch)
      historyRows += Math.max(1, Math.ceil(visualWidth / cols))
    }
    // 分隔
    historyRows++
  }

  // 限制历史不超过 rows-4（保留空间给输入区域）
  const maxHistoryRows = rows - 4
  const inputStartRow = Math.min(historyRows, maxHistoryRows)

  // 清理 grid
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      grid.setChar(r, c, ' ', 0)
      grid.setOwner(r, c, '')
    }
  }

  // 绘制历史（静态，不设置 owner = 'input'）
  let row = 0
  const startEntry = getStartEntry(maxHistoryRows)
  for (let i = startEntry; i < history.length && row < inputStartRow; i++) {
    const entry = history[i]!
    // Prompt
    writeStr(row, 0, `[${entry.prompt}]`, promptStyle)
    writeStr(row, entry.prompt.length + 2, ' ↵', separatorStyle)
    row++

    // Content
    const lines = entry.text.split('\n')
    for (const line of lines) {
      if (row >= inputStartRow) break
      writeStr(row, 2, line, historyStyle)
      row++
    }

    // Separator
    if (row < inputStartRow) {
      writeStr(row, 0, '─'.repeat(Math.min(cols, 40)), separatorStyle)
      row++
    }
  }

  // 输入区域标签
  const labelRow = Math.min(row, rows - 3)
  const prompt = `[${promptCounter}]>`
  writeStr(labelRow, 0, prompt, inputLabelStyle)

  // 设置输入区域 ownership
  const inputStart = labelRow + 1
  for (let r = inputStart; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      grid.setOwner(r, c, 'input')
    }
  }
}

function getStartEntry(maxRows: number): number {
  // 从后往前计算能显示多少历史
  let totalRows = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i]!
    let entryRows = 2 // prompt + separator
    const lines = entry.text.split('\n')
    for (const line of lines) {
      let visualWidth = 0
      for (const ch of line) visualWidth += charWidth(ch)
      entryRows += Math.max(1, Math.ceil(visualWidth / cols))
    }
    if (totalRows + entryRows > maxRows) return i + 1
    totalRows += entryRows
  }
  return 0
}

function render() {
  layout()
  ti.ensureCursorVisible(grid, 'input')
  ti.paint(grid, 'input')
  grid.flush(stream)
  stream.write(`\x1b[${ti.cursorRow + 1};${ti.cursorCol + 1}H`)
}

// --- Init ---

stream.write('\x1b[?25l\x1b[2J\x1b[H')
render()
stream.write('\x1b[?25h')

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
}
process.stdin.resume()

process.stdin.on('data', (buf: Buffer) => {
  const key = parseKey(buf)

  switch (key.type) {
    case 'ctrl':
      if (key.key === 'c') {
        stream.write('\x1b[?25h\x1b[0m')
        stream.write(`\x1b[${rows};1H\n`)
        process.exit(0)
      }
      if (key.key === 'd') {
        // Submit current text as history
        if (ti.text.trim().length > 0) {
          history.push({ prompt: String(promptCounter), text: ti.text })
          promptCounter++
          ti.text = ''
          ti.cursorOffset = 0
          ti.scrollOffset = 0
        }
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
