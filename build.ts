/**
 * 构建脚本：生成 JS + .d.ts 到 dist/
 */
import { readdir, readFile, writeFile, rm, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { $ } from 'bun'

const distDir = 'dist'

// 清理 dist
await rm(distDir, { recursive: true, force: true })
await mkdir(distDir, { recursive: true })

// 源文件列表（排除测试，递归遍历子目录）
async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.includes('.test.')) {
      files.push(fullPath)
    }
  }
  return files
}
const srcDir = 'src'
const srcFiles = (await walk(srcDir)).map((f: string) => f.replace(/\\/g, '/').replace(srcDir + '/', ''))

// 1. 逐个文件用 Bun.Transpiler 转译为 JS
const transpiler = new Bun.Transpiler({
  loader: 'ts',
  target: 'node',
  tsconfig: JSON.stringify({
    compilerOptions: {
      module: 'ESNext',
      target: 'ESNext',
      verbatimModuleSyntax: true,
    }
  })
})

for (const file of srcFiles) {
  const srcPath = join('src', file)
  const content = await readFile(srcPath, 'utf-8')
  let js = transpiler.transformSync(content)

  // 修正 import 路径：.ts → .js
  js = js.replace(/from\s+["'](\.[^"']+)\.ts["']/g, "from '$1.js'")

  const outFile = file.replace(/\.ts$/, '.js')
  const outPath = join(distDir, outFile)
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, js)
}

// 2. tsc 生成 .d.ts
await $`npx tsc --project tsconfig.build.json`

// 3. 后处理 .d.ts：修正 .ts → .js 扩展名，递归遍历子目录
async function walkDist(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await walkDist(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.d.ts')) {
      files.push(fullPath)
    }
  }
  return files
}

for (const filePath of await walkDist(distDir)) {
  let content = await readFile(filePath, 'utf-8')
  content = content.replace(/from\s+['"](\.[^'"]+)\.ts['"]/g, "from '$1.js'")
  await writeFile(filePath, content)
}

console.log('Build complete ✓')
