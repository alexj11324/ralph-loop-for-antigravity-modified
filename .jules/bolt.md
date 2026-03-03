## 2026-03-02 - [Pre-compiled vsix extension]
**Learning:** Found an extension repo where all the .ts source files have been compiled directly to .js into the out/ folder and the original .ts files are missing/deleted from the git tree. Since we can't compile we shouldn't attempt optimizations that would normally be done in typescript source files. The out/ directory IS the source now.
**Action:** Directly edit files in the out/ directory.
