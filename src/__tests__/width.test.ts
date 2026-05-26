import { describe, test, expect } from 'bun:test'
import { charWidth } from '../width.ts'

describe('charWidth', () => {
  test('ASCII 字符宽度为 1', () => {
    expect(charWidth('A')).toBe(1)
    expect(charWidth('z')).toBe(1)
    expect(charWidth(' ')).toBe(1)
    expect(charWidth('!')).toBe(1)
  })

  test('CJK 字符宽度为 2', () => {
    expect(charWidth('你')).toBe(2)
    expect(charWidth('好')).toBe(2)
    expect(charWidth('中')).toBe(2)
    expect(charWidth('文')).toBe(2)
  })

  test('空字符串宽度为 0', () => {
    expect(charWidth('')).toBe(0)
  })
})
