/**
 * TextInput — 多行文本输入 Widget
 *
 * 将文本灌入 Grid 中属于自己的格子。支持自动折行、CJK 宽字符、光标定位。
 */

import { Grid } from './grid.ts'
import { charWidth } from './width.ts'

export class TextInput {
  text: string = ''
  cursorOffset: number = 0
  scrollOffset: number = 0
  stickyCol: number | null = null

  // paint 后更新的光标网格位置
  cursorRow: number = 0
  cursorCol: number = 0

  paint(grid: Grid, ownerId: string): void {
    let charIdx = this.scrollOffset
    let cursorPlaced = false

    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        if (grid.ownerAt(row, col) !== ownerId) continue

        // 记录光标位置
        if (!cursorPlaced && charIdx === this.cursorOffset) {
          this.cursorRow = row
          this.cursorCol = col
          cursorPlaced = true
        }

        // 写入字符
        if (charIdx < this.text.length) {
          const ch = this.text[charIdx]!
          const w = charWidth(ch)

          if (w === 2) {
            // 宽字符：检查下一列是否也属于自己
            const nextCol = col + 1
            if (nextCol < grid.cols && grid.ownerAt(row, nextCol) === ownerId) {
              grid.setWideChar(row, col, ch, 0)
              col++ // 跳过 continuation cell
              charIdx++
            } else {
              // 放不下 → 当前格子留空格，不递增 charIdx
              grid.setChar(row, col, ' ', 0)
            }
          } else {
            grid.setChar(row, col, ch, 0)
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
      // 光标定位到最后一个 owned cell 之后（视觉上停在最后一个位置）
      // 向后找最后一个 owned cell
      for (let row = grid.rows - 1; row >= 0; row--) {
        for (let col = grid.cols - 1; col >= 0; col--) {
          if (grid.ownerAt(row, col) === ownerId) {
            this.cursorRow = row
            this.cursorCol = col
            cursorPlaced = true
            return
          }
        }
      }
    }
  }

  // --- 编辑操作 ---

  insertChar(ch: string): void {
    this.text = this.text.slice(0, this.cursorOffset) + ch + this.text.slice(this.cursorOffset)
    this.cursorOffset += ch.length
    this.stickyCol = null
  }

  deleteBeforeCursor(): void {
    if (this.cursorOffset === 0) return
    // 处理可能的多字节字符：取 cursorOffset 前一个字符
    const before = [...this.text.slice(0, this.cursorOffset)]
    before.pop()
    const newBefore = before.join('')
    this.text = newBefore + this.text.slice(this.cursorOffset)
    this.cursorOffset = newBefore.length
    this.stickyCol = null
  }

  moveLeft(): void {
    if (this.cursorOffset <= 0) return
    // 后退一个字符（处理多字节）
    const before = [...this.text.slice(0, this.cursorOffset)]
    before.pop()
    this.cursorOffset = before.join('').length
    this.stickyCol = null
  }

  moveRight(): void {
    if (this.cursorOffset >= this.text.length) return
    // 前进一个字符（处理多字节）
    const remaining = [...this.text.slice(this.cursorOffset)]
    const nextChar = remaining[0]!
    this.cursorOffset += nextChar.length
    this.stickyCol = null
  }
}
