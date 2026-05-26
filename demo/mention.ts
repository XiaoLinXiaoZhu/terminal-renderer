/**
 * Demo: @mention 输入框 (Step 3.4)
 *
 * 输入 @ 触发菜单弹出。↑↓ 切换选项，Enter 选中，Esc 关闭。
 * 运行: bun demo/mention.ts
 * 退出: Ctrl+C
 */

import { Grid } from '../src/grid.ts'
import { TextInput } from '../src/text-input.ts'
import { Menu } from '../src/menu.ts'
import { parseKey } from '../src/keys.ts'

const stream = process.stderr
const cols = stream.columns || 80
const rows = stream.rows || 24

const grid = Grid.create(cols, rows)
const ti = new TextInput()
const menu = new Menu()

menu.items = ['Alice', 'Bob', 'Charlie', 'David', '你好世界']

let menuOpen = false
const MENU_HEIGHT = 5
const MENU_WIDTH = 20

function updateOwnership() {
  grid.setOwnerAll('input')
  if (menuOpen) {
    // 菜单锚定在光标下方
    const anchorRow = ti.cursorRow + 1
    const anchorCol = Math.min(ti.cursorCol, cols - MENU_WIDTH)
    for (let r = anchorRow; r < anchorRow + MENU_HEIGHT && r < rows; r++) {
      for (let c = anchorCol; c < anchorCol + MENU_WIDTH && c < cols; c++) {
        grid.setOwner(r, c, 'menu')
      }
    }
  }
}

function render() {
  ti.ensureCursorVisible(grid, 'input')
  ti.paint(grid, 'input')
  updateOwnership()
  ti.paint(grid, 'input') // repaint after ownership change
  if (menuOpen) {
    menu.paint(grid, 'menu')
  }
  grid.flush(stream)
  stream.write(`\x1b[${ti.cursorRow + 1};${ti.cursorCol + 1}H`)
}

// 初始化
stream.write('\x1b[?25l\x1b[2J\x1b[H')
ti.text = '试试输入 @ 来触发菜单...\n'
ti.cursorOffset = ti.text.length
updateOwnership()
render()
stream.write('\x1b[?25h')

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
}
process.stdin.resume()

process.stdin.on('data', (buf: Buffer) => {
  const key = parseKey(buf)

  if (menuOpen) {
    // 菜单模式
    switch (key.type) {
      case 'up':
        menu.selectPrev()
        break
      case 'down':
        menu.selectNext()
        break
      case 'enter': {
        const selected = menu.items[menu.selectedIndex]!
        ti.insertChar(selected)
        menuOpen = false
        menu.selectedIndex = 0
        break
      }
      case 'escape':
        menuOpen = false
        menu.selectedIndex = 0
        break
      case 'ctrl':
        if (key.key === 'c') {
          stream.write('\x1b[?25h\x1b[0m')
          stream.write(`\x1b[${rows};1H\n`)
          process.exit(0)
        }
        break
      default:
        break
    }
  } else {
    // 正常输入模式
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
        if (key.char === '@') {
          menuOpen = true
        }
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
  }

  updateOwnership()
  render()
})
