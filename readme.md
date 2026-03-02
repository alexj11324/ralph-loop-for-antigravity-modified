# Ralph Loop for Antigravity (Updated)

> **Fork Notice**: This is a fork of [Ralph Loop for Antigravity](https://github.com/abhishekbhakat/ralph-loop-for-antigravity) by [Abhishek Bhakat](https://github.com/abhishekbhakat), released under the MIT License.
>
> **Key improvements in this fork:**
> - Added support for the latest models available in Antigravity: Claude Sonnet 4.6 (Thinking), Claude Opus 4.6 (Thinking), Gemini 3.1 Pro (High/Low), GPT-OSS 120B
> - Updated API integration for Antigravity v1.107+ (JSON-based REST API)

A VSCode extension that brings the Ralph Loop autonomous AI agent methodology to Antigravity.

## Overview

Developers using AI coding assistants face two key challenges:

1. **Context window limitations** - LLMs forget important context mid-task
2. **Constant oversight required** - AI cannot work autonomously for extended periods

The Ralph Loop methodology solves this by externalizing memory to files and running AI agents in iterative loops. This extension provides intuitive controls for managing these loops directly within VS Code.

## Quick Start

1. **Install the extension** from the VSIX file
2. **Create your PRD/spec file** (see [Task File Format](#task-file-format) below)
   - Use **Planning mode** in Antigravity to help create a proper PRD with discrete tasks
3. **Open the Ralph Loop sidebar** via the Activity Bar icon
4. **Configure your session** in the sidebar:
   - Select task file (default: `PRD.md`)
   - Set progress file (default: `progress.txt`)
   - Choose mode and model
   - Set max iterations
5. **Start the loop** using the play button in the sidebar

> **Recommended Workflow (Antigravity):**  
> Use **Planning mode** to create your PRD/spec file with well-defined tasks.  
> Then switch to **Fast mode** to run the Ralph Loop for execution.

## File Structure

The extension uses a simple file-based architecture:

| File           | Purpose            | Description                                                  |
|----------------|--------------------|--------------------------------------------------------------|
| `PRD.md`       | Task Specification | Your tasks/requirements. **Read-only** for agent.            |
| `progress.txt` | Progress Log       | Agent appends progress here. Source of truth for completion. |
| `prompt.md`    | Instructions       | Optional custom instructions for the agent.                  |

### Task File Format

The task file is **read-only** - the agent never modifies it. Write a proper PRD or specification document, but **organize it into discrete, actionable tasks** so the agent can identify what to work on next by cross-referencing `progress.txt`.

```markdown
# PRD: User Management System

## Overview
Build a user management system with authentication, profiles, and admin controls.

## Task 1: Authentication
Implement JWT-based authentication with login/logout endpoints.
- POST /api/auth/login
- POST /api/auth/logout
- Token refresh mechanism

## Task 2: User Profiles
Create user profile CRUD operations.
- GET/PUT /api/users/:id
- Profile picture upload
- Email verification

## Task 3: Admin Dashboard
Build admin interface for user management.
- List all users with pagination
- Suspend/activate accounts
- View user activity logs
```

The key is **clear task boundaries** - each `## Task N:` section should be a self-contained unit of work that the agent can complete in one iteration.

### Progress File Format

The agent appends entries to track completion. This is how it knows which tasks are done:

```bash
[2026-01-21 10:30] Started: Task 1 - User Authentication
[2026-01-21 10:45] Created auth module in src/auth/
[2026-01-21 11:00] Completed: Task 1 - User Authentication
[2026-01-21 11:05] Started: Task 2 - Database Migrations
```

## Features

### Activity Bar & Sidebar

Ralph Loop has a dedicated Activity Bar icon. The sidebar shows:

- **Session**: Current status, mode, model, iteration count, elapsed time
- **Configuration**: All configurable options (click to change)
  - Mode (Fast/Planning)
  - Model
  - Max Iterations
  - Prompt File
  - Task File
  - Progress File

### Status Bar

A persistent status bar item displays:

- Loop state: `Running`, `Paused`, or `Stopped`
- Current iteration: `15/50`
- Elapsed time: `2m 34s`

### Output Channel

The **Ralph Loop** output channel provides:

- Streaming agent responses
- Iteration markers and phase tracking
- Progress indicators

## Commands

| Command                            | Description                 |
|------------------------------------|-----------------------------|
| `Ralph: Start Ralph Loop`          | Start a new loop session    |
| `Ralph: Stop Ralph Loop`           | Stop the loop gracefully    |
| `Ralph: Pause/Resume Ralph Loop`   | Toggle pause state          |
| `Ralph: Emergency Stop Ralph Loop` | Immediately stop the loop   |

## Configuration

### Settings

Configure Ralph Loop via VS Code Settings (`Preferences: Open Settings`):

| Setting                    | Default          | Description                 |
|----------------------------|------------------|-----------------------------|
| `ralphLoop.maxIterations`  | `50`             | Maximum iterations per loop |
| `ralphLoop.defaultMode`    | `Fast`           | Default mode                |
| `ralphLoop.defaultModel`   | `Gemini 3 Flash` | Default AI model            |
| `ralphLoop.promptFile`     | `None`           | Default prompt file         |
| `ralphLoop.taskFile`       | `PRD.md`         | Default task file           |
| `ralphLoop.progressFile`   | `progress.txt`   | Default progress file       |

## How It Works

1. **Fresh Context Per Iteration**: Each iteration spawns a fresh cascade session, sending structured instructions that reference your task and progress files.

2. **Structured Instructions**: The agent receives clear instructions:
   - Read tasks from your task file
   - Check progress in your progress file
   - Complete exactly one task
   - Append progress (never delete)
   - Commit changes

3. **File-Based Memory**: Progress persists on disk between iterations in `progress.txt`, not in the agent's memory.

4. **Graceful Stop**: The stop command waits for the current iteration to complete.

5. **Emergency Stop**: Immediately terminates the loop.

### Automatic Loop Completion

When you start a loop, Ralph generates a unique completion marker (e.g., `ralph-done-a3x9k`). The agent is instructed to append this marker to the progress file when ALL tasks are complete.

Before each iteration, Ralph checks the last few lines of your progress file for this marker. If found, the loop ends automatically - no manual stop needed.

This means:

- The loop stops on its own when work is done
- Each loop session has a unique marker (prevents false positives from old runs)
- You can still manually stop anytime if needed

## Troubleshooting

### "No task file selected"

Select a task file in the sidebar Configuration section.

### "No workspace folder open"

Open a folder in VS Code before starting Ralph Loop.

### Loop not responding

Use `Ralph: Emergency Stop Ralph Loop` from the Command Palette.

### Wrong workspace

The extension opens your task/prompt file before starting to ensure the agent works in the correct workspace.

## Links

- [GitHub Repository (Fork)](https://github.com/alexj11324/ralph-loop-for-antigravity-modified)
- [Report Issues](https://github.com/alexj11324/ralph-loop-for-antigravity-modified/issues)
- [Original Project](https://github.com/abhishekbhakat/ralph-loop-for-antigravity) by Abhishek Bhakat

## Requirements

- VS Code 1.75.0 or later
- Antigravity in agent driven mode
- A workspace folder with task files

## License

MIT - Original copyright © 2026 [Abhishek Bhakat](https://github.com/abhishekbhakat). Fork maintained by Alex Jiang.

---

*Turn Antigravity into an autonomous, iterative coding agent.*
