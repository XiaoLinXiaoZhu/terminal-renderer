/**
 * TextInput — 多行文本输入 Widget
 *
 * 将文本灌入 Grid 中属于自己的格子。支持自动折行、CJK 宽字符、
 * 换行符、光标定位、垂直导航、滚动、粘贴。
 *
 * 本类是组合 facade：状态保存在实例上，渲染/编辑/导航/滚动逻辑
 * 分别由 paint / edit / navigate / scroll 模块的纯函数实现。
 */

import type { Grid } from '../grid.ts'
import type { Decoration, TextInputState } from './types.ts'
import { paint } from './paint.ts'
import {
  insertChar,
  insertText,
  deleteBeforeCursor,
  moveLeft,
  moveRight,
} from './edit.ts'
import { moveUp, moveDown } from './navigate.ts'
import { ensureCursorVisible } from './scroll.ts'

export class TextInput implements TextInputState {
  text: string = ''
  cursorOffset: number = 0
  scrollOffset: number = 0
  stickyCol: number | null = null
  decorations: Decoration[] = []

  // paint 后更新的光标网格位置
  cursorRow: number = 0
  cursorCol: number = 0

  paint(grid: Grid, ownerId: string): void {
    paint(this, grid, ownerId)
  }

  // --- 编辑操作 ---

  insertChar(ch: string): void {
    insertChar(this, ch)
  }

  /** 插入一段粘贴文本（换行符会被规范化为 \n） */
  insertText(text: string): void {
    insertText(this, text)
  }

  deleteBeforeCursor(): void {
    deleteBeforeCursor(this)
  }

  moveLeft(): void {
    moveLeft(this)
  }

  moveRight(): void {
    moveRight(this)
  }

  // --- 垂直导航 ---

  moveUp(grid: Grid, ownerId: string): void {
    moveUp(this, grid, ownerId)
  }

  moveDown(grid: Grid, ownerId: string): void {
    moveDown(this, grid, ownerId)
  }

  // --- 滚动 ---

  ensureCursorVisible(grid: Grid, ownerId: string): boolean {
    return ensureCursorVisible(this, grid, ownerId)
  }
}
