#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, rmSync, renameSync, cpSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
process.chdir(root)

const npmRoot = '/tmp/vscode-ext-prod-node-modules'

console.log('📦 Packaging shiki-markdown-preview...\n')

// 1. Compile
console.log('1. Compiling...')
execSync('npm run compile', { stdio: 'inherit' })

// 2. Copy webview assets
console.log('2. Copying webview assets...')
execSync('npm run copy-assets', { stdio: 'inherit' })

// 3. Ensure npm production node_modules exist
if (!existsSync(npmRoot)) {
  console.log('3. Installing production dependencies via npm...')
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
  const tmpRoot = '/tmp/vscode-ext-prod-install'
  rmSync(tmpRoot, { recursive: true, force: true })
  mkdirSync(tmpRoot, { recursive: true })
  const tmpPkg = { name: pkg.name, version: pkg.version, dependencies: pkg.dependencies, private: true }
  writeFileSync(resolve(tmpRoot, 'package.json'), JSON.stringify(tmpPkg, null, 2))
  execSync('npm install --production --ignore-scripts', { cwd: tmpRoot, stdio: 'inherit' })
  renameSync(resolve(tmpRoot, 'node_modules'), npmRoot)
  rmSync(tmpRoot, { recursive: true, force: true })
} else {
  console.log('3. Using cached production node_modules...')
}

// 4. Swap to npm production node_modules for packaging
console.log('4. Swapping node_modules for packaging...')
const pnpmModules = resolve(root, 'node_modules.pnpm.bak')
if (existsSync(pnpmModules)) {
  rmSync(pnpmModules, { recursive: true, force: true })
}
renameSync(resolve(root, 'node_modules'), pnpmModules)
cpSync(npmRoot, resolve(root, 'node_modules'), { recursive: true })

// 5. Temporarily disable vscode:prepublish (already compiled)
const pkgPath = resolve(root, 'package.json')
const origPkg = readFileSync(pkgPath, 'utf-8')
let patchedPkg = origPkg.replace(/"vscode:prepublish":\s*"[^"]*"/, '"vscode:prepublish": ""')

// 6. Package
console.log('5. Running vsce package...')
try {
  writeFileSync(pkgPath, patchedPkg)
  execSync('npx vsce package', { stdio: 'inherit' })
} finally {
  writeFileSync(pkgPath, origPkg)
}

// 7. Restore pnpm node_modules
console.log('6. Restoring pnpm node_modules...')
rmSync(resolve(root, 'node_modules'), { recursive: true, force: true })
renameSync(pnpmModules, resolve(root, 'node_modules'))

console.log('\n✅ Done!')
