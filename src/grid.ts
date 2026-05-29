/**
 * Grid — 虚拟终端缓冲区
 *
 * SoA 存储模型 + cell 粒度 dirty tracking + flush 上屏。
 *
 * 样式编码（32-bit，仅用低 24 bits）：
 *   bits 0-7:   fg 值（256 色索引 / truecolor 注册表索引）
 *   bits 8-15:  bg 值
 *   bits 16-19: flags (bold/dim/italic/underline)
 *   bits 20-21: fg 模式 (0=default, 1=256色, 2=truecolor)
 *   bits 22-23: bg 模式 (0=default, 1=256色, 2=truecolor)
 *   bits 24-31: 保留
 *
 * 256 色调色板前 16 色：
 *   0-7   = 基本色 (SGR 30-37), 8-15 = 亮色 (SGR 90-97)
 */

// ── 全局 truecolor 注册表 ──
const fgRegistry: [number, number, number][] = []
const bgRegistry: [number, number, number][] = []

function registerFgColor(r: number, g: number, b: number): number {
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

// 模式偏移与值
const FG_MODE_SHIFT = 20
const BG_MODE_SHIFT = 22
const MODE_DEFAULT    = 0
const MODE_256        = 1
const MODE_TRUECOLOR  = 2

// ── 公开 API ──

type ColorSpec = number | [number, number, number]

/**
 * 统一样式编码。
 *
 * @param fg 前景色：-1 = default, 0-255 = 256 色调色板, [r,g,b] = truecolor
 * @param bg 背景色：同上
 * @param flags 样式标志（BOLD | DIM | ITALIC | UNDERLINE）
 *
 * 示例：
 *   encodeStyle(-1, -1)              // default
 *   encodeStyle(1, -1, BOLD)         // 红色加粗（256 色索引 1）
 *   encodeStyle(9, -1)               // 亮红色
 *   encodeStyle([255,128,0], -1)     // 橙色 truecolor
 */
export function encodeStyle(fg: ColorSpec, bg: ColorSpec, flags: number = 0): number {
  const fgMode = typeof fg === 'number' ? (fg < 0 ? MODE_DEFAULT : MODE_256) : MODE_TRUECOLOR
  const bgMode = typeof bg === 'number' ? (bg < 0 ? MODE_DEFAULT : MODE_256) : MODE_TRUECOLOR

  let fgVal = 0
  let bgVal = 0

  if (fgMode === MODE_256) fgVal = (fg as number) & 0xFF
  else if (fgMode === MODE_TRUECOLOR) {
    const rgb = fg as [number, number, number]
    fgVal = registerFgColor(rgb[0], rgb[1], rgb[2])
  }

  if (bgMode === MODE_256) bgVal = (bg as number) & 0xFF
  else if (bgMode === MODE_TRUECOLOR) {
    const rgb = bg as [number, number, number]
    bgVal = registerBgColor(rgb[0], rgb[1], rgb[2])
  }

  return (fgVal & 0xFF) | ((bgVal & 0xFF) << 8) | (flags & 0xF0000) |
    (fgMode << FG_MODE_SHIFT) | (bgMode << BG_MODE_SHIFT)
}

// ── SGR 生成 ──

// 256 色调色板前 8 色 → SGR 30-37
const FG_256: Record<number, number> = {
  0: 30, 1: 31, 2: 32, 3: 33, 4: 34, 5: 35, 6: 36, 7: 37,
}
const BG_256: Record<number, number> = {
  0: 40, 1: 41, 2: 42, 3: 43, 4: 44, 5: 45, 6: 46, 7: 47,
}

function fgSGR(mode: number, value: number): string {
  if (mode === MODE_DEFAULT) return '39'
  if (mode === MODE_256) {
    if (value <= 7) return String(FG_256[value] ?? 39)
    if (value <= 15) return String(90 + (value - 8)) // bright: 90-97
    return `38;5;${value & 0xFF}`
  }
  if (mode === MODE_TRUECOLOR) {
    const rgb = fgRegistry[value & 0xFF]
    if (!rgb) return '39'
    return `38;2;${rgb[0]};${rgb[1]};${rgb[2]}`
  }
  return '39'
}

function bgSGR(mode: number, value: number): string {
  if (mode === MODE_DEFAULT) return '49'
  if (mode === MODE_256) {
    if (value <= 7) return String(BG_256[value] ?? 49)
    if (value <= 15) return String(100 + (value - 8)) // bright bg: 100-107
    return `48;5;${value & 0xFF}`
  }
  if (mode === MODE_TRUECOLOR) {
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
  const fgMode = (style >> FG_MODE_SHIFT) & 3
  const bgMode = (style >> BG_MODE_SHIFT) & 3

  const parts: string[] = ['0']

  const fgPart = fgSGR(fgMode, fgVal)
  if (fgPart !== '39') parts.push(fgPart)

  const bgPart = bgSGR(bgMode, bgVal)
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

    if (this.flags[row]![col]! & IS_CONTINUATION) {
      this.clearMainCellOf(row, col)
    }

    if (col + 1 < this.cols && (this.flags[row]![col + 1]! & IS_CONTINUATION)) {
      this.chars[row]![col + 1] = ' '
      this.styles[row]![col + 1] = 0
      this.flags[row]![col + 1] = 0
      this.dirty[row]![col + 1] = true
    }

    if (this.chars[row]![col] === char && this.styles[row]![col] === style && !(this.flags[row]![col]! & IS_CONTINUATION)) {
      return
    }

    this.chars[row]![col] = char
    this.styles[row]![col] = style
    this.flags[row]![col] = 0
    this.dirty[row]![col] = true
  }

  setWideChar(row: number, col: number, char: string, style: number): void {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return

    if (col + 1 >= this.cols) {
      this.setChar(row, col, ' ', 0)
      return
    }

    if (this.flags[row]![col]! & IS_CONTINUATION) {
      this.clearMainCellOf(row, col)
    }

    if (col + 2 < this.cols && (this.flags[row]![col + 2]! & IS_CONTINUATION)) {
      this.chars[row]![col + 2] = ' '
      this.styles[row]![col + 2] = 0
      this.flags[row]![col + 2] = 0
      this.dirty[row]![col + 2] = true
    }

    if (this.flags[row]![col + 1]! & IS_CONTINUATION) {
      this.clearMainCellOf(row, col + 1)
    }

    const oldChar = this.chars[row]![col]
    const oldStyle = this.styles[row]![col]
    const oldFlags = this.flags[row]![col]
    if (oldChar !== char || oldStyle !== style || oldFlags !== 0) {
      this.chars[row]![col] = char
      this.styles[row]![col] = style
      this.flags[row]![col] = 0
      this.dirty[row]![col] = true
    }

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

        if (row !== curRow || col !== curCol) {
          if (row > curRow) stream.write(`\x1b[${row - curRow}B`)
          else if (row < curRow) stream.write(`\x1b[${curRow - row}A`)
          stream.write(`\r`)
          if (col > 0) stream.write(`\x1b[${col}C`)
          curRow = row
          curCol = col
        }

        if (this.styles[row]![col] !== currentStyle) {
          currentStyle = this.styles[row]![col]!
          stream.write(sgrFromEncoded(currentStyle))
        }

        stream.write(this.chars[row]![col]!)
        curCol++
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
