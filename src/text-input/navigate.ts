/**
 * TextInput 垂直导航 — moveUp / moveDown，以及视觉行 ↔ charIndex 的换算辅助。
 *
 * 垂直移动依赖 paint 后的 cursorRow/cursorCol 与 grid 的 ownership 布局，
 * 通过重新模拟 paint 遍历来反查目标视觉位置对应的 charIndex。
 * stickyCol 记忆用户期望的列，跨越短行/空行时保持。
 */

import type { Grid } from '../grid.ts'
import { charWidth } from '../width.ts'
import type { TextInputState } from './types.ts'

export function moveUp(state: TextInputState, grid: Grid, ownerId: string): void {
  const targetCol = state.stickyCol ?? state.cursorCol
  if (state.stickyCol === null) state.stickyCol = state.cursorCol

  const targetRow = state.cursorRow - 1
  if (targetRow < 0 || !rowHasOwner(grid, targetRow, ownerId)) {
    // 有内容在视口上方：回退 scrollOffset 并重新定位
    if (state.scrollOffset > 0) {
      const prevStart = findPrevVisualLineStart(state, grid, ownerId)
      if (prevStart < state.scrollOffset) {
        state.cursorOffset = prevStart + visualColToCharCount(state, prevStart, targetCol, grid, ownerId)
      }
    }
    return
  }

  state.cursorOffset = resolveCharIndex(state, grid, ownerId, targetRow, targetCol)
}

export function moveDown(state: TextInputState, grid: Grid, ownerId: string): void {
  const targetCol = state.stickyCol ?? state.cursorCol
  if (state.stickyCol === null) state.stickyCol = state.cursorCol

  const targetRow = state.cursorRow + 1
  if (targetRow >= grid.rows || !rowHasOwner(grid, targetRow, ownerId)) {
    // 有内容在视口下方：前进到下一视觉行
    const nextStart = findNextVisualLineStart(state, grid, ownerId)
    if (nextStart > state.cursorOffset && nextStart <= state.text.length) {
      state.cursorOffset = nextStart + visualColToCharCount(state, nextStart, targetCol, grid, ownerId)
    }
    return
  }

  state.cursorOffset = resolveCharIndex(state, grid, ownerId, targetRow, targetCol)
}

/** 检查指定行是否有属于 ownerId 的 cell */
export function rowHasOwner(grid: Grid, row: number, ownerId: string): boolean {
  if (row < 0 || row >= grid.rows) return false
  for (let col = 0; col < grid.cols; col++) {
    if (grid.ownerAt(row, col) === ownerId) return true
  }
  return false
}

/**
 * 从 (targetRow, targetCol) 反查 charIndex。
 * 重新模拟 paint 遍历来定位。
 */
function resolveCharIndex(
  state: TextInputState,
  grid: Grid,
  ownerId: string,
  targetRow: number,
  targetCol: number,
): number {
  let charIdx = state.scrollOffset
  let lastCharIdxOnTargetRow = -1
  let firstCharIdxOnTargetRow = -1

  for (let row = 0; row < grid.rows; row++) {
    let skipToNextRow = false
    for (let col = 0; col < grid.cols; col++) {
      if (grid.ownerAt(row, col) !== ownerId) continue
      if (skipToNextRow) continue

      if (charIdx >= state.text.length) {
        // 文本已结束
        if (row === targetRow && col >= targetCol) return charIdx
        if (row > targetRow) {
          return lastCharIdxOnTargetRow >= 0 ? lastCharIdxOnTargetRow : charIdx
        }
        continue
      }

      if (row === targetRow) {
        if (firstCharIdxOnTargetRow < 0) firstCharIdxOnTargetRow = charIdx
        if (col >= targetCol) return charIdx
      }

      if (row > targetRow) {
        // 已过目标行
        if (lastCharIdxOnTargetRow >= 0) {
          // 返回目标行最后一个 charIdx 后一位（即该行尾部）
          return advanceOneChar(state, lastCharIdxOnTargetRow)
        }
        return charIdx
      }

      const ch = state.text[charIdx]!
      if (ch === '\n') {
        if (row === targetRow) return charIdx
        charIdx++
        skipToNextRow = true
        continue
      }

      const w = charWidth(ch)
      if (w === 2) {
        const nextCol = col + 1
        if (nextCol < grid.cols && grid.ownerAt(row, nextCol) === ownerId) {
          if (row === targetRow) lastCharIdxOnTargetRow = charIdx
          col++
          charIdx++
        } else {
          // CJK 放不下，不递增 charIdx
        }
      } else {
        if (row === targetRow) lastCharIdxOnTargetRow = charIdx
        charIdx++
      }
    }
  }

  // 如果目标行有内容
  if (lastCharIdxOnTargetRow >= 0) {
    return advanceOneChar(state, lastCharIdxOnTargetRow)
  }
  return charIdx
}

/** 前进一个字符的 offset */
function advanceOneChar(state: TextInputState, offset: number): number {
  if (offset >= state.text.length) return offset
  const remaining = [...state.text.slice(offset)]
  if (remaining.length === 0) return offset
  return offset + remaining[0]!.length
}

/** 从当前光标行末找到下一个视觉行的起始 charIdx */
function findNextVisualLineStart(state: TextInputState, grid: Grid, ownerId: string): number {
  // 模拟 paint 从 scrollOffset 开始，找到光标所在视觉行的末尾
  let charIdx = state.scrollOffset
  let onCursorRow = false
  for (let row = 0; row < grid.rows; row++) {
    let skipToNextRow = false
    for (let col = 0; col < grid.cols; col++) {
      if (grid.ownerAt(row, col) !== ownerId) continue
      if (skipToNextRow) continue

      if (row === state.cursorRow) onCursorRow = true

      if (charIdx >= state.text.length) return state.text.length

      if (onCursorRow && row > state.cursorRow) {
        // 刚过光标行 → 当前 charIdx 就是下一行起始
        return charIdx
      }

      const ch = state.text[charIdx]!
      if (ch === '\n') {
        if (row === state.cursorRow) return charIdx + 1
        charIdx++
        skipToNextRow = true
        continue
      }

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
    if (row === state.cursorRow) {
      // 光标行结束（自动折行），charIdx 是下一行起始
      return charIdx
    }
  }
  return charIdx
}

/** 找到当前 scrollOffset 对应的视觉行的前一行起始 */
function findPrevVisualLineStart(state: TextInputState, _grid: Grid, _ownerId: string): number {
  if (state.scrollOffset === 0) return 0
  // 找到 scrollOffset 前一个字符所在行的起始
  // 简化：找最近的 '\n' 或用 grid 宽度回退
  const before = state.text.slice(0, state.scrollOffset)
  const lastNl = before.lastIndexOf('\n')
  if (lastNl >= 0 && lastNl === state.scrollOffset - 1) {
    // scrollOffset 紧跟在 '\n' 后面，找再上一个行起始
    const beforeNl = state.text.slice(0, lastNl)
    const prevNl = beforeNl.lastIndexOf('\n')
    return prevNl >= 0 ? prevNl + 1 : 0
  }
  if (lastNl >= 0) return lastNl + 1
  return 0
}

/** 从 startOffset 开始模拟灌入，返回到达 targetCol 时经过的字符数 */
function visualColToCharCount(
  state: TextInputState,
  startOffset: number,
  targetCol: number,
  grid: Grid,
  ownerId: string,
): number {
  let charIdx = startOffset
  let colCount = 0
  // 找第一行的 owned cols 宽度来模拟
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (grid.ownerAt(row, col) !== ownerId) continue
      if (colCount >= targetCol) return charIdx - startOffset
      if (charIdx >= state.text.length) return charIdx - startOffset

      const ch = state.text[charIdx]!
      if (ch === '\n') return charIdx - startOffset

      const w = charWidth(ch)
      if (w === 2) {
        const nextCol = col + 1
        if (nextCol < grid.cols && grid.ownerAt(row, nextCol) === ownerId) {
          col++
          charIdx++
          colCount += 2
        } else {
          colCount++
        }
      } else {
        charIdx++
        colCount++
      }
    }
    return charIdx - startOffset // end of first owned row
  }
  return charIdx - startOffset
}
