import { describe, test, expect } from 'bun:test'
import { Grid, encodeStyle } from '../grid.ts'
import { Menu } from '../menu.ts'
import { gridToString } from './helpers/grid-to-string.ts'

const NORMAL_STYLE = encodeStyle(-1, -1)
const HIGHLIGHT_STYLE = encodeStyle(0, 7) // black on white

describe('Menu — Step 3.2', () => {
  test('items 正确渲染到 owned cells', () => {
    const grid = Grid.create(10, 3)
    grid.setOwnerAll('menu')
    const menu = new Menu()
    menu.items = ['Apple', 'Banana', 'Cherry']
    menu.paint(grid, 'menu')
    expect(gridToString(grid)).toBe(
      'Apple     \n' +
      'Banana    \n' +
      'Cherry    '
    )
  })

  test('selectedIndex 项高亮', () => {
    const grid = Grid.create(10, 3)
    grid.setOwnerAll('menu')
    const menu = new Menu()
    menu.items = ['A', 'B', 'C']
    menu.selectedIndex = 1
    menu.paint(grid, 'menu')
    // 选中项(B)应该用 HIGHLIGHT_STYLE
    expect(grid.styleAt(1, 0)).toBe(HIGHLIGHT_STYLE)
    // 非选中项(A)应该用 NORMAL_STYLE
    expect(grid.styleAt(0, 0)).toBe(NORMAL_STYLE)
  })

  test('selectNext/selectPrev 循环', () => {
    const menu = new Menu()
    menu.items = ['A', 'B', 'C']
    menu.selectedIndex = 0

    menu.selectNext()
    expect(menu.selectedIndex).toBe(1)
    menu.selectNext()
    expect(menu.selectedIndex).toBe(2)
    menu.selectNext()
    expect(menu.selectedIndex).toBe(0) // 循环

    menu.selectPrev()
    expect(menu.selectedIndex).toBe(2) // 循环回去
    menu.selectPrev()
    expect(menu.selectedIndex).toBe(1)
  })

  test('CJK items 正确渲染', () => {
    const grid = Grid.create(8, 2)
    grid.setOwnerAll('menu')
    const menu = new Menu()
    menu.items = ['你好', '世界']
    menu.paint(grid, 'menu')
    expect(gridToString(grid)).toBe(
      '你好    \n' +
      '世界    '
    )
  })

  test('items 超出行数时截断', () => {
    const grid = Grid.create(10, 2)
    grid.setOwnerAll('menu')
    const menu = new Menu()
    menu.items = ['A', 'B', 'C'] // 3 items but only 2 rows
    menu.paint(grid, 'menu')
    expect(gridToString(grid)).toBe(
      'A         \n' +
      'B         '
    )
  })

  test('部分 ownership 区域', () => {
    const grid = Grid.create(10, 3)
    // 只有 cols 2-7 属于 menu，行 0-2
    for (let r = 0; r < 3; r++) {
      for (let c = 2; c < 8; c++) {
        grid.setOwner(r, c, 'menu')
      }
    }
    const menu = new Menu()
    menu.items = ['Hello', 'World']
    menu.paint(grid, 'menu')
    expect(grid.charAt(0, 2)).toBe('H')
    expect(grid.charAt(0, 6)).toBe('o')
    expect(grid.charAt(1, 2)).toBe('W')
  })
})

describe('TextInput + Menu — Step 3.1 & 3.3: Ownership 切换', () => {
  test('ownership 变化后 TextInput 重排正确', () => {
    const { TextInput } = require('../text-input')
    const grid = Grid.create(10, 3)
    grid.setOwnerAll('input')

    const ti = new TextInput()
    ti.text = 'ABCDEFGHIJ' // 10 chars, fits in 1 row of 10 cols

    ti.paint(grid, 'input')
    expect(gridToString(grid)).toBe(
      'ABCDEFGHIJ\n' +
      '          \n' +
      '          '
    )

    // 缩小 ownership：只保留前 5 列
    for (let r = 0; r < 3; r++) {
      for (let c = 5; c < 10; c++) {
        grid.setOwner(r, c, 'other')
      }
    }

    ti.paint(grid, 'input')
    // 10 chars 在 5 cols 宽的区域中折行为 2 行
    expect(grid.charAt(0, 0)).toBe('A')
    expect(grid.charAt(0, 4)).toBe('E')
    expect(grid.charAt(1, 0)).toBe('F')
    expect(grid.charAt(1, 4)).toBe('J')
  })

  test('区域缩小时文本折行变化', () => {
    const { TextInput } = require('../text-input')
    const grid = Grid.create(10, 4)
    grid.setOwnerAll('input')

    const ti = new TextInput()
    ti.text = 'Hello World!'

    ti.paint(grid, 'input')
    // 全部在第一行
    expect(grid.charAt(0, 0)).toBe('H')
    expect(grid.charAt(1, 1)).toBe('!')

    // 缩小到 6 列
    for (let r = 0; r < 4; r++) {
      for (let c = 6; c < 10; c++) {
        grid.setOwner(r, c, 'other')
      }
    }

    ti.paint(grid, 'input')
    // "Hello " 在第 0 行, "World!" 在第 1 行
    expect(grid.charAt(0, 0)).toBe('H')
    expect(grid.charAt(0, 5)).toBe(' ')
    expect(grid.charAt(1, 0)).toBe('W')
  })

  test('区域恢复时文本折行恢复', () => {
    const { TextInput } = require('../text-input')
    const grid = Grid.create(10, 3)
    grid.setOwnerAll('input')

    const ti = new TextInput()
    ti.text = 'ABCDEFGHIJ'

    // 先缩小
    for (let r = 0; r < 3; r++) {
      for (let c = 5; c < 10; c++) {
        grid.setOwner(r, c, 'other')
      }
    }
    ti.paint(grid, 'input')
    expect(grid.charAt(1, 0)).toBe('F') // 折到第二行

    // 恢复
    grid.setOwnerAll('input')
    ti.paint(grid, 'input')
    expect(grid.charAt(0, 9)).toBe('J') // 又在第一行了
    expect(grid.charAt(1, 0)).toBe(' ') // 第二行被清空
  })

  test('菜单打开时 TextInput 文本绕开菜单区域', () => {
    const { TextInput } = require('../text-input')
    const grid = Grid.create(10, 4)
    grid.setOwnerAll('input')

    const ti = new TextInput()
    ti.text = 'ABCDEFGHIJKLMNOP' // 16 chars

    // 模拟菜单打开：row 1-2, cols 0-4 归 menu
    for (let r = 1; r <= 2; r++) {
      for (let c = 0; c < 5; c++) {
        grid.setOwner(r, c, 'menu')
      }
    }

    ti.paint(grid, 'input')
    // row 0: ABCDEFGHIJ (10 chars)
    // row 1: cols 5-9 owned → KLMNO (5 chars, but only 5 cols owned)
    // row 2: cols 5-9 → P + spaces
    // row 3: full row → space
    expect(grid.charAt(0, 0)).toBe('A')
    expect(grid.charAt(0, 9)).toBe('J')
    expect(grid.charAt(1, 5)).toBe('K')
    expect(grid.charAt(1, 9)).toBe('O')
    expect(grid.charAt(2, 5)).toBe('P')
  })

  test('选中后文本正确插入', () => {
    const { TextInput } = require('../text-input')
    const ti = new TextInput()
    ti.text = 'Hello @'
    ti.cursorOffset = 7

    // 模拟选中 menu item
    const selectedText = 'World'
    ti.insertChar(selectedText)
    expect(ti.text).toBe('Hello @World')
    expect(ti.cursorOffset).toBe(12)
  })

  test('关闭后区域恢复', () => {
    const { TextInput } = require('../text-input')
    const grid = Grid.create(10, 3)
    grid.setOwnerAll('input')

    const ti = new TextInput()
    ti.text = 'ABCDEFGHIJ'

    // 打开菜单 → 缩小区域
    for (let c = 0; c < 5; c++) grid.setOwner(1, c, 'menu')
    ti.paint(grid, 'input')

    // 关闭菜单 → 恢复区域
    grid.setOwnerAll('input')
    ti.paint(grid, 'input')
    expect(gridToString(grid)).toBe(
      'ABCDEFGHIJ\n' +
      '          \n' +
      '          '
    )
  })
})
