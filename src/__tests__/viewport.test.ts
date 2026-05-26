import { describe, it, expect } from 'bun:test'
import { Grid } from '../grid.ts'
import { Viewport } from '../viewport.ts'

function createMockStream() {
  let output = ''
  return {
    write(s: string) { output += s },
    get output() { return output },
    clear() { output = '' },
  }
}

describe('Viewport', () => {
  it('mount 输出正确的预留空间序列', () => {
    const grid = Grid.create(10, 3)
    const stream = createMockStream()
    const vp = new Viewport(grid, stream)

    vp.mount()

    // 3 个换行 + 上移 3 行
    expect(stream.output).toBe('\n\n\n\x1b[3A')
  })

  it('render 无 dirty cells 时只做光标定位', () => {
    const grid = Grid.create(10, 3)
    const stream = createMockStream()
    const vp = new Viewport(grid, stream)

    // 模拟已 mount（cursorRow = 0）
    vp.mount()
    stream.clear()

    // flush 无 dirty → 返回 {0,0}，然后定位到 target
    vp.render({ row: 1, col: 5 })

    // 应该包含：回到 home（已在 home，无上移）+ \r + flush（无输出）+ reset + 定位到 (1,5)
    // 回到 home: \r
    // flush 返回 (0,0)
    // reset: \x1b[0m
    // 从 (0,0) 到 (1,5): 下移1 + \r + 右移5
    expect(stream.output).toBe('\r\x1b[0m\x1b[1B\r\x1b[5C')
  })

  it('render 有 dirty cells 时正确 flush 并定位光标', () => {
    const grid = Grid.create(10, 3)
    const stream = createMockStream()
    const vp = new Viewport(grid, stream)

    vp.mount()
    stream.clear()

    // 写入一个字符使其 dirty
    grid.setChar(0, 0, 'A', 0)

    vp.render({ row: 0, col: 1 })

    // 回到 home: \r
    // flush: 输出 A（在 0,0 位置，flush 起始就在 0,0 所以不需要移动）
    // reset: \x1b[0m
    // endPos = {0, 1}，target = {0, 1}，不需要移动
    // 但 moveFromTo 总是输出 \r + 可能的右移
    expect(stream.output).toContain('A')
    expect(stream.output).toContain('\x1b[0m')
  })

  it('render 后追踪 cursorRow，下次 render 能正确回到 home', () => {
    const grid = Grid.create(10, 5)
    const stream = createMockStream()
    const vp = new Viewport(grid, stream)

    vp.mount()
    stream.clear()

    // 第一次 render，光标定位到 row 3
    vp.render({ row: 3, col: 0 })
    stream.clear()

    // 第二次 render，应该先上移 3 行回到 home
    grid.setChar(0, 0, 'B', 0)
    vp.render({ row: 0, col: 0 })

    // 开头应该有上移 3 行的序列
    expect(stream.output).toContain('\x1b[3A')
  })

  it('clear 清除动态区域并重置光标', () => {
    const grid = Grid.create(10, 3)
    const stream = createMockStream()
    const vp = new Viewport(grid, stream)

    vp.mount()
    // 模拟光标在 row 2
    vp.render({ row: 2, col: 0 })
    stream.clear()

    vp.clear()

    // 应该上移 2 行回到 home，然后 \x1b[J 清除
    expect(stream.output).toContain('\x1b[2A')
    expect(stream.output).toContain('\x1b[J')
  })

  it('commit 固化内容并重新预留空间', () => {
    const grid = Grid.create(10, 3)
    const stream = createMockStream()
    const vp = new Viewport(grid, stream)

    vp.mount()
    vp.render({ row: 1, col: 0 })
    stream.clear()

    vp.commit('Hello\n')

    // 应包含：clear（上移+\x1b[J）+ 输出内容 + mount（3换行+上移3）
    expect(stream.output).toContain('\x1b[J')
    expect(stream.output).toContain('Hello\n')
    expect(stream.output).toContain('\n\n\n\x1b[3A')
  })
})
