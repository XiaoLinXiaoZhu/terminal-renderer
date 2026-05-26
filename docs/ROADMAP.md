# Roadmap

每一步独立可验收。验收 = 测试通过 + demo 可运行。

---

## 阶段 0: Grid 核心

### Step 0.1 — Grid 数据存储

**产出**: `src/grid.ts` — GridStore 类

SoA 存储模型，基础读写 API。

```typescript
const grid = Grid.create(80, 24)
grid.setChar(0, 0, 'A', styleNormal)
grid.charAt(0, 0)  // 'A'
grid.setOwner(0, 0, 'input')
grid.ownerAt(0, 0)  // 'input'
```

- [ ] **auto**: create 创建指定尺寸的 Grid，默认全空格
- [ ] **auto**: setChar/charAt 读写正确
- [ ] **auto**: setOwner/ownerAt 读写正确
- [ ] **auto**: flags 读写正确（IS_CONTINUATION）
- [ ] **auto**: setChar 相同值不标记 dirty
- [ ] **auto**: setChar 不同值标记 dirty
- [ ] **human**: 无

### Step 0.2 — 宽字符处理

**产出**: `src/grid.ts` + `src/width.ts`

宽字符写入时自动设置 continuation cell。覆盖 continuation cell 时自动清理关联的主 cell。

```typescript
grid.setWideChar(0, 0, '你', style)
// grid[0][0] = '你', grid[0][1] = '' + IS_CONTINUATION

grid.setChar(0, 1, 'x', style)
// 覆盖 continuation → 先清除 grid[0][0] 的 '你'（变为空格）
// 然后 grid[0][1] = 'x'
```

- [ ] **auto**: 宽字符写入正确设置 continuation
- [ ] **auto**: 覆盖 continuation cell 时清理主 cell
- [ ] **auto**: 覆盖主 cell 时清理 continuation
- [ ] **auto**: 宽字符在行末放不下时的处理（留空格）
- [ ] **auto**: string-width 封装：ASCII=1, CJK=2
- [ ] **human**: 无

### Step 0.3 — Flush 上屏

**产出**: `src/grid.ts` — flush 方法

遍历 dirty cells，生成 ANSI 序列写入输出流。

- [ ] **auto**: 无 dirty cells → 无输出
- [ ] **auto**: 单个 dirty cell → 正确的 move + style + char 序列
- [ ] **auto**: 连续 dirty cells → 批量输出（不重复 move）
- [ ] **auto**: 样式变化时输出 SGR
- [ ] **auto**: flush 后 dirty 标记清除
- [ ] **human**: 终端显示正确

### Step 0.4 — Demo: Hello Grid

**产出**: `demo/hello.ts`

硬编码文本写入 Grid，flush 到终端。验证基础管线通畅。

- [ ] **auto**: 无
- [ ] **human**: 终端显示带颜色的文本，CJK 正确

---

## 阶段 1: TextInput 基础

### Step 1.1 — TextInput paint（无交互）

**产出**: `src/text-input.ts`

TextInput.paint() 能把文本灌入 owned cells。支持自动折行和 CJK。

```typescript
const ti = new TextInput()
ti.text = '你好 world hello'
ti.paint(grid, 'input')
// Grid 中正确显示折行后的文本
```

- [ ] **auto**: 短文本正确填入
- [ ] **auto**: 超宽文本自动折行（文本流到下一行的 owned cells）
- [ ] **auto**: CJK 字符正确处理（不截断）
- [ ] **auto**: CJK 在行尾放不下时留空格跳行
- [ ] **auto**: 文本结束后剩余格子填空格
- [ ] **auto**: 只写入 owner 匹配的格子
- [ ] **human**: 无

### Step 1.2 — TextInput 光标定位

**产出**: `src/text-input.ts` — cursorRow/cursorCol 在 paint 时计算

- [ ] **auto**: cursorOffset=0 → 光标在首个 owned cell
- [ ] **auto**: cursorOffset=text.length → 光标在最后一个字符之后
- [ ] **auto**: CJK 后光标位置正确（跳过 continuation）
- [ ] **auto**: 折行后光标行列正确
- [ ] **human**: 无

### Step 1.3 — TextInput 编辑操作

**产出**: `src/text-input.ts` — insertChar, deleteBeforeCursor, moveLeft, moveRight

- [ ] **auto**: insertChar 插入并移动光标
- [ ] **auto**: deleteBeforeCursor 删除并回退光标
- [ ] **auto**: moveLeft 到头不溢出
- [ ] **auto**: moveRight 到尾不溢出
- [ ] **auto**: 编辑操作重置 stickyCol
- [ ] **human**: 无

### Step 1.4 — Demo: 交互式单行输入

**产出**: `demo/input.ts`

stdin raw mode + 按键解析 + TextInput + Grid flush。可以打字和移动光标。

- [ ] **auto**: 无
- [ ] **human**: 终端中输入字符、移动光标、删除、超宽折行、CJK 正确

---

## 阶段 2: 多行 + 垂直导航

### Step 2.1 — 换行支持

**产出**: `src/text-input.ts` — 文本中的 `\n` 处理

TextInput 的 text 中可以包含 `\n`。paint 时遇到 `\n` 就跳到下一行的第一个 owned cell。

- [ ] **auto**: `\n` 正确断行
- [ ] **auto**: 多行文本正确灌入
- [ ] **auto**: Enter 键 → 在光标处插入 `\n`
- [ ] **auto**: Backspace 在行首 → 删除 `\n`，合并行
- [ ] **human**: 无

### Step 2.2 — 垂直光标移动

**产出**: `src/text-input.ts` — moveUp, moveDown, stickyCol

- [ ] **auto**: moveUp 到上一行同列位置
- [ ] **auto**: moveDown 到下一行同列位置
- [ ] **auto**: stickyCol 在连续垂直移动时保持
- [ ] **auto**: 目标行比 stickyCol 短时定位到行尾
- [ ] **auto**: 非垂直操作重置 stickyCol
- [ ] **auto**: 第一行 moveUp 不动
- [ ] **auto**: 最后一行 moveDown 不动
- [ ] **human**: 无

### Step 2.3 — 滚动

**产出**: `src/text-input.ts` — scrollOffset 管理

内容超出 owned cells 行数时，通过 scrollOffset 滚动。

- [ ] **auto**: 内容不超出 → scrollOffset = 0
- [ ] **auto**: 光标移出视口底部 → scrollOffset 增加
- [ ] **auto**: 光标移出视口顶部 → scrollOffset 减少
- [ ] **auto**: 滚动后 paint 正确（从 scrollOffset 位置开始灌入）
- [ ] **human**: 无

### Step 2.4 — Demo: 多行编辑器

**产出**: `demo/editor.ts`

完整多行编辑体验。

- [ ] **auto**: 无
- [ ] **human**: 多行输入、↑↓ 正确跳转、滚动、resize 重排

---

## 阶段 3: Ownership 动态 + Menu

### Step 3.1 — Ownership 响应式切换

**产出**: ownership 动态变更 + TextInput 自适应

当 ownership 变化时，TextInput 下次 paint 自动重排文本（因为可用格子变了）。

- [ ] **auto**: ownership 变化后 TextInput 重排正确
- [ ] **auto**: 区域缩小时文本折行变化
- [ ] **auto**: 区域恢复时文本折行恢复
- [ ] **human**: 无

### Step 3.2 — Menu Widget

**产出**: `src/menu.ts`

- [ ] **auto**: items 正确渲染到 owned cells
- [ ] **auto**: selectedIndex 项高亮
- [ ] **auto**: selectNext/selectPrev 循环
- [ ] **human**: 无

### Step 3.3 — Menu + TextInput 集成

**产出**: 完整的 @mention 流程

```
输入 @ → menuOpen = true → ownership 切换 → Menu paint
↑↓ → 切换选项
Enter → 选中文本写入 TextInput → menuOpen = false → ownership 恢复
Esc → 关闭菜单
```

- [ ] **auto**: 菜单打开时 ownership 正确
- [ ] **auto**: TextInput 文本绕开菜单区域
- [ ] **auto**: 选中后文本正确插入
- [ ] **auto**: 关闭后区域恢复
- [ ] **human**: 无

### Step 3.4 — Demo: @mention 输入框

**产出**: `demo/mention.ts`

- [ ] **auto**: 无
- [ ] **human**: 完整的 @mention 交互体验

---

## 阶段 4: 文本环绕 + Resize

### Step 4.1 — 非连续 Ownership 区域

**产出**: 验证文本在不连续区域中的正确灌入

```
ownership:
  row 0: [I I I I I I I I I I]
  row 1: [I I I I P P P I I I]  (P = panel)
  row 2: [I I I I P P P I I I]
  row 3: [I I I I I I I I I I]
```

- [ ] **auto**: 文本正确绕过 P 区域
- [ ] **auto**: 光标跳过 P 区域的格子
- [ ] **auto**: ↑↓ 在环绕区域正确导航
- [ ] **human**: 无

### Step 4.2 — Resize 处理

**产出**: resize 事件处理

- [ ] **auto**: computeReflowHeight 正确计算
- [ ] **auto**: resize 后 Grid 尺寸更新
- [ ] **auto**: resize 后 ownership 重算 + repaint
- [ ] **human**: 拖动终端窗口，内容正确重排

### Step 4.3 — Demo: 环绕 + resize

**产出**: `demo/wrap.ts`

展示文本环绕块 + resize 的综合效果。

- [ ] **auto**: 无
- [ ] **human**: 文本在块两侧流动，resize 后正确重排

---

## 阶段 5: 样式 + 装饰

### Step 5.1 — 样式编码与输出

**产出**: `src/style.ts` — 编码/解码 + SGR 生成

- [ ] **auto**: encodeStyle 正确编码 fg/bg/flags
- [ ] **auto**: sgrFromEncoded 生成正确的 ANSI 序列
- [ ] **auto**: flush 时样式相同不重复输出 SGR
- [ ] **human**: 终端显示正确颜色

### Step 5.2 — TextInput Decorations

**产出**: TextInput 支持样式区间

```typescript
textInput.decorations = [
  { start: 2, end: 5, style: encodeStyle(RED, 0, BOLD) }
]
```

- [ ] **auto**: decoration 区间内字符用指定样式
- [ ] **auto**: 多个 decoration 不重叠时各自正确
- [ ] **auto**: decoration 跨折行时正确
- [ ] **human**: 肉眼可见颜色

### Step 5.3 — Demo: 带样式的输入

**产出**: `demo/styled.ts`

- [ ] **auto**: 无
- [ ] **human**: 输入文本部分高亮，resize 后样式不丢失

---

## 测试策略

### 单元测试

```
src/__tests__/
  grid.test.ts         # Grid 读写、dirty tracking
  width.test.ts        # string-width 封装
  text-input.test.ts   # 编辑操作、paint 结果、光标位置
  menu.test.ts         # Menu paint、导航
  style.test.ts        # 编码/解码
```

### 端到端 snapshot 测试

测试 helper：把 Grid 渲染为可读字符串，含光标标记。

```typescript
function gridToString(grid: Grid, cursor?: {row: number, col: number}): string {
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
  return result.trimEnd()
}

// 用法：
test('折行 + 光标', () => {
  const grid = Grid.create(5, 3)
  grid.setOwnerAll('input')
  const ti = new TextInput()
  ti.text = '你好world'
  ti.cursorOffset = 3  // '你好w' 之后
  ti.paint(grid, 'input')
  
  expect(gridToString(grid, { row: ti.cursorRow, col: ti.cursorCol })).toBe(
    '你好w|\n' +
    'orld \n' +
    '     '
  )
})
```

### 人工验证

每阶段末尾的 `demo/*.ts` 在终端中运行，肉眼确认效果。

---

## 依赖关系

```
0.1 Grid 存储
  → 0.2 宽字符
    → 0.3 Flush
      → 0.4 Hello demo
        → 1.1 TextInput paint
          → 1.2 光标定位
            → 1.3 编辑操作
              → 1.4 输入 demo
                → 2.1 换行
                  → 2.2 垂直导航
                    → 2.3 滚动
                      → 2.4 编辑器 demo
                        → 3.x Menu + ownership
                        → 4.x 环绕 + resize
                        → 5.x 样式
```

线性推进。每步建立在前一步之上。但关键区别是：**每步完成后都有可验证的端到端效果**（从 Step 0.4 开始就有 demo）。

---

## 验收标准（每步）

1. `bun test` 全部通过
2. `bun run typecheck` 零错误
3. 如有 demo，终端中运行正常
4. 代码可读，无过度抽象

---

## 项目结构

```
terminal-renderer/
├── src/
│   ├── grid.ts           # Grid 核心（存储 + dirty + flush）
│   ├── width.ts          # string-width 封装
│   ├── style.ts          # 样式编码/解码/SGR
│   ├── text-input.ts     # TextInput Widget
│   ├── menu.ts           # Menu Widget
│   ├── keys.ts           # 按键解析（raw stdin → action）
│   └── index.ts          # 公共 API
├── src/__tests__/
│   ├── helpers/
│   │   └── grid-to-string.ts
│   ├── grid.test.ts
│   ├── width.test.ts
│   ├── text-input.test.ts
│   ├── menu.test.ts
│   └── style.test.ts
├── demo/
│   ├── hello.ts          # 阶段 0
│   ├── input.ts          # 阶段 1
│   ├── editor.ts         # 阶段 2
│   ├── mention.ts        # 阶段 3
│   ├── wrap.ts           # 阶段 4
│   └── styled.ts         # 阶段 5
├── package.json
└── tsconfig.json
```
