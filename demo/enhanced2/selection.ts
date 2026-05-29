/**
 * enhanced2/selection — Shift+方向键文本选区
 *
 * 追踪选区起止偏移量，提供增删查改和选区高亮叠加绘制。
 */

import { Grid } from '../../src/grid.ts'
import { encodeStyle } from '../../src/grid.ts'
import { charWidth } from '../../src/width.ts'

/** 选区高亮样式：黑底白字（反相） */
export const SEL_STYLE = encodeStyle(0, 7)

export class Selection {
  start: number | null = null
  end: number | null = null

  /** 是否存在有效选区（起止不同） */
  get active(): boolean {
    return this.start !== null && this.end !== null && this.start !== this.end
  }

  /** 规范化后的 [from, to) 区间（from < to），无选区返回 null */
  get range(): [number, number] | null {
    if (this.start === null || this.end === null || this.start === this.end) return null
    return this.start < this.end
      ? [this.start, this.end]
      : [this.end, this.start]
  }

  /** 清除选区 */
  clear(): void {
    this.start = null
    this.end = null
  }

  /** 开始选区（锚定起点），同时设置终点。用于 shift+方向键 首次按下 */
  begin(at: number): void {
    this.start = at
    this.end = at
  }

  /** 扩展选区终点 */
  extendTo(at: number): void {
    this.end = at
  }

  /** 从 text 中删除选区内容，返回新 text */
  deleteFrom(text: string): string {
    const r = this.range
    if (!r) return text
    this.clear()
    return text.slice(0, r[0]) + text.slice(r[1])
  }

  /** 获取选区内的文本 */
  selectedText(text: string): string {
    const r = this.range
    if (!r) return ''
    return text.slice(r[0], r[1])
  }

  /**
   * 在已绘制的 grid 上叠加选区样式。
   * 遍历 ownerId 所属 cell，模拟与 TextInput.paint 相同的字符推进逻辑，
   * 将落入 [range[0], range[1]) 区间的 cell 样式替换为 SEL_STYLE。
   */
  paintOverlay(grid: Grid, ownerId: string, scrollOffset: number, text: string): void {
    const range = this.range
    if (!range) return

    let charIdx = scrollOffset

    for (let row = 0; row < grid.rows; row++) {
      let skipToNextRow = false
      for (let col = 0; col < grid.cols; col++) {
        if (grid.ownerAt(row, col) !== ownerId) continue
        if (skipToNextRow) continue
        if (charIdx >= text.length) return

        const inSelection = charIdx >= range[0] && charIdx < range[1]

        const ch = text[charIdx]!
        if (ch === '\n') {
          if (inSelection) {
            grid.setChar(row, col, ' ', SEL_STYLE)
          }
          charIdx++
          skipToNextRow = true
          continue
        }

        const w = charWidth(ch)
        if (w === 2) {
          const nextCol = col + 1
          if (nextCol < grid.cols && grid.ownerAt(row, nextCol) === ownerId) {
            if (inSelection) {
              // setWideChar 正确管理主 cell + continuation cell 的样式
              grid.setWideChar(row, col, ch, SEL_STYLE)
            }
            col++
            charIdx++
          } else {
            // CJK 放不下当前行，不推进 charIdx；但如果选中则覆盖样式
            if (inSelection) {
              grid.setChar(row, col, grid.charAt(row, col), SEL_STYLE)
            }
          }
        } else {
          if (inSelection) {
            grid.setChar(row, col, grid.charAt(row, col), SEL_STYLE)
          }
          charIdx++
        }
      }
    }
  }
}
