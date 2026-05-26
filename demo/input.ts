/**
 * Demo: 交互式单行输入 (Step 1.4)
 *
 * stdin raw mode + 按键解析 + TextInput + Grid flush。
 * 运行: bun demo/input.ts
 * 退出: Ctrl+C
 */

import { Grid } from '../src/grid.ts'
import { TextInput } from '../src/text-input.ts'
import { parseKey } from '../src/keys.ts'

const stream = process.stderr
const cols = stream.columns || 80
const rows = stream.rows || 24

const grid = Grid.create(cols, rows)
grid.setOwnerAll('input')

const ti = new TextInput()

function render() {
  ti.paint(grid, 'input')
  stream.write('\x1b[H')
  grid.flush(stream)
  // 移动终端真实光标到 TextInput 光标位置
  stream.write(`\x1b[${ti.cursorRow + 1};${ti.cursorCol + 1}H`)
}

// 初始渲染
stream.write('\x1b[?25l') // 隐藏光标（避免闪烁）
stream.write('\x1b[2J\x1b[H') // 清屏
render()
stream.write('\x1b[?25h') // 显示光标

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
        // 退出
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
    case 'left':
      ti.moveLeft()
      break
    case 'right':
      ti.moveRight()
      break
    default:
      // 忽略其他按键
      break
  }

  render()
})
