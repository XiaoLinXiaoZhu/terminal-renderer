import { describe, test, expect } from 'bun:test'
import { encodeStyle, sgrFromEncoded, BOLD, DIM, ITALIC, UNDERLINE } from '../grid.ts'

describe('Style — Step 5.1: 样式编码与输出', () => {
  test('encodeStyle 正确编码 fg/bg/flags', () => {
    expect(encodeStyle(0, 0)).toBe(0)
    expect(encodeStyle(2, 0)).toBe(2) // red fg
    expect(encodeStyle(0, 3)).toBe(0x30) // green bg
    expect(encodeStyle(2, 3)).toBe(0x32) // red fg + green bg
    expect(encodeStyle(2, 3, BOLD)).toBe(0x132) // + bold
    expect(encodeStyle(0, 0, BOLD | ITALIC)).toBe(0x500) // bold + italic
  })

  test('sgrFromEncoded style=0 → reset', () => {
    expect(sgrFromEncoded(0)).toBe('\x1b[0m')
  })

  test('sgrFromEncoded fg 颜色正确', () => {
    const sgr = sgrFromEncoded(encodeStyle(2, 0)) // red
    expect(sgr).toContain('31') // ANSI red = 31
  })

  test('sgrFromEncoded bg 颜色正确', () => {
    const sgr = sgrFromEncoded(encodeStyle(0, 3)) // green bg
    expect(sgr).toContain('42') // ANSI green bg = 42
  })

  test('sgrFromEncoded flags 正确', () => {
    const boldSgr = sgrFromEncoded(encodeStyle(0, 0, BOLD))
    expect(boldSgr).toContain(';1') // bold = SGR 1

    const dimSgr = sgrFromEncoded(encodeStyle(0, 0, DIM))
    expect(dimSgr).toContain(';2') // dim = SGR 2

    const italicSgr = sgrFromEncoded(encodeStyle(0, 0, ITALIC))
    expect(italicSgr).toContain(';3') // italic = SGR 3

    const ulSgr = sgrFromEncoded(encodeStyle(0, 0, UNDERLINE))
    expect(ulSgr).toContain(';4') // underline = SGR 4
  })

  test('sgrFromEncoded 组合样式', () => {
    const sgr = sgrFromEncoded(encodeStyle(2, 5, BOLD | UNDERLINE))
    expect(sgr).toContain('31') // red fg
    expect(sgr).toContain('44') // blue bg
    expect(sgr).toContain(';1') // bold
    expect(sgr).toContain(';4') // underline
  })
})

describe('TextInput — Step 5.2: Decorations', () => {
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

    // row 0: ABCDE — D,E styled
    expect(grid.styleAt(0, 2)).toBe(0) // C
    expect(grid.styleAt(0, 3)).toBe(encodeStyle(4, 0, BOLD)) // D
    expect(grid.styleAt(0, 4)).toBe(encodeStyle(4, 0, BOLD)) // E
    // row 1: FGH — F,G styled, H not
    expect(grid.styleAt(1, 0)).toBe(encodeStyle(4, 0, BOLD)) // F
    expect(grid.styleAt(1, 1)).toBe(encodeStyle(4, 0, BOLD)) // G
    expect(grid.styleAt(1, 2)).toBe(0) // H
  })
})
