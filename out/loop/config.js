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
exports.getLoopConfiguration = getLoopConfiguration;
const vscode = __importStar(require("vscode"));
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
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
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
        config.get("maxIterations", 50);
    const taskFile = workspaceState.get("ralph.lastTaskFile") ??
        config.get("taskFile", "PRD.md");
    const progressFile = workspaceState.get("ralph.lastProgressFile") ??
        config.get("progressFile", "progress.txt");
    const stableThreshold = workspaceState.get("ralph.lastStableThreshold") ??
        config.get("stableThreshold", 7);
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