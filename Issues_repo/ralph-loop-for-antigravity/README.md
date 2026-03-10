# Ralph Loop for Antigravity - Community Issues

Community issue tracker for [Ralph Loop for Antigravity](https://github.com/abhishekbhakat/ralph-loop-for-antigravity), a VS Code extension that enables autonomous AI agent execution using Antigravity.

## What is Ralph Loop?

Ralph Loop solves two fundamental problems with AI coding assistants:

1. **Context window limitations** - LLMs forget important context mid-task
2. **Constant oversight required** - AI cannot work autonomously for extended periods

The solution: **externalize memory to files** and run AI agents in **iterative loops** with fresh context per iteration.

### How It Works

```
1. Read tasks from PRD.md (task file)
2. Check progress in progress.txt
3. Complete exactly ONE task
4. Append progress (never delete)
5. Commit changes
6. Repeat until all tasks done or max iterations reached
```

Each iteration spawns a fresh Cascade session, ensuring the agent always has full context by reading from disk rather than relying on conversation memory.

## Reporting Issues

Before opening an issue:

1. **Search existing issues** - Your issue may already be reported
2. **Check requirements**:
   - VS Code 1.75.0 or later
   - Antigravity in agent driven mode
   - A workspace folder with task files
3. **Gather information**:
   - OS and version
   - VS Code version
   - Ralph Loop extension version
   - Steps to reproduce
   - Relevant logs from the "Ralph Loop" output channel

### Issue Templates

| Template             | Use For                                    |
|----------------------|--------------------------------------------|
| **Bug Report**       | Something isn't working as expected        |
| **Feature Request**  | Suggest new features or improvements       |

## Common Issues

### "No task file selected"
Select a task file in the sidebar Configuration section before starting the loop.

### "No workspace folder open"
Open a folder in VS Code before starting Ralph Loop.

### Loop not responding
Use `Ralph: Emergency Stop Ralph Loop` from the Command Palette (Cmd/Ctrl+Shift+P).

### Token extraction failing
Ensure Antigravity is running. If auto-discovery fails, manually configure the CSRF token and port in settings.

## Default File Paths

Ralph Loop searches for task and prompt files in the following locations **only**:

| File Type | Search Paths |
|-----------|-------------|
| Task File | `./PRD.md`, `./TASKS.md`, `./TODO.md`, etc. (workspace root) |
| | `docs/tasks/*.md` (standard deliverable directory) |
| Prompt File | `./prompt.md`, `./PROMPT.md`, etc. (workspace root) |
| | `docs/tasks/prompt.md` (standard deliverable directory) |
| Progress File | `./progress.txt` (workspace root, default) |
| | `docs/tasks/progress.txt` (recommended) |

> **Recommended directory structure:**
> ```
> <workspace>/
> └── docs/tasks/
>     ├── PRD.md          ← task file
>     ├── prompt.md       ← prompt file
>     └── progress.txt    ← progress file
> ```

## CLI Tool (`ralph-loop`)

Install the CLI for terminal / agent / CI usage:

```bash
npm install -g ralph-loop
```

**Examples:**
```bash
# Basic usage
ralph-loop -w /path/to/project

# Benchmark with long poll interval
ralph-loop -w . --poll-interval 2m --max-iterations 50

# Custom model + Planning mode
ralph-loop -w . --model "Claude Sonnet 4.6 (Thinking)" --mode Planning

# Resume from checkpoint
ralph-loop -w . --resume

# Dry-run (show config only)
ralph-loop -w . --poll-interval 30s --dry-run
```

Run `ralph-loop --help` for full options.

## Fork 改进 (alexj11324/ralph-loop-for-antigravity-modified)

本仓库基于 [原始项目](https://github.com/abhishekbhakat/ralph-loop-for-antigravity) 进行了以下改进：

### 🔒 安全修复
- **命令注入防护**: `execCommand` 使用 `execFileAsync` + 显式参数数组替代 shell 字符串拼接，防止命令注入攻击
- **Git 命令注入修复**: 修复了 Git 操作中的潜在注入风险

### ⚡ 性能优化
- **并行文件发现**: `discoverPromptFiles` 和 `discoverTaskFiles` 使用 `Promise.all` 并行检查文件存在性，保持原始顺序
- **异步 OAuth Token 提取**: `extractOAuthToken` 改为纯异步操作，消除 `existsSync` 的 TOCTOU 竞态条件
- **异步进程发现**: 所有进程发现命令改为异步执行，带 stderr 暴露
- **Windows 版本缓存**: `getWindowsVersion` 结果缓存，避免重复子进程调用

### 🛠 代码质量
- **Stderr 规范化**: 统一 stderr 处理为一致的字符串类型
- **模型支持更新**: 支持 Gemini 3.1 Pro 和 Claude 4.6 Opus

## Links

- [原始项目](https://github.com/abhishekbhakat/ralph-loop-for-antigravity)
- [本 Fork](https://github.com/alexj11324/ralph-loop-for-antigravity-modified)
- [VS Code Marketplace (原始)](https://marketplace.visualstudio.com/items?itemName=abhishekbhakat.ralph-loop-for-antigravity)
- [Open VSX Registry (原始)](https://open-vsx.org/extension/abhishekbhakat/ralph-loop-for-antigravity)

## License

MIT
