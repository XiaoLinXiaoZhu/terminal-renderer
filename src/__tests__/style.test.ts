import { describe, test, expect } from 'bun:test'
import { encodeStyle, sgrFromEncoded, BOLD, DIM, ITALIC, UNDERLINE } from '../grid.ts'

describe('encodeStyle — 统一入口', () => {
  test('default', () => {
    expect(encodeStyle(-1, -1)).toBe(0) // all modes are 0 → default → reset
    const s = sgrFromEncoded(encodeStyle(-1, -1))
    expect(s).toBe('\x1b[0m')
  })

  test('256 色 fg', () => {
    // red = 256-color index 1
    const sgr = sgrFromEncoded(encodeStyle(1, -1))
    expect(sgr).toContain('31')
  })

  test('256 色 bg', () => {
    // green bg = 256-color index 2
    const sgr = sgrFromEncoded(encodeStyle(-1, 2))
    expect(sgr).toContain('42')
  })

  test('基本色组合', () => {
    const sgr = sgrFromEncoded(encodeStyle(1, 4, BOLD | UNDERLINE))
    expect(sgr).toContain('31') // red fg
    expect(sgr).toContain('44') // blue bg
    expect(sgr).toContain(';1') // bold
    expect(sgr).toContain(';4') // underline
  })

  test('flags 正确编码', () => {
    const s = encodeStyle(-1, -1, BOLD)
    expect(s & BOLD).not.toBe(0)

    const s2 = encodeStyle(-1, -1, BOLD | ITALIC)
    expect(s2 & BOLD).not.toBe(0)
    expect(s2 & ITALIC).not.toBe(0)
  })

  test('亮色 fg (90-97)', () => {
    // bright black = 256-color index 8 → 90
    const sgr = sgrFromEncoded(encodeStyle(8, -1))
    expect(sgr).toContain('90')
  })

  test('亮色 bg (100-107)', () => {
    // bright red bg = 256-color index 9 → 101
    const sgr = sgrFromEncoded(encodeStyle(-1, 9))
    expect(sgr).toContain('101')
  })

  test('256 色扩展', () => {
    const sgr = sgrFromEncoded(encodeStyle(196, 42))
    expect(sgr).toContain('38;5;196')
    expect(sgr).toContain('48;5;42')
  })

  test('truecolor', () => {
    const sgr = sgrFromEncoded(encodeStyle([255, 128, 64], [10, 20, 30]))
    expect(sgr).toContain('38;2;255;128;64')
    expect(sgr).toContain('48;2;10;20;30')
  })

  test('truecolor 混用 256 色', () => {
    const sgr = sgrFromEncoded(encodeStyle([100, 200, 50], 4))
    expect(sgr).toContain('38;2;100;200;50')
    expect(sgr).toContain('44') // blue bg
  })

  test('same RGB reuses registry entry', () => {
    const s1 = encodeStyle([100, 200, 50], [-1, -1, -1])
    const s2 = encodeStyle([100, 200, 50], [-1, -1, -1])
    expect(s1).toBe(s2)
  })

  test('default 颜色不输出 SGR 码', () => {
    const sgr = sgrFromEncoded(encodeStyle(-1, -1, BOLD))
    expect(sgr).not.toContain('39')
    expect(sgr).not.toContain('49')
    expect(sgr).toContain(';1')
  })
})

describe('sgrFromEncoded', () => {
  test('style=0 → reset', () => {
    expect(sgrFromEncoded(0)).toBe('\x1b[0m')
  })

  test('flags 独立测试', () => {
    expect(sgrFromEncoded(encodeStyle(-1, -1, BOLD))).toContain(';1')
    expect(sgrFromEncoded(encodeStyle(-1, -1, DIM))).toContain(';2')
    expect(sgrFromEncoded(encodeStyle(-1, -1, ITALIC))).toContain(';3')
    expect(sgrFromEncoded(encodeStyle(-1, -1, UNDERLINE))).toContain(';4')
  })
})

describe('TextInput — Decorations', () => {
  const { Grid } = require('../grid.ts')
  const { TextInput } = require('../text-input')

  test('decoration 区间内字符用指定样式', () => {
    const grid = Grid.create(10, 1)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'Hello'
    ti.decorations = [{ start: 1, end: 4, style: encodeStyle(1, -1) }] // 'ell' in red
    ti.paint(grid, 'input')

    expect(grid.styleAt(0, 0)).toBe(0) // 'H' — no decoration
    expect(grid.styleAt(0, 1)).toBe(encodeStyle(1, -1)) // 'e' — red
    expect(grid.styleAt(0, 2)).toBe(encodeStyle(1, -1)) // 'l' — red
    expect(grid.styleAt(0, 3)).toBe(encodeStyle(1, -1)) // 'l' — red
    expect(grid.styleAt(0, 4)).toBe(0) // 'o' — no decoration
  })

  test('多个 decoration 不重叠时各自正确', () => {
    const grid = Grid.create(10, 1)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'ABCDEF'
    ti.decorations = [
      { start: 0, end: 2, style: encodeStyle(1, -1) }, // AB red
      { start: 4, end: 6, style: encodeStyle(2, -1) }, // EF green
    ]
    ti.paint(grid, 'input')

    expect(grid.styleAt(0, 0)).toBe(encodeStyle(1, -1)) // A
    expect(grid.styleAt(0, 1)).toBe(encodeStyle(1, -1)) // B
    expect(grid.styleAt(0, 2)).toBe(0) // C
    expect(grid.styleAt(0, 3)).toBe(0) // D
    expect(grid.styleAt(0, 4)).toBe(encodeStyle(2, -1)) // E
    expect(grid.styleAt(0, 5)).toBe(encodeStyle(2, -1)) // F
  })

  test('decoration 跨折行时正确', () => {
    const grid = Grid.create(5, 2)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'ABCDEFGH'
    ti.decorations = [{ start: 3, end: 7, style: encodeStyle(3, -1, BOLD) }] // DEFG bold yellow
    ti.paint(grid, 'input')

    expect(grid.styleAt(0, 2)).toBe(0) // C
    expect(grid.styleAt(0, 3)).toBe(encodeStyle(3, -1, BOLD)) // D
    expect(grid.styleAt(0, 4)).toBe(encodeStyle(3, -1, BOLD)) // E
    expect(grid.styleAt(1, 0)).toBe(encodeStyle(3, -1, BOLD)) // F
    expect(grid.styleAt(1, 1)).toBe(encodeStyle(3, -1, BOLD)) // G
    expect(grid.styleAt(1, 2)).toBe(0) // H
  })
})
