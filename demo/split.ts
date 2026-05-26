/**
 * Demo: 左右分屏 Markdown 编辑器/预览
 *
 * 左半屏为原始 Markdown 文本（可编辑），右半屏为渲染后的预览。
 * 支持简单的 Markdown 渲染：# 标题、**粗体**、*斜体*、`代码`。
 * 运行: bun demo/split.ts
 * 退出: Ctrl+C
 */

import { Grid, encodeStyle, BOLD, DIM, ITALIC, UNDERLINE } from '../src/grid.ts'
import { TextInput } from '../src/text-input.ts'
import { parseKey } from '../src/keys.ts'
import { charWidth } from '../src/width.ts'

const stream = process.stderr
const cols = stream.columns || 80
const rows = stream.rows || 24

const grid = Grid.create(cols, rows)
const ti = new TextInput()

ti.text = `# Hello Markdown

This is a **bold** word and *italic* text.

## Features

- Inline \`code\` rendering
- **Bold** and *italic*
- Headers with # prefix

Try editing the left pane!`

ti.cursorOffset = 0

// --- Styles ---

const borderStyle = encodeStyle(0, 0, DIM)
const headerStyle = encodeStyle(4, 0, BOLD) // yellow bold
const boldStyle = encodeStyle(8, 0, BOLD) // white bold
const italicStyle = encodeStyle(7, 0, ITALIC) // cyan italic
const codeStyle = encodeStyle(3, 0) // green
const normalStyle = encodeStyle(0, 0)
const labelStyle = encodeStyle(5, 0, BOLD) // blue bold
const dimStyle = encodeStyle(0, 0, DIM)

// --- Layout ---

const dividerCol = Math.floor(cols / 2)
const leftWidth = dividerCol - 1
const rightWidth = cols - dividerCol - 2

function setupOwnership() {
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 0; c < leftWidth; c++) {
      grid.setOwner(r, c, 'input')
    }
  }
}

// --- Markdown Renderer ---

interface StyledSpan {
  text: string
  style: number
}

function renderMarkdownLine(line: string): StyledSpan[] {
  // Header
  if (line.startsWith('# ')) {
    return [{ text: line.slice(2), style: headerStyle }]
  }
  if (line.startsWith('## ')) {
    return [{ text: line.slice(3), style: headerStyle }]
  }
  if (line.startsWith('### ')) {
    return [{ text: line.slice(4), style: headerStyle }]
  }

  // Inline formatting
  const spans: StyledSpan[] = []
  let i = 0
  let current = ''

  while (i < line.length) {
    // **bold**
    if (line[i] === '*' && line[i + 1] === '*') {
      if (current) { spans.push({ text: current, style: normalStyle }); current = '' }
      const end = line.indexOf('**', i + 2)
      if (end >= 0) {
        spans.push({ text: line.slice(i + 2, end), style: boldStyle })
        i = end + 2
        continue
      }
    }
    // *italic*
    if (line[i] === '*' && line[i + 1] !== '*') {
      if (current) { spans.push({ text: current, style: normalStyle }); current = '' }
      const end = line.indexOf('*', i + 1)
      if (end >= 0) {
        spans.push({ text: line.slice(i + 1, end), style: italicStyle })
        i = end + 1
        continue
      }
    }
    // `code`
    if (line[i] === '`') {
      if (current) { spans.push({ text: current, style: normalStyle }); current = '' }
      const end = line.indexOf('`', i + 1)
      if (end >= 0) {
        spans.push({ text: line.slice(i + 1, end), style: codeStyle })
        i = end + 1
        continue
      }
    }
    current += line[i]
    i++
  }
  if (current) spans.push({ text: current, style: normalStyle })
  return spans
}

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

function paintChrome() {
  // Top bar
  writeStr(0, 0, ' EDIT', labelStyle)
  for (let c = 5; c < dividerCol; c++) grid.setChar(0, c, ' ', encodeStyle(0, 5))
  writeStr(0, dividerCol + 1, ' PREVIEW', labelStyle)
  for (let c = dividerCol + 9; c < cols; c++) grid.setChar(0, c, ' ', encodeStyle(0, 5))

  // Vertical divider
  for (let r = 0; r < rows; r++) {
    grid.setChar(r, dividerCol, '│', borderStyle)
  }

  // Bottom bar
  writeStr(rows - 1, 0, ' Ctrl+C 退出 | 左侧编辑 Markdown，右侧实时预览', dimStyle)
}

function paintPreview() {
  const startCol = dividerCol + 2
  const maxWidth = rightWidth

  // 清除预览区域
  for (let r = 1; r < rows - 1; r++) {
    for (let c = startCol; c < cols; c++) {
      grid.setChar(r, c, ' ', 0)
    }
  }

  // 渲染 Markdown
  const lines = ti.text.split('\n')
  let row = 1
  for (const line of lines) {
    if (row >= rows - 1) break

    if (line.trim() === '') {
      row++
      continue
    }

    // List items
    const isListItem = line.startsWith('- ')
    const displayLine = isListItem ? '• ' + line.slice(2) : line

    const spans = renderMarkdownLine(displayLine)

    let col = startCol
    for (const span of spans) {
      for (const ch of span.text) {
        if (col >= cols - 1) { row++; col = startCol; if (row >= rows - 1) break }
        const w = charWidth(ch)
        if (w === 2) {
          if (col + 1 < cols) {
            grid.setWideChar(row, col, ch, span.style)
            col += 2
          } else {
            row++; col = startCol
            if (row >= rows - 1) break
            grid.setWideChar(row, col, ch, span.style)
            col += 2
          }
        } else {
          grid.setChar(row, col, ch, span.style)
          col++
        }
      }
      if (row >= rows - 1) break
    }
    row++
  }
}

function render() {
  setupOwnership()
  ti.ensureCursorVisible(grid, 'input')
  ti.paint(grid, 'input')
  paintChrome()
  paintPreview()
  stream.write('\x1b[H')
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
  const newCols = process.stderr.columns || 80
  const newRows = process.stderr.rows || 24
  grid.resize(newCols, newRows)
  stream.write('\x1b[2J\x1b[H')
  render()
})
