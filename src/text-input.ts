/**
 * TextInput — 多行文本输入 Widget
 *
 * 将文本灌入 Grid 中属于自己的格子。支持自动折行、CJK 宽字符、
 * 换行符、光标定位、垂直导航、滚动。
 */

import { Grid } from './grid.ts'
import { charWidth } from './width.ts'

export class TextInput {
  text: string = ''
  cursorOffset: number = 0
  scrollOffset: number = 0
  stickyCol: number | null = null
  decorations: { start: number; end: number; style: number }[] = []

  // paint 后更新的光标网格位置
  cursorRow: number = 0
  cursorCol: number = 0

  paint(grid: Grid, ownerId: string): void {
    let charIdx = this.scrollOffset
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
        if (!cursorPlaced && charIdx === this.cursorOffset) {
          this.cursorRow = row
          this.cursorCol = col
          cursorPlaced = true
        }

        // 写入字符
        if (charIdx < this.text.length) {
          const ch = this.text[charIdx]!

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
              grid.setWideChar(row, col, ch, this.styleAt(charIdx))
              col++ // 跳过 continuation cell
              charIdx++
            } else {
              // 放不下 → 当前格子留空格，不递增 charIdx
              grid.setChar(row, col, ' ', 0)
            }
          } else {
            grid.setChar(row, col, ch, this.styleAt(charIdx))
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
            this.cursorRow = row
            this.cursorCol = col
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
    const before = [...this.text.slice(0, this.cursorOffset)]
    before.pop()
    const newBefore = before.join('')
    this.text = newBefore + this.text.slice(this.cursorOffset)
    this.cursorOffset = newBefore.length
    this.stickyCol = null
  }

  moveLeft(): void {
    if (this.cursorOffset <= 0) return
    const before = [...this.text.slice(0, this.cursorOffset)]
    before.pop()
    this.cursorOffset = before.join('').length
    this.stickyCol = null
  }

  moveRight(): void {
    if (this.cursorOffset >= this.text.length) return
    const remaining = [...this.text.slice(this.cursorOffset)]
    const nextChar = remaining[0]!
    this.cursorOffset += nextChar.length
    this.stickyCol = null
  }

  // --- 垂直导航 ---

  moveUp(grid: Grid, ownerId: string): void {
    const targetCol = this.stickyCol ?? this.cursorCol
    if (this.stickyCol === null) this.stickyCol = this.cursorCol

    const targetRow = this.cursorRow - 1
    if (targetRow < 0 || !this.rowHasOwner(grid, targetRow, ownerId)) {
      // 有内容在视口上方：回退 scrollOffset 并重新定位
      if (this.scrollOffset > 0) {
        const prevStart = this.findPrevVisualLineStart(grid, ownerId)
        if (prevStart < this.scrollOffset) {
          this.cursorOffset = prevStart + this.visualColToCharCount(prevStart, targetCol, grid, ownerId)
        }
      }
      return
    }

    this.cursorOffset = this.resolveCharIndex(grid, ownerId, targetRow, targetCol)
  }

  moveDown(grid: Grid, ownerId: string): void {
    const targetCol = this.stickyCol ?? this.cursorCol
    if (this.stickyCol === null) this.stickyCol = this.cursorCol

    const targetRow = this.cursorRow + 1
    if (targetRow >= grid.rows || !this.rowHasOwner(grid, targetRow, ownerId)) {
      // 有内容在视口下方：前进到下一视觉行
      const nextStart = this.findNextVisualLineStart(grid, ownerId)
      if (nextStart > this.cursorOffset && nextStart <= this.text.length) {
        this.cursorOffset = nextStart + this.visualColToCharCount(nextStart, targetCol, grid, ownerId)
      }
      return
    }

    this.cursorOffset = this.resolveCharIndex(grid, ownerId, targetRow, targetCol)
  }

  // --- 滚动 ---

  /**
   * 确保光标在视口内。如果光标超出当前可见区域则调整 scrollOffset。
   * 需要在编辑/移动后、paint 前调用。
   * 返回是否发生了调整。
   */
  ensureCursorVisible(grid: Grid, ownerId: string): boolean {
    // 计算 owned 行数（视口高度）
    const ownedRows = this.getOwnedRowCount(grid, ownerId)
    if (ownedRows === 0) return false

    // 先用当前 scrollOffset paint 一次来确定光标位置
    this.paint(grid, ownerId)

    // 检查光标是否超出底部（cursorOffset 在 paint 结束时仍未被放置说明在视口外）
    // 更精确的方法：模拟遍历计算光标所在的"逻辑行"

    let adjusted = false

    // 向下滚动：如果光标在内容中的位置使得 paint 无法将其定位在视口内
    // 策略：反复增加 scrollOffset 直到光标在视口内
    while (this.isCursorBelowViewport(grid, ownerId)) {
      const prev = this.scrollOffset
      this.scrollOffset = this.advanceScrollOffset(grid, ownerId)
      adjusted = true
      if (this.scrollOffset >= this.text.length) break
      if (this.scrollOffset === prev) break // safety: no progress
    }

    // 向上滚动：如果 cursorOffset < scrollOffset
    if (this.cursorOffset < this.scrollOffset) {
      this.scrollOffset = this.findLineStart(this.cursorOffset)
      adjusted = true
    }

    return adjusted
  }

  /** 获取 charIdx 位置的装饰样式，无装饰返回 0 */
  private styleAt(charIdx: number): number {
    for (const d of this.decorations) {
      if (charIdx >= d.start && charIdx < d.end) return d.style
    }
    return 0
  }

  /** 检查指定行是否有属于 ownerId 的 cell */
  private rowHasOwner(grid: Grid, row: number, ownerId: string): boolean {
    if (row < 0 || row >= grid.rows) return false
    for (let col = 0; col < grid.cols; col++) {
      if (grid.ownerAt(row, col) === ownerId) return true
    }
    return false
  }

  // --- 内部辅助 ---

  /**
   * 从 (targetRow, targetCol) 反查 charIndex。
   * 重新模拟 paint 遍历来定位。
   */
  private resolveCharIndex(grid: Grid, ownerId: string, targetRow: number, targetCol: number): number {
    let charIdx = this.scrollOffset
    let lastCharIdxOnTargetRow = -1
    let firstCharIdxOnTargetRow = -1

    for (let row = 0; row < grid.rows; row++) {
      let skipToNextRow = false
      for (let col = 0; col < grid.cols; col++) {
        if (grid.ownerAt(row, col) !== ownerId) continue
        if (skipToNextRow) continue

        if (charIdx >= this.text.length) {
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
            return this.advanceOneChar(lastCharIdxOnTargetRow)
          }
          return charIdx
        }

        const ch = this.text[charIdx]!
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
      return this.advanceOneChar(lastCharIdxOnTargetRow)
    }
    return charIdx
  }

  /** 前进一个字符的 offset */
  private advanceOneChar(offset: number): number {
    if (offset >= this.text.length) return offset
    const remaining = [...this.text.slice(offset)]
    if (remaining.length === 0) return offset
    return offset + remaining[0]!.length
  }

  /** 获取 owned 行数 */
  private getOwnedRowCount(grid: Grid, ownerId: string): number {
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
  private isCursorBelowViewport(grid: Grid, ownerId: string): boolean {
    // 模拟 paint 看 cursorOffset 是否在可渲染范围内
    let charIdx = this.scrollOffset
    for (let row = 0; row < grid.rows; row++) {
      let skipToNextRow = false
      for (let col = 0; col < grid.cols; col++) {
        if (grid.ownerAt(row, col) !== ownerId) continue
        if (skipToNextRow) continue

        if (charIdx === this.cursorOffset) return false // 光标在视口内

        if (charIdx >= this.text.length) return false // 文本已结束，光标也在视口内

        const ch = this.text[charIdx]!
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
  private advanceScrollOffset(grid: Grid, ownerId: string): number {
    let charIdx = this.scrollOffset
    for (let row = 0; row < grid.rows; row++) {
      let skipToNextRow = false
      let hadOwnedCell = false
      for (let col = 0; col < grid.cols; col++) {
        if (grid.ownerAt(row, col) !== ownerId) continue
        if (skipToNextRow) continue
        hadOwnedCell = true

        if (charIdx >= this.text.length) return charIdx

        const ch = this.text[charIdx]!
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
  private findLineStart(offset: number): number {
    // 向前找最近的 '\n'
    const before = this.text.slice(0, offset)
    const lastNewline = before.lastIndexOf('\n')
    if (lastNewline >= 0) return lastNewline + 1
    return 0
  }

  /** 从当前光标行末找到下一个视觉行的起始 charIdx */
  private findNextVisualLineStart(grid: Grid, ownerId: string): number {
    // 模拟 paint 从 scrollOffset 开始，找到光标所在视觉行的末尾
    let charIdx = this.scrollOffset
    let onCursorRow = false
    for (let row = 0; row < grid.rows; row++) {
      let skipToNextRow = false
      for (let col = 0; col < grid.cols; col++) {
        if (grid.ownerAt(row, col) !== ownerId) continue
        if (skipToNextRow) continue

        if (row === this.cursorRow) onCursorRow = true

        if (charIdx >= this.text.length) return this.text.length

        if (onCursorRow && row > this.cursorRow) {
          // 刚过光标行 → 当前 charIdx 就是下一行起始
          return charIdx
        }

        const ch = this.text[charIdx]!
        if (ch === '\n') {
          if (row === this.cursorRow) return charIdx + 1
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
      if (row === this.cursorRow) {
        // 光标行结束（自动折行），charIdx 是下一行起始
        return charIdx
      }
    }
    return charIdx
  }

  /** 找到当前 scrollOffset 对应的视觉行的前一行起始 */
  private findPrevVisualLineStart(grid: Grid, ownerId: string): number {
    if (this.scrollOffset === 0) return 0
    // 找到 scrollOffset 前一个字符所在行的起始
    // 简化：找最近的 '\n' 或用 grid 宽度回退
    const before = this.text.slice(0, this.scrollOffset)
    const lastNl = before.lastIndexOf('\n')
    if (lastNl >= 0 && lastNl === this.scrollOffset - 1) {
      // scrollOffset 紧跟在 '\n' 后面，找再上一个行起始
      const beforeNl = this.text.slice(0, lastNl)
      const prevNl = beforeNl.lastIndexOf('\n')
      return prevNl >= 0 ? prevNl + 1 : 0
    }
    if (lastNl >= 0) return lastNl + 1
    return 0
  }

  /** 从 startOffset 开始模拟灌入，返回到达 targetCol 时经过的字符数 */
  private visualColToCharCount(startOffset: number, targetCol: number, grid: Grid, ownerId: string): number {
    let charIdx = startOffset
    let colCount = 0
    // 找第一行的 owned cols 宽度来模拟
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        if (grid.ownerAt(row, col) !== ownerId) continue
        if (colCount >= targetCol) return charIdx - startOffset
        if (charIdx >= this.text.length) return charIdx - startOffset

        const ch = this.text[charIdx]!
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
}
