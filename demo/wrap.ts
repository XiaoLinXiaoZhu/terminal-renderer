/**
 * Demo: 文本环绕 + resize (Step 4.3)
 *
 * 展示文本在非连续 ownership 区域中环绕块流动，以及 resize 后正确重排。
 * 运行: bun demo/wrap.ts
 * 退出: Ctrl+C
 */

import { Grid, encodeStyle, BOLD, DIM } from '../src/grid.ts'
import { TextInput } from '../src/text-input.ts'
import { parseKey } from '../src/keys.ts'
import { charWidth } from '../src/width.ts'

const stream = process.stderr
let cols = stream.columns || 80
let rows = stream.rows || 24

let grid = Grid.create(cols, rows)
const ti = new TextInput()
ti.text = '这是一段环绕演示文本。文字会在中心块的两侧自然流动，就像报纸排版一样。试试输入更多文字，或者调整终端窗口大小观察重排效果。\n\nThe quick brown fox jumps over the lazy dog. This text wraps around the panel in the middle of the screen.'

// Panel 参数
const PANEL_WIDTH = 16
const PANEL_HEIGHT = 5
const PANEL_STYLE = encodeStyle(7, 5, BOLD) // cyan on blue
const BORDER_STYLE = encodeStyle(4, 0, DIM) // yellow dim

function updateOwnership() {
  grid.setOwnerAll('input')

  // 放置中心 panel
  const panelStartRow = 2
  const panelStartCol = Math.floor((cols - PANEL_WIDTH) / 2)

  for (let r = panelStartRow; r < panelStartRow + PANEL_HEIGHT && r < rows; r++) {
    for (let c = panelStartCol; c < panelStartCol + PANEL_WIDTH && c < cols; c++) {
      grid.setOwner(r, c, 'panel')
    }
  }
}

function paintPanel() {
  const panelStartRow = 2
  const panelStartCol = Math.floor((cols - PANEL_WIDTH) / 2)
  const title = ' INFO PANEL '

  for (let r = panelStartRow; r < panelStartRow + PANEL_HEIGHT && r < rows; r++) {
    for (let c = panelStartCol; c < panelStartCol + PANEL_WIDTH && c < cols; c++) {
      if (grid.ownerAt(r, c) !== 'panel') continue
      const isTop = r === panelStartRow
      const isBottom = r === panelStartRow + PANEL_HEIGHT - 1
      const isLeft = c === panelStartCol
      const isRight = c === panelStartCol + PANEL_WIDTH - 1

      if (isTop && isLeft) grid.setChar(r, c, '┌', BORDER_STYLE)
      else if (isTop && isRight) grid.setChar(r, c, '┐', BORDER_STYLE)
      else if (isBottom && isLeft) grid.setChar(r, c, '└', BORDER_STYLE)
      else if (isBottom && isRight) grid.setChar(r, c, '┘', BORDER_STYLE)
      else if (isTop || isBottom) grid.setChar(r, c, '─', BORDER_STYLE)
      else if (isLeft || isRight) grid.setChar(r, c, '│', BORDER_STYLE)
      else grid.setChar(r, c, ' ', PANEL_STYLE)
    }
  }

  // Title
  const titleRow = panelStartRow
  const titleStart = panelStartCol + Math.floor((PANEL_WIDTH - title.length) / 2)
  for (let i = 0; i < title.length; i++) {
    if (titleStart + i < cols) {
      grid.setChar(titleRow, titleStart + i, title[i]!, PANEL_STYLE)
    }
  }

  // Panel content
  const lines = ['Size: ' + cols + '×' + rows, 'Ctrl+C quit']
  for (let i = 0; i < lines.length; i++) {
    const lineRow = panelStartRow + 2 + i
    if (lineRow >= rows) break
    let col = panelStartCol + 2
    for (const ch of lines[i]!) {
      if (col >= panelStartCol + PANEL_WIDTH - 1) break
      grid.setChar(lineRow, col, ch, PANEL_STYLE)
      col++
    }
  }
}

function render() {
  updateOwnership()
  ti.ensureCursorVisible(grid, 'input')
  ti.paint(grid, 'input')
  paintPanel()
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
  stream.write('\x1b[2J\x1b[H')
  render()
})
