/**
 * enhanced2/ui — 布局计算 + 绘制
 *
 * 封装：
 * 1. 动态 guide 高度：根据输入内容行数 + 终端尺寸自动调整 grid 行数（有 min/max 限制）
 * 2. 输入区域 layout + ownership
 * 3. 滚动指示器（↑ N lines above / ↓ N lines below）
 * 4. 状态栏（字符数、光标位置、时间）
 * 5. Mention 菜单自适应定位（优先下方，空间不够则上方）并覆盖其他内容
 * 6. 菜单带外边框绘制
 */

import { Grid, encodeStyle, BOLD, DIM } from '../../src/grid.ts'
import { TextInput } from '../../src/text-input'
import { Menu } from '../../src/menu.ts'
import { charWidth, stringWidth } from '../../src/width.ts'

// ── 样式常量 ──

export const promptStyle      = encodeStyle(2, -1, BOLD)    // green bold
export const dimStyle         = encodeStyle(-1, -1, DIM)
export const statusBgStyle    = encodeStyle(7, 4, BOLD)     // white on blue
export const statusDimStyle   = encodeStyle(6, 4)           // cyan on blue
export const indicatorStyle   = encodeStyle(3, -1, DIM)     // yellow dim
export const borderStyle      = encodeStyle(5, -1)           // magenta
export const menuHighlight    = encodeStyle(0, 7, BOLD)     // black on white bold
export const menuNormal       = encodeStyle(7, 0)            // white on black
export const inputPromptStyle = encodeStyle(4, -1, BOLD)    // blue bold

// ── 动态高度配置 ──

/** 最小 grid 行数 */
export const MIN_ROWS = 6
/** 最大 grid 行数（会在运行时用终端行数 clamp） */
export const MAX_ROWS = 20

/** 非输入区域的固定行数：顶部指示器 + 底部指示器 + 状态栏 */
const OVERHEAD_ROWS = 3

// ── Layout ──

export interface Layout {
  inputStartRow: number
  inputEndRow: number   // inclusive
  indicatorTopRow: number
  indicatorBotRow: number
  statusRow: number
}

export function getLayout(gridRows: number): Layout {
  return {
    indicatorTopRow: 0,
    inputStartRow: 1,
    inputEndRow: gridRows - 3,
    indicatorBotRow: gridRows - 2,
    statusRow: gridRows - 1,
  }
}

// ── 辅助 ──

/** 向 grid 写入字符串（从指定位置开始），处理 CJK 宽字符 */
export function writeStr(grid: Grid, row: number, col: number, text: string, style: number): void {
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

/** 清除指定行，填充空格 */
export function clearRow(grid: Grid, row: number, style: number = 0): void {
  for (let c = 0; c < grid.cols; c++) grid.setChar(row, c, ' ', style)
}

// ── 动态高度计算 ──

/**
 * 计算文本在给定终端宽度下占用的视觉行数。
 * 考虑换行符和 CJK 宽度导致的自动折行。
 */
export function countVisualLines(text: string, termCols: number): number {
  if (text.length === 0) return 1
  const width = Math.max(1, termCols)
  let lines = 0
  let lineStart = 0
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === '\n') {
      const segment = text.slice(lineStart, i)
      const displayWidth = stringWidth(segment)
      lines += Math.max(1, Math.ceil(displayWidth / width))
      lineStart = i + 1
    }
  }
  return lines
}

/**
 * 根据当前文本和终端尺寸计算所需 grid 行数。
 */
export function calcGridRows(text: string, termCols: number, termRows: number): number {
  const maxRows = Math.min(MAX_ROWS, termRows - 2) // 留 2 行给终端 prompt
  const visualLines = countVisualLines(text, termCols)
  const needed = visualLines + OVERHEAD_ROWS
  return Math.max(MIN_ROWS, Math.min(needed, maxRows))
}

// ── Ownership ──

/** 重置所有 ownership 并将输入区域分配给 ownerId */
export function setupInputOwnership(grid: Grid, ownerId: string): void {
  const layout = getLayout(grid.rows)
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      grid.setOwner(r, c, '')
    }
  }
  for (let r = layout.inputStartRow; r <= layout.inputEndRow; r++) {
    for (let c = 0; c < grid.cols; c++) {
      grid.setOwner(r, c, ownerId)
    }
  }
}

// ── Mention 菜单定位 ──

export interface MenuBox {
  anchorRow: number
  anchorCol: number
  boxWidth: number
  boxHeight: number
  visibleItems: number
}

/**
 * 计算菜单渲染位置。
 * 优先光标下方，空间不够则上方，两边都不够则选择空间更大的一侧。
 * 返回 null 表示完全无法渲染菜单。
 */
export function calcMenuPosition(
  gridRows: number,
  gridCols: number,
  cursorRow: number,
  cursorCol: number,
  itemCount: number,
  itemWidth: number,
): MenuBox | null {
  const boxWidth = Math.min(itemWidth + 2, gridCols)
  const boxHeight = itemCount + 2
  const anchorCol = Math.min(Math.max(0, cursorCol - 1), gridCols - boxWidth)

  const belowRows = gridRows - cursorRow - 1
  const aboveRows = cursorRow

  // 下方够用
  if (belowRows >= boxHeight) {
    return { anchorRow: cursorRow + 1, anchorCol, boxWidth, boxHeight, visibleItems: itemCount }
  }

  // 上方够用
  if (aboveRows >= boxHeight) {
    return { anchorRow: cursorRow - boxHeight, anchorCol, boxWidth, boxHeight, visibleItems: itemCount }
  }

  // 两侧都不够：选空间更大的一侧
  if (belowRows >= aboveRows && belowRows >= 3) {
    const visible = belowRows - 2
    return { anchorRow: cursorRow + 1, anchorCol, boxWidth, boxHeight: belowRows, visibleItems: Math.max(1, visible) }
  } else if (aboveRows >= 3) {
    const visible = aboveRows - 2
    const h = aboveRows
    return { anchorRow: cursorRow - h, anchorCol, boxWidth, boxHeight: h, visibleItems: Math.max(1, visible) }
  }

  return null
}

/** 为菜单区域设置 ownership（覆盖 input 区域） */
export function setupMenuOwnership(grid: Grid, box: MenuBox): void {
  const { anchorRow, anchorCol, boxWidth, boxHeight } = box
  for (let r = anchorRow; r < anchorRow + boxHeight && r < grid.rows; r++) {
    for (let c = anchorCol; c < anchorCol + boxWidth && c < grid.cols; c++) {
      grid.setOwner(r, c, 'menu')
    }
  }
}

/** 绘制带外边框的菜单 */
export function paintMenuWithBorder(grid: Grid, menu: Menu, box: MenuBox): void {
  const { anchorRow, anchorCol, boxWidth, boxHeight, visibleItems } = box
  const topRow = anchorRow
  const botRow = anchorRow + boxHeight - 1
  const rightCol = Math.min(anchorCol + boxWidth - 1, grid.cols - 1)

  // 顶边框
  if (topRow >= 0 && topRow < grid.rows) {
    grid.setChar(topRow, anchorCol, '┌', borderStyle)
    grid.setChar(topRow, rightCol, '┐', borderStyle)
    for (let c = anchorCol + 1; c < rightCol; c++) {
      grid.setChar(topRow, c, '─', borderStyle)
    }
  }

  // 底边框
  if (botRow > topRow && botRow < grid.rows) {
    grid.setChar(botRow, anchorCol, '└', borderStyle)
    grid.setChar(botRow, rightCol, '┘', borderStyle)
    for (let c = anchorCol + 1; c < rightCol; c++) {
      grid.setChar(botRow, c, '─', borderStyle)
    }
  }

  // 侧边框 + 内部菜单项
  for (let i = 0; i < visibleItems; i++) {
    const row = topRow + 1 + i
    if (row >= grid.rows) break
    grid.setChar(row, anchorCol, '│', borderStyle)
    grid.setChar(row, rightCol, '│', borderStyle)

    const item = menu.items[i]!
    const isSelected = i === menu.selectedIndex
    const style = isSelected ? menuHighlight : menuNormal
    const chars = [...item]

    let charIdx = 0
    for (let c = anchorCol + 1; c < rightCol; c++) {
      if (charIdx < chars.length) {
        const ch = chars[charIdx]!
        const w = charWidth(ch)
        if (w === 2 && c + 1 < rightCol) {
          grid.setWideChar(row, c, ch, style)
          c++
          charIdx++
        } else if (w === 2) {
          grid.setChar(row, c, ' ', style)
        } else {
          grid.setChar(row, c, ch, style)
          charIdx++
        }
      } else {
        grid.setChar(row, c, ' ', style)
      }
    }
  }
}

// ── 滚动指示器 ──

/** 计算由 scrollOffset 隐藏的上方视觉行数 */
export function countLinesAbove(ti: TextInput, termCols: number): number {
  if (ti.scrollOffset === 0) return 0
  const before = ti.text.slice(0, ti.scrollOffset)
  const total = countVisualLines(before, termCols)
  return Math.max(0, total - 1)
}

/**
 * 计算输入区域下方被隐藏的视觉行数。
 * 利用已绘制的 grid 快速定位 input 区域结束位置，然后计算剩余文本行数。
 */
export function countLinesBelow(ti: TextInput, grid: Grid, ownerId: string): number {
  const layout = getLayout(grid.rows)
  let charIdx = ti.scrollOffset
  for (let row = layout.inputStartRow; row <= layout.inputEndRow; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (grid.ownerAt(row, col) !== ownerId) continue
      if (charIdx >= ti.text.length) return 0
      const ch = ti.text[charIdx]!
      if (ch === '\n') { charIdx++; break }
      const w = charWidth(ch)
      if (w === 2) {
        const nextCol = col + 1
        if (nextCol < grid.cols && grid.ownerAt(row, nextCol) === ownerId) {
          col++
          charIdx++
        }
      } else {
        charIdx++
      }
    }
  }
  if (charIdx >= ti.text.length) return 0
  const remaining = ti.text.slice(charIdx)
  return countVisualLines(remaining, grid.cols)
}

/** 绘制顶部和底部滚动指示器 */
export function paintIndicators(
  grid: Grid,
  ti: TextInput,
  ownerId: string,
  promptCounter: number,
): void {
  const layout = getLayout(grid.rows)
  const above = countLinesAbove(ti, grid.cols)
  const below = countLinesBelow(ti, grid, ownerId)

  // 顶部
  clearRow(grid, layout.indicatorTopRow)
  if (above > 0) {
    const text = `  ↑ ${above} line${above > 1 ? 's' : ''} above`
    writeStr(grid, layout.indicatorTopRow, 0, text, indicatorStyle)
    const dots = '·'.repeat(Math.max(0, grid.cols - text.length - 2))
    writeStr(grid, layout.indicatorTopRow, text.length, dots.slice(0, grid.cols - text.length), dimStyle)
  } else {
    const prompt = `[${promptCounter}]`
    writeStr(grid, layout.indicatorTopRow, 1, prompt, inputPromptStyle)
    const line = '─'.repeat(Math.max(0, grid.cols - prompt.length - 3))
    writeStr(grid, layout.indicatorTopRow, prompt.length + 2, line, dimStyle)
  }

  // 底部
  clearRow(grid, layout.indicatorBotRow)
  if (below > 0) {
    const text = `  ↓ ${below} line${below > 1 ? 's' : ''} below`
    writeStr(grid, layout.indicatorBotRow, 0, text, indicatorStyle)
    const dots = '·'.repeat(Math.max(0, grid.cols - text.length - 2))
    writeStr(grid, layout.indicatorBotRow, text.length, dots.slice(0, grid.cols - text.length), dimStyle)
  } else {
    const line = '─'.repeat(Math.max(0, grid.cols - 2))
    writeStr(grid, layout.indicatorBotRow, 1, line, dimStyle)
  }
}

// ── 状态栏 ──

/** 绘制底部状态栏（字符数 + 光标位置 + 时间） */
export function paintStatusBar(grid: Grid, ti: TextInput, promptCounter: number): void {
  const layout = getLayout(grid.rows)
  clearRow(grid, layout.statusRow, statusBgStyle)

  const totalChars = ti.text.length
  const aboveLines = countLinesAbove(ti, grid.cols)
  const cursorLine = ti.cursorRow - layout.inputStartRow + 1 + aboveLines
  const cursorCol = ti.cursorCol + 1
  const now = new Date()
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false })

  const left = ` Chars: ${totalChars} | Cursor: L${cursorLine}:C${cursorCol}`
  const right = `${timeStr} `
  const middle = ' '.repeat(Math.max(0, grid.cols - left.length - right.length))

  writeStr(grid, layout.statusRow, 0, left, statusBgStyle)
  writeStr(grid, layout.statusRow, left.length, middle, statusBgStyle)
  writeStr(grid, layout.statusRow, grid.cols - right.length, right, statusDimStyle)
}
