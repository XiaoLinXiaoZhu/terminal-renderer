/**
 * TextInput 渲染 — 将文本灌入 Grid 中属于 ownerId 的格子。
 *
 * 支持自动折行、CJK 宽字符、换行符、光标定位。
 * paint 后会更新 state.cursorRow / state.cursorCol。
 */

import type { Grid } from '../grid.ts'
import { charWidth } from '../width.ts'
import type { TextInputState } from './types.ts'

/** 获取 charIdx 位置的装饰样式，无装饰返回 0 */
export function styleAt(state: TextInputState, charIdx: number): number {
  for (const d of state.decorations) {
    if (charIdx >= d.start && charIdx < d.end) return d.style
  }
  return 0
}

export function paint(state: TextInputState, grid: Grid, ownerId: string): void {
  let charIdx = state.scrollOffset
  let cursorPlaced = false
  let skipToNextRow = false

  for (let row = 0; row < grid.rows; row++) {
    skipToNextRow = false
    for (let col = 0; col < grid.cols; col++) {
      if (grid.ownerAt(row, col) !== ownerId) continue

      if (skipToNextRow) {
        grid.setChar(row, col, ' ', 0)
        continue
      }

      // 记录光标位置
      if (!cursorPlaced && charIdx === state.cursorOffset) {
        state.cursorRow = row
        state.cursorCol = col
        cursorPlaced = true
      }

      // 写入字符
      if (charIdx < state.text.length) {
        const ch = state.text[charIdx]!

        // 换行符：填充当前行剩余空格，跳到下一行
        if (ch === '\n') {
          grid.setChar(row, col, ' ', 0)
          charIdx++
          skipToNextRow = true
          continue
        }

        const w = charWidth(ch)

        if (w === 2) {
          // 宽字符：检查下一列是否也属于自己
          const nextCol = col + 1
          if (nextCol < grid.cols && grid.ownerAt(row, nextCol) === ownerId) {
            grid.setWideChar(row, col, ch, styleAt(state, charIdx))
            col++ // 跳过 continuation cell
            charIdx++
          } else {
            // 放不下 → 当前格子留空格，不递增 charIdx
            grid.setChar(row, col, ' ', 0)
          }
        } else {
          grid.setChar(row, col, ch, styleAt(state, charIdx))
          charIdx++
        }
      } else {
        // 文本已结束，填空格
        grid.setChar(row, col, ' ', 0)
      }
    }
  }

  // 光标在文本末尾且未在遍历中定位到（文本刚好填满所有格子）
  if (!cursorPlaced) {
    for (let row = grid.rows - 1; row >= 0; row--) {
      for (let col = grid.cols - 1; col >= 0; col--) {
        if (grid.ownerAt(row, col) === ownerId) {
          state.cursorRow = row
          state.cursorCol = col
          return
        }
      }
    }
  }
}
