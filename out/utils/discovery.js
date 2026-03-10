"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function () { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function (o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function (o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function (o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverPromptFiles = discoverPromptFiles;
exports.discoverTaskFiles = discoverTaskFiles;
exports.selectTaskFile = selectTaskFile;
const vscode = __importStar(require("vscode"));
const state = __importStar(require("../state"));
async function _readRootFileNames(workspaceRoot) {
    try {
        const rootUri = vscode.Uri.file(workspaceRoot);
        const entries = await vscode.workspace.fs.readDirectory(rootUri);
        return new Set(entries.map(([name]) => name));
    }
    catch {
        return new Set();
    }
}
async function discoverPromptFiles(workspaceRoot) {
    const promptFiles = [];
    try {
        const realNames = await _readRootFileNames(workspaceRoot);
        const commonPromptFiles = [
            "PROMPT.md", "prompt.md", "Prompt.md",
            "PROMPT.txt", "prompt.txt",
            "INSTRUCTIONS.md", "instructions.md", "Instructions.md",
            "SYSTEM_PROMPT.md", "system_prompt.md",
            "AGENT_PROMPT.md", "agent_prompt.md",
            "CONTEXT.md", "context.md",
        ];
        for (const fileName of commonPromptFiles) {
            if (realNames.has(fileName) && !promptFiles.includes(fileName)) {
                promptFiles.push(fileName);
            }
        }
        // Only search in docs/tasks/ (the standard deliverable path)
        const pattern = new vscode.RelativePattern(
            workspaceRoot,
            "docs/tasks/{*PROMPT*,*prompt*,*INSTRUCTION*,*instruction*,*CONTEXT*}.{md,txt}"
        );
        const files = await vscode.workspace.findFiles(pattern, undefined, 20);
        for (const file of files) {
            const relativePath = vscode.workspace.asRelativePath(file);
            if (!promptFiles.includes(relativePath)) {
                promptFiles.push(relativePath);
            }
        }
        const uniqueFiles = [...new Set(promptFiles)];
        return uniqueFiles.sort();
    }
    catch (error) {
        state.progressLogger?.error(`Error discovering prompt files: ${error}`, "Discovery");
        return ["prompt.md"];
    }
}
async function discoverTaskFiles(workspaceRoot) {
    const rootFiles = [];
    const docsFiles = [];
    try {
        const realNames = await _readRootFileNames(workspaceRoot);
        const patterns = [
            "PRD.md", "prd.md", "Prd.md",
            "TASKS.md", "tasks.md", "Tasks.md",
            "TODO.md", "todo.md", "Todo.md",
            "task.md", "TASK.md",
            "REQUIREMENTS.md", "requirements.md", "Requirements.md",
            "SPEC.md", "spec.md", "Spec.md",
            "BACKLOG.md", "backlog.md", "Backlog.md",
            "ISSUES.md", "issues.md", "Issues.md",
            "ROADMAP.md", "roadmap.md", "Roadmap.md",
            "PLAN.md", "plan.md", "Plan.md",
            "PRD.txt", "TASKS.txt", "TODO.txt",
        ];
        for (const pattern of patterns) {
            if (realNames.has(pattern) && !rootFiles.includes(pattern)) {
                rootFiles.push(pattern);
            }
        }
        // Only search in docs/tasks/ (the standard deliverable path)
        const docsTasksPattern = new vscode.RelativePattern(
            workspaceRoot,
            "docs/tasks/{*TASK*,*PRD*,*TODO*,*SPEC*,*REQUIREMENT*,*BACKLOG*,*ROADMAP*,*prd*,*task*}.{md,txt}"
        );
        const files = await vscode.workspace.findFiles(docsTasksPattern, undefined, 20);
        for (const file of files) {
            const relativePath = vscode.workspace.asRelativePath(file);
            if (!docsFiles.includes(relativePath) && !relativePath.includes("progress")) {
                docsFiles.push(relativePath);
            }
        }
        // Priority: docs/tasks/ first, then root files
        const combined = [...docsFiles.sort(), ...rootFiles.sort()];
        return [...new Set(combined)];
    }
    catch (error) {
        state.progressLogger?.error(`Error discovering task files: ${error}`, "Discovery");
        return ["PRD.md", "TASKS.md"];
    }
}
async function selectTaskFile(context) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
    }
    // Get workspace from active editor, fall back to first workspace
    let workspaceRoot = workspaceFolders[0].uri.fsPath;
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const activeWorkspace = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
        if (activeWorkspace) {
            workspaceRoot = activeWorkspace.uri.fsPath;
        }
    }
    const taskFiles = await discoverTaskFiles(workspaceRoot);
    if (taskFiles.length === 0) {
        vscode.window.showInformationMessage("No task files (PRD.md, TASKS.md, etc.) found in workspace.");
        return;
    }
    const result = await vscode.window.showQuickPick(taskFiles, {
        placeHolder: "Select task file for Ralph Loop",
    });
    if (result) {
        await context.workspaceState.update("ralph.lastTaskFile", result);
        state.ralphLoopProvider.refresh();
        state.progressLogger?.info(`Task file selected: ${result}`, "Config");
    }
}
//# sourceMappingURL=discovery.js.map