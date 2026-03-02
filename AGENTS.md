# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Ralph Loop for Antigravity is a VSCode extension that enables autonomous AI agent loops using the "Ralph Loop" methodology. It interfaces with Antigravity (Codeium's AI coding assistant) via its internal gRPC-Web API to run iterative coding sessions with fresh context per iteration.

**This is a closed source repository.** The public-facing issues repo is at `Issues_repo/ralph-loop-for-antigravity/` for community bug reports and feature requests.

## Build & Development Commands

```bash
make install      # Install npm dependencies
make compile      # Compile TypeScript to out/
make lint         # Run ESLint
make format       # Format with Prettier
make build        # Compile + package VSIX
make package      # Package VSIX only (skips prompts)
make clean        # Remove out/ and *.vsix files
npm run watch     # Watch mode for development
npm run test      # Run tests
```

Single test: `node ./out/test/runTest.js` (after compile)

## Architecture

### Core Loop Flow
1. `extension.ts` → activates extension, registers commands, initializes global state
2. `commands/loop.ts` → handles start/stop/pause commands, creates `LoopConfig`
3. `loop/iteration.ts` → main while-loop controller with pause/resume handling
4. `loop/agentRunner.ts` → spawns fresh agent context per iteration, sends instructions to Antigravity

### Key Modules

**State (`state.ts`)**: Global singleton managing loop status, iteration count, cascade IDs, and client connections. All state mutations go through setter functions.

**AntigravityClient (`antigravityClient/`)**: gRPC-Web client using Connect protocol over HTTP/2. Handles:
- Auto-discovery of Antigravity's local port via process inspection (`antigravityClient/discovery.ts`)
- Token extraction (CSRF + OAuth) from Antigravity's electron state (`antigravityClient/discovery.ts`)
- Cascade session management (start, message, stream, delete) (`antigravityClient/client.ts`)
- Protobuf framing/payload helpers for the wire protocol (`antigravityClient/protobuf.ts`)

**RalphLoopProvider (`ralphLoopProvider.ts`)**: VSCode TreeDataProvider for the sidebar UI. Displays session status and configuration items.

### Data Flow
```
User starts loop → LoopConfig created → iteration.ts runs while-loop
  → agentRunner spawns fresh context → antigravityClient creates cascade
  → Instructions sent with task/progress file references
  → Stream updates until completion → cascade deleted → next iteration
```

### Pseudo Ralph Mode
When enabled, reuses a single cascade session across iterations instead of creating/deleting per iteration. Controlled via `state.pseudoRalphMode` and `state.persistentCascadeId`.

## File Conventions

- **Task file** (default: `PRD.md`): Read-only spec with discrete tasks, referenced by agent
- **Progress file** (default: `progress.txt`): Append-only log of completed work
- **Prompt file** (optional): Custom instructions prepended to agent messages

## Extension Points

Commands are registered in `extension.ts` and implemented in `commands/`. Configuration schema is in `package.json` under `contributes.configuration`.

Model IDs for Antigravity are mapped in `antigravityClient/protobuf.ts` (`MODEL_IDS` constant) - add new models there when Antigravity adds them.
