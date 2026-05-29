/**
 * TextInput 编辑操作 — 插入、删除、水平移动光标。
 *
 * 所有操作以 grapheme（[...str] 拆分）为单位推进光标，
 * 保证 CJK / emoji / 代理对不会被截断到非法位置。
 */

import type { TextInputState } from './types.ts'

/** 在光标处插入字符串，光标移到插入内容之后 */
export function insertChar(state: TextInputState, ch: string): void {
  state.text = state.text.slice(0, state.cursorOffset) + ch + state.text.slice(state.cursorOffset)
  state.cursorOffset += ch.length
  state.stickyCol = null
}

/**
 * 在光标处插入一段粘贴文本。
 *
 * 与 insertChar 的区别：对粘贴内容做换行符规范化（CRLF / CR → LF），
 * 终端粘贴常携带 \r\n 或裸 \r，若不归一会在 Grid 中产生多余空行或错位。
 */
export function insertText(state: TextInputState, text: string): void {
  const normalized = text.replace(/\r\n?/g, '\n')
  insertChar(state, normalized)
}

/** 删除光标前一个 grapheme */
export function deleteBeforeCursor(state: TextInputState): void {
  if (state.cursorOffset === 0) return
  const before = [...state.text.slice(0, state.cursorOffset)]
  before.pop()
  const newBefore = before.join('')
  state.text = newBefore + state.text.slice(state.cursorOffset)
  state.cursorOffset = newBefore.length
  state.stickyCol = null
}

/** 光标左移一个 grapheme */
export function moveLeft(state: TextInputState): void {
  if (state.cursorOffset <= 0) return
  const before = [...state.text.slice(0, state.cursorOffset)]
  before.pop()
  state.cursorOffset = before.join('').length
  state.stickyCol = null
}

/** 光标右移一个 grapheme */
export function moveRight(state: TextInputState): void {
  if (state.cursorOffset >= state.text.length) return
  const remaining = [...state.text.slice(state.cursorOffset)]
  const nextChar = remaining[0]!
  state.cursorOffset += nextChar.length
  state.stickyCol = null
}
