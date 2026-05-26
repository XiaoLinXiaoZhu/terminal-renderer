/**
 * Demo: 带样式的输入 (Step 5.3)
 *
 * 输入文本时自动高亮部分区域（模拟语法高亮）。
 * 运行: bun demo/styled.ts
 * 退出: Ctrl+C
 */

import { Grid, encodeStyle, BOLD, DIM, ITALIC, UNDERLINE } from '../src/grid.ts'
import { TextInput } from '../src/text-input.ts'
import { parseKey } from '../src/keys.ts'

const stream = process.stderr
let cols = stream.columns || 80
let rows = stream.rows || 24

let grid = Grid.create(cols, rows)
grid.setOwnerAll('input')

const ti = new TextInput()
ti.text = 'Hello @World! This is a #demo of styled text input.\nType @mentions and #hashtags to see colors.'
ti.cursorOffset = ti.text.length

/** 简单的样式规则：@word 高亮蓝色，#word 高亮绿色 */
function updateDecorations() {
  const decorations: { start: number; end: number; style: number }[] = []
  const mentionRegex = /@\w+/g
  const hashRegex = /#\w+/g

  let match: RegExpExecArray | null
  while ((match = mentionRegex.exec(ti.text)) !== null) {
    decorations.push({
      start: match.index,
      end: match.index + match[0].length,
      style: encodeStyle(5, 0, BOLD), // blue bold
    })
  }
  while ((match = hashRegex.exec(ti.text)) !== null) {
    decorations.push({
      start: match.index,
      end: match.index + match[0].length,
      style: encodeStyle(3, 0, ITALIC), // green italic
    })
  }

  ti.decorations = decorations
}

function render() {
  updateDecorations()
  ti.ensureCursorVisible(grid, 'input')
  ti.paint(grid, 'input')
  grid.flush(stream)
  stream.write(`\x1b[${ti.cursorRow + 1};${ti.cursorCol + 1}H`)
}

// 初始化
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

// Resize
process.stderr.on('resize', () => {
  cols = process.stderr.columns || 80
  rows = process.stderr.rows || 24
  grid.resize(cols, rows)
  grid.setOwnerAll('input')
  stream.write('\x1b[2J\x1b[H')
  render()
})
