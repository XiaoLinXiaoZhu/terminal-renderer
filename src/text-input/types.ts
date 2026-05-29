/**
 * TextInput 共享类型
 */

export interface Decoration {
  start: number
  end: number
  style: number
}

/**
 * TextInput 的可变状态。
 *
 * 各逻辑模块（paint/edit/navigate/scroll）以纯函数操作此接口，
 * TextInput class 实现该接口并将方法委托给这些函数。
 */
export interface TextInputState {
  text: string
  cursorOffset: number
  scrollOffset: number
  stickyCol: number | null
  decorations: Decoration[]
  cursorRow: number
  cursorCol: number
}
