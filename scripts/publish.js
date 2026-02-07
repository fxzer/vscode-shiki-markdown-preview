#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'

// 获取 package.json 中的版本号
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))
const version = packageJson.version
const extensionName = packageJson.name
const vsixFileName = `${extensionName}-${version}.vsix`

// 简单的 release note
const notes = `${extensionName} v${version}\n\n查看 [CHANGELOG](./CHANGELOG.md) 了解详细变更。`

console.log(`\n🚀 开始发布 ${extensionName} v${version}\n`)

try {
  // 1. 编译
  console.log('📦 1. 编译项目...')
  execSync('npm run compile && npm run copy-assets', { stdio: 'inherit' })
  console.log('✅ 编译完成\n')

  // 2. 打包
  console.log('📦 2. 打包扩展...')
  execSync('npm run ext:package', { stdio: 'inherit' })
  console.log('✅ 打包完成\n')

  // 3. 推送 tag 到远程
  console.log('📤 3. 推送 tag 到远程...')
  execSync(`git push origin v${version}`, { stdio: 'inherit' })
  console.log('✅ tag 推送完成\n')

  // 4. 创建 GitHub Release 并上传
  console.log('📤 3. 创建 GitHub Release...')
  const releaseUrl = execSync(
    `gh release create v${version} ./${vsixFileName} --title "Release v${version}" --notes "${notes}"`,
    { stdio: 'pipe', encoding: 'utf-8' },
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
