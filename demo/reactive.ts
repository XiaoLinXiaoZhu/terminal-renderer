/**
 * Demo: 响应式动画更新
 *
 * 用 @vue/reactivity 的 watchEffect 驱动 paint cycle。
 * 展示：时钟、旋转器、进度条、弹跳球 — 全部由 reactive state 驱动。
 *
 * 全屏模式：动态区域高度 = 终端高度（Viewport 统一机制的特殊情况）。
 *
 * 运行: bun demo/reactive.ts
 * 退出: Ctrl+C
 */

import { ref, effect } from '@vue/reactivity'
import { Grid, encodeStyle, BOLD, DIM, ITALIC } from '../src/grid.ts'
import { Viewport } from '../src/viewport.ts'
import { charWidth } from '../src/width.ts'

const stream = process.stderr
const cols = stream.columns || 80
const rows = stream.rows || 24
const grid = Grid.create(cols, rows)
const vp = new Viewport(grid, stream)
grid.setOwnerAll('display')

// --- Reactive State ---

const tick = ref(0)
const progress = ref(0)
const ballX = ref(2)
const ballY = ref(10)
const ballDx = ref(1)
const ballDy = ref(1)

// --- Styles ---

const titleStyle = encodeStyle(8, 0, BOLD)
const clockStyle = encodeStyle(7, 0, BOLD) // cyan bold
const spinnerStyle = encodeStyle(6, 0) // magenta
const barFillStyle = encodeStyle(3, 0, BOLD) // green bold
const barEmptyStyle = encodeStyle(0, 0, DIM)
const ballStyle = encodeStyle(2, 0, BOLD) // red bold
const labelStyle = encodeStyle(0, 0, DIM)

// --- Helpers ---

function writeStr(row: number, col: number, text: string, style: number) {
  let c = col
  for (const ch of text) {
    if (c >= grid.cols) break
    const w = charWidth(ch)
    if (w === 2) {
      if (c + 1 < grid.cols) {
        grid.setWideChar(row, c, ch, style)
        c += 2
      } else {
        grid.setChar(row, c, ' ', 0)
        c++
      }
    } else {
      grid.setChar(row, c, ch, style)
      c++
    }
  }
}

function clearRow(row: number) {
  for (let c = 0; c < grid.cols; c++) grid.setChar(row, c, ' ', 0)
}

// --- Paint ---

const SPINNERS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

effect(() => {
  const t = tick.value
  const p = progress.value

  // Title
  writeStr(1, 2, '♦ terminal-renderer — Reactive Animation Demo', titleStyle)
  writeStr(2, 2, '─'.repeat(Math.min(50, cols - 4)), encodeStyle(0, 0, DIM))

  // Clock
  const now = new Date()
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false })
  writeStr(4, 2, '时钟:', labelStyle)
  writeStr(4, 9, timeStr, clockStyle)

  // Spinner
  const spinChar = SPINNERS[t % SPINNERS.length]!
  writeStr(6, 2, '旋转:', labelStyle)
  writeStr(6, 9, `${spinChar} Loading...`, spinnerStyle)

  // Progress bar
  const barWidth = Math.min(40, cols - 14)
  const filled = Math.round((p / 100) * barWidth)
  writeStr(8, 2, '进度:', labelStyle)
  for (let i = 0; i < barWidth; i++) {
    const ch = i < filled ? '█' : '░'
    const style = i < filled ? barFillStyle : barEmptyStyle
    grid.setChar(8, 9 + i, ch, style)
  }
  writeStr(8, 9 + barWidth + 1, `${p.toString().padStart(3)}%`, labelStyle)

  // Counter
  writeStr(10, 2, '帧数:', labelStyle)
  writeStr(10, 9, `${t}`, encodeStyle(4, 0))

  // Bouncing ball
  const bx = ballX.value
  const by = ballY.value
  // Clear ball area
  for (let r = 12; r < Math.min(rows - 1, 22); r++) {
    clearRow(r)
  }
  // Draw border
  const boxTop = 12, boxBot = Math.min(rows - 2, 21)
  const boxLeft = 2, boxRight = Math.min(cols - 3, 50)
  for (let c = boxLeft; c <= boxRight; c++) {
    grid.setChar(boxTop, c, '─', labelStyle)
    grid.setChar(boxBot, c, '─', labelStyle)
  }
  for (let r = boxTop; r <= boxBot; r++) {
    grid.setChar(r, boxLeft, '│', labelStyle)
    grid.setChar(r, boxRight, '│', labelStyle)
  }
  grid.setChar(boxTop, boxLeft, '┌', labelStyle)
  grid.setChar(boxTop, boxRight, '┐', labelStyle)
  grid.setChar(boxBot, boxLeft, '└', labelStyle)
  grid.setChar(boxBot, boxRight, '┘', labelStyle)
  // Draw ball
  if (by > boxTop && by < boxBot && bx > boxLeft && bx < boxRight) {
    grid.setChar(by, bx, '●', ballStyle)
  }

  // Instructions
  writeStr(rows - 1, 2, 'Ctrl+C 退出 | 所有动画由 @vue/reactivity watchEffect 驱动', labelStyle)

  // 统一渲染：Viewport 管理光标定位
  vp.render()
})

// --- Animation Loop ---

setInterval(() => {
  tick.value++
  progress.value = (progress.value + 1) % 101

  // Bounce ball
  const boxTop = 13, boxBot = Math.min(rows - 3, 20)
  const boxLeft = 3, boxRight = Math.min(cols - 4, 49)
  let nx = ballX.value + ballDx.value
  let ny = ballY.value + ballDy.value
  if (nx <= boxLeft || nx >= boxRight) ballDx.value *= -1
  if (ny <= boxTop || ny >= boxBot) ballDy.value *= -1
  ballX.value = Math.max(boxLeft, Math.min(boxRight, nx))
  ballY.value = Math.max(boxTop, Math.min(boxBot, ny))
}, 80)

// --- Setup ---

stream.write('\x1b[?25l') // hide cursor
vp.mount() // 全屏 = 在尾部预留 terminal-height 行空间

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
}
process.stdin.resume()
process.stdin.on('data', (buf: Buffer) => {
  if (buf[0] === 3) { // Ctrl+C
    stream.write('\x1b[?25h\x1b[0m')
    vp.render({ row: rows - 1, col: 0 })
    stream.write('\n')
    process.exit(0)
  }
})

// --- Resize ---

process.stderr.on('resize', () => {
  const newCols = process.stderr.columns || 80
  const newRows = process.stderr.rows || 24
  const oldRows = grid.rows
  grid.resize(newCols, newRows)
  grid.setOwnerAll('display')
  vp.remount(oldRows)
})
