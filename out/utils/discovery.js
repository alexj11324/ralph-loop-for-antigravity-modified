"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
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
async function discoverPromptFiles(workspaceRoot) {
    const promptFiles = [];
    try {
        const pattern = new vscode.RelativePattern(workspaceRoot, "**/*PROMPT*.md");
        const files = await vscode.workspace.findFiles(pattern);
        const commonPromptFiles = [
            "PROMPT.md",
            "prompt.md",
            "PROMPT.txt",
            "prompt.txt",
        ];
        await Promise.all(commonPromptFiles.map(async (fileName) => {
            const fileUri = vscode.Uri.file(`${workspaceRoot}/${fileName}`);
            try {
                await vscode.workspace.fs.stat(fileUri);
                promptFiles.push(fileName);
            }
            catch {
                // Ignore
            }
        }));
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
        return ["PROMPT.md"];
    }
}
async function discoverTaskFiles(workspaceRoot) {
    const taskFiles = [];
    try {
        // Look for common task file patterns
        const patterns = ["PRD.md", "TASKS.md", "TODO.md", "task.md", "tasks.md"];
        await Promise.all(patterns.map(async (pattern) => {
            const fileUri = vscode.Uri.file(`${workspaceRoot}/${pattern}`);
            try {
                await vscode.workspace.fs.stat(fileUri);
                taskFiles.push(pattern);
            }
            catch {
                // Ignore
            }
        }));
        // Also search for any markdown file with TASK or PRD in the name
        const pattern = new vscode.RelativePattern(workspaceRoot, "**/{*TASK*,*PRD*}.md");
        const files = await vscode.workspace.findFiles(pattern);
        for (const file of files) {
            const relativePath = vscode.workspace.asRelativePath(file);
            if (!taskFiles.includes(relativePath)) {
                taskFiles.push(relativePath);
            }
        }
        return [...new Set(taskFiles)].sort();
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