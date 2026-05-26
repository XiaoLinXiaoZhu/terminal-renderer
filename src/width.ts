/**
 * 字符宽度工具 — 封装 string-width
 */

import stringWidth from 'string-width'

/**
 * 返回单个字符在终端中占据的列数。
 * ASCII = 1, CJK = 2
 */
export function charWidth(ch: string): number {
  if (ch === '') return 0
  // 快速路径：ASCII 可打印字符
  const code = ch.charCodeAt(0)
  if (code >= 0x20 && code <= 0x7E) return 1
  return stringWidth(ch)
}
