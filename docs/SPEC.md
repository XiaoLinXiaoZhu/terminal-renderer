# terminal-renderer 设计规格

基于 ownflow 的终端混合渲染引擎。

## 核心原则

1. **终端永远不替我折行** — 写入的每行宽度 ≤ cols
2. **物理模型是 own 状态** — Screen 精确知道终端上有什么
3. **diff 在终端行粒度** — `physicalRows[i] !== terminalRows[i]` 纯字符串比较
4. **resize 不需要特殊逻辑** — cols 变 → terminalRows 全变 → diff 自然全量重写
5. **live-height 声明式** — `min(termRows, contentHeight, maxHeight)`
6. **光标绑定文本位置** — own 状态是 TextPosition，屏幕位置全部 derived
7. **单一写入者** — 每个 own 只有一个模块写入

## 数据管线

```
Text（原始字符串，own by InputBuffer）
  → TextLine（按 \n 拆分）
    → InputLine（绑定 cols 切分，derived）
      → InputArea（绑定 liveHeight 裁剪视口，derived）
        → TerminalRow（Screen 消费 + diff + ANSI 输出）
```

## 数据流图

```mermaid
flowchart TB
    subgraph External["外部"]
        STDIN["stdin raw bytes"]
        RESIZE["resize event"]
        APP["应用层"]
    end

    subgraph TermSize["TermSize"]
        TS_cols["own: cols"]
        TS_rows["own: rows"]
    end

    subgraph KeyParser["KeyParser"]
        KP_event["own: keyEvent {seq, action}"]
    end

    subgraph Completion["Completion"]
        CO_active["own: active, prefix, selectedIndex"]
        CO_output["own: outputKeyEvents"]
        CO_menu["derived: menuLines"]
    end

    subgraph InputBuffer["InputBuffer"]
        IB_lines["own: textLines[]"]
        IB_cursor["own: cursorLine, cursorOffset"]
        IB_sticky["own: stickyCol"]
    end

    subgraph Layout["Layout"]
        LO_inputLines["derived: inputLines"]
        LO_termRows["derived: terminalRows"]
        LO_cursor["derived: cursorPos"]
        LO_live["derived: liveHeight"]
        LO_wrap["derived: wrapMeta"]
    end

    subgraph Screen["Screen"]
        SC_physical["own: physicalRows"]
        SC_cursor["own: physicalCursor"]
    end

    RESIZE --> TermSize
    STDIN --> KeyParser
    APP -->|"candidates, maxHeight"| Completion
    APP -->|"content"| Layout

    TermSize -->|"cols"| Layout
    TermSize -->|"cols"| Screen
    TermSize -->|"rows"| Layout
    KeyParser -->|"keyEvents"| Completion
    Completion -->|"outputKeyEvents"| InputBuffer
    Completion -->|"menuLines"| APP
    Layout -->|"wrapMeta"| InputBuffer

    InputBuffer -->|"textLines, cursor"| Layout
    InputBuffer -->|"textLines, cursor"| Completion

    Layout -->|"terminalRows, cursorPos, liveHeight"| Screen
    Screen -->|"ANSI"| TTY["stderr"]
```

## 模块规格

### TermSize
- **own**: `cols: number`, `rows: number`
- **watch**: `resizeEvent: { seq, cols, rows }`
- 纯数据持有

### KeyParser
- **own**: `keyEvents: { seq, actions: Action[] }`
- **watch**: `rawInput: { seq, data: string }`
- 解析 raw bytes → Action（char/arrow/submit/abort/paste/tab）
- 处理 bracketed paste（跨 chunk 状态机）

### Completion
- **watch**: `textLines`, `cursorLine`, `cursorOffset`（检测 `@` 触发）
- **watch**: `keyEvents`（拦截 Tab/→/Esc）
- **watch**: `candidates: string[]`
- **own**: `active`, `prefix`, `selectedIndex`, `outputKeyEvents`
- **derived**: `filteredCandidates`, `menuLines`
- 激活时：Tab 切换、→ 接受（发射 backspace+paste 到 outputKeyEvents）、其余透传
- 非激活时：全部透传

### InputBuffer
- **watch**: `keyEvents`（from Completion.outputKeyEvents）
- **watch**: `wrapMeta`（from Layout，用于终端行级光标移动）
- **own**: `textLines[]`, `cursorLine`, `cursorOffset`, `stickyCol`
- 光标 own 状态是 TextPosition（文本行 + 字符间隙偏移）
- Up/Down 通过 wrapMeta 在 InputLine 级别移动，反算回 TextPosition
- 左右/插入/删除重置 stickyCol

### Layout
- **watch**: `cols`, `rows`, `textLines`, `cursorLine`, `cursorOffset`, `maxHeight`
- **derived**:
  - `inputLines`: textLines 按 cols 切分后的 InputLine[]
  - `wrapMeta`: 每个文本行的折行 span 信息（供 InputBuffer 光标移动）
  - `liveHeight`: min(rows, inputLines.length, maxHeight)
  - `scrollOffset`: 保证光标在视口内
  - `terminalRows`: inputLines[scrollOffset..scrollOffset+liveHeight] 的文本
  - `cursorPos`: 光标在视口内的 {row, col}
- 纯计算，无 own，无副作用

### Screen
- **watch**: `terminalRows`, `cursorPos`, `liveHeight`, `cols`, `freezeSeq`
- **own**: `physicalRows[]`, `physicalCursor`
- **on terminalRows 变化**:
  1. 用当前 cols 计算 physicalRows 实际占多少物理行（处理 resize reflow）
  2. cursor-up 到 live zone 顶部
  3. clearDown
  4. 逐行写入新 terminalRows（或 diff 优化：跳过未变行）
  5. 定位光标到 cursorPos
  6. 更新 physicalRows/physicalCursor
- **on cursorPos 变化**（内容未变时）: 仅重定位光标
- **on freezeSeq 变化**: 光标移到 live zone 末尾 → 换行 → 重置 physicalRows

## 光标移动模型

```
光标 own 状态: TextPosition { line: number, offset: number }

Up 键按下:
  1. TextPosition → InputLinePosition (通过 wrapMeta 查找 offset 所在 inputLine)
  2. inputLine - 1（上移一个输入行）
  3. 用 stickyCol 在目标 inputLine 中反算 → 新的 TextPosition
  4. 写回 own 状态

stickyCol:
  - 首次垂直移动时记录当前可见列
  - 连续垂直移动保持
  - 任何非垂直操作重置为 null
```

## live-height

```
liveHeight = min(terminalRows, contentRequiredHeight, maxHeight)
```

- Screen 精确管理 liveHeight 行
- cursor-up 计算考虑 reflow（resize 后旧行可能占更多物理行）
- freeze = 释放 live zone 为 scrollback，physicalRows 清空

## resize 处理

```
cols 变化
  → inputLines 全部重新切分（derived 重算）
  → terminalRows 全部变化
  → Screen diff 发现全不同 → 全量重写
  → 同时：cursor-up 需要考虑旧 physicalRows 在新 cols 下的 reflow
    physicalRowCount = sum(ceil(visibleWidth(row) / newCols))
```

## 补全菜单

```
用户输入 '@' (行首或空白后)
  → Completion 激活，prefix = ""
  → menuLines 产出候选列表
  → 应用层将 menuLines 插入 cursorLine+1 处
  → Layout 渲染合成内容
  → Screen 渲染

Tab → selectedIndex 循环
→ → 接受：删除 @prefix，插入完整候选文本
继续输入 → prefix 更新 → filteredCandidates 过滤
光标离开 @ 区域 → Completion 关闭
```

## 依赖

- `ownflow` — 响应式模块架构
- `@vue/reactivity` — reactive primitives (ownflow peer dep)
- `string-width` — CJK/emoji 可见宽度计算
- `picocolors` — 终端颜色（可选）

## 最小原型 (MVP)

### 1. 渲染原语

#### VNode

```typescript
type VNodeTag = 'root' | 'textinput' | 'selector' | 'text' | 'inline-block' | 'ghost-text'

interface VNode {
  tag: VNodeTag
  attrs?: Record<string, string | number | boolean>
  children?: (string | VNode)[]
}
```

| 原语 | 类型 | 描述 |
|------|------|------|
| **VNode** | `interface` | 虚拟节点树，tag 枚举严格限定原语类型 |
| **TextInput** | `own` | 多行文本输入框，own: `textLines[]`, `cursor{line,offset}`, `focus`, `placeholder` |
| **GhostText** | `component` | 灰显提示文本，绑定 TextInput，在光标后渲染占位建议 |
| **StyleRange** | `data` | `{ start, end, fg, bg, bold?, italic? }`，文本片段样式描述 |
| **InlineBlock** | `layout` | 行内块级元素，width 固定，height 由内容撑开，参与折行 |
| **Selector** | `own` | 列表选择器，own: `items[]`, `selectedIndex`, `open` |
| **Flow** | `engine` | 布局引擎，接收原语树，产出 TerminalRow[]，接管 diff + 渲染 |

### 2. 用例映射

| # | 用例 | 所需原语 | 数据流 |
|---|------|----------|--------|
| 1 | **聊天输入框** — 多行文本 + @补全 + ghost hint + 菜单选择 | TextInput, GhostText, Selector, Flow | TextInput.textLines → Layout → Screen；@ 触发 Completion → menuLines → Selector → Layout → Screen；GhostText 检查 prefix 后附加 hint |
| 2 | **表单渲染器** — 标签/输入/校验状态 | VNode(root→text+textinput), StyleRange, Flow | VNode 树编译 → TerminalRow[] → Screen；StyleRange 映射校验错误 → 红色 fg；TextInput focus 驱动校验状态变化 |
| 3 | **列表选取** — 输入过滤 + 上下翻页 + 高亮 | TextInput, Selector, Flow | TextInput.value 作为 filter → Selector.items 过滤；↑↓ → selectedIndex 变化 → Selector 发出 outputKeyEvents → Layout 重算 terminalRows |
| 4 | **富文本展示** — 标题/正文/代码块/内联样式 | VNode(root→text,inline-block), StyleRange, InlineBlock, Flow | VNode 树深度遍历 → 行内块占据固定 col 宽度 → Flow 折行引擎按 cols 切分 → 样式合并到每个 TerminalRow 的 StyleRange[] |

### 3. Flow 布局算法（InlineBlock 折行）

```
输入: VNode 树, cols: number
输出: TerminalRow[]

算法:
  1. 先序遍历 VNode 树，收集平坦的 InlineSegment[]:
     - 'text' 节点 → TextSegment { content: string, style }
     - 'inline-block' 节点 → BlockSegment { width: number, content: VNode[] }
     - 'textinput'/'selector'/'ghost-text' 展开为对应的 InlineSegment
  2. 从左到右扫描 InlineSegment[]，按 cols 折行:
     - 维护当前行剩余宽度 rem = cols
     - TextSegment: 用 string-width 测量可见宽度 w
       - w ≤ rem → 追加到当前行，rem -= w
       - w > rem → 换行（新行 rem = cols），跨行时按 rem 做首次截断，后续完整行 w ≤ cols
     - BlockSegment: blockWidth = min(width, cols)
       - blockWidth ≤ rem → 追加（占位高度=展平文本所需行数），rem -= blockWidth
       - blockWidth > rem → 换行到新行首
     - 跨行时继承当前 StyleRange（样式不中断）
  3. 每个完成的行打包为 TerminalRow { text: string, styles: StyleRange[] }
  4. 返回 TerminalRow[] → 送入 Screen
```

### 4. MVP 边界

**范围内 (In scope):**
- Flow 引擎支持 VNode 树到 TerminalRow 的编译，含样式合并、折行、行内块定位
- TextInput 作为核心交互原语，支持多行文本、focus/blur、光标移动、字符插入删除
- GhostText 绑定 TextInput，基于前缀匹配展示灰显建议
- StyleRange 支持基础 16 色 + 粗体/斜体
- InlineBlock 固定宽度渲染，内容影响行高
- Selector 支持键盘上下选择、高亮当前项、收起/展开

**范围外 (Out of scope):**
- 鼠标事件处理（仅键盘导航）
- 终端超 256 色（16 色足够 MVP）
- 嵌套滚动（Flow 内无独立滚动容器）
- 富文本编辑（TextInput 仅纯文本输入）
- 异步虚拟列表（Selector 数据全量在内存）
- 国际化/双向文本（仅 LTR + ASCII/CJK 子集）
