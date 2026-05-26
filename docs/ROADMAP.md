# Roadmap

每一步独立可验收：实现 → 写测试 → 跑 demo → 确认通过。不跳过、不并行。

---

## 阶段 0: 基础设施

> **🧪 突变测试已集成**：每个模块的纯函数都通过 `bun run mutate` 验证（使用 stryker-mutator），确保测试套件能有效捕获逻辑错误。

### ✅ Step 0.1 — ANSI Builder
**产出**: `src/ansi.ts`

纯函数，构建 ANSI escape code。不依赖终端，不写 stderr。

```typescript
// 核心 API
sgr({ fg: 'red', bold: true })        // → "\x1b[31;1m"
sgr.reset()                            // → "\x1b[0m"
cursor.up(n)                           // → "\x1b[nA"
cursor.down(n)                         // → "\x1b[nB"
cursor.to(row, col)                    // → "\x1b[row;colH"
cursor.hide() / cursor.show()
erase.screenEnd()                      // → "\x1b[0J"
erase.lineEnd()                        // → "\x1b[0K"
```

- [ ] **auto**: 每个函数的输出字符串断言
- [ ] **auto**: 组合样式（fg+bg+bold+italic）输出正确序列
- [ ] **auto**: reset 在多个样式后正确重置
- [ ] **human**: 无

### ✅ Step 0.2 — string-width 封装
**产出**: `src/width.ts`

封装 `string-width`，提供统一的宽度计算入口。为什么封装：未来可能换库或加缓存。

```typescript
width(s: string): number           // 可见宽度
width.slice(s, start, end): string // 按宽度截取子串
```

- [ ] **auto**: ASCII 字符宽度=1
- [ ] **auto**: CJK 字符宽度=2
- [ ] **auto**: emoji 宽度正确
- [ ] **auto**: width.slice 在 CJK 边界正确切割
- [ ] **human**: 无

### ✅ Step 0.3 — VNode 类型 + h() 工厂
**产出**: `src/vnode.ts`

定义 6 种 tag 的 TypeScript 类型和 h() 工厂函数。

```typescript
h('root', {}, [
  h('text', { value: 'hello' }),
  h('textinput', { focus: true }, [])
])
```

- [ ] **auto**: h() 返回正确的 VNode 结构
- [ ] **auto**: 嵌套 children 树正确
- [ ] **auto**: attrs 类型检查（非法 attr 报 TS 错误）
- [ ] **human**: 无

---

## 阶段 1: 纯文本折行 (Flow 引擎核心)

### Step 1.1 — 简单折行（无样式）
**产出**: `src/flow.ts` — `layoutSimple(text: string, cols: number): string[]`

输入纯文本和列宽，输出按 cols 折行的字符串数组。这是 Flow 引擎的最简内核。

```
输入: "hello world this is a long text", cols=10
输出: ["hello worl", "d this is ", "a long tex", "t"]
```

- [ ] **auto**: 空字符串 → [""]
- [ ] **auto**: 短文本 < cols → 1 行
- [ ] **auto**: 精确等于 cols → 1 行
- [ ] **auto**: 超 cols → 多行，每行 ≤ cols
- [ ] **auto**: CJK 字符折行正确（不截断半个字符）
- [ ] **auto**: 换行符 `\n` 强制断行
- [ ] **human**: 无

### Step 1.2 — 多文本行折行 + wrapMeta
**产出**: `src/flow.ts` — `layoutTextLines(lines: string[], cols: number): { rows: string[], wrapMeta: WrapMeta[] }`

多行文本折行，同时产出 wrapMeta（每个文本行折成了哪几个输入行）供光标上下移动使用。

```typescript
interface WrapMeta {
  textLineIndex: number     // 来源文本行
  inputLineStart: number    // 第一个输入行在 rows 中的索引
  inputLineCount: number    // 占用的输入行数
}
```

- [ ] **auto**: 单行短文本 → wrapMeta: [{textLine: 0, start: 0, count: 1}]
- [ ] **auto**: 单行长文本折 3 行 → wrapMeta count=3
- [ ] **auto**: 多行混排（短+长+短）→ 各行 wrapMeta 索引正确
- [ ] **auto**: `\n` 强制断行与折行混合 → wrapMeta 正确映射
- [ ] **human**: 无

### Step 1.3 — 带 StyleRange 的折行
**产出**: `src/flow.ts` — `layoutStyled(text: string, styles: StyleRange[], cols: number): TerminalRow[]`

输入文本 + 样式范围 + 列宽，产出 TerminalRow[]。折行时自动跨行继承样式。

```
TerminalRow { text: string, styles: StyleRange[] }
```

- [ ] **auto**: 单行无样式 → TerminalRow.text = 原文，styles = [{}]
- [ ] **auto**: 单 style 不跨行 → 1 行，styles 正确
- [ ] **auto**: style 跨折行 → 第一行和第二行都包含对应的（调整后）style
- [ ] **auto**: 多 style 部分重叠 → 正确合并
- [ ] **auto**: 折行后 styles 的 start/end 偏移正确调整
- [ ] **auto**: CJK + style → 宽度和样式都不丢失
- [ ] **human**: 无

---

## 阶段 2: Screen（终端渲染）

### Step 2.1 — Screen 基础写入
**产出**: `src/screen.ts`

```typescript
const screen = createScreen()
screen.render(rows: TerminalRow[], cursorPos: ScreenPosition)
```

将 TerminalRow[] 按 ANSI 写入 stderr。首次写入无 diff——全量产出。

- [ ] **auto**: ANSI 字符串包含的行数 = TerminalRow.length
- [ ] **auto**: ANSI 字符串包含 SGR 样式码
- [ ] **auto**: ANSI 字符串末尾包含光标定位序列
- [ ] **auto**: 空 rows → 只移动光标
- [ ] **human**: **终端实际渲染效果**（颜色、位置、闪烁）

### Step 2.2 — Screen diff
**产出**: `src/screen.ts` — diff 优化

第二次 render 时，比较 `physicalRows[i] !== newRows[i]`，只重写变化行。

- [ ] **auto**: 相同内容 → 输出不含任何行写入
- [ ] **auto**: 仅 1 行变化 → 只重写该行
- [ ] **auto**: 行数变化（增加/减少）→ 正确处理追加/删除
- [ ] **auto**: diff 后光标定位正确
- [ ] **human**: **肉眼验证无闪烁**（相同内容不闪，变化行无多余重绘）

### Step 2.3 — Demo: 纯文本滚动输出
**产出**: `apps/demo/text-scroll.ts`

演示 Screen + Flow 联调效果：定时追加文本行，观察 diff 和滚动。

- [ ] **auto**: 无（纯交互验证）
- [ ] **human**: **终端中运行 30 秒**，确认：行正确折行、滚动流畅、无闪烁、CJK 显示正常

---

## 阶段 3: TextInput（多行输入）

### Step 3.1 — TextInput own 状态 + 编辑操作
**产出**: `src/textinput.ts`

```typescript
interface TextInputState {
  textLines: string[]
  cursor: TextPosition
  focus: boolean
}

// 操作函数（纯函数，输入 state → 输出新 state）
insertChar(state, char: string): TextInputState
deleteBeforeCursor(state): TextInputState
deleteAfterCursor(state): TextInputState
moveCursorLeft(state): TextInputState
moveCursorRight(state): TextInputState
splitLine(state): TextInputState        // Enter 键
```

- [ ] **auto**: insertChar — 单字符插入，cursor 右移
- [ ] **auto**: deleteBeforeCursor — 删除光标左侧字符
- [ ] **auto**: deleteAfterCursor — 删除光标右侧字符
- [ ] **auto**: moveCursorLeft 到头不溢出
- [ ] **auto**: moveCursorRight 到尾不溢出
- [ ] **auto**: splitLine — 在光标处拆行为两行
- [ ] **auto**: CJK 字符的插入/删除/光标移动正确
- [ ] **human**: 无

### Step 3.2 — 光标上下移动（按渲染行）
**产出**: `src/textinput.ts` — `moveCursorUp(state, wrapMeta): TextInputState`

用 wrapMeta 将 TextPosition 映射到渲染行，上下移动后反算回 TextPosition。

- [ ] **auto**: 短文本（1 渲染行）→ Up 不变
- [ ] **auto**: 长文本（3 渲染行）→ Up/Down 逐行跳转
- [ ] **auto**: 从第 2 个渲染行的第 5 列 Up → 第 1 个渲染行的第 5 列（stickyCol）
- [ ] **auto**: 目标行比 stickyCol 短 → 定位到目标行末尾
- [ ] **auto**: stickyCol 在非垂直操作后重置
- [ ] **human**: 无

### Step 3.3 — TextInput → VNode 展开
**产出**: `src/textinput.ts` — `expandTextInput(state, cols): InlineSegment[]`

将 TextInput 展开为 InlineSegment[]，含文本 + 光标位置指示 + focus 高亮。

- [ ] **auto**: 展开后 segment 数量 = 输入行数
- [ ] **auto**: focus=false → 无光标 segment
- [ ] **auto**: focus=true → 包含光标指示 segment
- [ ] **human**: 无

### Step 3.4 — Demo: 简单文本编辑器
**产出**: `apps/demo/text-editor.ts`

集成 TextInput + Flow + Screen。用 raw mode 接收按键，实时渲染。

- [ ] **auto**: 无
- [ ] **human**: **终端中交互**：
  - 输入字符显示正确
  - 左右移动光标
  - 超宽自动折行
  - ↑↓ 按渲染行跳转（不离谱跳）
  - Enter 换行
  - Backspace 删除
  - resize 终端窗口 → 内容自动重排

---

## 阶段 4: GhostText（自动补全）

### Step 4.1 — GhostText 状态管理
**产出**: `src/ghosttext.ts`

```typescript
interface GhostTextState {
  enabled: boolean           // 是否激活
  prefix: string             // 匹配前缀
  suggestion: string         // 建议文本（prefix 之后的部分）
}
```

- [ ] **auto**: 前缀匹配 → suggestion 更新
- [ ] **auto**: 无匹配 → enabled=false
- [ ] **auto**: Tab 接受 → 发出事件（待集成）
- [ ] **human**: 无

### Step 4.2 — GhostText → VNode 展开
**产出**: `src/ghosttext.ts` — `expandGhostText(state): InlineSegment[]`

展开为 dim 色的 TextSegment，位于光标之后。

- [ ] **auto**: enabled=false → 无 segment
- [ ] **auto**: enabled=true → 1 个 dim 色 TextSegment
- [ ] **human**: 无

### Step 4.3 — GhostText + TextInput 集成
**产出**: `src/ghosttext.ts` — 绑定 logic

Tab 键在 GhostText enabled 时写入 suggestion 到 TextInput，同时清除 ghost。

- [ ] **auto**: Tab 接受 → TextInput 正确插入文本
- [ ] **auto**: 接受后 ghost 关闭
- [ ] **auto**: 继续输入不匹配 → ghost 消失
- [ ] **auto**: Esc → ghost 关闭但不修改 TextInput
- [ ] **human**: 无

### Step 4.4 — Demo: 带补全的输入框
**产出**: `apps/demo/ghost-input.ts`

TextInput + GhostText + Flow + Screen。固定 suggestion 列表，演示补全交互。

- [ ] **auto**: 无
- [ ] **human**: **终端中交互**：
  - 输入前缀 → 灰色补全文本出现
  - Tab 接受 → 文本插入，ghost 消失
  - Esc 取消 → ghost 消失
  - 灰色文本肉眼可辨（dim / 暗色）

---

## 阶段 5: Selector（列表选择器）

### Step 5.1 — Selector own 状态 + 导航
**产出**: `src/selector.ts`

```typescript
interface SelectorState {
  items: string[]
  selectedIndex: number
  open: boolean
}

selectNext(state): SelectorState
selectPrev(state): SelectorState
selectIndex(state, i): SelectorState
toggleOpen(state): SelectorState
```

- [ ] **auto**: selectNext — selectedIndex 循环（到底 → 回 0）
- [ ] **auto**: selectPrev — 到 0 后回末尾
- [ ] **auto**: 空 items → open=false → selectNext 不变
- [ ] **auto**: toggleOpen 切换状态
- [ ] **human**: 无

### Step 5.2 — Selector → InlineBlock 展开
**产出**: `src/selector.ts` — `expandSelector(state, width): BlockSegment`

Selector 展开为固定宽度的 BlockSegment，内部是 items 列表：

```
┌──────────┐
│ item 1   │
│ ▶ item 2 │  ← selected
│ item 3   │
└──────────┘
```

- [ ] **auto**: items[] → BlockSegment.width = width
- [ ] **auto**: 选中项标记（▶ 或高亮）正确
- [ ] **auto**: 空 items → 空 BlockSegment 或不存在
- [ ] **human**: 无

### Step 5.3 — Selector + TextInput 集成
**产出**: `src/selector.ts` — 键盘事件拦截

Selector open 时：↑↓ 导航选项、Enter 选择、Esc 关闭。
选择后关闭 Selector，将选中文本写入 TextInput。

- [ ] **auto**: Enter → 尾项 token 写入，selector 关闭
- [ ] **auto**: Esc → selector 关闭，不修改 text
- [ ] **auto**: 不是 selector 的按键 → 透传
- [ ] **human**: 无

### Step 5.4 — Demo: @mention 选择器
**产出**: `apps/demo/mention-picker.ts`

输入 `@` 弹出候选人列表，↑↓ 选择，Enter 选中。

- [ ] **auto**: 无
- [ ] **human**: **终端中交互**：
  - 输入 `@` → 菜单弹出
  - ↑↓ → 选中项高亮
  - Enter → 文本替换为选中项，菜单关闭
  - Esc → 菜单关闭
  - 继续输入过滤字符 → 列表过滤

---

## 阶段 6: InlineBlock（文本环绕）

### Step 6.1 — Flow: InlineBlock 折行
**产出**: `src/flow.ts` — InlineBlock 参与 layout 算法

在 Flow 的 layout 阶段处理 BlockSegment：文本在 block 左右绕排。

```
文本文字文字文字文字
文字文字 ┌──────┐ 文字
文字文字 │ block │ 文字
文字文字 └──────┘ 文字
文字文字文字文字文字
```

- [ ] **auto**: BlockSegment 插入位置正确
- [ ] **auto**: block 左侧文本 + block + 右侧文本 → 一行拆分为三段
- [ ] **auto**: block 宽度 > rem → 换行到新行首
- [ ] **auto**: block 后续文本在 block 下方继续
- [ ] **auto**: block 内部内容正确排版（在固定宽度内）
- [ ] **human**: 无

### Step 6.2 — Demo: 文本环绕 selector
**产出**: `apps/demo/wrap-selector.ts`

一段长文本中嵌入 Selector，观察 block 绕排效果。

- [ ] **auto**: 无
- [ ] **human**: **终端中交互**：
  - Selector 在文本流中可见
  - 文本在 Selector 左右绕排
  - ↑↓ 导航 → Selector 内高亮变化 → 周围文本不闪

---

## 阶段 7: 自动高亮

### Step 7.1 — Markdown inline 语法解析器
**产出**: `src/highlight.ts` — `parseInline(text: string): { text: string, styles: StyleRange[] }`

解析 markdown inline 语法：

| 语法 | 渲染 |
|------|------|
| `**text**` | bold |
| `__text__` | bold |
| `*text*` | italic |
| `_text_` | italic |
| `` `code` `` | bg: grey / reverse |
| `~~text~~` | strikethrough |

- [ ] **auto**: 纯文本无标记 → styles=[]
- [ ] **auto**: `**bold**` → bold StyleRange
- [ ] **auto**: `**bold** and *italic*` → 两个不重叠 style
- [ ] **auto**: 嵌套 `**bold *italic* more**` → bold 跨全部 + italic 跨子段
- [ ] **auto**: 未闭合标记 → 不解析，保留原文（graceful）
- [ ] **auto**: `` `code` `` → grey bg
- [ ] **auto**: `~~del~~` → strikethrough
- [ ] **human**: 无

### Step 7.2 — 高亮后的文本 → VNode 展开
**产出**: `src/highlight.ts` — `highlightText(text: string): VNode`

将 markdown 文本解析后包装为带 StyleRange 的 VNode(text)。

- [ ] **auto**: `**hello**` → VNode(text) with styles: [{start:0, end:5, bold:true}]
- [ ] **auto**: 无标记 → VNode(text) with styles: []
- [ ] **human**: 无

### Step 7.3 — Demo: 富文本阅读器
**产出**: `apps/demo/rich-text.ts`

展示一段 markdown 格式文本，实时渲染样式。支持 resize。

- [ ] **auto**: 无
- [ ] **human**: **终端中交互**：
  - `**bold**` 肉眼可见粗体
  - `*italic*` 肉眼可见斜体
  - `` `code` `` 肉眼可见灰底
  - `~~strike~~` 肉眼可见删除线
  - resize → 样式不丢失

---

## 阶段 8: 集成 + 综合 Demo

### Step 8.1 — Demo: 聊天输入框 (Use Case 1+2+3 联合)
**产出**: `apps/demo/chat-input.ts`

全功能聊天输入框：多行输入 + @mention 补全（ghost text + selector）+ markdown 实时高亮预览。

- [ ] **auto**: 无
- [ ] **human**: **终端中完全交互测试**：
  - 多行输入 + 自动折行
  - ↑↓ 按渲染行跳转
  - `@` 触发 mention selector → 选人
  - markdown 语法实时高亮
  - resize → 一切重排正确
  - Enter 提交 → 内容 freeze → 下一轮输入

### Step 8.2 — Demo: 表单渲染器 (Use Case 2)
**产出**: `apps/demo/form-renderer.ts`

标签 + 输入框 + 校验状态（红色错误提示）。

- [ ] **auto**: 无
- [ ] **human**: **终端中交互**：
  - VNode 树渲染正确
  - 多个 TextInput 各自独立 focus
  - 校验失败 → 红色文本
  - Tab/S-Tab 切换输入框

### Step 8.3 — Demo: 列表选取 (Use Case 3)
**产出**: `apps/demo/list-selector.ts`

输入过滤 → 列表更新 → 键盘选取。

- [ ] **auto**: 无
- [ ] **human**: **终端中交互**：
  - 输入文本 → 列表实时过滤
  - ↑↓ 切换选项
  - 当前项高亮
  - Enter 选中

### Step 8.4 — Demo: 富文本展示 (Use Case 4)
**产出**: `apps/demo/rich-display.ts`

纯展示：带标题/正文/代码块的 markdown 文档渲染。

- [ ] **auto**: 无
- [ ] **human**: **终端中交互**：
  - 段落正确折行
  - 代码块灰底显示
  - 标题 bold
  - resize 自适应

---

## 测试策略

### 自动测试（`bun test`）

适用：纯函数、无终端依赖、无异步时序。

```
src/__tests__/
  ansi.test.ts        # ANSI 生成
  width.test.ts       # string-width 封装
  vnode.test.ts       # VNode 创建
  flow.test.ts        # layoutSimple, layoutTextLines, layoutStyled, InlineBlock
  textinput.test.ts   # 编辑操作, 光标移动
  ghosttext.test.ts   # GhostText 状态管理
  selector.test.ts    # Selector 导航
  highlight.test.ts   # Markdown 解析
  screen.test.ts      # diff 逻辑（不真正写 stderr）
```

### 人工验证（终端 interactive demo）

适用：视觉外观、交互手感、ANSI 兼容性。

每个阶段末尾的 `apps/demo/*.ts` 都需要在真实终端中运行和肉眼验证。
验收清单在对应 step 中标注了 `**human**`。

---

## 依赖关系

```
0.1 ANSI ──┐
0.2 width ─┤
0.3 VNode ─┘
           ↓
1.1 简单折行 ──→ 1.2 wrapMeta ──→ 1.3 StyleRange 折行
                                        ↓
2.1 Screen 写入 ──→ 2.2 diff ──→ 2.3 滚动 demo
                                        ↓
3.1 编辑操作 ──→ 3.2 上下跳转 ──→ 3.3 VNode 展开 ──→ 3.4 编辑器 demo
                                        ↓
4.1 GhostText state ──→ 4.2 展开 ──→ 4.3 集成 ──→ 4.4 补全 demo
                                        ↓
5.1 Selector state ──→ 5.2 展开 ──→ 5.3 集成 ──→ 5.4 mention demo
                                        ↓
6.1 InlineBlock 折行 ──→ 6.2 环绕 demo
                                        ↓
7.1 Markdown 解析 ──→ 7.2 VNode 生成 ──→ 7.3 富文本 demo
                                        ↓
8.x 综合 demo
```

阶段 0-2 是基础设施，必须先完成。阶段 3-7 相对独立，但建议按序号推进（后续阶段用到前面的模块）。

---

## 验收标准

每个 step 验收通过才算完成：

1. `bun test` 全部通过（auto 测试）
2. `bun run typecheck` 零错误
3. `bun run lint` 零问题
4. `bun run mutate` (100% killed)
5. 如有 human test，终端内运行 demo 确认效果