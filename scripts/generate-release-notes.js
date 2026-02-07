#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

// 读取环境变量
let envContent = {};
try {
  envContent = require('dotenv').config().parsed || {};
} catch {
  // dotenv 未安装，尝试直接读取 .env
  try {
    const envFile = readFileSync('./.env', 'utf-8');
    envContent = Object.fromEntries(
      envFile
        .split('\n')
        .filter(line => line.trim() && !line.startsWith('#'))
        .map(line => line.split('=', 2).map(s => s.trim()))
        .filter(([k, v]) => k && v),
    );
  } catch {
    console.error('❌ 请先创建 .env 文件，参考 .env.example');
    process.exit(1);
  }
}

const {
  OPENAI_API_KEY,
  OPENAI_BASE_URL = 'https://api.siliconflow.com/v1',
  OPENAI_MODEL = 'deepseek-ai/DeepSeek-R1',
} = envContent;

if (!OPENAI_API_KEY) {
  console.error('❌ 请在 .env 文件中设置 OPENAI_API_KEY');
  process.exit(1);
}

// 获取上一次发版日期
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
const version = packageJson.version;

// 获取最近一个 release 的日期
try {
  const lastReleaseTag = execSync('gh release list --limit 1 --json tagName', {
    encoding: 'utf-8',
  })
    ? JSON.parse(
        execSync('gh release list --limit 1 --json tagName', {
          encoding: 'utf-8',
        }),
      )?.[0]?.tagName
    : null;

  if (lastReleaseTag === `v${version}`) {
    console.error('❌ 当前版本已存在 release');
    process.exit(1);
  }

  const lastReleaseDate = lastReleaseTag
    ? execSync(
        `gh release view ${lastReleaseTag} --json createdAt -q '.createdAt'`,
        { encoding: 'utf-8' },
      ).trim()
    : '1970-01-01';

  // 获取提交信息
  const commits = execSync(
    `git log --since="${lastReleaseDate}" --pretty=format:"%h|%ad|%s|%b" --date=short --no-merges`,
    { encoding: 'utf-8' },
  ).trim();

  if (!commits) {
    console.error('❌ 没有新的提交');
    process.exit(1);
  }

  console.log(`\n📝 正在生成 v${version} 的 Release 文案...\n`);

  // 调用 OpenAI API
  const prompt = `你是一个专业的 Release 文案撰写助手。请根据以下 Git 提交记录，生成一个简洁、专业的 GitHub Release 文案。

版本: v${version}
提交记录:
${commits}

请生成一个 Markdown 格式的文案，要求：
1. 以"## 新功能"开头，列出新增的功能
2. 以"## 修复"开头，列出的 bug 修复
3. 以"## 改进"开头，列出其他改进
4. 使用 emoji 图标增强可读性
5. 每项用 - 开头，简洁明了
6. 如果某个分类没有内容则不显示该分类

只返回 Markdown 文案，不要有其他说明文字。`;

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: '你是一个专业的 Release 文案撰写助手。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    }),
  });

  const data = await response.json();

  if (data.error) {
    console.error('❌ OpenAI API 调用失败:', data.error.message);
    process.exit(1);
  }

  const notes = data.choices[0].message.content;

  console.log('✅ Release 文案生成成功\n');
  console.log(notes);
  console.log('\n');

  // 保存到文件
  writeFileSync('./.release-notes.md', notes);
  console.log('📄 已保存到 .release-notes.md');
} catch (error) {
  console.error('❌ 生成失败:', error.message);
  process.exit(1);
}
