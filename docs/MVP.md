# terminal-renderer MVP

## 概述

terminal-renderer 是一个基于虚拟网格的终端渲染引擎。它将终端抽象为 `Cell[rows][cols]` 的二维缓冲区，Widget 声明式地在属于自己的格子中绘制内容，Grid 通过 dirty tracking 精准上屏。

MVP 目标：用最少的代码证明核心模型可行——虚拟网格 + ownership + dirty flush + 交互式文本输入。

---

## 核心原语

| 原语 | 类型 | 描述 |
|------|------|------|
| **Grid** | 数据+引擎 | 虚拟终端缓冲区。SoA 存储 + dirty tracking + flush 上屏 |
| **Cell** | 概念 | 网格中一个位置：char + style + owner + flags |
| **Widget** | 接口 | paint(grid, ownerId) — 在自己的格子中绘制内容 |
| **TextInput** | Widget | 多行文本输入。charIndex 光标 + 自动折行 + 滚动 |
| **Menu** | Widget | 列表选择器。items + selectedIndex + 高亮 |

---

## 用例映射

| # | 用例 | 原语组合 | 核心能力 |
|---|------|----------|----------|
| 1 | **多行文本编辑** | Grid + TextInput | 输入/删除/光标移动/折行/滚动/resize |
| 2 | **@mention 菜单** | Grid + TextInput + Menu | ownership 动态切换，Menu 覆盖 TextInput 区域 |
| 3 | **文本环绕块** | Grid + TextInput + 任意 Widget | 非连续 ownership 区域，文本自然绕排 |
| 4 | **带装饰的输入** | Grid + TextInput + 样式 | Widget 自行决定边框/竖线/高亮的绘制 |

---

## 用例 1：多行文本编辑

最核心的场景。一个 TextInput 占据整个 Grid，用户可以输入、删除、移动光标。

```typescript
const grid = Grid.create(80, 24)
const textInput = new TextInput()

// 所有格子归 textInput
grid.setOwnerAll('input')

watchEffect(() => {
  textInput.paint(grid, 'input')
  grid.flush(process.stderr)
})
```

验证点：
- 输入 ASCII/CJK 字符正确显示
- 超宽自动折行
- 光标左右移动位置正确
- ↑↓ 按渲染行跳转 + stickyCol
- Enter 换行、Backspace 删除
- 内容超出屏幕时滚动
- resize 后内容正确重排

---

## 用例 2：@mention 菜单

TextInput 中输入 `@` 触发菜单。菜单弹出时，应用层把菜单区域的 ownership 从 `'input'` 改为 `'menu'`。TextInput 自动跳过那些格子，文本重排。

```typescript
const menuOpen = ref(false)
const menuAnchor = computed(() => ({ row: textInput.cursorRow + 1, col: 0 }))

// Ownership 响应式声明
watchEffect(() => {
  grid.setOwnerAll('input')
  if (menuOpen.value) {
    const { row, col } = menuAnchor.value
    for (let r = row; r < row + 5 && r < grid.rows; r++) {
      for (let c = col; c < col + 20 && c < grid.cols; c++) {
        grid.setOwner(r, c, 'menu')
      }
    }
  }
})

// Paint cycle
watchEffect(() => {
  textInput.paint(grid, 'input')
  if (menuOpen.value) menu.paint(grid, 'menu')
  grid.flush(process.stderr)
})
```

验证点：
- @ 触发菜单弹出
- 菜单区域正确覆盖（TextInput 内容自动重排）
- ↑↓ 切换菜单选项
- Enter 选中，文本插入
- Esc 关闭菜单，区域恢复

---

## 用例 3：文本环绕

一个区块（如信息面板）占据 TextInput 中间的一块区域。TextInput 的文本在区块两侧流动。

```typescript
// 中间 5×3 的区域归 panel
for (let r = 1; r <= 3; r++) {
  for (let c = 30; c < 35; c++) {
    grid.setOwner(r, c, 'panel')
  }
}
// 其余归 input
```

验证点：
- 文本在 panel 两侧自然绕排
- 光标移动正确跳过 panel 区域
- ↑↓ 在 panel 旁的行中正确导航

---

## 用例 4：带装饰的输入

TextInput 自己决定如何利用边界格子画装饰（行号、边框等）。因为 Widget 拿到完整的 Grid 引用，它可以在 paint 时自行判断区域形状并绘制装饰。

```typescript
class DecoratedInput implements Widget {
  private textInput = new TextInput()
  
  paint(grid: Grid, ownerId: string) {
    // 找到自己区域的左边界，画行号
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        if (grid.ownerAt(row, col) === ownerId) {
          // 左边界的前 3 列画行号
          if (col < 3) {
            grid.setChar(row, col, lineNumberChar(row), DIM_STYLE)
          }
          break  // 只处理每行的第一个 owned cell
        }
      }
    }
    
    // 剩余区域交给 textInput（跳过行号列）
    this.textInput.paintWithOffset(grid, ownerId, 3)
  }
}
```

---

## MVP 边界

**范围内：**
- Grid: SoA 存储 + setChar/setOwner + dirty tracking + flush
- TextInput: 文本输入 + 光标 + 折行 + 滚动 + 编辑操作
- Menu: 列表显示 + 选中高亮
- 响应式驱动: watchEffect + paint cycle
- Ownership 动态切换
- CJK 宽字符 + continuation cell
- resize 处理 (reflow-aware clear + 重建)
- 基础样式 (16 色 + bold/dim/italic/underline)

**范围外：**
- 自动布局/flexbox
- 鼠标事件
- 256 色 / true color
- RTL / 双向文本
- 多光标/多焦点
- GhostText（延后）
- Markdown 高亮（延后）
- ownflow 集成（延后）
