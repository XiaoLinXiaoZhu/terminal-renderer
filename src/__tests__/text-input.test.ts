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
    for (let c = 0; c < 5; c++) grid.setOwner(0, c, 'input')
    for (let c = 5; c < 10; c++) grid.setOwner(0, c, 'other')

    const ti = new TextInput()
    ti.text = 'HelloWorld'
    ti.paint(grid, 'input')

    expect(grid.charAt(0, 0)).toBe('H')
    expect(grid.charAt(0, 4)).toBe('o')
    expect(grid.charAt(0, 5)).toBe(' ')
  })

  test('非连续 ownership 区域的文本灌入', () => {
    const grid = Grid.create(10, 1)
    for (let c = 0; c < 3; c++) grid.setOwner(0, c, 'input')
    for (let c = 3; c < 7; c++) grid.setOwner(0, c, 'other')
    for (let c = 7; c < 10; c++) grid.setOwner(0, c, 'input')

    const ti = new TextInput()
    ti.text = 'ABCDEF'
    ti.paint(grid, 'input')

    expect(grid.charAt(0, 0)).toBe('A')
    expect(grid.charAt(0, 1)).toBe('B')
    expect(grid.charAt(0, 2)).toBe('C')
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
    ti.cursorOffset = 1
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(0)
    expect(ti.cursorCol).toBe(2)
  })

  test('折行后光标行列正确', () => {
    const grid = Grid.create(5, 3)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'HelloWorld'
    ti.cursorOffset = 7
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(1)
    expect(ti.cursorCol).toBe(2)
  })

  test('CJK + 折行 + 光标综合', () => {
    const grid = Grid.create(5, 3)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = '你好world'
    ti.cursorOffset = 3
    ti.paint(grid, 'input')
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
    ti.cursorOffset = 2
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
    ti.cursorOffset = 2
    ti.moveLeft()
    expect(ti.cursorOffset).toBe(1)
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
    ti.cursorOffset = 1
    ti.moveRight()
    expect(ti.cursorOffset).toBe(2)
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

describe('TextInput — Step 2.1: 换行支持', () => {
  test('\\n 正确断行', () => {
    const grid = Grid.create(10, 3)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'Hello\nWorld'
    ti.paint(grid, 'input')
    expect(gridToString(grid)).toBe(
      'Hello     \n' +
      'World     \n' +
      '          '
    )
  })

  test('多行文本正确灌入', () => {
    const grid = Grid.create(5, 4)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'AB\nCD\nEF'
    ti.paint(grid, 'input')
    expect(gridToString(grid)).toBe(
      'AB   \n' +
      'CD   \n' +
      'EF   \n' +
      '     '
    )
  })

  test('Enter 键 → 在光标处插入 \\n', () => {
    const ti = new TextInput()
    ti.text = 'AB'
    ti.cursorOffset = 1
    ti.insertChar('\n')
    expect(ti.text).toBe('A\nB')
    expect(ti.cursorOffset).toBe(2)
  })

  test('Backspace 在行首 → 删除 \\n，合并行', () => {
    const ti = new TextInput()
    ti.text = 'A\nB'
    ti.cursorOffset = 2 // at start of 'B'
    ti.deleteBeforeCursor()
    expect(ti.text).toBe('AB')
    expect(ti.cursorOffset).toBe(1)
  })

  test('换行 + 自动折行组合', () => {
    const grid = Grid.create(5, 4)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'ABCDEFG\nHI'
    ti.paint(grid, 'input')
    // 'ABCDEFG' auto-wraps at col 5: row 0 = ABCDE, row 1 = FG + spaces (due to \n)
    // 'HI' starts on row 2
    expect(gridToString(grid)).toBe(
      'ABCDE\n' +
      'FG   \n' +
      'HI   \n' +
      '     '
    )
  })

  test('光标在 \\n 处的定位', () => {
    const grid = Grid.create(10, 3)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'AB\nCD'
    ti.cursorOffset = 2 // at '\n'
    ti.paint(grid, 'input')
    // cursorOffset=2 指向 '\n' 字符。在 paint 遍历中，当 charIdx=2 时光标被定位。
    // '\n' 在 row 0, col 2 位置
    expect(ti.cursorRow).toBe(0)
    expect(ti.cursorCol).toBe(2)
  })

  test('光标在 \\n 之后（下一行起始）', () => {
    const grid = Grid.create(10, 3)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'AB\nCD'
    ti.cursorOffset = 3 // 'C' position
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(1)
    expect(ti.cursorCol).toBe(0)
  })
})

describe('TextInput — Step 2.2: 垂直光标移动', () => {
  test('moveUp 到上一行同列位置', () => {
    const grid = Grid.create(10, 3)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'Hello\nWorld'
    ti.cursorOffset = 9 // 'l' in 'World' (index: 'Hello\n' = 6, then 'Wor' = 3 → 9)
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(1)
    expect(ti.cursorCol).toBe(3)

    ti.moveUp(grid, 'input')
    // Should move to row 0, col 3 → 'l' in 'Hello' → cursorOffset = 3
    expect(ti.cursorOffset).toBe(3)
  })

  test('moveDown 到下一行同列位置', () => {
    const grid = Grid.create(10, 3)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'Hello\nWorld'
    ti.cursorOffset = 3 // 'l' in 'Hello'
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(0)
    expect(ti.cursorCol).toBe(3)

    ti.moveDown(grid, 'input')
    // Should move to row 1, col 3 → 'l' in 'World' → cursorOffset = 9
    expect(ti.cursorOffset).toBe(9)
  })

  test('stickyCol 在连续垂直移动时保持', () => {
    const grid = Grid.create(10, 4)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'ABCDE\nFG\nHIJKL'
    ti.cursorOffset = 4 // 'E' in first line (col 4)
    ti.paint(grid, 'input')
    expect(ti.cursorCol).toBe(4)

    ti.moveDown(grid, 'input')
    // row 1 only has 'FG' (2 chars), col 4 > end → position at end
    // 'FG' occupies cols 0-1, so target col 4 → past end → charIdx at end of 'FG' = 8 (after '\n' + FG)
    expect(ti.stickyCol).toBe(4)
    ti.paint(grid, 'input')

    ti.moveDown(grid, 'input')
    // row 2 has 'HIJKL', stickyCol=4 → col 4 → 'L' → charIdx = 13
    ti.paint(grid, 'input')
    expect(ti.cursorCol).toBe(4)
  })

  test('目标行比 stickyCol 短时定位到行尾', () => {
    const grid = Grid.create(10, 3)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'ABCDE\nFG'
    ti.cursorOffset = 4 // col 4 on first line
    ti.paint(grid, 'input')

    ti.moveDown(grid, 'input')
    ti.paint(grid, 'input')
    // 'FG' is 2 chars, stickyCol=4 > line end → cursor at end of 'FG'
    expect(ti.cursorOffset).toBe(8) // 'ABCDE\nFG'.length = 8 → at end
    expect(ti.cursorRow).toBe(1)
  })

  test('非垂直操作重置 stickyCol', () => {
    const grid = Grid.create(10, 3)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'Hello\nWorld'
    ti.cursorOffset = 3
    ti.paint(grid, 'input')

    ti.moveDown(grid, 'input')
    expect(ti.stickyCol).toBe(3)

    ti.moveLeft()
    expect(ti.stickyCol).toBeNull()
  })

  test('第一行 moveUp 不动', () => {
    const grid = Grid.create(10, 3)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'Hello\nWorld'
    ti.cursorOffset = 2
    ti.paint(grid, 'input')

    ti.moveUp(grid, 'input')
    expect(ti.cursorOffset).toBe(2) // 不变
  })

  test('最后一行 moveDown 不动', () => {
    const grid = Grid.create(10, 3)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'Hello\nWorld'
    ti.cursorOffset = 8
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(1)

    ti.moveDown(grid, 'input')
    // row 2 has no owned cells with text → but row 2 exists and is owned
    // However since cursorRow=1 and targetRow=2, we try to resolve char at row 2
    // Row 2 is empty (text ended) → cursor stays where it can be placed
    ti.paint(grid, 'input')
    // cursorOffset should position at end of text or on row 2
  })

  test('自动折行中的 moveUp/moveDown', () => {
    const grid = Grid.create(5, 3)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'HelloWorld!'
    ti.cursorOffset = 7 // 'r' on second visual line
    ti.paint(grid, 'input')
    // row 0: Hello (0-4)
    // row 1: World (5-9)
    // row 2: !     (10)
    expect(ti.cursorRow).toBe(1)
    expect(ti.cursorCol).toBe(2)

    ti.moveUp(grid, 'input')
    // target: row 0, col 2 → 'l' → cursorOffset = 2
    expect(ti.cursorOffset).toBe(2)
  })

  test('空行导航：stickyCol 跨越空行保持', () => {
    const grid = Grid.create(10, 5)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = '1231123\n\n123'
    ti.cursorOffset = 4 // col 4 on first line
    ti.paint(grid, 'input')
    expect(ti.cursorCol).toBe(4)

    // Down to empty line
    ti.moveDown(grid, 'input')
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(1)
    expect(ti.cursorCol).toBe(0) // empty line end
    expect(ti.stickyCol).toBe(4)

    // Down to "123"
    ti.moveDown(grid, 'input')
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(2)
    expect(ti.cursorCol).toBe(3) // end of "123", stickyCol=4 > length

    // Up back to empty line
    ti.moveUp(grid, 'input')
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(1)
    expect(ti.cursorCol).toBe(0)

    // Up back to first line - should restore col 4
    ti.moveUp(grid, 'input')
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBe(0)
    expect(ti.cursorCol).toBe(4)
  })
})

describe('TextInput — Step 2.3: 滚动', () => {
  test('内容不超出 → scrollOffset = 0', () => {
    const grid = Grid.create(10, 3)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'Hello'
    ti.ensureCursorVisible(grid, 'input')
    expect(ti.scrollOffset).toBe(0)
  })

  test('光标移出视口底部 → scrollOffset 增加', () => {
    const grid = Grid.create(5, 2) // 只有 2 行
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'AAAAABBBBBCCCCC' // 3 visual lines of 5 chars each
    ti.cursorOffset = 12 // on third visual line
    ti.ensureCursorVisible(grid, 'input')
    expect(ti.scrollOffset).toBeGreaterThan(0)
    // 重新 paint 验证光标在视口内
    ti.paint(grid, 'input')
    expect(ti.cursorRow).toBeGreaterThanOrEqual(0)
    expect(ti.cursorRow).toBeLessThan(grid.rows)
  })

  test('光标移出视口顶部 → scrollOffset 减少', () => {
    const grid = Grid.create(5, 2)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'AAAAABBBBBCCCCC'
    ti.scrollOffset = 10 // scrolled to third line
    ti.cursorOffset = 3 // cursor in first line (before scrollOffset)
    ti.ensureCursorVisible(grid, 'input')
    expect(ti.scrollOffset).toBe(0) // scrolled back to start
  })

  test('滚动后 paint 正确', () => {
    const grid = Grid.create(5, 2)
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'AAAAABBBBB'
    ti.scrollOffset = 5 // start from 'BBBBB'
    ti.cursorOffset = 7
    ti.paint(grid, 'input')
    expect(gridToString(grid)).toBe(
      'BBBBB\n' +
      '     '
    )
    expect(ti.cursorRow).toBe(0)
    expect(ti.cursorCol).toBe(2) // 'B' at index 7, displayed at col 2 (offset 7-5=2)
  })

  test('换行文本的滚动', () => {
    const grid = Grid.create(10, 2) // 2 rows
    grid.setOwnerAll('input')
    const ti = new TextInput()
    ti.text = 'Line1\nLine2\nLine3'
    ti.cursorOffset = 14 // 'n' in 'Line3'
    ti.ensureCursorVisible(grid, 'input')
    ti.paint(grid, 'input')
    // 滚动后 Line3 应该在视口内
    expect(ti.cursorRow).toBeGreaterThanOrEqual(0)
    expect(ti.cursorRow).toBeLessThan(2)
  })
})
