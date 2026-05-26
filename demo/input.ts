/**
 * Demo: 交互式输入
 *
 * stdin raw mode + 按键解析 + TextInput + Grid flush。
 * 运行: bun demo/input.ts
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

function render() {
  ti.paint(grid, 'input')
  vp.render({ row: ti.cursorRow, col: ti.cursorCol })
}

// 初始化
stream.write('\x1b[?25l')
vp.mount()
render()
stream.write('\x1b[?25h')

// 设置 raw mode
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
    case 'left':
      ti.moveLeft()
      break
    case 'right':
      ti.moveRight()
      break
    default:
      break
  }

  render()
})
