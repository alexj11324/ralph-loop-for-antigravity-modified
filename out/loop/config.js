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
exports.getLoopConfiguration = getLoopConfiguration;
exports.parsePollInterval = parsePollInterval;
const vscode = __importStar(require("vscode"));
function parsePollInterval(value) {
    if (!value) return 4000;
    const str = String(value).trim().toLowerCase();
    const mMatch = str.match(/^([\d.]+)\s*m(?:in(?:ute)?s?)?$/);
    if (mMatch) return Math.round(parseFloat(mMatch[1]) * 60 * 1000);
    const sMatch = str.match(/^([\d.]+)\s*s(?:ec(?:ond)?s?)?$/);
    if (sMatch) return Math.round(parseFloat(sMatch[1]) * 1000);
    const num = parseFloat(str);
    if (!isNaN(num)) return Math.round(num * 1000);
    return 4000; // fallback
}
async function getLoopConfiguration(context) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("No workspace folder open");
        return null;
    }
    // Use the first workspace folder (this is the workspace for this VS Code window)
    // Note: We intentionally do NOT use activeTextEditor here because the active
    // document might be from a different workspace in multi-root scenarios, but
    // Ralph Loop should operate on the primary workspace of the current window.
    // Use the active workspace folder if available, otherwise fallback to the first one
    let workspaceRoot = workspaceFolders[0].uri.fsPath;
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const activeWorkspace = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
        if (activeWorkspace) {
            workspaceRoot = activeWorkspace.uri.fsPath;
        }
    }
    const config = vscode.workspace.getConfiguration("ralphLoop");
    const workspaceState = context.workspaceState;
    // Use persisted values or fall back to defaults
    const promptFile = workspaceState.get("ralph.lastPromptFile") ??
        config.get("promptFile", "");
    const mode = workspaceState.get("ralph.lastMode") ??
        config.get("defaultMode", "Fast");
    const model = workspaceState.get("ralph.lastModel") ??
        config.get("defaultModel", "Gemini 3 Flash");
    const maxIterations = workspaceState.get("ralph.lastMaxIterations") ??
        config.get("maxIterations", 200);
    const taskFileRaw = workspaceState.get("ralph.lastTaskFile") ??
        config.get("taskFile", "docs/tasks/PRD.md");
    const progressFileRaw = workspaceState.get("ralph.lastProgressFile") ??
        config.get("progressFile", "docs/tasks/progress.txt");
    // Auto-resolve: if configured path doesn't exist, try docs/tasks/ variant
    const fs = require("fs");
    const pathMod = require("path");
    let taskFile = taskFileRaw;
    if (taskFile && !pathMod.isAbsolute(taskFile) && !taskFile.startsWith("docs/tasks/")) {
        const rootPath = pathMod.join(workspaceRoot, taskFile);
        const docsPath = pathMod.join(workspaceRoot, "docs/tasks", taskFile);
        if (!fs.existsSync(rootPath) && fs.existsSync(docsPath)) {
            taskFile = "docs/tasks/" + taskFile;
        }
    }
    let progressFile = progressFileRaw;
    if (progressFile && !pathMod.isAbsolute(progressFile) && !progressFile.startsWith("docs/tasks/")) {
        const rootPath = pathMod.join(workspaceRoot, progressFile);
        const docsPath = pathMod.join(workspaceRoot, "docs/tasks", progressFile);
        if (!fs.existsSync(rootPath) && fs.existsSync(docsPath)) {
            progressFile = "docs/tasks/" + progressFile;
        }
    }
    const stableThreshold = workspaceState.get("ralph.lastStableThreshold") ??
        config.get("stableThreshold", 7);
    const gracePolls = workspaceState.get("ralph.lastGracePolls") ??
        config.get("gracePolls", 5);
    const pollIntervalRaw = workspaceState.get("ralph.lastPollInterval") ??
        config.get("pollInterval", "4s");
    const pollIntervalMs = parsePollInterval(pollIntervalRaw);
    const testCommand = config.get("testCommand", "npm run test");
    const lintCommand = config.get("lintCommand", "npm run lint");
    const buildCommand = config.get("buildCommand", "npm run build");
    const packageCommand = config.get("packageCommand", "");
    const enabledBackpressure = config.get("enabledBackpressure", ["test", "lint", "build"]);
    const useGit = workspaceState.get("ralph.useGit", true);
    const createBranchEverySession = workspaceState.get("ralph.createBranchEverySession", true);
    return {
        promptFile,
        mode,
        model,
        maxIterations,
        taskFile: taskFile === "None" ? undefined : taskFile,
        progressFile,
        workspaceRoot,
        doneMarker: "", // Set by iteration.ts with proper loopId
        stableThreshold,
        gracePolls,
        pollIntervalMs,
        pollIntervalRaw: pollIntervalRaw,
        backpressure: {
            testCommand,
            lintCommand,
            buildCommand,
            packageCommand,
            enabledBackpressure,
        },
        useGit,
        createBranchEverySession,
    };
}
//# sourceMappingURL=config.js.map