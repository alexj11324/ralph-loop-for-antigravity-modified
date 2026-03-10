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
exports.checkAntigravityAutonomy = checkAntigravityAutonomy;
exports.initializeWorkspaceState = initializeWorkspaceState;
const vscode = __importStar(require("vscode"));
const state = __importStar(require("../state"));
const antigravityClient_1 = require("../antigravityClient");
async function checkAntigravityAutonomy() {
    // Note: This check is informational only. The protobuf response parsing
    // may not be accurate, so we only log debug info and don't show warnings.
    try {
        // Get the current workspace to ensure we connect to the right Antigravity instance
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspacePath = workspaceFolders?.[0]?.uri.fsPath;
        const tempClient = await (0, antigravityClient_1.createAntigravityClient)(state.outputChannel, undefined, workspacePath);
        const userStatus = await tempClient.getUserStatus();
        state.progressLogger?.debug(`Antigravity autonomy status: autoRun=${userStatus.cascadeCanAutoRunCommands}`, "Autonomy");
        tempClient.disconnect();
    }
    catch (error) {
        // Non-fatal: Antigravity may not be running or configured
        state.progressLogger?.debug(`Autonomy check skipped: ${error}`, "Autonomy");
    }
}
function initializeWorkspaceState(context) {
    const workspaceState = context.workspaceState;
    const config = vscode.workspace.getConfiguration("ralphLoop");
    if (!workspaceState.get("ralph.lastPromptFile")) {
        workspaceState.update("ralph.lastPromptFile", config.get("promptFile", "docs/tasks/prompt.md"));
    }
    if (!workspaceState.get("ralph.lastMaxIterations")) {
        workspaceState.update("ralph.lastMaxIterations", config.get("maxIterations", 200));
    }
    if (!workspaceState.get("ralph.lastModel")) {
        workspaceState.update("ralph.lastModel", config.get("defaultModel", "Claude Opus 4.6 (Thinking)"));
    }
    // Migrate old mode 'Building' to 'Fast', or default to 'Fast'
    const currentMode = workspaceState.get("ralph.lastMode");
    if (!currentMode || currentMode === "Building") {
        workspaceState.update("ralph.lastMode", "Planning");
    }
}
//# sourceMappingURL=workspace.js.map