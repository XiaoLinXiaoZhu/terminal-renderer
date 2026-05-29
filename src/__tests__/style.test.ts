import { describe, test, expect } from 'bun:test'
import { encodeStyle, encodeStyle256, encodeStyleRGB, sgrFromEncoded, BOLD, DIM, ITALIC, UNDERLINE } from '../grid.ts'

describe('encodeStyle (basic/bright)', () => {
  test('default', () => {
    expect(encodeStyle(0, 0)).toBe(0) // fg=0,bg=0,type=basic→0
  })

  test('fg 基本色', () => {
    const s = encodeStyle(2, 0) // red fg
    expect(s & 0xFF).toBe(2) // fg=2
  })

  test('bg 基本色', () => {
    const s = encodeStyle(0, 3) // green bg
    expect((s >> 8) & 0xFF).toBe(3) // bg=3
  })

  test('flags 正确编码', () => {
    const s = encodeStyle(2, 3, BOLD)
    expect(s & BOLD).not.toBe(0)

    const s2 = encodeStyle(0, 0, BOLD | ITALIC)
    expect(s2 & BOLD).not.toBe(0)
    expect(s2 & ITALIC).not.toBe(0)
  })

  test('亮色 fg (90-97)', () => {
    const s = encodeStyle(9, 0) // bright black = gray
    expect(s & 0xFF).toBe(9)
  })

  test('亮色 bg (100-107)', () => {
    const s = encodeStyle(0, 9)
    expect((s >> 8) & 0xFF).toBe(9)
  })
})

describe('encodeStyle256', () => {
  test('256 色 fg', () => {
    const s = encodeStyle256(196, 0)
    const fgKind = (s >> 20) & 0xF
    expect(fgKind).toBe(1) // TYPE_256
    expect(s & 0xFF).toBe(196)
  })

  test('256 色 bg', () => {
    const s = encodeStyle256(0, 42)
    const bgKind = (s >> 24) & 0xF
    expect(bgKind).toBe(1) // TYPE_256
    expect((s >> 8) & 0xFF).toBe(42)
  })
})

describe('encodeStyleRGB', () => {
  test('truecolor fg + bg', () => {
    const s = encodeStyleRGB([255, 128, 64], [10, 20, 30])
    const fgKind = (s >> 20) & 0xF
    const bgKind = (s >> 24) & 0xF
    expect(fgKind).toBe(2) // TYPE_TRUECOLOR
    expect(bgKind).toBe(2) // TYPE_TRUECOLOR
  })

  test('相同 RGB 复用索引', () => {
    const s1 = encodeStyleRGB([100, 200, 50], [0, 0, 0])
    const s2 = encodeStyleRGB([100, 200, 50], [0, 0, 0])
    expect(s1).toBe(s2) // 应返回相同的 style 值
  })
})

describe('sgrFromEncoded', () => {
  test('style=0 → reset', () => {
    expect(sgrFromEncoded(0)).toBe('\x1b[0m')
  })

  test('fg 基本色', () => {
    const sgr = sgrFromEncoded(encodeStyle(2, 0)) // red
    expect(sgr).toContain('31')
  })

  test('bg 基本色', () => {
    const sgr = sgrFromEncoded(encodeStyle(0, 3)) // green bg
    expect(sgr).toContain('42')
  })

  test('flags', () => {
    expect(sgrFromEncoded(encodeStyle(0, 0, BOLD))).toContain(';1')
    expect(sgrFromEncoded(encodeStyle(0, 0, DIM))).toContain(';2')
    expect(sgrFromEncoded(encodeStyle(0, 0, ITALIC))).toContain(';3')
    expect(sgrFromEncoded(encodeStyle(0, 0, UNDERLINE))).toContain(';4')
  })

  test('组合基本色 + flags', () => {
    const sgr = sgrFromEncoded(encodeStyle(2, 5, BOLD | UNDERLINE))
    expect(sgr).toContain('31') // red fg
    expect(sgr).toContain('44') // blue bg
    expect(sgr).toContain(';1') // bold
    expect(sgr).toContain(';4') // underline
  })

  test('亮色 fg (90)', () => {
    const sgr = sgrFromEncoded(encodeStyle(9, 0)) // bright black
    expect(sgr).toContain('90')
  })

  test('亮色 bg (100)', () => {
    const sgr = sgrFromEncoded(encodeStyle(0, 10)) // bright red bg
    expect(sgr).toContain('101')
  })

  test('256 色', () => {
    const sgr = sgrFromEncoded(encodeStyle256(196, 42))
    expect(sgr).toContain('38;5;196')
    expect(sgr).toContain('48;5;42')
  })

  test('truecolor', () => {
    const sgr = sgrFromEncoded(encodeStyleRGB([255, 128, 64], [10, 20, 30]))
    expect(sgr).toContain('38;2;255;128;64')
    expect(sgr).toContain('48;2;10;20;30')
  })

  test('default 颜色不输出 SGR 码（仅 reset）', () => {
    const sgr = sgrFromEncoded(encodeStyle(0, 0, BOLD))
    expect(sgr).not.toContain('39')
    expect(sgr).not.toContain('49')
    expect(sgr).toContain(';1')
  })
})

describe('TextInput — Decorations (with new encoding)', () => {
  const { Grid } = require('../grid.ts')
  const { TextInput } = require('../text-input.ts')

  test('decoration 区间内字符用指定样式', () => {
    const grid = Grid.create(10, 1)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'Hello'
    ti.decorations = [{ start: 1, end: 4, style: encodeStyle(2, 0) }] // 'ell' in red
    ti.paint(grid, 'input')

    expect(grid.styleAt(0, 0)).toBe(0) // 'H' — no decoration
    expect(grid.styleAt(0, 1)).toBe(encodeStyle(2, 0)) // 'e' — red
    expect(grid.styleAt(0, 2)).toBe(encodeStyle(2, 0)) // 'l' — red
    expect(grid.styleAt(0, 3)).toBe(encodeStyle(2, 0)) // 'l' — red
    expect(grid.styleAt(0, 4)).toBe(0) // 'o' — no decoration
  })

  test('多个 decoration 不重叠时各自正确', () => {
    const grid = Grid.create(10, 1)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'ABCDEF'
    ti.decorations = [
      { start: 0, end: 2, style: encodeStyle(2, 0) }, // AB red
      { start: 4, end: 6, style: encodeStyle(3, 0) }, // EF green
    ]
    ti.paint(grid, 'input')

    expect(grid.styleAt(0, 0)).toBe(encodeStyle(2, 0)) // A
    expect(grid.styleAt(0, 1)).toBe(encodeStyle(2, 0)) // B
    expect(grid.styleAt(0, 2)).toBe(0) // C
    expect(grid.styleAt(0, 3)).toBe(0) // D
    expect(grid.styleAt(0, 4)).toBe(encodeStyle(3, 0)) // E
    expect(grid.styleAt(0, 5)).toBe(encodeStyle(3, 0)) // F
  })

  test('decoration 跨折行时正确', () => {
    const grid = Grid.create(5, 2)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'ABCDEFGH'
    ti.decorations = [{ start: 3, end: 7, style: encodeStyle(4, 0, BOLD) }] // DEFG bold yellow
    ti.paint(grid, 'input')

    expect(grid.styleAt(0, 2)).toBe(0) // C
    expect(grid.styleAt(0, 3)).toBe(encodeStyle(4, 0, BOLD)) // D
    expect(grid.styleAt(0, 4)).toBe(encodeStyle(4, 0, BOLD)) // E
    expect(grid.styleAt(1, 0)).toBe(encodeStyle(4, 0, BOLD)) // F
    expect(grid.styleAt(1, 1)).toBe(encodeStyle(4, 0, BOLD)) // G
    expect(grid.styleAt(1, 2)).toBe(0) // H
  })
})
