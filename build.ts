/**
 * 构建脚本：生成 JS + .d.ts 到 dist/
 */
import { readdir, readFile, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { $ } from 'bun'

const distDir = 'dist'

// 清理 dist
await rm(distDir, { recursive: true, force: true })

// 源文件列表
const srcFiles = (await readdir('src')).filter(f => f.endsWith('.ts') && !f.includes('.test.'))

// 1. bun build 生成 JS
const entrypoints = srcFiles.map(f => `src/${f}`)
await $`bun build ${entrypoints} --outdir dist --target node --format esm --splitting --external @vue/reactivity --external string-width`

// 2. tsc 生成 .d.ts
await $`npx tsc --project tsconfig.build.json`

// 3. 后处理 .d.ts：修正 .ts → .js 扩展名
const distFiles = await readdir(distDir)
for (const file of distFiles) {
  if (!file.endsWith('.d.ts')) continue
  const filePath = join(distDir, file)
  let content = await readFile(filePath, 'utf-8')
  content = content.replace(/from\s+['"](\.[^'"]+)\.ts['"]/g, "from '$1.js'")
  await writeFile(filePath, content)
}

console.log('Build complete ✓')
