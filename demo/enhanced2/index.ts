/**
 * enhanced2 — 强化输入 Demo（模块化版本）
 *
 * 特性：
 * 1. 动态 guide 高度 — 随输入行数自动扩展/收缩（有 max 限制）
 * 2. Shift + 方向键选区 — 高亮覆盖、选区删除
 * 3. Ctrl+C 复制选区 / Ctrl+V 粘贴（跨平台剪贴板）
 * 4. @mention 菜单自适应定位 — 优先下方，空间不够则上方，覆盖其他内容
 * 5. 滚动指示器 + 状态栏（继承 enhanced）
 *
 * 运行: bun demo/enhanced2/index.ts
 * 退出: Ctrl+C (无选区时) | Ctrl+Q | 提交: Ctrl+D
 */

import { Grid, sgrFromEncoded } from '../../src/grid.ts'
import { TextInput } from '../../src/text-input.ts'
import { Menu } from '../../src/menu.ts'
import { Viewport } from '../../src/viewport.ts'
import { parseKey } from '../../src/keys.ts'

import { Selection } from './selection.ts'
import { copyToClipboard, pasteFromClipboard } from './clipboard.ts'
import {
  promptStyle, dimStyle,
  MIN_ROWS,
  calcGridRows,
  setupInputOwnership, setupMenuOwnership,
  paintIndicators, paintStatusBar, paintMenuWithBorder,
  calcMenuPosition,
} from './ui.ts'

const OWNER_INPUT = 'input'
const OWNER_MENU = 'menu'

// ── Mutable state (reassigned on resize / submit) ──

let termCols = process.stderr.columns || 80
let termRows = process.stderr.rows || 24
let gridRows = MIN_ROWS

let grid = Grid.create(termCols, gridRows)
let vp = new Viewport(grid, process.stderr)

const ti = new TextInput()
const menu = new Menu()
const sel = new Selection()

menu.items = ['Alice', 'Bob', 'Charlie', 'David', 'Eve', '你好世界']

let menuOpen = false
let promptCounter = 1

const MENU_ITEM_WIDTH = 18

// ── Helpers ──

/**
 * 删除选区并将光标移到选区起点。
 * sel.deleteFrom 内部会调用 sel.clear()，返回删除后的 text。
 * 调用者应使用返回值更新 ti.text，光标已在返回值中被正确定位。
 */
function deleteSelection(): string {
  const r = sel.range!
  const newText = sel.deleteFrom(ti.text)
  ti.cursorOffset = r[0]
  return newText
}

// ── Dynamic height ──

function resizeGridIfNeeded(): boolean {
  const newRows = calcGridRows(ti.text, termCols, termRows)
  if (newRows === gridRows) return false
  gridRows = newRows
  vp.remount(termCols, gridRows)
  return true
}

// ── Render ──

function render(): void {
  vp.beginSync()

  resizeGridIfNeeded()

  // Ownership: 先清空，再分配 input
  setupInputOwnership(grid, OWNER_INPUT)

  ti.ensureCursorVisible(grid, OWNER_INPUT)
  ti.paint(grid, OWNER_INPUT)

  // Menu overlay（覆盖 input 区域）
  if (menuOpen) {
    const pos = calcMenuPosition(
      gridRows, termCols,
      ti.cursorRow, ti.cursorCol,
      menu.items.length, MENU_ITEM_WIDTH,
    )
    if (pos && pos.visibleItems > 0) {
      setupMenuOwnership(grid, pos)          // menu ownership 覆盖 input
      ti.paint(grid, OWNER_INPUT)             // repaint（input 区域已被 menu 裁剪）
      paintMenuWithBorder(grid, menu, pos)
    } else {
      menuOpen = false
    }
  }

  // Selection overlay（最后绘制，覆盖在文本之上）
  if (sel.active) {
    sel.paintOverlay(grid, OWNER_INPUT, ti.scrollOffset, ti.text)
  }

  // Indicators + Status bar
  paintIndicators(grid, ti, OWNER_INPUT, promptCounter)
  paintStatusBar(grid, ti, promptCounter)

  vp.endSync()
  vp.render({ row: ti.cursorRow, col: ti.cursorCol })
}

// ── Submit ──

function submit(): void {
  if (ti.text.trim().length === 0) return

  const prompt = `[${promptCounter}]> `
  let output = sgrFromEncoded(promptStyle) + prompt + '\x1b[0m'

  const lines = ti.text.split('\n')
  output += lines[0]!
  for (let i = 1; i < lines.length; i++) {
    output += '\n' + ' '.repeat(prompt.length) + lines[i]
  }
  output += '\n'
  output += sgrFromEncoded(dimStyle) + '─'.repeat(Math.min(50, termCols)) + '\x1b[0m\n'

  promptCounter++
  ti.text = ''
  ti.cursorOffset = 0
  ti.scrollOffset = 0
  sel.clear()
  menuOpen = false

  // 重置 grid 到最小高度，确保 commit 输出整洁
  if (gridRows !== MIN_ROWS) {
    gridRows = MIN_ROWS
    vp.remount(termCols, gridRows)
  }
  vp.commit(output)
  render()
}

// ── Bootstrap ──

process.stderr.write('\x1b[?25l')
process.stderr.write(sgrFromEncoded(dimStyle) + '── enhanced2 input demo ──\x1b[0m\n')
process.stderr.write(sgrFromEncoded(dimStyle) + '@ 菜单 | Shift+方向键选区 | Ctrl+C 复制 | Ctrl+V 粘贴 | Ctrl+D 提交 | Ctrl+Q 退出\x1b[0m\n')
process.stderr.write(sgrFromEncoded(dimStyle) + '─'.repeat(Math.min(50, termCols)) + '\x1b[0m\n')

vp.mount()
render()
process.stderr.write('\x1b[?25h')

// ── Status bar timer ──

const statusTimer = setInterval(() => {
  vp.beginSync()
  paintStatusBar(grid, ti, promptCounter)
  vp.render({ row: ti.cursorRow, col: ti.cursorCol })
  vp.endSync()
}, 1000)

// ── Input loop ──

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
}
process.stdin.resume()

process.stdin.on('data', (buf: Buffer) => {
  const key = parseKey(buf)

  // ── Menu mode ──
  if (menuOpen) {
    switch (key.type) {
      case 'up':
        menu.selectPrev()
        break
      case 'down':
        menu.selectNext()
        break
      case 'enter': {
        const selected = menu.items[menu.selectedIndex]!
        if (sel.active) { ti.text = deleteSelection() }
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
        if (key.key === 'c' && !sel.active) { exit(); return }
        if (key.key === 'q') { exit(); return }
        if (key.key === 'd') { submit(); return }
        break
      case 'backspace':
        ti.deleteBeforeCursor()
        sel.clear()
        menuOpen = false
        menu.selectedIndex = 0
        break
      default:
        break
    }
    render()
    return
  }

  // ── Normal mode ──
  switch (key.type) {
    case 'ctrl': {
      if (key.key === 'c') {
        if (sel.active) {
          copyToClipboard(sel.selectedText(ti.text))
        } else {
          exit()
        }
        return
      }
      if (key.key === 'v') {
        const pasted = pasteFromClipboard()
        if (pasted != null) {
          if (sel.active) { ti.text = deleteSelection() }
          ti.insertChar(pasted)
        }
        break
      }
      if (key.key === 'd') { submit(); return }
      if (key.key === 'q') { exit(); return }
      break
    }
    case 'char': {
      if (sel.active) { ti.text = deleteSelection() }
      ti.insertChar(key.char)
      if (key.char === '@') {
        menuOpen = true
        menu.selectedIndex = 0
      }
      break
    }
    case 'backspace':
    case 'delete': {
      if (sel.active) {
        ti.text = deleteSelection()
      } else if (key.type === 'backspace') {
        ti.deleteBeforeCursor()
      } else if (ti.cursorOffset < ti.text.length) {
        // Delete char at cursor
        const before = [...ti.text.slice(0, ti.cursorOffset)]
        const after = [...ti.text.slice(ti.cursorOffset)]
        after.shift()
        ti.text = before.join('') + after.join('')
      }
      break
    }
    case 'enter': {
      if (sel.active) { ti.text = deleteSelection() }
      ti.insertChar('\n')
      break
    }
    case 'left': {
      if (key.shift) {
        if (!sel.active) sel.begin(ti.cursorOffset)
        ti.moveLeft()
        sel.extendTo(ti.cursorOffset)
      } else {
        sel.clear()
        ti.moveLeft()
      }
      break
    }
    case 'right': {
      if (key.shift) {
        if (!sel.active) sel.begin(ti.cursorOffset)
        ti.moveRight()
        sel.extendTo(ti.cursorOffset)
      } else {
        sel.clear()
        ti.moveRight()
      }
      break
    }
    case 'up': {
      ti.paint(grid, OWNER_INPUT)
      if (key.shift) {
        if (!sel.active) sel.begin(ti.cursorOffset)
        ti.moveUp(grid, OWNER_INPUT)
        sel.extendTo(ti.cursorOffset)
      } else {
        sel.clear()
        ti.moveUp(grid, OWNER_INPUT)
      }
      break
    }
    case 'down': {
      ti.paint(grid, OWNER_INPUT)
      if (key.shift) {
        if (!sel.active) sel.begin(ti.cursorOffset)
        ti.moveDown(grid, OWNER_INPUT)
        sel.extendTo(ti.cursorOffset)
      } else {
        sel.clear()
        ti.moveDown(grid, OWNER_INPUT)
      }
      break
    }
    case 'home': {
      sel.clear()
      const before = ti.text.slice(0, ti.cursorOffset)
      const lastNL = before.lastIndexOf('\n')
      ti.cursorOffset = lastNL >= 0 ? lastNL + 1 : 0
      ti.stickyCol = null
      break
    }
    case 'end': {
      sel.clear()
      const after = ti.text.slice(ti.cursorOffset)
      const nextNL = after.indexOf('\n')
      ti.cursorOffset += nextNL >= 0 ? nextNL : after.length
      ti.stickyCol = null
      break
    }
    case 'tab': {
      if (sel.active) { ti.text = deleteSelection() }
      ti.insertChar('  ')
      break
    }
    case 'escape': {
      sel.clear()
      break
    }
    default:
      break
  }

  render()
})

// ── Resize ──

process.stderr.on('resize', () => {
  termCols = process.stderr.columns || 80
  termRows = process.stderr.rows || 24
  gridRows = calcGridRows(ti.text, termCols, termRows)
  vp.remount(termCols, gridRows)
  render()
})

// ── Exit ──

function exit(): void {
  clearInterval(statusTimer)
  vp.render({ row: gridRows - 1, col: 0 })
  process.stderr.write('\n\x1b[?25h\x1b[0m')
  process.exit(0)
}
