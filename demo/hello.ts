/**
 * Demo: Hello Grid (Step 0.4)
 *
 * 硬编码文本写入 Grid，flush 到终端。验证基础管线通畅。
 * 运行: bun demo/hello.ts
 */

import { Grid, encodeStyle, BOLD, DIM, ITALIC, UNDERLINE } from '../src/grid.ts'
import { charWidth } from '../src/width.ts'

const cols = process.stderr.columns || 80
const rows = process.stderr.rows || 24
const grid = Grid.create(cols, rows)

// 辅助：在指定行写入字符串（支持宽字符）
function writeString(grid: Grid, row: number, startCol: number, text: string, style: number): void {
  let col = startCol
  for (const ch of text) {
    if (col >= grid.cols) break
    const w = charWidth(ch)
    if (w === 2) {
      grid.setWideChar(row, col, ch, style)
      col += 2
    } else {
      grid.setChar(row, col, ch, style)
      col += 1
    }
  }
}

// 标题 — 粗体白色
const titleStyle = encodeStyle(8, 0, BOLD) // white + bold
writeString(grid, 0, 2, 'terminal-renderer — Hello Grid Demo', titleStyle)

// 分隔线
const dimStyle = encodeStyle(0, 0, DIM)
writeString(grid, 1, 2, '─'.repeat(40), dimStyle)

// 英文文本 — 绿色
const greenStyle = encodeStyle(3, 0)
writeString(grid, 3, 2, 'Hello, World!', greenStyle)

// CJK 文本 — 黄色斜体
const cjkStyle = encodeStyle(4, 0, ITALIC)
writeString(grid, 4, 2, '你好，世界！这是终端渲染器。', cjkStyle)

// 混合文本 — 红色
const redStyle = encodeStyle(2, 0)
writeString(grid, 5, 2, 'Mix: ABC你好DEF世界GHI', redStyle)

// 样式展示
const boldStyle = encodeStyle(6, 0, BOLD)    // magenta + bold
const italicStyle = encodeStyle(7, 0, ITALIC) // cyan + italic
const ulStyle = encodeStyle(5, 0, UNDERLINE)  // blue + underline

writeString(grid, 7, 2, 'Bold', boldStyle)
writeString(grid, 7, 8, 'Italic', italicStyle)
writeString(grid, 7, 16, 'Underline', ulStyle)

// 颜色展示
writeString(grid, 9, 2, '■ Red', encodeStyle(2, 0))
writeString(grid, 9, 9, '■ Green', encodeStyle(3, 0))
writeString(grid, 9, 18, '■ Yellow', encodeStyle(4, 0))
writeString(grid, 9, 28, '■ Blue', encodeStyle(5, 0))
writeString(grid, 9, 36, '■ Magenta', encodeStyle(6, 0))
writeString(grid, 9, 47, '■ Cyan', encodeStyle(7, 0))

// CJK 边界测试：宽字符在行尾
const infoStyle = encodeStyle(0, 0, DIM)
writeString(grid, 11, 2, `Grid: ${cols}×${rows} | 宽字符边界测试:`, infoStyle)
// 在接近行尾处写入宽字符
if (cols > 20) {
  grid.setWideChar(12, cols - 3, '你', cjkStyle) // 放得下
  grid.setWideChar(12, cols - 1, '好', cjkStyle) // 放不下 → 留空格
  writeString(grid, 13, 2, `col ${cols - 3}: '你' (fits)  |  col ${cols - 1}: '好' (overflow → space)`, infoStyle)
}

// flush 上屏
grid.flush(process.stderr)

// 光标移到底部，避免 shell prompt 覆盖输出
process.stderr.write(`\x1b[${rows};1H\x1b[0m`)
