/**
 * enhanced2/clipboard — 跨平台系统剪贴板读写
 *
 * 支持：Windows / macOS / Linux (X11 + Wayland)
 */

import { spawnSync } from 'child_process'

/**
 * 将文本写入系统剪贴板。
 * @returns 是否成功
 */
export function copyToClipboard(text: string): boolean {
  try {
    if (process.platform === 'win32') {
      // clip.exe 从 stdin 读取并写入剪贴板（Windows 内置）
      const proc = spawnSync('clip', { input: text, timeout: 3000 })
      return proc.status === 0
    }
    if (process.platform === 'darwin') {
      const proc = spawnSync('pbcopy', { input: text, timeout: 3000 })
      return proc.status === 0
    }
    // Linux: 先尝试 wl-copy (Wayland)，再尝试 xclip (X11)
    const wl = spawnSync('wl-copy', { input: text, timeout: 3000 })
    if (wl.status === 0) return true
    const xc = spawnSync('xclip', ['-selection', 'clipboard'], { input: text, timeout: 3000 })
    return xc.status === 0
  } catch {
    return false
  }
}

/**
 * 从系统剪贴板读取文本。
 * @returns 剪贴板内容，失败返回 null
 */
export function pasteFromClipboard(): string | null {
  try {
    if (process.platform === 'win32') {
      const proc = spawnSync(
        'powershell', ['-NoProfile', '-Command', 'Get-Clipboard'],
        { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }
      )
      if (proc.status === 0 && proc.stdout.length > 0) {
        const text = proc.stdout.toString('utf-8')
        // Get-Clipboard 会在末尾附加 \r\n，去掉
        return text.replace(/\r?\n$/, '')
      }
      return null
    }
    if (process.platform === 'darwin') {
      const proc = spawnSync('pbpaste', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 })
      if (proc.status === 0) return proc.stdout.toString('utf-8').replace(/\n$/, '')
      return null
    }
    // Linux
    const wl = spawnSync('wl-paste', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 })
    if (wl.status === 0) return wl.stdout.toString('utf-8').replace(/\n$/, '')
    const xc = spawnSync('xclip', ['-selection', 'clipboard', '-o'], {
      stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000
    })
    if (xc.status === 0) return xc.stdout.toString('utf-8').replace(/\n$/, '')
    return null
  } catch {
    return null
  }
}
