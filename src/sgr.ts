/**
 * SGR 解析 — 将带 ANSI 样式的字符串解析为 (char, style) 序列。
 *
 * 支持 SGR 参数：
 *   0 = reset, 1 = bold, 2 = dim, 3 = italic, 4 = underline
 *   30-37 = 基本 fg, 39 = default fg
 *   40-47 = 基本 bg, 49 = default bg
 *   90-97 = 亮色 fg, 100-107 = 亮色 bg
 *   38;5;n = 256 色 fg, 48;5;n = 256 色 bg
 *   38;2;r;g;b = truecolor fg, 48;2;r;g;b = truecolor bg
 */

import { encodeStyle, BOLD, DIM, ITALIC, UNDERLINE } from './grid.ts'
import type { Grid } from './grid.ts'

type ColorSpec = number | [number, number, number]

export interface SGRChar {
  char: string
  style: number
}

interface SGRState {
  fg: ColorSpec
  bg: ColorSpec
  flags: number
}

function defaultState(): SGRState {
  return { fg: -1, bg: -1, flags: 0 }
}

/**
 * 将带 ANSI SGR 转义序列的字符串解析为 (char, style) 数组。
 * 每个可见字符附带其当前的样式编码。
 */
export function parseSGR(s: string): SGRChar[] {
  const result: SGRChar[] = []
  let i = 0
  let state = defaultState()
  let currentStyle = 0

  while (i < s.length) {
    if (s[i] === '\x1b' && i + 1 < s.length && s[i + 1] === '[') {
      i += 2
      let paramStr = ''
      while (i < s.length) {
        const code = s.charCodeAt(i)
        if (code >= 0x40 && code <= 0x7E) {
          const final = s[i]!
          i++
          if (final === 'm') {
            state = applySGRParams(state, paramStr)
            currentStyle = encodeStyle(state.fg, state.bg, state.flags)
          }
          break
        }
        paramStr += s[i]!
        i++
      }
    } else {
      result.push({ char: s[i]!, style: currentStyle })
      i++
    }
  }

  return result
}

/**
 * 将 SGR 参数字符串应用到当前状态，返回新状态。
 * SGR 参数是累积的——未显式重置的属性会保留。
 */
function applySGRParams(state: SGRState, paramStr: string): SGRState {
  if (paramStr === '') paramStr = '0'
  const params = paramStr.split(';').map(s => parseInt(s, 10) || 0)

  let { fg, bg, flags } = state
  let p = 0

  while (p < params.length) {
    const code = params[p]!

    // Reset
    if (code === 0) {
      fg = -1; bg = -1; flags = 0
      p++; continue
    }

    // Bold / dim / italic / underline
    if (code === 1) { flags |= BOLD; p++; continue }
    if (code === 2) { flags |= DIM; p++; continue }
    if (code === 3) { flags |= ITALIC; p++; continue }
    if (code === 4) { flags |= UNDERLINE; p++; continue }

    // Not-bold/dim/italic/underline (some terminals support these)
    if (code === 22) { flags &= ~(BOLD | DIM); p++; continue }
    if (code === 23) { flags &= ~ITALIC; p++; continue }
    if (code === 24) { flags &= ~UNDERLINE; p++; continue }

    // Basic fg 30-37
    if (code >= 30 && code <= 37) { fg = code - 30; p++; continue }
    // Default fg
    if (code === 39) { fg = -1; p++; continue }

    // Basic bg 40-47
    if (code >= 40 && code <= 47) { bg = code - 40; p++; continue }
    // Default bg
    if (code === 49) { bg = -1; p++; continue }

    // Bright fg 90-97
    if (code >= 90 && code <= 97) { fg = code - 90 + 8; p++; continue }

    // Bright bg 100-107
    if (code >= 100 && code <= 107) { bg = code - 100 + 8; p++; continue }

    // 256-color fg: 38;5;n
    if (code === 38 && p + 2 < params.length && params[p + 1] === 5) {
      fg = params[p + 2]!
      p += 3; continue
    }

    // 256-color bg: 48;5;n
    if (code === 48 && p + 2 < params.length && params[p + 1] === 5) {
      bg = params[p + 2]!
      p += 3; continue
    }

    // truecolor fg: 38;2;r;g;b
    if (code === 38 && p + 4 < params.length && params[p + 1] === 2) {
      fg = [params[p + 2]!, params[p + 3]!, params[p + 4]!]
      p += 5; continue
    }

    // truecolor bg: 48;2;r;g;b
    if (code === 48 && p + 4 < params.length && params[p + 1] === 2) {
      bg = [params[p + 2]!, params[p + 3]!, params[p + 4]!]
      p += 5; continue
    }

    // Unknown code, skip
    p++
  }

  return { fg, bg, flags }
}

/**
 * 便捷方法：将 SGR 文本写入 Grid。
 * 从 (startRow, startCol) 开始逐字符写入，仅写入 ownerId 匹配的 cell。
 * 返回写入结束后的位置 { row, col }。
 */
export function writeSGRToGrid(
  grid: Grid,
  s: string,
  startRow: number,
  startCol: number,
  ownerId: string,
): { row: number; col: number } {
  let row = startRow
  let col = startCol

  for (const { char, style } of parseSGR(s)) {
    if (col >= grid.cols) {
      row++
      col = 0
    }
    if (row >= grid.rows) break

    if (grid.ownerAt(row, col) !== ownerId) {
      col++
      continue
    }

    grid.setChar(row, col, char, style)
    col++
  }

  return { row, col }
}
