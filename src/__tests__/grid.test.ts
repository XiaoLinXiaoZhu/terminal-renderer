import { describe, test, expect } from 'bun:test'
import { Grid, IS_CONTINUATION, encodeStyle } from '../grid.ts'
import { gridToString } from './helpers/grid-to-string.ts'

describe('Grid — Step 0.1: 数据存储', () => {
  test('create 创建指定尺寸的 Grid，默认全空格', () => {
    const grid = Grid.create(5, 3)
    expect(grid.cols).toBe(5)
    expect(grid.rows).toBe(3)
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        expect(grid.charAt(r, c)).toBe(' ')
        expect(grid.styleAt(r, c)).toBe(0)
        expect(grid.ownerAt(r, c)).toBe('')
        expect(grid.flagsAt(r, c)).toBe(0)
      }
    }
  })

  test('setChar/charAt 读写正确', () => {
    const grid = Grid.create(10, 5)
    const style = encodeStyle(2, 0) // red fg
    grid.setChar(1, 3, 'A', style)
    expect(grid.charAt(1, 3)).toBe('A')
    expect(grid.styleAt(1, 3)).toBe(style)
  })

  test('setOwner/ownerAt 读写正确', () => {
    const grid = Grid.create(10, 5)
    grid.setOwner(2, 4, 'input')
    expect(grid.ownerAt(2, 4)).toBe('input')
    expect(grid.ownerAt(0, 0)).toBe('')
  })

  test('setOwnerAll 设置所有格子', () => {
    const grid = Grid.create(3, 2)
    grid.setOwnerAll('input')
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        expect(grid.ownerAt(r, c)).toBe('input')
      }
    }
  })

  test('flags 读写正确（IS_CONTINUATION）', () => {
    const grid = Grid.create(10, 5)
    grid.setFlags(0, 1, IS_CONTINUATION)
    expect(grid.flagsAt(0, 1)).toBe(IS_CONTINUATION)
    expect(grid.flagsAt(0, 0)).toBe(0)
  })

  test('setChar 相同值不标记 dirty', () => {
    const grid = Grid.create(5, 3)
    // 初始是空格和 style 0
    // 先写入值使 dirty 为 true，然后 "flush" 清除 dirty
    grid.setChar(0, 0, 'X', 1)
    expect(grid.isDirty(0, 0)).toBe(true)

    // 模拟 flush 清除 dirty
    const buf: string[] = []
    grid.flush({ write: (s) => buf.push(s) })
    expect(grid.isDirty(0, 0)).toBe(false)

    // 再写入相同值
    grid.setChar(0, 0, 'X', 1)
    expect(grid.isDirty(0, 0)).toBe(false)
  })

  test('setChar 不同值标记 dirty', () => {
    const grid = Grid.create(5, 3)
    grid.setChar(0, 0, 'A', 0)
    expect(grid.isDirty(0, 0)).toBe(true)

    const buf: string[] = []
    grid.flush({ write: (s) => buf.push(s) })

    grid.setChar(0, 0, 'B', 0)
    expect(grid.isDirty(0, 0)).toBe(true)
  })

  test('setChar 改变 style 也标记 dirty', () => {
    const grid = Grid.create(5, 3)
    grid.setChar(0, 0, 'A', 1)
    const buf: string[] = []
    grid.flush({ write: (s) => buf.push(s) })

    grid.setChar(0, 0, 'A', 2)
    expect(grid.isDirty(0, 0)).toBe(true)
  })
})

describe('Grid — Step 0.2: 宽字符处理', () => {
  test('宽字符写入正确设置 continuation', () => {
    const grid = Grid.create(10, 3)
    grid.setWideChar(0, 0, '你', 0)
    expect(grid.charAt(0, 0)).toBe('你')
    expect(grid.charAt(0, 1)).toBe('')
    expect(grid.flagsAt(0, 1)).toBe(IS_CONTINUATION)
    expect(grid.flagsAt(0, 0)).toBe(0)
  })

  test('覆盖 continuation cell 时清理主 cell', () => {
    const grid = Grid.create(10, 3)
    grid.setWideChar(0, 0, '你', 0)

    // 覆盖 continuation (col 1)
    grid.setChar(0, 1, 'x', 0)
    expect(grid.charAt(0, 0)).toBe(' ') // 主 cell 被清理为空格
    expect(grid.charAt(0, 1)).toBe('x')
    expect(grid.flagsAt(0, 1)).toBe(0) // continuation 标记消失
  })

  test('覆盖主 cell 时清理 continuation', () => {
    const grid = Grid.create(10, 3)
    grid.setWideChar(0, 0, '你', 0)

    // 覆盖主 cell (col 0)
    grid.setChar(0, 0, 'A', 0)
    expect(grid.charAt(0, 0)).toBe('A')
    expect(grid.charAt(0, 1)).toBe(' ') // continuation 被清理
    expect(grid.flagsAt(0, 1)).toBe(0)
  })

  test('宽字符在行末放不下时的处理（留空格）', () => {
    const grid = Grid.create(5, 3)
    // col=4 是最后一列，宽字符需要 2 列放不下
    grid.setWideChar(0, 4, '你', 0)
    expect(grid.charAt(0, 4)).toBe(' ')
    expect(grid.flagsAt(0, 4)).toBe(0)
  })

  test('宽字符覆盖另一个宽字符的 continuation', () => {
    const grid = Grid.create(10, 3)
    grid.setWideChar(0, 0, '你', 0)
    // 写入另一个宽字符覆盖 continuation 位置
    grid.setWideChar(0, 1, '好', 0)
    expect(grid.charAt(0, 0)).toBe(' ') // 原主 cell 被清理
    expect(grid.charAt(0, 1)).toBe('好')
    expect(grid.charAt(0, 2)).toBe('')
    expect(grid.flagsAt(0, 2)).toBe(IS_CONTINUATION)
  })

  test('宽字符覆盖另一个宽字符的主 cell', () => {
    const grid = Grid.create(10, 3)
    grid.setWideChar(0, 2, '好', 0)
    // 写入宽字符到 col 1，其 continuation 会覆盖 col 2（原主 cell）
    grid.setWideChar(0, 1, '你', 0)
    expect(grid.charAt(0, 1)).toBe('你')
    expect(grid.charAt(0, 2)).toBe('')
    expect(grid.flagsAt(0, 2)).toBe(IS_CONTINUATION)
    expect(grid.charAt(0, 3)).toBe(' ') // 原 '好' 的 continuation 被清理
    expect(grid.flagsAt(0, 3)).toBe(0)
  })

  test('gridToString 正确显示宽字符', () => {
    const grid = Grid.create(6, 1)
    grid.setWideChar(0, 0, '你', 0)
    grid.setWideChar(0, 2, '好', 0)
    grid.setChar(0, 4, '!', 0)
    expect(gridToString(grid)).toBe('你好! ')
  })
})

describe('Grid — Step 0.3: flush 上屏', () => {
  test('无 dirty cells → 无输出', () => {
    const grid = Grid.create(5, 3)
    // 初始全是空格、style 0，但 dirty 默认为 false
    const output: string[] = []
    grid.flush({ write: (s) => output.push(s) })
    expect(output.join('')).toBe('')
  })

  test('单个 dirty cell → 正确的 move + style + char 序列', () => {
    const grid = Grid.create(10, 5)
    grid.setChar(2, 3, 'X', 0)
    const output: string[] = []
    grid.flush({ write: (s) => output.push(s) })
    const result = output.join('')
    // 移动到 (2, 3) → \x1b[3;4H (1-based)
    expect(result).toContain('\x1b[3;4H')
    // style=0 → reset
    expect(result).toContain('\x1b[0m')
    // 字符
    expect(result).toContain('X')
  })

  test('连续 dirty cells → 批量输出（不重复 move）', () => {
    const grid = Grid.create(10, 5)
    grid.setChar(1, 0, 'A', 0)
    grid.setChar(1, 1, 'B', 0)
    grid.setChar(1, 2, 'C', 0)
    const output: string[] = []
    grid.flush({ write: (s) => output.push(s) })
    const result = output.join('')
    // 只应有一次 cursor move
    const moveCount = (result.match(/\x1b\[\d+;\d+H/g) || []).length
    expect(moveCount).toBe(1)
    expect(result).toContain('A')
    expect(result).toContain('B')
    expect(result).toContain('C')
  })

  test('样式变化时输出 SGR', () => {
    const grid = Grid.create(10, 5)
    const redStyle = encodeStyle(2, 0)
    const greenStyle = encodeStyle(3, 0)
    grid.setChar(0, 0, 'R', redStyle)
    grid.setChar(0, 1, 'G', greenStyle)
    const output: string[] = []
    grid.flush({ write: (s) => output.push(s) })
    const result = output.join('')
    // 应有两次 SGR 输出（两种不同样式）
    const sgrCount = (result.match(/\x1b\[\d[\d;]*m/g) || []).length
    expect(sgrCount).toBe(2)
  })

  test('flush 后 dirty 标记清除', () => {
    const grid = Grid.create(5, 3)
    grid.setChar(0, 0, 'A', 0)
    grid.setChar(1, 2, 'B', 0)
    expect(grid.isDirty(0, 0)).toBe(true)
    expect(grid.isDirty(1, 2)).toBe(true)

    grid.flush({ write: () => {} })
    expect(grid.isDirty(0, 0)).toBe(false)
    expect(grid.isDirty(1, 2)).toBe(false)
  })

  test('flush 跳过 continuation cell', () => {
    const grid = Grid.create(10, 3)
    grid.setWideChar(0, 0, '你', 0)
    const output: string[] = []
    grid.flush({ write: (s) => output.push(s) })
    const result = output.join('')
    // 应该输出 '你'，不应该输出空字符串作为单独字符
    expect(result).toContain('你')
    // continuation cell 的 dirty 也应清除
    expect(grid.isDirty(0, 1)).toBe(false)
  })
})
