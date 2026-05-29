/**
 * Viewport — 终端尾部动态区域管理器
 *
 * 封装"在终端尾部渲染一个不干扰历史的动态区域"的完整生命周期。
 * 全屏渲染只是动态区域高度等于终端高度的特殊情况。
 *
 * 核心职责：
 * - mount: 在终端尾部预留空间
 * - render: 回到 grid home → flush → 定位光标到目标位置
 * - clear: 清除动态区域
 * - commit: 固化内容到历史，重新预留空间
 */

import { Grid } from './grid.ts'

export interface CursorPosition {
  row: number
  col: number
}

export class Viewport {
  readonly grid: Grid
  private stream: { write(s: string): void }
  private cursorRow: number = 0 // 终端光标相对于 grid home 的行位置

  constructor(grid: Grid, stream: { write(s: string): void }) {
    this.grid = grid
    this.stream = stream
  }

  /**
   * 开始 DEC 2026 同步输出。发送后终端会在垂直消隐期刷新画面，消除撕裂/闪烁。
   * 必须与 endSync() 配对使用。
   */
  beginSync(): void {
    this.stream.write('\x1b[?2026h')
  }

  /**
   * 结束 DEC 2026 同步输出。发送后终端恢复普通刷新模式。
   * 必须与 beginSync() 配对使用。
   */
  endSync(): void {
    this.stream.write('\x1b[?2026l')
  }

  /**
   * 在终端尾部预留空间并定位到 grid home。
   * 输出 grid.rows 个换行确保终端有足够空间，然后上移回到起始位置。
   */
  mount(): void {
    for (let i = 0; i < this.grid.rows; i++) {
      this.stream.write('\n')
    }
    this.stream.write(`\x1b[${this.grid.rows}A`)
    this.cursorRow = 0
  }

  /**
   * 完整渲染周期：回到 grid home → flush dirty cells → 定位光标。
   *
   * @param cursorTarget 渲染结束后光标应停留的位置（通常是 TextInput 的光标位置）。
   *                     省略时光标停在 grid home (0, 0)。
   */
  render(cursorTarget?: CursorPosition): void {
    // 1. 回到 grid home
    this.moveTo(0, 0)

    // 2. flush dirty cells
    const endPos = this.grid.flush(this.stream)

    // 3. 重置样式（防止 flush 输出的样式泄漏到后续内容）
    this.stream.write('\x1b[0m')

    // 4. 从 endPos 移动到 cursorTarget
    const target = cursorTarget ?? { row: 0, col: 0 }
    this.moveFromTo(endPos, target)

    // 5. 更新追踪位置
    this.cursorRow = target.row
  }

  /**
   * 清除动态区域（从 grid home 开始向下清除）。
   * 清除后光标停在 grid home 位置。
   */
  clear(): void {
    this.moveTo(0, 0)
    this.stream.write('\x1b[J') // clear from cursor to end of screen
    this.cursorRow = 0
  }

  /**
   * 固化内容到历史：清除动态区域，输出固定文本，重新预留空间。
   *
   * @param output 要固化到历史的文本（应以 \n 结尾）
   */
  commit(output: string): void {
    this.clear()
    this.stream.write(output)
    this.mount()
  }

  /**
   * resize 后重新挂载。内部处理 reflow 清除 + grid resize + 重新预留空间。
   * 必须在 grid.resize() 之前调用（需要旧内容计算 reflow）。
   *
   * @param newCols 新的终端列数
   * @param newRows 新的 grid 行数（省略则保持当前行数）
   */
  remount(newCols: number, newRows?: number): void {
    // 计算旧内容在新宽度下的 reflow 行数
    const reflowedHeight = this.grid.computeReflowHeight(newCols)

    // 终端 reflow 时所有行的额外折叠行都会推动光标下移
    // moveUp = 原 cursorRow + 全部行的额外 reflow 行数
    const moveUp = this.cursorRow + (reflowedHeight - this.grid.rows)
    if (moveUp > 0) {
      this.stream.write(`\x1b[${moveUp}A`)
    }
    this.stream.write('\r')

    // 清除从光标到屏幕底部的所有内容
    this.stream.write('\x1b[J')
    this.cursorRow = 0

    // resize grid
    const rows = newRows ?? this.grid.rows
    this.grid.resize(newCols, rows)

    // 重新预留空间
    this.mount()
  }

  // --- 内部辅助 ---

  /** 从当前 cursorRow 移动到 grid 内指定位置 */
  private moveTo(row: number, col: number): void {
    // 垂直移动
    if (this.cursorRow > row) {
      this.stream.write(`\x1b[${this.cursorRow - row}A`)
    } else if (this.cursorRow < row) {
      this.stream.write(`\x1b[${row - this.cursorRow}B`)
    }
    // 水平定位：回到行首再右移
    this.stream.write('\r')
    if (col > 0) {
      this.stream.write(`\x1b[${col}C`)
    }
    this.cursorRow = row
  }

  /** 从 from 位置移动到 to 位置（相对定位） */
  private moveFromTo(from: CursorPosition, to: CursorPosition): void {
    // 垂直移动
    if (from.row > to.row) {
      this.stream.write(`\x1b[${from.row - to.row}A`)
    } else if (from.row < to.row) {
      this.stream.write(`\x1b[${to.row - from.row}B`)
    }
    // 水平定位：回到行首再右移
    this.stream.write('\r')
    if (to.col > 0) {
      this.stream.write(`\x1b[${to.col}C`)
    }
  }
}

// --- 工具函数 ---

/**
 * 创建一个 debounced 版本的函数。在最后一次调用后等待 ms 毫秒才执行。
 * 适用于 resize 事件防抖。
 */
export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: any[]) => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; fn(...args) }, ms)
  }) as unknown as T
}
