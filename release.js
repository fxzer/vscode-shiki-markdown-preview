#!/usr/bin/env node

/**
 * 自动化打包发布脚本
 * 自动读取 fish 环境变量中的 VS Code & Open VSX Token 并一键发布
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname)
process.chdir(root)

/**
 * 智能获取环境变量（优先当前环境，其次读取 fish 全局变量）
 */
function getEnv(varName, fallbackNames = []) {
  // 1. 尝试从当前进程环境变量读取
  if (process.env[varName]) {
    return process.env[varName].trim()
  }
  for (const alt of fallbackNames) {
    if (process.env[alt]) {
      return process.env[alt].trim()
    }
  }

  // 2. 尝试从 fish 环境变量中读取
  try {
    const output = execSync(`fish -c "echo -n \\$${varName}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
    if (output)
      return output
  }
  catch {
    // 忽略 fish 执行失败
  }

  for (const alt of fallbackNames) {
    try {
      const output = execSync(`fish -c "echo -n \\$${alt}"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim()
      if (output)
        return output
    }
    catch {
      // 忽略
    }
  }

  return ''
}

/**
 * 安全打印 Token 掩码
 */
function maskToken(token) {
  if (!token)
    return '(未配置)'
  if (token.length <= 8)
    return '***'
  return `${token.slice(0, 4)}...${token.slice(-4)}`
}

async function main() {
  console.log('\n🚀 ==========================================')
  console.log('   VSCode Extension 一键自动化发布工具')
  console.log('==========================================\n')

  // 1. 读取项目元信息
  const pkgPath = resolve(root, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  const { name, version } = pkg
  const vsixFileName = `${name}-${version}.vsix`
  const vsixFilePath = resolve(root, vsixFileName)

  console.log(`📦 扩展名称: ${name}`)
  console.log(`🔖 当前版本: v${version}`)
  console.log(`📄 目标产物: ${vsixFileName}\n`)

  // 2. 获取发布凭证 Token
  console.log('🔑 正在读取认证 Token (支持 fish 全局变量)...')
  const vsceToken = getEnv('VSCE_PUBLISH_TOKEN', ['VSCE_PAT'])
  const ovsxToken = getEnv('OPEN_VSX_ACCESS_TOKEN', ['OVSX_PAT'])

  console.log(`   - VS Code Marketplace Token: ${maskToken(vsceToken)}`)
  console.log(`   - Open VSX Token:            ${maskToken(ovsxToken)}\n`)

  if (!vsceToken && !ovsxToken) {
    console.error('❌ 错误: 未能在当前环境或 fish 全局变量中找到 VSCE_PUBLISH_TOKEN 或 OPEN_VSX_ACCESS_TOKEN！')
    process.exit(1)
  }

  // 3. 打包 VSIX
  console.log('🔨 [1/4] 正在编译并打包 VSIX 扩展...')
  try {
    execSync('npm run ext:package', { stdio: 'inherit' })
    if (!existsSync(vsixFilePath)) {
      throw new Error(`未找到打包生成的产物: ${vsixFilePath}`)
    }
    console.log('✅ 打包完成！\n')
  }
  catch (error) {
    console.error('❌ 打包失败:', error.message)
    process.exit(1)
  }

  // 4. 发布到 VS Code Marketplace
  if (vsceToken) {
    console.log('🚀 [2/4] 正在发布到 VS Code 官方扩展商店 (Marketplace)...')
    try {
      execSync(`npx vsce publish -p "${vsceToken}" --packagePath "${vsixFilePath}"`, {
        stdio: 'inherit',
      })
      console.log('✅ VS Code Marketplace 发布成功！\n')
    }
    catch (error) {
      console.error('❌ VS Code Marketplace 发布失败:', error.message)
    }
  }
  else {
    console.log('⚠️ [2/4] 跳过 VS Code Marketplace 发布（未找到 Token）\n')
  }

  // 5. 发布到 Open VSX
  if (ovsxToken) {
    console.log('🚀 [3/4] 正在发布到 Open VSX 扩展市场 (open-vsx.org)...')
    try {
      execSync(`npx ovsx publish -p "${ovsxToken}" "${vsixFilePath}"`, {
        stdio: 'inherit',
      })
      console.log('✅ Open VSX 发布成功！\n')
    }
    catch (error) {
      console.error('❌ Open VSX 发布失败:', error.message)
    }
  }
  else {
    console.log('⚠️ [3/4] 跳过 Open VSX 发布（未找到 Token）\n')
  }

  // 6. 自动安装到本地 Cursor（如可用）
  console.log('💻 [4/4] 检查并同步安装到本地 Cursor...')
  try {
    execSync(`cursor --install-extension "${vsixFilePath}" --force`, {
      stdio: 'inherit',
    })
    console.log('✅ 已成功将最新扩展安装至本地 Cursor！\n')
  }
  catch {
    console.log('ℹ️ 未检测到 cursor 命令或跳过本地安装\n')
  }

  console.log('🎉 ==========================================')
  console.log(`   发布流程全部完成！版本: v${version}`)
  console.log('==========================================\n')
}

main()
