---
trigger: always_on
---

# Google Antigravity Project Rules

## 1. Project Context

- **Role**: Full Stack Developer
- **Tech Stack**: markdown-it , shiki, ts,
- **Package Manager**: pnpm
- **Environment**: vscode 插件扩展项目

## 2. Antigravity Engineering Standards

### Core Principles & Architecture

> **Language Requirement**: All responses, thinking processes, and task lists must be in **Simplified Chinese (zh-CN)**.

> **简洁至上**: 恪守 KISS 原则，优先选择最直接、稳定的技术实现
> **结构化流程**: 遵循 '构思方案 -> 提请审核 -> 分解任务' 的顺序
> **组件化**: 遵循单一职责原则，UI 组件与业务逻辑分离 (Container/Presentational)
> **架构分层**: 严格遵守 视图层 -> 逻辑层 -> 数据层 的单向依赖流
> **深度分析**: 立足于第一性原理 (First Principles) 剖析问题
> **事实为本**: 以事实为最高准则，发现技术隐患(如TCP粘包)必须坦率斧正

## 3. Workflow & Interaction

- **Tone**: Professional, technical, concise (No fluff).
- **Thinking Process**: Use **First Principles**. Explain _why_ before _how_.
- **Fixed Command**: Always include `Implementation Plan` and `Task List` in thinking process.

## 4. Code Quality & Design

- **Architecture**: Enforce Logic Splitting & Composition. Avoid files > 400 lines.
- **Components**: Prefer Functional Components + Hooks over Class Components.
- **Comments**: Detailed Chinese comments for critical logic (TCP, File IO, Algorithms).
- 尽量使用现代化推荐的主流语法，让代码更简洁、易维护。
- 定义常量对象/map/数组时，一定要看看原本代码有没有已经定义的，别重复定义，尽量复用或在原来基础上进行扩展！！！
- 如无必要, 不要写兼容代码
