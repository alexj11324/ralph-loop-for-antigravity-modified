# RIP: Loop Halt on Task Completion

Ralph Improvement Proposal for early loop termination when all tasks are complete.

## Problem

Currently, the Ralph Loop runs for a fixed number of iterations regardless of whether all tasks are complete. This wastes resources and time when the AI finishes all tasks before reaching the iteration limit.

## Proposed Solution

Introduce a unique per-loop marker that the AI appends to the progress file when all tasks are complete. Before each iteration, check for this marker and halt the loop if found.

## Mechanism

### 1. Marker Generation

When a loop starts, generate a unique marker:

```
ralph-done-{random_5_char_string}
```

Example: `ralph-done-xsfgy`

### 2. Instruction Injection

Add to the agent instructions in `agentRunner.ts`:

```
- **Signal completion**: When ALL tasks in `{taskFile}` are complete, append this exact block at the end of `{progressFile}`:
----------
ralph-done-xsfgy
```

### 3. Pre-Iteration Check

Before each iteration in `iteration.ts`:

1. Read the last 5 lines of the progress file
2. Check if the marker exists
3. If found, stop the loop and notify the user that all tasks are complete

## Implementation Details

### State Changes

Add to `LoopConfig`:

```typescript
doneMarker: string;
```

### Check Logic (iteration.ts)

```typescript
async function checkTasksComplete(config: LoopConfig): Promise<boolean> {
  if (!config.progressFile || !config.doneMarker) return false;
  
  try {
    const progressUri = vscode.Uri.file(
      `${config.workspaceRoot}/${config.progressFile}`
    );
    const content = await vscode.workspace.fs.readFile(progressUri);
    const lines = new TextDecoder().decode(content).trim().split('\n');
    const lastLines = lines.slice(-5).join('\n');
    return lastLines.includes(config.doneMarker);
  } catch {
    return false;
  }
}
```

### Instruction Addition (agentRunner.ts)

Add to the Rules section:

```
- **Signal completion**: When ALL tasks in \`${taskFile}\` are complete, append this exact block at the end of \`${progressFile}\`:
----------
${config.doneMarker}
```

## Benefits

- Saves API costs by not running unnecessary iterations
- Reduces total loop time
- Provides clear signal of task completion
- Per-loop unique marker prevents false positives from previous runs

## Considerations

- The AI must correctly identify when all tasks are complete
- The AI must remember to add the marker (instruction clarity is important)
- Checking last 5 lines handles trailing whitespace/newlines gracefully
