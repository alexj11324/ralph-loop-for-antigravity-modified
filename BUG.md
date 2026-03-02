# Bug Report - v0.5.0

Reported by: @k1lgor ([Issue #2](https://github.com/abhishekbhakat/ralph-loop-for-antigravity/issues/2))

## Bug 1: Configuration Settings Not Registered

**Symptoms:**
- "Use Git" and "Create new branch every session" checkboxes reset when making other configuration changes
- New branch is still created despite unchecking the option
- VSCode shows error notifications:
  - "Unable to write to Workspace Settings because ralphLoop.useGit is not a registered configuration."
  - "Unable to write to Workspace Settings because ralphLoop.createBranchEverySession is not a registered configuration."

**Root Cause:**
The settings `ralphLoop.useGit` and `ralphLoop.createBranchEverySession` are used in code but not properly registered in `package.json` under `contributes.configuration`.

**Fix:**
Add the missing configuration properties to `package.json`.

---

## Bug 2: progress.txt Not Being Edited

**Symptoms:**
- The extension no longer edits `progress.txt` at all during loop iterations

**Root Cause:**
TBD - needs investigation

**Fix:**
TBD
