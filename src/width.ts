/**
 * 字符宽度工具 — 封装 string-width
 */

import stringWidthLib from 'string-width'

/**
 * 返回单个字符在终端中占据的列数。
 * ASCII = 1, CJK = 2
 */
export function charWidth(ch: string): number {
  if (ch === '') return 0
  const code = ch.charCodeAt(0)
  if (code >= 0x20 && code <= 0x7E) return 1
  return stringWidthLib(ch)
}

/**
 * 返回字符串在终端中占据的列数（剥离 ANSI escape 序列后）。
 */
export function stringWidth(s: string): number {
  return stringWidthLib(stripANSI(s))
}

// ── ANSI escape 序列剥离 ──

/**
 * 剥离字符串中的所有 ANSI escape 序列，返回纯文本。
 */
export function stripANSI(s: string): string {
  let result = ''
  let i = 0
  while (i < s.length) {
    if (s[i] === '\x1b' && i + 1 < s.length && s[i + 1] === '[') {
      // Skip CSI sequence: ESC [ ... final (0x40-0x7E)
      i += 2
      while (i < s.length) {
        const code = s.charCodeAt(i)
        if (code >= 0x40 && code <= 0x7E) { i++; break }
        i++
      }
    } else {
      result += s[i]!
      i++
    }
  }
  return result
}
