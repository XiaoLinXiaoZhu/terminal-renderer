/**
 * Grid — 虚拟终端缓冲区
 *
 * SoA 存储模型 + cell 粒度 dirty tracking + flush 上屏。
 *
 * 样式编码（32-bit，仅用低 28 bits）：
 *   bits 0-7:   fg 值
 *   bits 8-15:  bg 值
 *   bits 16-19: flags (bold/dim/italic/underline)
 *   bits 20-23: fg 类型 (0=basic, 1=256色, 2=truecolor)
 *   bits 24-27: bg 类型 (0=basic, 1=256色, 2=truecolor)
 *   bits 28-31: 保留
 *
 * fg/bg 类型 = 0 (basic):
 *   值 0 = default, 1-8 = 基本色 (30-37), 9-16 = 亮色 (90-97)
 *
 * fg/bg 类型 = 1 (256色):
 *   值 0-255 = 256 色调色板索引
 *
 * fg/bg 类型 = 2 (truecolor):
 *   值 = 全局 truecolor 注册表索引（0-255，共 256 个槽位）
 */

// ── 全局 truecolor 注册表 ──
// fgRegistry 和 bgRegistry 各自维护，避免 fg/bg 共用索引时碰撞
const fgRegistry: [number, number, number][] = []  // [r, g, b]
const bgRegistry: [number, number, number][] = []  // [r, g, b]

function registerFgColor(r: number, g: number, b: number): number {
  // 先查找是否已存在
  for (let i = 0; i < fgRegistry.length; i++) {
    const entry = fgRegistry[i]!
    if (entry[0] === r && entry[1] === g && entry[2] === b) return i
  }
  if (fgRegistry.length >= 256) throw new Error('Too many truecolor fg colors (max 256)')
  const idx = fgRegistry.length
  fgRegistry.push([r, g, b])
  return idx
}

function registerBgColor(r: number, g: number, b: number): number {
  for (let i = 0; i < bgRegistry.length; i++) {
    const entry = bgRegistry[i]!
    if (entry[0] === r && entry[1] === g && entry[2] === b) return i
  }
  if (bgRegistry.length >= 256) throw new Error('Too many truecolor bg colors (max 256)')
  const idx = bgRegistry.length
  bgRegistry.push([r, g, b])
  return idx
}

// ── 导出常量 ──

export const IS_CONTINUATION = 1

// Flags（bits 16-19）
export const BOLD      = 1 << 16
export const DIM       = 1 << 17
export const ITALIC    = 1 << 18
export const UNDERLINE = 1 << 19

// 类型偏移
const FG_TYPE_SHIFT = 20
const BG_TYPE_SHIFT = 24

// 类型值
const TYPE_BASIC    = 0
const TYPE_256      = 1
const TYPE_TRUECOLOR = 2

// ── 公开 API ──

/**
 * 基本色 / 亮色样式。
 * fg, bg: 0=default, 1-8=基本色 (30-37), 9-16=亮色 (90-97)。
 */
export function encodeStyle(fg: number, bg: number, flags: number = 0): number {
  return (fg & 0xFF) | ((bg & 0xFF) << 8) | (flags & 0xF0000) |
    (TYPE_BASIC << FG_TYPE_SHIFT) | (TYPE_BASIC << BG_TYPE_SHIFT)
}

/**
 * 256 色调色板样式。
 * fg, bg: 0-255。（0 = 调色板索引 0，不同于 default；如需 default 用 encodeStyle）
 */
export function encodeStyle256(fg: number, bg: number, flags: number = 0): number {
  return (fg & 0xFF) | ((bg & 0xFF) << 8) | (flags & 0xF0000) |
    (TYPE_256 << FG_TYPE_SHIFT) | (TYPE_256 << BG_TYPE_SHIFT)
}

/**
 * Truecolor (24-bit RGB) 样式。
 * 每个参数为 [r, g, b] 元组（0-255），传入 [0,0,0] 表示 default。
 */
export function encodeStyleRGB(
  fg: [number, number, number],
  bg: [number, number, number],
  flags: number = 0,
): number {
  const fgIdx = registerFgColor(fg[0], fg[1], fg[2])
  const bgIdx = registerBgColor(bg[0], bg[1], bg[2])
  return (fgIdx & 0xFF) | ((bgIdx & 0xFF) << 8) | (flags & 0xF0000) |
    (TYPE_TRUECOLOR << FG_TYPE_SHIFT) | (TYPE_TRUECOLOR << BG_TYPE_SHIFT)
}

// ── SGR 生成 ──

// 基本色映射（type=basic, value 1-8 → 30-37）
const BASIC_FG: Record<number, number> = {
  0: 39,
  1: 30, 2: 31, 3: 32, 4: 33, 5: 34, 6: 35, 7: 36, 8: 37,
}
const BASIC_BG: Record<number, number> = {
  0: 49,
  1: 40, 2: 41, 3: 42, 4: 43, 5: 44, 6: 45, 7: 46, 8: 47,
}

// 亮色映射（type=basic, value 9-16 → 90-97）
const BRIGHT_FG: Record<number, number> = {
  9: 90, 10: 91, 11: 92, 12: 93, 13: 94, 14: 95, 15: 96, 16: 97,
}
const BRIGHT_BG: Record<number, number> = {
  9: 100, 10: 101, 11: 102, 12: 103, 13: 104, 14: 105, 15: 106, 16: 107,
}

function fgSGR(kind: number, value: number): string {
  if (kind === TYPE_BASIC) {
    if (value === 0) return '39'
    if (value <= 8) return String(BASIC_FG[value] ?? 39)
    return String(BRIGHT_FG[value] ?? 39)
  }
  if (kind === TYPE_256) {
    return `38;5;${value & 0xFF}`
  }
  if (kind === TYPE_TRUECOLOR) {
    const rgb = fgRegistry[value & 0xFF]
    if (!rgb) return '39'
    return `38;2;${rgb[0]};${rgb[1]};${rgb[2]}`
  }
  return '39'
}

function bgSGR(kind: number, value: number): string {
  if (kind === TYPE_BASIC) {
    if (value === 0) return '49'
    if (value <= 8) return String(BASIC_BG[value] ?? 49)
    return String(BRIGHT_BG[value] ?? 49)
  }
  if (kind === TYPE_256) {
    return `48;5;${value & 0xFF}`
  }
  if (kind === TYPE_TRUECOLOR) {
    const rgb = bgRegistry[value & 0xFF]
    if (!rgb) return '49'
    return `48;2;${rgb[0]};${rgb[1]};${rgb[2]}`
  }
  return '49'
}

export function sgrFromEncoded(style: number): string {
  if (style === 0) return '\x1b[0m'

  const fgVal = style & 0xFF
  const bgVal = (style >> 8) & 0xFF
  const flags = style & 0xF0000
  const fgKind = (style >> FG_TYPE_SHIFT) & 0xF
  const bgKind = (style >> BG_TYPE_SHIFT) & 0xF

  const parts: string[] = ['0'] // always reset first

  const fgPart = fgSGR(fgKind, fgVal)
  if (fgPart !== '39') parts.push(fgPart)

  const bgPart = bgSGR(bgKind, bgVal)
  if (bgPart !== '49') parts.push(bgPart)

  if (flags & BOLD)      parts.push('1')
  if (flags & DIM)       parts.push('2')
  if (flags & ITALIC)    parts.push('3')
  if (flags & UNDERLINE) parts.push('4')

  return `\x1b[${parts.join(';')}m`
}

// ── Grid ──

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

  flush(stream: { write(s: string): void }): { row: number; col: number } {
    // 调用者必须在调用前将终端光标定位到 Grid 的 home（左上角）
    let curRow = 0
    let curCol = 0
    let currentStyle = -1

    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        if (!this.dirty[row]![col]) continue
        if (this.flags[row]![col]! & IS_CONTINUATION) {
          this.dirty[row]![col] = false
          continue
        }

        // 移动光标到 (row, col)
        if (row !== curRow || col !== curCol) {
          if (row > curRow) stream.write(`\x1b[${row - curRow}B`)
          else if (row < curRow) stream.write(`\x1b[${curRow - row}A`)
          stream.write(`\r`)
          if (col > 0) stream.write(`\x1b[${col}C`)
          curRow = row
          curCol = col
        }

        // 设置样式
        if (this.styles[row]![col] !== currentStyle) {
          currentStyle = this.styles[row]![col]!
          stream.write(sgrFromEncoded(currentStyle))
        }

        // 写入字符
        stream.write(this.chars[row]![col]!)
        curCol++
        // 宽字符会让终端光标前进 2 列
        if (col + 1 < this.cols && (this.flags[row]![col + 1]! & IS_CONTINUATION)) {
          curCol++
        }

        this.dirty[row]![col] = false
      }
    }

    return { row: curRow, col: curCol }
  }

  // --- Resize ---

  resize(cols: number, rows: number): void {
    (this as { cols: number }).cols = cols;
    (this as { rows: number }).rows = rows;
    this.chars = Array.from({ length: rows }, () => Array<string>(cols).fill(' '))
    this.styles = Array.from({ length: rows }, () => Array<number>(cols).fill(0))
    this.owners = Array.from({ length: rows }, () => Array<string>(cols).fill(''))
    this.flags = Array.from({ length: rows }, () => Array<number>(cols).fill(0))
    this.dirty = Array.from({ length: rows }, () => Array<boolean>(cols).fill(true))
  }

  computeReflowHeight(newCols: number): number {
    let totalRows = 0
    for (let row = 0; row < this.rows; row++) {
      let contentWidth = 0
      for (let col = this.cols - 1; col >= 0; col--) {
        if (this.chars[row]![col] !== ' ' || (this.flags[row]![col]! & IS_CONTINUATION)) {
          contentWidth = col + 1
          break
        }
      }
      totalRows += Math.max(1, Math.ceil(contentWidth / newCols))
    }
    return totalRows
  }

  clearFromTerminal(stream: { write(s: string): void }, reflowedHeight: number): void {
    stream.write(`\x1b[${reflowedHeight}A`)
    for (let i = 0; i < reflowedHeight; i++) {
      stream.write('\x1b[2K')
      if (i < reflowedHeight - 1) stream.write('\x1b[B')
    }
    stream.write(`\x1b[${reflowedHeight - 1}A`)
  }

  // --- 内部 ---

  private clearMainCellOf(row: number, col: number): void {
    for (let c = col - 1; c >= 0; c--) {
      if (!(this.flags[row]![c]! & IS_CONTINUATION)) {
        this.chars[row]![c] = ' '
        this.styles[row]![c] = 0
        this.flags[row]![c] = 0
        this.dirty[row]![c] = true
        break
      }
    }
    this.flags[row]![col] = 0
  }
}
