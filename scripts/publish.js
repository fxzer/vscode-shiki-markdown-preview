#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'

// 获取 package.json 中的版本号
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))
const version = packageJson.version
const extensionName = packageJson.name
const vsixFileName = `${extensionName}-${version}.vsix`

console.log(`\n🚀 开始发布 ${extensionName} v${version}\n`)

try {
  // 0. 生成 Release 文案
  console.log('📝 0. 生成 Release 文案...')
  execSync('node scripts/generate-release-notes.js', { stdio: 'inherit' })
  console.log('✅ 文案生成完成\n')

  // 读取生成的文案
  const notes = existsSync('./.release-notes.md')
    ? readFileSync('./.release-notes.md', 'utf-8')
    : `${extensionName} v${version}`

  // 1. 编译
  console.log('📦 1. 编译项目...')
  execSync('npm run compile && npm run copy-assets', { stdio: 'inherit' })
  console.log('✅ 编译完成\n')

  // 2. 打包
  console.log('📦 2. 打包扩展...')
  execSync('npm run ext:package', { stdio: 'inherit' })
  console.log('✅ 打包完成\n')

  // 3. 创建 GitHub Release 并上传
  console.log('📤 3. 创建 GitHub Release...')
  const releaseUrl = execSync(
    `gh release create v${version} ./${vsixFileName} --title "Release v${version}" --notes-file -`,
    { input: notes, stdio: 'pipe', encoding: 'utf-8' },
  ).trim()

  console.log('✅ Release 创建成功\n')
  console.log(`🎉 发布完成！`)
  console.log(`\n📦 文件: ${vsixFileName}`)
  console.log(`🔗 Release: ${releaseUrl}\n`)
}
catch (error) {
  console.error('\n❌ 发布失败:', error.message)
  process.exit(1)
}
