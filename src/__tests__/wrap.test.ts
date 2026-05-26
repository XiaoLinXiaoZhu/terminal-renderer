import { describe, test, expect } from 'bun:test'
import { Grid } from '../grid.ts'
import { TextInput } from '../text-input.ts'
import { gridToString } from './helpers/grid-to-string.ts'

describe('TextInput — Step 4.1: 非连续 Ownership 区域', () => {
  /** 创建带中心 panel 的 grid */
  function createGridWithPanel() {
    const grid = Grid.create(10, 4)
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 10; c++) grid.setOwner(r, c, 'input')
    }
    // rows 1-2, cols 4-6 归 panel
    for (let r = 1; r <= 2; r++) {
      for (let c = 4; c <= 6; c++) grid.setOwner(r, c, 'panel')
    }
    return grid
  }

  test('文本正确绕过 P 区域', () => {
    const grid = createGridWithPanel()
    const ti = new TextInput()
    ti.text = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    ti.paint(grid, 'input')

    // row 0: 10 owned cells → ABCDEFGHIJ (chars 0-9)
    expect(grid.charAt(0, 0)).toBe('A')
    expect(grid.charAt(0, 9)).toBe('J')

    // row 1: cells 0-3, 7-9 owned (7 cells) → KLMNOPQ (chars 10-16)
    expect(grid.charAt(1, 0)).toBe('K')
    expect(grid.charAt(1, 3)).toBe('N')
    expect(grid.charAt(1, 7)).toBe('O')
    expect(grid.charAt(1, 9)).toBe('Q')

    // row 2: same pattern → RSTUVWX (chars 17-23)
    expect(grid.charAt(2, 0)).toBe('R')
    expect(grid.charAt(2, 3)).toBe('U')
    expect(grid.charAt(2, 7)).toBe('V')
    expect(grid.charAt(2, 9)).toBe('X')

    // row 3: 10 owned cells → YZ + spaces (chars 24-25)
    expect(grid.charAt(3, 0)).toBe('Y')
    expect(grid.charAt(3, 1)).toBe('Z')
    expect(grid.charAt(3, 2)).toBe(' ')
  })

  test('光标跳过 P 区域的格子', () => {
    const grid = createGridWithPanel()
    const ti = new TextInput()
    ti.text = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

    // 光标在 row 1 的 panel 之后 (char 'O' at col 7)
    ti.cursorOffset = 14 // 'O'
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(1)
    expect(ti.cursorCol).toBe(7) // 跳过了 cols 4-6

    // 光标在 row 1 panel 之前 (char 'N' at col 3)
    ti.cursorOffset = 13
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(1)
    expect(ti.cursorCol).toBe(3)
  })

  test('↑↓ 在环绕区域正确导航', () => {
    const grid = createGridWithPanel()
    const ti = new TextInput()
    ti.text = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

    // Start at row 0, col 2 (char 'C')
    ti.cursorOffset = 2
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(0)
    expect(ti.cursorCol).toBe(2)

    // moveDown to row 1, col 2 → 'M' (col 2 is owned on row 1)
    ti.moveDown(grid, 'input')
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(1)
    expect(ti.cursorCol).toBe(2)

    // moveDown to row 2, col 2 → 'T'
    ti.moveDown(grid, 'input')
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(2)
    expect(ti.cursorCol).toBe(2)

    // moveDown to row 3, col 2 → 'Z' or space (depends on content)
    ti.moveDown(grid, 'input')
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(3)
    expect(ti.cursorCol).toBe(2)
  })

  test('↑↓ 目标列在 panel 内时跳到最近的 owned cell', () => {
    const grid = createGridWithPanel()
    const ti = new TextInput()
    ti.text = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

    // Start at row 0, col 5 (char 'F')
    ti.cursorOffset = 5
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(0)
    expect(ti.cursorCol).toBe(5)

    // moveDown to row 1 — col 5 is panel, should land on first owned cell after col 5
    ti.moveDown(grid, 'input')
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(1)
    expect(ti.cursorCol).toBe(7) // first owned cell at or after col 5 on row 1

    // moveUp back — stickyCol=5, row 0 col 5 is owned → should return to col 5
    ti.moveUp(grid, 'input')
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(0)
    expect(ti.cursorCol).toBe(5)
  })

  test('CJK 在环绕区域边界的处理', () => {
    const grid = Grid.create(10, 3)
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 10; c++) grid.setOwner(r, c, 'input')
    }
    // cols 3-4 on row 1 belong to panel (2 cols)
    grid.setOwner(1, 3, 'panel')
    grid.setOwner(1, 4, 'panel')

    const ti = new TextInput()
    ti.text = 'ABCDEFGHIJ你好KLMN'
    ti.paint(grid, 'input')

    // row 0: 10 owned cells → ABCDEFGHIJ (10 chars)
    expect(grid.charAt(0, 9)).toBe('J')
    // row 1: owned = cols 0-2, 5-9 (8 cells)
    // '你' needs 2 cells. At col 0: cols 0,1 owned → fits
    expect(grid.charAt(1, 0)).toBe('你')
    // '好' at col 2: needs cols 2,3 but col 3 is panel → can't fit
    // col 2 gets space, '好' tries later at col 5: cols 5,6 owned → fits
    expect(grid.charAt(1, 2)).toBe(' ')
    expect(grid.charAt(1, 5)).toBe('好')
  })
})

describe('Grid — Step 4.2: Resize 处理', () => {
  test('computeReflowHeight 正确计算', () => {
    const grid = Grid.create(10, 3)
    grid.setChar(0, 0, 'A', 0)
    grid.setChar(0, 9, 'B', 0) // row 0 has content width 10
    grid.setChar(1, 0, 'C', 0)
    grid.setChar(1, 4, 'D', 0) // row 1 has content width 5
    // row 2 is all spaces → content width 0

    // Reflow to width 5:
    // row 0 (width 10) → ceil(10/5) = 2 rows
    // row 1 (width 5)  → ceil(5/5) = 1 row
    // row 2 (width 0)  → 1 row (minimum)
    expect(grid.computeReflowHeight(5)).toBe(4)
  })

  test('resize 后 Grid 尺寸更新', () => {
    const grid = Grid.create(10, 5)
    grid.setChar(0, 0, 'X', 1)
    grid.resize(20, 10)
    expect(grid.cols).toBe(20)
    expect(grid.rows).toBe(10)
    // 旧内容清除
    expect(grid.charAt(0, 0)).toBe(' ')
    // 所有 cell 标记为 dirty（用于全量重绘）
    expect(grid.isDirty(0, 0)).toBe(true)
    expect(grid.isDirty(9, 19)).toBe(true)
  })

  test('resize 后 ownership 重算 + repaint 正确', () => {
    const grid = Grid.create(10, 3)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'HelloWorld!'

    ti.paint(grid, 'input')
    expect(grid.charAt(0, 0)).toBe('H')
    expect(grid.charAt(0, 9)).toBe('d')
    expect(grid.charAt(1, 0)).toBe('!')

    // Resize to narrower
    grid.resize(5, 4)
    grid.setOwnerAll('input')
    ti.paint(grid, 'input')
    // "HelloWorld!" now wraps at 5: Hello/World/!
    expect(grid.charAt(0, 0)).toBe('H')
    expect(grid.charAt(0, 4)).toBe('o')
    expect(grid.charAt(1, 0)).toBe('W')
    expect(grid.charAt(1, 4)).toBe('d')
    expect(grid.charAt(2, 0)).toBe('!')
  })
})
