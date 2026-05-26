import { Grid, IS_CONTINUATION } from '../../grid.ts'

/**
 * 将 Grid 渲染为可读字符串（用于 snapshot 测试）。
 * continuation cell 被跳过（它们不占字符位）。
 * 如果提供了 cursor，会在光标位置插入 '|'。
 */
export function gridToString(
  grid: Grid,
  cursor?: { row: number; col: number }
): string {
  let result = ''
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (cursor && cursor.row === row && cursor.col === col) {
        result += '|'
      }
      if (grid.flagsAt(row, col) & IS_CONTINUATION) continue
      result += grid.charAt(row, col)
    }
    result += '\n'
  }
  return result.replace(/\n$/, '')
}
