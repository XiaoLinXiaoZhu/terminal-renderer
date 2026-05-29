import { describe, it, expect } from 'bun:test'
import { Grid } from '../grid.ts'
import { TextInput } from '../text-input'

describe('TextInput — moveUp/moveDown 在非零起始行的滚动', () => {
  it('input 区域不从 row 0 开始时，顶部按 ↑ 应触发向上滚动', () => {
    // 模拟 enhanced demo 布局：row 0 不属于 input，rows 1-4 属于 input
    // 使用 20 列宽的 grid，每行文本 5 字符（含换行远不会填满一行）
    const grid = Grid.create(20, 5)
    for (let c = 0; c < 20; c++) grid.setOwner(0, c, 'indicator')
    for (let r = 1; r < 5; r++) {
      for (let c = 0; c < 20; c++) grid.setOwner(r, c, 'input')
    }

    const ti = new TextInput()
    // 6 行短文本
    ti.text = 'AAA\nBBB\nCCC\nDDD\nEEE\nFFF'
    // scrollOffset 跳过第一行 "AAA\n"，从 BBB 开始显示
    ti.scrollOffset = 4
    // 光标在 BBB 行开头（可见区域第一行）
    ti.cursorOffset = 4

    ti.paint(grid, 'input')
    // 光标应在 row 1（input 区域第一行）
    expect(ti.cursorRow).toBe(1)

    // 按 ↑ — 应该触发向上滚动
    ti.moveUp(grid, 'input')

    // 光标应该移到 scrollOffset 之前的内容（即 AAA 行）
    expect(ti.cursorOffset).toBeLessThan(4)
  })

  it('input 区域从 row 0 开始时，顶部按 ↑ 正常触发滚动（原有行为）', () => {
    const grid = Grid.create(20, 4)
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 20; c++) grid.setOwner(r, c, 'input')
    }

    const ti = new TextInput()
    ti.text = 'AAA\nBBB\nCCC\nDDD\nEEE\nFFF'
    ti.scrollOffset = 4
    ti.cursorOffset = 4

    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(0)

    ti.moveUp(grid, 'input')
    expect(ti.cursorOffset).toBeLessThan(4)
  })

  it('input 区域不到最后一行时，底部按 ↓ 应触发向下滚动', () => {
    // rows 0-3 属于 input，row 4 属于 status
    const grid = Grid.create(20, 5)
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 20; c++) grid.setOwner(r, c, 'input')
    }
    for (let c = 0; c < 20; c++) grid.setOwner(4, c, 'status')

    const ti = new TextInput()
    // 6 行短文本，只有 4 行可显示
    ti.text = 'AAA\nBBB\nCCC\nDDD\nEEE\nFFF'
    //          0123 4567 8901 2345 6789 0123
    // offsets: A=0-2, \n=3, B=4-6, \n=7, C=8-10, \n=11, D=12-14, \n=15, E=16-18, \n=19, F=20-22
    ti.scrollOffset = 0
    // 光标在 DDD 行开头（可见区域最后一行 = row 3）
    ti.cursorOffset = 12

    ti.paint(grid, 'input')
    // row 0: AAA\n, row 1: BBB\n, row 2: CCC\n, row 3: DDD...
    expect(ti.cursorRow).toBe(3)

    // 按 ↓ — 应该触发向下滚动（还有 EEE、FFF）
    ti.moveDown(grid, 'input')

    // 光标应该移到 DDD 行之后的内容
    expect(ti.cursorOffset).toBeGreaterThan(12)
  })

  it('底部行下方无 owned cell 且无更多内容时，↓ 不超出文本范围', () => {
    // rows 0-1 属于 input，row 2+ 属于其他
    const grid = Grid.create(20, 3)
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 20; c++) grid.setOwner(r, c, 'input')
    }
    for (let c = 0; c < 20; c++) grid.setOwner(2, c, 'status')

    const ti = new TextInput()
    ti.text = 'AAA\nBBB'
    ti.scrollOffset = 0
    ti.cursorOffset = 4 // BBB 行开头

    ti.paint(grid, 'input')
    // row 0: AAA\n, row 1: BBB
    expect(ti.cursorRow).toBe(1)

    // 按 ↓ — row 2 无 ownership，没有更多内容需要滚动
    ti.moveDown(grid, 'input')
    // 光标移到行尾（标准编辑器行为：最后一行按↓移到行末）
    expect(ti.cursorOffset).toBe(7) // end of 'BBB'
    expect(ti.cursorOffset).toBeLessThanOrEqual(ti.text.length)
  })
})
