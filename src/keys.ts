/**
 * 按键解析 — raw stdin buffer → action
 */

export type KeyAction =
  | { type: 'char'; char: string }
  | { type: 'backspace' }
  | { type: 'delete' }
  | { type: 'left' }
  | { type: 'right' }
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'enter' }
  | { type: 'escape' }
  | { type: 'ctrl'; key: string }
  | { type: 'unknown'; raw: Buffer }

export function parseKey(buf: Buffer): KeyAction {
  // Ctrl+C, Ctrl+D etc
  if (buf.length === 1 && buf[0]! < 32) {
    const code = buf[0]!
    if (code === 3) return { type: 'ctrl', key: 'c' }
    if (code === 4) return { type: 'ctrl', key: 'd' }
    if (code === 13) return { type: 'enter' }
    if (code === 27) return { type: 'escape' }
    if (code === 127) return { type: 'backspace' }
    if (code === 8) return { type: 'backspace' }
    return { type: 'ctrl', key: String.fromCharCode(code + 96) }
  }

  // ANSI escape sequences
  if (buf.length >= 3 && buf[0] === 27 && buf[1] === 91) {
    const seq = buf.toString('utf-8', 2)
    if (seq === 'A') return { type: 'up' }
    if (seq === 'B') return { type: 'down' }
    if (seq === 'C') return { type: 'right' }
    if (seq === 'D') return { type: 'left' }
    if (seq === '3~') return { type: 'delete' }
    return { type: 'unknown', raw: buf }
  }

  // Escape alone
  if (buf.length === 1 && buf[0] === 27) {
    return { type: 'escape' }
  }

  // Regular character (UTF-8)
  const str = buf.toString('utf-8')
  if (str.length > 0) {
    return { type: 'char', char: str }
  }

  return { type: 'unknown', raw: buf }
}
