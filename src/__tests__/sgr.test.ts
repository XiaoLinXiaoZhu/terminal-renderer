import { describe, test, expect } from 'bun:test'
import { stringWidth, stripANSI } from '../width.ts'
import { parseSGR } from '../sgr.ts'
import { sgrFromEncoded } from '../grid.ts'

describe('stringWidth', () => {
  test('纯 ASCII', () => {
    expect(stringWidth('Hello')).toBe(5)
  })

  test('CJK 字符', () => {
    expect(stringWidth('你好')).toBe(4)
  })

  test('混合 ASCII + CJK', () => {
    expect(stringWidth('Hello你好')).toBe(9) // 5 + 4
  })

  test('带 ANSI escape 序列', () => {
    expect(stringWidth('\x1b[31mHello\x1b[0m')).toBe(5)
  })

  test('复杂 ANSI 序列', () => {
    expect(stringWidth('\x1b[1;31mBold Red\x1b[0m')).toBe(8)
  })

  test('256 色 escape 序列', () => {
    expect(stringWidth('\x1b[38;5;196mX\x1b[0m')).toBe(1)
  })

  test('truecolor escape 序列', () => {
    expect(stringWidth('\x1b[38;2;255;128;0mX\x1b[0m')).toBe(1)
  })
})

describe('stripANSI', () => {
  test('无 escape 序列的文本原样返回', () => {
    expect(stripANSI('Hello')).toBe('Hello')
  })

  test('剥离基本 SGR 序列', () => {
    expect(stripANSI('\x1b[31mRed\x1b[0m')).toBe('Red')
  })

  test('剥离多个 SGR 序列', () => {
    expect(stripANSI('\x1b[1mBold\x1b[0m and \x1b[31mRed\x1b[0m')).toBe('Bold and Red')
  })
})

describe('parseSGR', () => {
  test('无 escape 序列 → 全默认 style', () => {
    const result = parseSGR('Hello')
    expect(result.length).toBe(5)
    result.forEach(({ style }) => expect(style).toBe(0))
    expect(result.map(r => r.char).join('')).toBe('Hello')
  })

  test('基本 fg 颜色', () => {
    const result = parseSGR('\x1b[31mRed\x1b[0m')
    // [31m → fg=1 (red), [0m → reset (style 0)
    expect(result.length).toBe(3)
    result.forEach(({ style }) => {
      const sgr = sgrFromEncoded(style)
      expect(sgr).toContain('31') // red
    })
  })

  test('reset 后回到默认', () => {
    const result = parseSGR('\x1b[31mR\x1b[0me')
    expect(result.length).toBe(2)
    expect(sgrFromEncoded(result[0]!.style)).toContain('31') // R: red
    expect(result[1]!.style).toBe(0) // e: default (reset)
  })

  test('bold + fg 组合', () => {
    const result = parseSGR('\x1b[1;31mBold Red\x1b[0m')
    result.forEach(({ style }) => {
      const sgr = sgrFromEncoded(style)
      expect(sgr).toContain('31')
      expect(sgr).toContain(';1')
    })
  })

  test('样式累积', () => {
    // [1m → bold, [31m → red (bold preserved)
    const result = parseSGR('\x1b[1m\x1b[31mBoldRed\x1b[0m')
    result.forEach(({ style }) => {
      const sgr = sgrFromEncoded(style)
      expect(sgr).toContain('31')
      expect(sgr).toContain(';1')
    })
  })

  test('亮色 fg (90-97)', () => {
    const result = parseSGR('\x1b[90mGray\x1b[0m')
    result.forEach(({ style }) => {
      const sgr = sgrFromEncoded(style)
      expect(sgr).toContain('90') // bright black
    })
  })

  test('亮色 bg (100-107)', () => {
    const result = parseSGR('\x1b[101mRedBg\x1b[0m')
    result.forEach(({ style }) => {
      const sgr = sgrFromEncoded(style)
      expect(sgr).toContain('101') // bright red bg
    })
  })

  test('256 色 fg', () => {
    const result = parseSGR('\x1b[38;5;196mX\x1b[0m')
    expect(result.length).toBe(1)
    const sgr = sgrFromEncoded(result[0]!.style)
    expect(sgr).toContain('38;5;196')
  })

  test('truecolor fg', () => {
    const result = parseSGR('\x1b[38;2;100;200;50mX\x1b[0m')
    expect(result.length).toBe(1)
    const sgr = sgrFromEncoded(result[0]!.style)
    expect(sgr).toContain('38;2;100;200;50')
  })

  test('混合 fg + bg', () => {
    const result = parseSGR('\x1b[31;44mRedOnBlue\x1b[0m')
    result.forEach(({ style }) => {
      const sgr = sgrFromEncoded(style)
      expect(sgr).toContain('31')
      expect(sgr).toContain('44')
    })
  })

  test('CJK 字符保留', () => {
    const result = parseSGR('\x1b[32m你好\x1b[0m')
    expect(result.map(r => r.char).join('')).toBe('你好')
    result.forEach(({ style }) => {
      const sgr = sgrFromEncoded(style)
      expect(sgr).toContain('32') // green
    })
  })

  test('空字符串', () => {
    expect(parseSGR('')).toEqual([])
  })

  test('仅 SGR 序列无文本', () => {
    expect(parseSGR('\x1b[31m\x1b[0m')).toEqual([])
  })
})
