/**
 * Grid — 虚拟终端缓冲区
 *
 * SoA 存储模型 + cell 粒度 dirty tracking + flush 上屏。
 */

export const IS_CONTINUATION = 1

export class Grid {
  readonly rows: number
  readonly cols: number

  private chars: string[][]
  private styles: number[][]
  private owners: string[][]
  private flags: number[][]
  private dirty: boolean[][]

  private constructor(cols: number, rows: number) {
    this.cols = cols
    this.rows = rows
    this.chars = Array.from({ length: rows }, () => Array<string>(cols).fill(' '))
    this.styles = Array.from({ length: rows }, () => Array<number>(cols).fill(0))
    this.owners = Array.from({ length: rows }, () => Array<string>(cols).fill(''))
    this.flags = Array.from({ length: rows }, () => Array<number>(cols).fill(0))
    this.dirty = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false))
  }

  static create(cols: number, rows: number): Grid {
    return new Grid(cols, rows)
  }

  // --- 写入 ---

  setChar(row: number, col: number, char: string, style: number): void {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return

    // 如果写入位置是 continuation cell，先清理关联的主 cell
    if (this.flags[row]![col]! & IS_CONTINUATION) {
      this.clearMainCellOf(row, col)
    }

    // 如果写入位置是宽字符的主 cell（右边是 continuation），清理 continuation
    if (col + 1 < this.cols && (this.flags[row]![col + 1]! & IS_CONTINUATION)) {
      // 只清理当 chars[row][col] 是宽字符时（即有 continuation 跟随）
      this.chars[row]![col + 1] = ' '
      this.styles[row]![col + 1] = 0
      this.flags[row]![col + 1] = 0
      this.dirty[row]![col + 1] = true
    }

    if (this.chars[row]![col] === char && this.styles[row]![col] === style && !(this.flags[row]![col]! & IS_CONTINUATION)) {
      return // 值相同且不是 continuation → 不标记 dirty
    }

    this.chars[row]![col] = char
    this.styles[row]![col] = style
    this.flags[row]![col] = 0
    this.dirty[row]![col] = true
  }

  setWideChar(row: number, col: number, char: string, style: number): void {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return

    // 行末放不下宽字符
    if (col + 1 >= this.cols) {
      this.setChar(row, col, ' ', 0)
      return
    }

    // 如果写入位置是 continuation cell，先清理关联的主 cell
    if (this.flags[row]![col]! & IS_CONTINUATION) {
      this.clearMainCellOf(row, col)
    }

    // 如果主 cell 位置的右邻居是已有的 continuation（当前 cell 本身是宽字符），
    // 这已经在下面覆盖 continuation 位置时处理

    // 如果 continuation 位置（col+1）本身是宽字符的主 cell，清理它的 continuation
    if (col + 2 < this.cols && (this.flags[row]![col + 2]! & IS_CONTINUATION)) {
      this.chars[row]![col + 2] = ' '
      this.styles[row]![col + 2] = 0
      this.flags[row]![col + 2] = 0
      this.dirty[row]![col + 2] = true
    }

    // 如果 continuation 位置是另一个宽字符的 continuation，清理那个主 cell
    if (this.flags[row]![col + 1]! & IS_CONTINUATION) {
      this.clearMainCellOf(row, col + 1)
    }

    // 写入主 cell
    const oldChar = this.chars[row]![col]
    const oldStyle = this.styles[row]![col]
    const oldFlags = this.flags[row]![col]
    if (oldChar !== char || oldStyle !== style || oldFlags !== 0) {
      this.chars[row]![col] = char
      this.styles[row]![col] = style
      this.flags[row]![col] = 0
      this.dirty[row]![col] = true
    }

    // 写入 continuation cell
    const oldContChar = this.chars[row]![col + 1]
    const oldContStyle = this.styles[row]![col + 1]
    const oldContFlags = this.flags[row]![col + 1]
    if (oldContChar !== '' || oldContStyle !== style || oldContFlags !== IS_CONTINUATION) {
      this.chars[row]![col + 1] = ''
      this.styles[row]![col + 1] = style
      this.flags[row]![col + 1] = IS_CONTINUATION
      this.dirty[row]![col + 1] = true
    }
  }

  setOwner(row: number, col: number, owner: string): void {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return
    this.owners[row]![col] = owner
  }

  setOwnerAll(owner: string): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.owners[r]![c] = owner
      }
    }
  }

  setFlags(row: number, col: number, value: number): void {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return
    this.flags[row]![col] = value
  }

  // --- 读取 ---

  charAt(row: number, col: number): string {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return ''
    return this.chars[row]![col]!
  }

  styleAt(row: number, col: number): number {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return 0
    return this.styles[row]![col]!
  }

  ownerAt(row: number, col: number): string {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return ''
    return this.owners[row]![col]!
  }

  flagsAt(row: number, col: number): number {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return 0
    return this.flags[row]![col]!
  }

  isDirty(row: number, col: number): boolean {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return false
    return this.dirty[row]![col]!
  }

  // --- 上屏 ---

  flush(stream: { write(s: string): void }, rowOffset: number = 0): void {
    let lastRow = -1
    let lastCol = -1
    let currentStyle = -1 // impossible initial value to force first SGR

    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        if (!this.dirty[row]![col]) continue
        if (this.flags[row]![col]! & IS_CONTINUATION) {
          this.dirty[row]![col] = false
          continue
        }

        // 移动光标
        if (row !== lastRow || col !== lastCol + 1) {
          stream.write(`\x1b[${row + 1 + rowOffset};${col + 1}H`)
        }

        // 设置样式
        if (this.styles[row]![col] !== currentStyle) {
          currentStyle = this.styles[row]![col]!
          stream.write(sgrFromEncoded(currentStyle))
        }

        // 写入字符
        stream.write(this.chars[row]![col]!)
        lastRow = row
        lastCol = col

        this.dirty[row]![col] = false
      }
    }
  }

  // --- Resize ---

  /**
   * 重建 Grid 为新尺寸。重置所有内容为空格、dirty 全部标记为 true。
   */
  resize(cols: number, rows: number): void {
    (this as { cols: number }).cols = cols;
    (this as { rows: number }).rows = rows;
    this.chars = Array.from({ length: rows }, () => Array<string>(cols).fill(' '))
    this.styles = Array.from({ length: rows }, () => Array<number>(cols).fill(0))
    this.owners = Array.from({ length: rows }, () => Array<string>(cols).fill(''))
    this.flags = Array.from({ length: rows }, () => Array<number>(cols).fill(0))
    this.dirty = Array.from({ length: rows }, () => Array<boolean>(cols).fill(true))
  }

  /**
   * 计算当前 Grid 内容在 newCols 宽度下会占多少行（预测终端 reflow）。
   * 基于每行实际内容宽度（非尾部空格）进行估算。
   */
  computeReflowHeight(newCols: number): number {
    let totalRows = 0
    for (let row = 0; row < this.rows; row++) {
      // 找到该行实际内容的最后一列（非空格）
      let contentWidth = 0
      for (let col = this.cols - 1; col >= 0; col--) {
        if (this.chars[row]![col] !== ' ' || (this.flags[row]![col]! & IS_CONTINUATION)) {
          contentWidth = col + 1
          break
        }
      }
      // 空行至少占 1 行
      totalRows += Math.max(1, Math.ceil(contentWidth / newCols))
    }
    return totalRows
  }

  /**
   * 清除终端上的旧内容（基于 reflow 后的行数）。
   */
  clearFromTerminal(stream: { write(s: string): void }, reflowedHeight: number): void {
    // 移动到第一行，逐行清除
    stream.write(`\x1b[${reflowedHeight}A`) // 上移
    for (let i = 0; i < reflowedHeight; i++) {
      stream.write('\x1b[2K') // 清除当前行
      if (i < reflowedHeight - 1) stream.write('\x1b[B') // 下移
    }
    stream.write(`\x1b[${reflowedHeight - 1}A`) // 回到顶部
  }

  // --- 内部 ---

  /** 找到 continuation cell 对应的主 cell 并清理它 */
  private clearMainCellOf(row: number, col: number): void {
    // 向左寻找主 cell
    for (let c = col - 1; c >= 0; c--) {
      if (!(this.flags[row]![c]! & IS_CONTINUATION)) {
        // 这是主 cell
        this.chars[row]![c] = ' '
        this.styles[row]![c] = 0
        this.flags[row]![c] = 0
        this.dirty[row]![c] = true
        break
      }
    }
    // 清除自身的 continuation flag
    this.flags[row]![col] = 0
  }
}

// --- 样式编码 ---

// bits 0-3: fg (0=default, 1-8=basic colors)
// bits 4-7: bg (0=default, 1-8=basic colors)
// bits 8-11: flags (bold=0x100, dim=0x200, italic=0x400, underline=0x800)

export const BOLD = 1 << 8
export const DIM = 1 << 9
export const ITALIC = 1 << 10
export const UNDERLINE = 1 << 11

export function encodeStyle(fg: number, bg: number, flags: number = 0): number {
  return (fg & 0xF) | ((bg & 0xF) << 4) | (flags & 0xF00)
}

// fg 颜色值 → ANSI code 映射
const FG_CODES: Record<number, number> = {
  0: 39, // default
  1: 30, // black
  2: 31, // red
  3: 32, // green
  4: 33, // yellow
  5: 34, // blue
  6: 35, // magenta
  7: 36, // cyan
  8: 37, // white
}

const BG_CODES: Record<number, number> = {
  0: 49, // default
  1: 40, // black
  2: 41, // red
  3: 42, // green
  4: 43, // yellow
  5: 44, // blue
  6: 45, // magenta
  7: 46, // cyan
  8: 47, // white
}

export function sgrFromEncoded(style: number): string {
  if (style === 0) return '\x1b[0m'

  const parts: number[] = [0] // always reset first
  const fg = style & 0xF
  const bg = (style >> 4) & 0xF
  const flags = style & 0xF00

  if (fg !== 0) parts.push(FG_CODES[fg] ?? 39)
  if (bg !== 0) parts.push(BG_CODES[bg] ?? 49)
  if (flags & BOLD) parts.push(1)
  if (flags & DIM) parts.push(2)
  if (flags & ITALIC) parts.push(3)
  if (flags & UNDERLINE) parts.push(4)

  return `\x1b[${parts.join(';')}m`
}
