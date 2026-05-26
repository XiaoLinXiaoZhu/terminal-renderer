# terminal-renderer 最小原型 (MVP)

## 概述

terminal-renderer 是一个终端混合渲染引擎。它将声明式的 VNode 树编译为 ANSI 输出，通过差量刷新渲染到终端。

MVP 的目标：用最少的模块覆盖四个核心使用场景，每个场景可独立运行和演示。

## 核心原则

1. **终端永远不替我们折行** — 写入的每行宽度 ≤ cols，我们自己控制换行
2. **物理行是 own 状态** — Screen 精确追踪终端上的每一行内容
3. **diff 在行粒度** — `physicalRows[i] !== newRows[i]` 纯字符串比较，只重写变化行
4. **resize 自愈** — cols 变 → 全量重算 terminalRows → diff 自然全量重写
5. **光标绑定逻辑位置** — own 状态是 TextPosition（文本行+偏移），屏幕坐标全部 derived
6. **单一写入者** — 每份 own 状态只有一个模块能修改
7. **组合优于继承** — UI 通过 VNode 树组合，类似 HTML 的 DOM 树

## 渲染原语

### VNode

声明式 UI 的原子类型。所有 UI 由 VNode 树描述。

```typescript
type VNodeTag = 'root' | 'textinput' | 'selector' | 'text' | 'inline-block' | 'ghost-text'

interface VNode {
  tag: VNodeTag
  attrs?: Record<string, string | number | boolean>
  children?: (string | VNode)[]
}

// 创建 VNode 的工厂函数
function h(tag: VNodeTag, attrs?: VNode['attrs'], children?: VNode['children']): VNode
```

### 原语清单

| 原语 | 类型 | 描述 |
|------|------|------|
| **VNode** | `interface` | 虚拟节点树，tag 枚举限定 6 种原语，attrs 承载属性，children 嵌套子节点 |
| **TextInput** | `own` | 多行文本输入，own: `textLines[]`, `cursor: {line, offset}`, `focus: boolean` |
| **GhostText** | `component` | 光标后的灰显补全提示，Tab 接受写入 TextInput |
| **StyleRange** | `data` | `{ start, end, fg?, bg?, bold?, italic? }` 描述一段文本的样式 |
| **InlineBlock** | `layout` | 固定宽度的行内矩形，文本在其左右绕排（类似 CSS float） |
| **Selector** | `own` | 列表选择器，own: `items[]`, `selectedIndex`, `open`，键盘导航 |
| **Flow** | `engine` | 布局引擎，VNode 树 → TerminalRow[]，管理 diff 及 ANSI 输出 |

## 数据管线

```
VNode 树 (声明式)
  → Flow.expand()   → InlineSegment[]
    → Flow.layout()   → TerminalRow[] (按 cols 折行 + 样式合并)
      → Screen.diff()  → 差量 ANSI 写入 stderr
```

三层分离：
- **expand**: 树 → 平坦段（TextSegment | BlockSegment）
- **layout**: 段 → 栅格（TerminalRow[]），处理折行和样式合并
- **render**: 栅格 → ANSI + diff → stderr

## 四个用例

| # | 用例 | 原语组合 | 预期效果 |
|---|------|----------|----------|
| 1 | **多行输入 + 上下跳转** | TextInput + Flow | 输入超 cols 自动折行；↑↓ 按渲染行跳转（非文本行）；stickyCol 保持列位置 |
| 2 | **Ghost text 补全** | TextInput + GhostText | 输入前缀匹配 → 光标后出现灰色提示文本；Tab 接受；Esc 消失 |
| 3 | **列表选择器（文本环绕）** | TextInput + Selector + InlineBlock + Flow | Selector 作为 InlineBlock 插入文本流中；文本在块左右绕排；↑↓ 切换选项；Enter 选中 |
| 4 | **自动高亮** | VNode(text) + StyleRange + Flow | `**bold**` 渲染为粗体；`` `code` `` 渲染为反色/灰底；`~~del~~` 渲染为删除线 |

## Flow 布局算法

```
输入: VNode 树, cols: number
输出: TerminalRow[]

步骤:
  1. expand(VNode树) → InlineSegment[]
     遍历树，展开为平坦段：
     - 'text' → TextSegment { content, style }
     - 'inline-block' → BlockSegment { width, children[] }
     - 'textinput' → 按 textLines + cursor 展开为 TextSegment
     - 'selector' → 展开为 BlockSegment（内容=items 列表）
     - 'ghost-text' → 展开为 styled TextSegment（dim 色）

  2. layout(segments, cols) → TerminalRow[]
     从左到右扫描 segments，按 cols 折行：
     - rem = cols（当前行剩余宽度）
     - TextSegment(w=cw) where cw ≤ rem → 追加，rem -= cw
     - TextSegment(w=cw) where cw > rem → 换行，新行 rem = cols - cw
     - BlockSegment(w=bw) where bw ≤ rem → 在当前行右侧占位，rem -= bw
     - BlockSegment(w=bw) where bw > rem → 换行到新行首
     - 跨行时继承当前 StyleRange（样式不中断）
     - BlockSegment 内部内容在它所占的宽度内独立排版

  3. 每个完成的行打包为 TerminalRow { text, styles[] }
```

## MVP 边界

**范围内:**
- VNode 6 种 tag、h() 工厂、树组合
- Flow: expand → layout → Screen 三阶段管线
- TextInput: 多行编辑、光标左右移动、插入删除、换行
- TextInput: 按渲染行上下跳转（wrapMeta + stickyCol）
- GhostText: 前缀匹配 + dim 渲染 + Tab 接受
- StyleRange: 16 色 + bold/italic/underline
- InlineBlock: 固定宽度、内容独立排版、文本绕排
- Selector: items[] + ↑↓ 导航 + 选中高亮 + Enter 选择
- Screen: 行粒度 diff、ANSI 输出、光标定位
- resize: cols 变化 → 全量重算 → diff 重写

**范围外:**
- 鼠标事件
- 256 色 / true color
- 嵌套滚动容器
- 富文本编辑（TextInput 仅纯文本）
- 异步虚拟列表
- RTL / 双向文本
- 多窗口 / 分屏