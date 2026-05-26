# Roadmap

## 已完成阶段

所有 MVP 阶段已实现并验收。112 个测试通过，11 个 demo 可运行。

### 阶段 0: Grid 核心 ✓

- Grid SoA 存储 + dirty tracking
- 宽字符 + continuation cell
- flush 上屏（纯相对定位，返回光标结束位置）
- Demo: hello.ts

### 阶段 1: TextInput 基础 ✓

- TextInput paint（自动折行 + CJK）
- 光标定位（cursorRow/cursorCol derived from paint）
- 编辑操作（insert/delete/moveLeft/moveRight）
- Demo: input.ts

### 阶段 2: 多行 + 垂直导航 ✓

- 换行支持（`\n` 断行）
- 垂直光标移动（moveUp/moveDown + stickyCol）
- 滚动（scrollOffset + ensureCursorVisible）
- Demo: editor.ts

### 阶段 3: Ownership 动态 + Menu ✓

- Ownership 响应式切换
- Menu Widget（items + selectedIndex + 高亮）
- Menu + TextInput 集成（@mention 流程）
- Demo: mention.ts

### 阶段 4: 文本环绕 + Resize ✓

- 非连续 ownership 区域文本绕排
- resize 处理（computeReflowHeight + 重建）
- Demo: wrap.ts

### 阶段 5: 样式 + 装饰 ✓

- 样式编码（16 色 + bold/dim/italic/underline）
- TextInput decorations（样式区间）
- Demo: styled.ts

### 额外: Viewport 统一渲染 ✓

- Viewport 类（mount/render/commit/remount）
- 统一全屏和局部（history）场景
- flush 返回光标结束位置
- moveUp/moveDown rowHasOwner 边界判断
- Demo: history.ts, reactive.ts, enhanced.ts

### 额外: Ghost Text ✓

- 临时拼入建议文本 + DIM decoration
- Tab 接受 = insertChar
- keys.ts 添加 Tab 支持
- Demo: ghost.ts

---

## 可选的后续方向

以下是 MVP 之后可以探索的改进，按优先级排列：

1. **性能优化** — TextInput.paint 每次全量遍历 ownership；大 grid + 长文本场景可考虑局部更新
2. **精确 resize reflow** — 当前 resize 重建整个 grid；可改进为保留内容的智能 reflow
3. **256 色 / true color** — 扩展样式编码的高 bits
4. **鼠标事件** — 点击定位光标、选区
5. **多光标 / 多焦点** — 协作编辑场景
6. **ownflow 集成** — 作为 ownflow 的终端 UI 层

---

## 测试与验收

```
bun test          # 112 个单元测试
bun demo/xxx.ts   # 11 个 demo 交互验收
```

每个 demo 覆盖一个完整用例，在终端中运行即可验证。
