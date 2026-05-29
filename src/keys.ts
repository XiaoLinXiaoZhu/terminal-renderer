/**
 * 按键解析 — raw stdin buffer → action
 *
 * 支持：
 * - 单字节 ctrl 字符、普通字符、UTF-8 多字节
 * - ANSI escape sequences（方向键、Home/End、Delete）
 * - 修饰方向键（Ctrl/Alt/Shift + 方向键）
 * - Alt+Enter
 * - Bracketed paste（\x1b[200~ / \x1b[201~）
 */

export type KeyAction =
  | { type: 'char'; char: string }
  | { type: 'backspace' }
  | { type: 'delete' }
  | { type: 'left'; shift?: boolean; alt?: boolean; ctrl?: boolean }
  | { type: 'right'; shift?: boolean; alt?: boolean; ctrl?: boolean }
  | { type: 'up'; shift?: boolean; alt?: boolean; ctrl?: boolean }
  | { type: 'down'; shift?: boolean; alt?: boolean; ctrl?: boolean }
  | { type: 'home' }
  | { type: 'end' }
  | { type: 'enter'; alt?: boolean }
  | { type: 'escape' }
  | { type: 'tab' }
  | { type: 'ctrl'; key: string }
  | { type: 'pasteStart' }
  | { type: 'pasteEnd' }
  | { type: 'unknown'; raw: Buffer }

/**
 * 解析 CSI 参数：`\x1b[...final` 中 [...] 部分的内容。
 * 返回解析后的参数数组和终止字符。
 */
function parseCSI(seq: string): { params: number[]; final: string } {
  // 找到终止字符（0x40-0x7E 范围）
  let i = 0
  while (i < seq.length && (seq.charCodeAt(i) < 0x40 || seq.charCodeAt(i) > 0x7E)) {
    i++
  }
  const final = i < seq.length ? seq[i]! : ''
  const paramStr = seq.slice(0, i)
  const params = paramStr.length > 0
    ? paramStr.split(';').map(s => parseInt(s, 10) || 0)
    : [0]
  return { params, final }
}

/**
 * 修饰键编码 → 布尔标志。
 * 0/1 = 无修饰, 2 = Shift, 3 = Alt, 4 = Shift+Alt,
 * 5 = Ctrl, 6 = Ctrl+Shift, 7 = Ctrl+Alt, 8 = Ctrl+Shift+Alt
 */
function parseModifiers(mod: number): { shift?: boolean; alt?: boolean; ctrl?: boolean } {
  if (mod <= 1) return {}
  const mods: { shift?: boolean; alt?: boolean; ctrl?: boolean } = {}
  if (mod === 2 || mod === 4 || mod === 6 || mod === 8) mods.shift = true
  if (mod === 3 || mod === 4 || mod === 7 || mod === 8) mods.alt = true
  if (mod >= 5 && mod <= 8) mods.ctrl = true
  return mods
}

export function parseKey(buf: Buffer): KeyAction {
  // ── Alt+Enter: ESC CR (27, 13) ──
  if (buf.length === 2 && buf[0] === 27 && buf[1] === 13) {
    return { type: 'enter', alt: true }
  }

  // ── 单字节处理 ──
  if (buf.length === 1) {
    const code = buf[0]!
    if (code === 127 || code === 8) return { type: 'backspace' }
    if (code < 32) {
      if (code === 3) return { type: 'ctrl', key: 'c' }
      if (code === 4) return { type: 'ctrl', key: 'd' }
      if (code === 13) return { type: 'enter' }
      if (code === 27) return { type: 'escape' }
      if (code === 9) return { type: 'tab' }
      return { type: 'ctrl', key: String.fromCharCode(code + 96) }
    }
  }

  // ── CSI 序列：ESC [ ... ──
  if (buf.length >= 3 && buf[0] === 27 && buf[1] === 91) {
    const seq = buf.toString('utf-8', 2)

    // Bracketed paste: \x1b[200~ / \x1b[201~
    if (seq === '200~') return { type: 'pasteStart' }
    if (seq === '201~') return { type: 'pasteEnd' }

    // Home/End (VT-style): \x1b[1~ / \x1b[4~
    if (seq === '1~' || seq === 'H') return { type: 'home' }
    if (seq === '4~' || seq === 'F') return { type: 'end' }

    // Delete: \x1b[3~
    if (seq === '3~') return { type: 'delete' }

    // 基本方向键: \x1b[A / B / C / D
    if (seq === 'A') return { type: 'up' }
    if (seq === 'B') return { type: 'down' }
    if (seq === 'C') return { type: 'right' }
    if (seq === 'D') return { type: 'left' }

    // 修饰方向键: \x1b[1;modA / \x1b[1;modB 等
    // 也支持 \x1b[mod;param~ 格式，但修饰方向键通常是 1;mod+终字
    if (seq.length >= 4) {
      const { params, final } = parseCSI(seq)
      if (params.length >= 2 && (final === 'A' || final === 'B' || final === 'C' || final === 'D')) {
        const mods = parseModifiers(params[1]!)
        const dir = final === 'A' ? 'up' : final === 'B' ? 'down' : final === 'C' ? 'right' : 'left'
        return { type: dir, ...mods } as KeyAction
      }
      // Home/End with modifiers: \x1b[1;modH / \x1b[1;modF
      if (params.length >= 2 && (final === 'H' || final === 'F')) {
        return final === 'H' ? { type: 'home' } : { type: 'end' }
      }
    }

    return { type: 'unknown', raw: buf }
  }

  // ── Escape alone ──
  if (buf.length === 1 && buf[0] === 27) {
    return { type: 'escape' }
  }

  // ── Regular character (UTF-8) ──
  const str = buf.toString('utf-8')
  if (str.length > 0) {
    return { type: 'char', char: str }
  }

  return { type: 'unknown', raw: buf }
}
