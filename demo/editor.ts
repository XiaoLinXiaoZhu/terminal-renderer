/**
 * Demo: 多行编辑器
 *
 * 完整多行编辑体验：输入、删除、折行、↑↓ 导航、滚动。
 *
 * 全屏模式：动态区域高度 = 终端高度。
 *
 * 运行: bun demo/editor.ts
 * 退出: Ctrl+C
 */

import { Grid } from '../src/grid.ts'
import { TextInput } from '../src/text-input.ts'
import { Viewport } from '../src/viewport.ts'
import { parseKey } from '../src/keys.ts'

const stream = process.stderr
const cols = stream.columns || 80
const rows = stream.rows || 24

const grid = Grid.create(cols, rows)
const vp = new Viewport(grid, stream)
grid.setOwnerAll('input')

const ti = new TextInput()
ti.text = '欢迎使用 terminal-renderer 多行编辑器！\n\n按键说明：\n  ← → 移动光标\n  ↑ ↓ 上下行\n  Enter 换行\n  Backspace 删除\n  Ctrl+C 退出\n\n试试输入中文和英文混合文本...'

function render() {
  ti.ensureCursorVisible(grid, 'input')
  ti.paint(grid, 'input')
  vp.render({ row: ti.cursorRow, col: ti.cursorCol })
}

// 初始化
stream.write('\x1b[?25l')
vp.mount()
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
        vp.render({ row: rows - 1, col: 0 })
        stream.write('\n')
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

// Resize 处理
process.stderr.on('resize', () => {
  const newCols = process.stderr.columns || 80
  const newRows = process.stderr.rows || 24
  const oldRows = grid.rows
  grid.resize(newCols, newRows)
  grid.setOwnerAll('input')
  vp.remount(oldRows)
  render()
})
