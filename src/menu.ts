/**
 * Menu — 列表选择器 Widget
 *
 * 将 items 渲染到 owned cells 中，每行一个 item。
 * selectedIndex 项使用高亮样式。
 */

import { Grid } from './grid.ts'
import { encodeStyle } from './grid.ts'
import { charWidth } from './width.ts'

const NORMAL_STYLE = encodeStyle(-1, -1)
const HIGHLIGHT_STYLE = encodeStyle(0, 7) // black on white (inverted)

export class Menu {
  items: string[] = []
  selectedIndex: number = 0

  paint(grid: Grid, ownerId: string): void {
    let itemIdx = 0
    let colInItem = 0
    let currentRow = -1

    for (let row = 0; row < grid.rows; row++) {
      let hasOwnedCell = false
      for (let col = 0; col < grid.cols; col++) {
        if (grid.ownerAt(row, col) !== ownerId) continue

        if (!hasOwnedCell) {
          hasOwnedCell = true
          if (currentRow >= 0) {
            // 新的一行 → 切换到下一个 item
            itemIdx++
            colInItem = 0
          }
          currentRow = row
        }

        if (itemIdx >= this.items.length) {
          grid.setChar(row, col, ' ', NORMAL_STYLE)
          continue
        }

        const item = this.items[itemIdx]!
        const style = itemIdx === this.selectedIndex ? HIGHLIGHT_STYLE : NORMAL_STYLE
        const chars = [...item]

        if (colInItem < chars.length) {
          const ch = chars[colInItem]!
          const w = charWidth(ch)
          if (w === 2) {
            const nextCol = col + 1
            if (nextCol < grid.cols && grid.ownerAt(row, nextCol) === ownerId) {
              grid.setWideChar(row, col, ch, style)
              col++
            } else {
              grid.setChar(row, col, ' ', style)
              // 不前进 colInItem，下一个位置再试
              continue
            }
          } else {
            grid.setChar(row, col, ch, style)
          }
          colInItem++
        } else {
          // item 文本结束，填充行尾空格（保持高亮背景）
          grid.setChar(row, col, ' ', style)
        }
      }
    }
  }

  selectNext(): void {
    if (this.items.length === 0) return
    this.selectedIndex = (this.selectedIndex + 1) % this.items.length
  }

  selectPrev(): void {
    if (this.items.length === 0) return
    this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length
  }
}
