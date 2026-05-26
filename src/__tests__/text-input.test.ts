import { describe, test, expect } from 'bun:test'
import { Grid } from '../grid.ts'
import { TextInput } from '../text-input.ts'
import { gridToString } from './helpers/grid-to-string.ts'

describe('TextInput — Step 1.1: paint', () => {
  test('短文本正确填入', () => {
    const grid = Grid.create(10, 1)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'Hello'
    ti.paint(grid, 'input')
    expect(gridToString(grid)).toBe('Hello     ')
  })

  test('超宽文本自动折行', () => {
    const grid = Grid.create(5, 3)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'HelloWorld'
    ti.paint(grid, 'input')
    expect(gridToString(grid)).toBe(
      'Hello\n' +
      'World\n' +
      '     '
    )
  })

  test('CJK 字符正确处理（不截断）', () => {
    const grid = Grid.create(6, 2)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = '你好AB'
    ti.paint(grid, 'input')
    expect(gridToString(grid)).toBe(
      '你好AB\n' +
      '      '
    )
  })

  test('CJK 在行尾放不下时留空格跳行', () => {
    const grid = Grid.create(5, 2)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'ABC你好'
    ti.paint(grid, 'input')
    // 'ABC' takes 3 cols, '你' needs 2 but only 2 left (cols 3,4) → fits!
    // Wait: col 3 and 4 → 2 cols → '你' fits.
    // Then '好' needs 2 cols on row 1, fits at col 0,1.
    expect(gridToString(grid)).toBe(
      'ABC你\n' +
      '好   '
    )
  })

  test('CJK 在行尾只剩1列时留空格跳行', () => {
    const grid = Grid.create(5, 2)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'ABCD你'
    ti.paint(grid, 'input')
    // 'ABCD' fills cols 0-3, col 4 has 1 space left, '你' needs 2 → can't fit
    // col 4 gets space, '你' goes to row 1
    expect(gridToString(grid)).toBe(
      'ABCD \n' +
      '你   '
    )
  })

  test('文本结束后剩余格子填空格', () => {
    const grid = Grid.create(5, 2)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'Hi'
    ti.paint(grid, 'input')
    expect(gridToString(grid)).toBe(
      'Hi   \n' +
      '     '
    )
  })

  test('只写入 owner 匹配的格子', () => {
    const grid = Grid.create(10, 1)
    // 只前5列属于 input
    for (let c = 0; c < 5; c++) grid.setOwner(0, c, 'input')
    for (let c = 5; c < 10; c++) grid.setOwner(0, c, 'other')

    const ti = new TextInput()
    ti.text = 'HelloWorld'
    ti.paint(grid, 'input')

    // 只有前5格被写入
    expect(grid.charAt(0, 0)).toBe('H')
    expect(grid.charAt(0, 4)).toBe('o')
    // 后5格未被触碰（仍是默认空格）
    expect(grid.charAt(0, 5)).toBe(' ')
  })

  test('非连续 ownership 区域的文本灌入', () => {
    const grid = Grid.create(10, 1)
    // cols 0-2 和 7-9 属于 input，中间属于 other
    for (let c = 0; c < 3; c++) grid.setOwner(0, c, 'input')
    for (let c = 3; c < 7; c++) grid.setOwner(0, c, 'other')
    for (let c = 7; c < 10; c++) grid.setOwner(0, c, 'input')

    const ti = new TextInput()
    ti.text = 'ABCDEF'
    ti.paint(grid, 'input')

    expect(grid.charAt(0, 0)).toBe('A')
    expect(grid.charAt(0, 1)).toBe('B')
    expect(grid.charAt(0, 2)).toBe('C')
    // cols 3-6 not owned, not written
    expect(grid.charAt(0, 7)).toBe('D')
    expect(grid.charAt(0, 8)).toBe('E')
    expect(grid.charAt(0, 9)).toBe('F')
  })
})

describe('TextInput — Step 1.2: 光标定位', () => {
  test('cursorOffset=0 → 光标在首个 owned cell', () => {
    const grid = Grid.create(10, 2)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'Hello'
    ti.cursorOffset = 0
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(0)
    expect(ti.cursorCol).toBe(0)
  })

  test('cursorOffset=text.length → 光标在最后一个字符之后', () => {
    const grid = Grid.create(10, 2)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'Hello'
    ti.cursorOffset = 5
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(0)
    expect(ti.cursorCol).toBe(5)
  })

  test('CJK 后光标位置正确（跳过 continuation）', () => {
    const grid = Grid.create(10, 2)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = '你好'
    ti.cursorOffset = 1 // 在 '你' 之后
    ti.paint(grid, 'input')
    // '你' 占 col 0,1。cursorOffset=1 意味着第 1 个字符之后 → col 2
    expect(ti.cursorRow).toBe(0)
    expect(ti.cursorCol).toBe(2)
  })

  test('折行后光标行列正确', () => {
    const grid = Grid.create(5, 3)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'HelloWorld'
    ti.cursorOffset = 7 // 'HelloWo' 之后 → 'r' 位置
    ti.paint(grid, 'input')
    // row 0: Hello (charIdx 0-4)
    // row 1: World (charIdx 5-9)
    // cursorOffset=7 → charIdx 7 在 row 1, col 2
    expect(ti.cursorRow).toBe(1)
    expect(ti.cursorCol).toBe(2)
  })

  test('CJK + 折行 + 光标综合', () => {
    const grid = Grid.create(5, 3)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = '你好world'
    ti.cursorOffset = 3 // '你好w' 之后
    ti.paint(grid, 'input')
    // '你' → cols 0,1; '好' → cols 2,3; col 4 only 1 left → 'w' fits
    // row 0: 你好w (charIdx 0,1,2)
    // row 1: orld  (charIdx 3,4,5,6)
    // cursorOffset=3 → charIdx 3 在 row 1, col 0
    expect(gridToString(grid, { row: ti.cursorRow, col: ti.cursorCol })).toBe(
      '你好w\n' +
      '|orld \n' +
      '     '
    )
  })
})

describe('TextInput — Step 1.3: 编辑操作', () => {
  test('insertChar 插入并移动光标', () => {
    const ti = new TextInput()
    ti.text = 'AC'
    ti.cursorOffset = 1
    ti.insertChar('B')
    expect(ti.text).toBe('ABC')
    expect(ti.cursorOffset).toBe(2)
  })

  test('insertChar CJK', () => {
    const ti = new TextInput()
    ti.text = 'A'
    ti.cursorOffset = 1
    ti.insertChar('你')
    expect(ti.text).toBe('A你')
    expect(ti.cursorOffset).toBe(2)
  })

  test('deleteBeforeCursor 删除并回退光标', () => {
    const ti = new TextInput()
    ti.text = 'ABC'
    ti.cursorOffset = 2
    ti.deleteBeforeCursor()
    expect(ti.text).toBe('AC')
    expect(ti.cursorOffset).toBe(1)
  })

  test('deleteBeforeCursor 删除 CJK 字符', () => {
    const ti = new TextInput()
    ti.text = 'A你B'
    ti.cursorOffset = 2 // after '你'
    ti.deleteBeforeCursor()
    expect(ti.text).toBe('AB')
    expect(ti.cursorOffset).toBe(1)
  })

  test('deleteBeforeCursor 在开头不动', () => {
    const ti = new TextInput()
    ti.text = 'ABC'
    ti.cursorOffset = 0
    ti.deleteBeforeCursor()
    expect(ti.text).toBe('ABC')
    expect(ti.cursorOffset).toBe(0)
  })

  test('moveLeft 到头不溢出', () => {
    const ti = new TextInput()
    ti.text = 'ABC'
    ti.cursorOffset = 0
    ti.moveLeft()
    expect(ti.cursorOffset).toBe(0)
  })

  test('moveLeft 正常后退', () => {
    const ti = new TextInput()
    ti.text = 'ABC'
    ti.cursorOffset = 2
    ti.moveLeft()
    expect(ti.cursorOffset).toBe(1)
  })

  test('moveLeft 跳过 CJK 整个字符', () => {
    const ti = new TextInput()
    ti.text = 'A你B'
    ti.cursorOffset = 2 // after '你'
    ti.moveLeft()
    expect(ti.cursorOffset).toBe(1) // before '你'
  })

  test('moveRight 到尾不溢出', () => {
    const ti = new TextInput()
    ti.text = 'ABC'
    ti.cursorOffset = 3
    ti.moveRight()
    expect(ti.cursorOffset).toBe(3)
  })

  test('moveRight 正常前进', () => {
    const ti = new TextInput()
    ti.text = 'ABC'
    ti.cursorOffset = 1
    ti.moveRight()
    expect(ti.cursorOffset).toBe(2)
  })

  test('moveRight 跳过 CJK 整个字符', () => {
    const ti = new TextInput()
    ti.text = 'A你B'
    ti.cursorOffset = 1 // before '你'
    ti.moveRight()
    expect(ti.cursorOffset).toBe(2) // after '你'
  })

  test('编辑操作重置 stickyCol', () => {
    const ti = new TextInput()
    ti.text = 'ABC'
    ti.cursorOffset = 1
    ti.stickyCol = 5
    ti.insertChar('X')
    expect(ti.stickyCol).toBeNull()

    ti.stickyCol = 3
    ti.deleteBeforeCursor()
    expect(ti.stickyCol).toBeNull()

    ti.stickyCol = 3
    ti.moveLeft()
    expect(ti.stickyCol).toBeNull()

    ti.stickyCol = 3
    ti.moveRight()
    expect(ti.stickyCol).toBeNull()
  })
})
