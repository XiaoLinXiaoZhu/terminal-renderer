/**
 * Demo: 历史保留测试
 *
 * Grid 只管理底部的小输入区域（10 行）。提交后内容作为普通终端输出
 * "固化"到 scrollback 中，Grid 清空重新开始。
 * 运行: bun demo/history.ts
 * 退出: Ctrl+C
 */

import { Grid, encodeStyle, BOLD, DIM } from '../src/grid.ts'
import { TextInput } from '../src/text-input.ts'
import { parseKey } from '../src/keys.ts'
import { charWidth } from '../src/width.ts'

const stream = process.stderr
const cols = stream.columns || 80

// Grid 只占底部 10 行
const GRID_ROWS = 10

const grid = Grid.create(cols, GRID_ROWS)
const ti = new TextInput()
let promptCounter = 1

// --- Styles ---

const promptStyle = encodeStyle(3, 0, BOLD) // green bold
const dimStyle = encodeStyle(0, 0, DIM)
const inputPromptStyle = encodeStyle(5, 0, BOLD) // blue bold

// --- Layout ---

function setupGrid() {
  // 第 0 行：prompt 标签（不属于 input，静态绘制）
  // 第 1-9 行：输入区域
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      grid.setOwner(r, c, '')
      grid.setChar(r, c, ' ', 0)
    }
  }

  // 绘制 prompt
  const prompt = `[${promptCounter}]> `
  let col = 0
  for (const ch of prompt) {
    if (col >= cols) break
    grid.setChar(0, col, ch, inputPromptStyle)
    col++
  }

  // prompt 行的剩余部分也归 input（允许在 prompt 同行输入）
  for (let c = col; c < cols; c++) {
    grid.setOwner(0, c, 'input')
  }
  // 剩余行全部归 input
  for (let r = 1; r < GRID_ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      grid.setOwner(r, c, 'input')
    }
  }
}

function render() {
  setupGrid()
  ti.ensureCursorVisible(grid, 'input')
  ti.paint(grid, 'input')
  grid.flush(stream)
  stream.write(`\x1b[${ti.cursorRow + 1};${ti.cursorCol + 1}H`)
}

/**
 * 提交当前输入：将内容"固化"为终端输出，然后清空 Grid 重新开始。
 */
function submit() {
  if (ti.text.trim().length === 0) return

  // 1. 先清除当前 Grid 在终端上的显示（回到 Grid 起始位置）
  stream.write(`\x1b[${GRID_ROWS}A`) // 上移到 Grid 顶部
  stream.write('\x1b[J') // 清除从光标到屏幕底部

  // 2. 输出固化内容（带样式）
  const prompt = `[${promptCounter}]> `
  stream.write(sgrString(promptStyle) + prompt + '\x1b[0m')
  stream.write(ti.text)
  stream.write('\n')

  // 3. 分隔线
  stream.write(sgrString(dimStyle) + '─'.repeat(Math.min(40, cols)) + '\x1b[0m\n')

  // 4. 重置状态
  promptCounter++
  ti.text = ''
  ti.cursorOffset = 0
  ti.scrollOffset = 0

  // 5. 为新 Grid 留出空间（输出空行占位）
  for (let i = 0; i < GRID_ROWS; i++) {
    stream.write('\n')
  }
  // 回到 Grid 起始位置
  stream.write(`\x1b[${GRID_ROWS}A`)

  // 6. 重建 Grid 并渲染
  grid.resize(cols, GRID_ROWS)
  render()
}

/** 从 encoded style 生成 SGR 字符串 */
function sgrString(style: number): string {
  if (style === 0) return '\x1b[0m'
  const fg = style & 0xF
  const bg = (style >> 4) & 0xF
  const flags = style & 0xF00
  const parts: number[] = [0]
  if (fg) {
    const fgCodes: Record<number, number> = { 1:30,2:31,3:32,4:33,5:34,6:35,7:36,8:37 }
    parts.push(fgCodes[fg] ?? 39)
  }
  if (bg) {
    const bgCodes: Record<number, number> = { 1:40,2:41,3:42,4:43,5:44,6:45,7:46,8:47 }
    parts.push(bgCodes[bg] ?? 49)
  }
  if (flags & 0x100) parts.push(1)
  if (flags & 0x200) parts.push(2)
  if (flags & 0x400) parts.push(3)
  if (flags & 0x800) parts.push(4)
  return `\x1b[${parts.join(';')}m`
}

// --- Init ---

// 留出 Grid 空间
stream.write('\x1b[?25l')
for (let i = 0; i < GRID_ROWS; i++) stream.write('\n')
stream.write(`\x1b[${GRID_ROWS}A`)
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
        // 退出：移到 Grid 底部下方
        stream.write(`\x1b[${GRID_ROWS};1H`)
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
