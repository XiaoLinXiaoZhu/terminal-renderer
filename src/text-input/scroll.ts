/**
 * TextInput 滚动 — 通过调整 scrollOffset 保证光标始终在视口内。
 *
 * 需要在编辑/移动后、最终 paint 前调用 ensureCursorVisible。
 */

import type { Grid } from '../grid.ts'
import { charWidth } from '../width.ts'
import type { TextInputState } from './types.ts'
import { paint } from './paint.ts'

/**
 * 确保光标在视口内。如果光标超出当前可见区域则调整 scrollOffset。
 * 返回是否发生了调整。
 */
export function ensureCursorVisible(state: TextInputState, grid: Grid, ownerId: string): boolean {
  // 计算 owned 行数（视口高度）
  const ownedRows = getOwnedRowCount(grid, ownerId)
  if (ownedRows === 0) return false

  // 先用当前 scrollOffset paint 一次来确定光标位置
  paint(state, grid, ownerId)

  let adjusted = false

  // 向下滚动：反复增加 scrollOffset 直到光标在视口内
  while (isCursorBelowViewport(state, grid, ownerId)) {
    const prev = state.scrollOffset
    state.scrollOffset = advanceScrollOffset(state, grid, ownerId)
    adjusted = true
    if (state.scrollOffset >= state.text.length) break
    if (state.scrollOffset === prev) break // safety: no progress
  }

  // 向上滚动：如果 cursorOffset < scrollOffset
  if (state.cursorOffset < state.scrollOffset) {
    state.scrollOffset = findLineStart(state, state.cursorOffset)
    adjusted = true
  }

  return adjusted
}

/** 获取 owned 行数 */
function getOwnedRowCount(grid: Grid, ownerId: string): number {
  let count = 0
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (grid.ownerAt(row, col) === ownerId) {
        count++
        break
      }
    }
  }
  return count
}

/** 判断光标是否在视口底部之下 */
function isCursorBelowViewport(state: TextInputState, grid: Grid, ownerId: string): boolean {
  // 模拟 paint 看 cursorOffset 是否在可渲染范围内
  let charIdx = state.scrollOffset
  for (let row = 0; row < grid.rows; row++) {
    let skipToNextRow = false
    for (let col = 0; col < grid.cols; col++) {
      if (grid.ownerAt(row, col) !== ownerId) continue
      if (skipToNextRow) continue

      if (charIdx === state.cursorOffset) return false // 光标在视口内

      if (charIdx >= state.text.length) return false // 文本已结束，光标也在视口内

      const ch = state.text[charIdx]!
      if (ch === '\n') {
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
        // 放不下的情况不递增
      } else {
        charIdx++
      }
    }
  }
  // 遍历完所有视口格子都没找到光标 → 光标在视口下方
  return true
}

/** 将 scrollOffset 前进一个视觉行（到下一行起始的 charIdx） */
function advanceScrollOffset(state: TextInputState, grid: Grid, ownerId: string): number {
  let charIdx = state.scrollOffset
  for (let row = 0; row < grid.rows; row++) {
    let skipToNextRow = false
    let hadOwnedCell = false
    for (let col = 0; col < grid.cols; col++) {
      if (grid.ownerAt(row, col) !== ownerId) continue
      if (skipToNextRow) continue
      hadOwnedCell = true

      if (charIdx >= state.text.length) return charIdx

      const ch = state.text[charIdx]!
      if (ch === '\n') {
        return charIdx + 1
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
    // 只有处理了 owned cells 的行才算"一行结束"
    if (hadOwnedCell) return charIdx
  }
  return charIdx
}

/** 找到包含 offset 的行的起始位置 */
function findLineStart(state: TextInputState, offset: number): number {
  // 向前找最近的 '\n'
  const before = state.text.slice(0, offset)
  const lastNewline = before.lastIndexOf('\n')
  if (lastNewline >= 0) return lastNewline + 1
  return 0
}
