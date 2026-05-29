import { describe, test, expect } from 'bun:test'
import { parseKey } from '../keys.ts'
import type { KeyAction } from '../keys.ts'

function buf(bytes: number[]): Buffer {
  return Buffer.from(bytes)
}

describe('parseKey — 基本键（不受影响）', () => {
  test('单字节 ctrl 键', () => {
    expect(parseKey(buf([3]))).toEqual({ type: 'ctrl', key: 'c' })
    expect(parseKey(buf([4]))).toEqual({ type: 'ctrl', key: 'd' })
    expect(parseKey(buf([1]))).toEqual({ type: 'ctrl', key: 'a' })
  })

  test('Enter', () => {
    expect(parseKey(buf([13]))).toEqual({ type: 'enter' })
  })

  test('Escape', () => {
    expect(parseKey(buf([27]))).toEqual({ type: 'escape' })
  })

  test('Tab', () => {
    expect(parseKey(buf([9]))).toEqual({ type: 'tab' })
  })

  test('Backspace', () => {
    expect(parseKey(buf([127]))).toEqual({ type: 'backspace' })
    expect(parseKey(buf([8]))).toEqual({ type: 'backspace' })
  })

  test('基本方向键', () => {
    expect(parseKey(buf([27, 91, 65]))).toEqual({ type: 'up' })
    expect(parseKey(buf([27, 91, 66]))).toEqual({ type: 'down' })
    expect(parseKey(buf([27, 91, 67]))).toEqual({ type: 'right' })
    expect(parseKey(buf([27, 91, 68]))).toEqual({ type: 'left' })
  })

  test('Delete', () => {
    expect(parseKey(buf([27, 91, 51, 126]))).toEqual({ type: 'delete' })
  })

  test('普通字符', () => {
    expect(parseKey(buf([65]))).toEqual({ type: 'char', char: 'A' })
    expect(parseKey(buf([0xE4, 0xBD, 0xA0]))).toEqual({ type: 'char', char: '你' })
  })
})

describe('parseKey — 新增：Alt+Enter', () => {
  test('ESC CR → alt+enter', () => {
    expect(parseKey(buf([27, 13]))).toEqual({ type: 'enter', alt: true })
  })
})

describe('parseKey — 新增：Home/End', () => {
  test('CSI H → home', () => {
    expect(parseKey(buf([27, 91, 72]))).toEqual({ type: 'home' })
  })

  test('CSI F → end', () => {
    expect(parseKey(buf([27, 91, 70]))).toEqual({ type: 'end' })
  })

  test('CSI 1~ → home (VT style)', () => {
    expect(parseKey(buf([27, 91, 49, 126]))).toEqual({ type: 'home' })
  })

  test('CSI 4~ → end (VT style)', () => {
    expect(parseKey(buf([27, 91, 52, 126]))).toEqual({ type: 'end' })
  })
})

describe('parseKey — 新增：Bracketed paste', () => {
  test('CSI 200~ → pasteStart', () => {
    expect(parseKey(buf([27, 91, 50, 48, 48, 126]))).toEqual({ type: 'pasteStart' })
  })

  test('CSI 201~ → pasteEnd', () => {
    expect(parseKey(buf([27, 91, 50, 48, 49, 126]))).toEqual({ type: 'pasteEnd' })
  })
})

describe('parseKey — 新增：修饰方向键', () => {
  test('Ctrl+Up', () => {
    expect(parseKey(buf([27, 91, 49, 59, 53, 65]))).toEqual({ type: 'up', ctrl: true })
  })

  test('Ctrl+Down', () => {
    expect(parseKey(buf([27, 91, 49, 59, 53, 66]))).toEqual({ type: 'down', ctrl: true })
  })

  test('Ctrl+Right', () => {
    expect(parseKey(buf([27, 91, 49, 59, 53, 67]))).toEqual({ type: 'right', ctrl: true })
  })

  test('Ctrl+Left', () => {
    expect(parseKey(buf([27, 91, 49, 59, 53, 68]))).toEqual({ type: 'left', ctrl: true })
  })

  test('Shift+Up', () => {
    expect(parseKey(buf([27, 91, 49, 59, 50, 65]))).toEqual({ type: 'up', shift: true })
  })

  test('Alt+Down', () => {
    expect(parseKey(buf([27, 91, 49, 59, 51, 66]))).toEqual({ type: 'down', alt: true })
  })

  test('Ctrl+Shift+Left', () => {
    expect(parseKey(buf([27, 91, 49, 59, 54, 68]))).toEqual({ type: 'left', ctrl: true, shift: true })
  })
})

describe('parseKey — 边界与回退', () => {
  test('未知 CSI 序列返回 unknown', () => {
    const result = parseKey(buf([27, 91, 57, 57, 126]))
    expect(result.type).toBe('unknown')
  })

  test('空 Buffer 返回 unknown', () => {
    const result = parseKey(Buffer.alloc(0))
    expect(result.type).toBe('unknown')
  })
})
