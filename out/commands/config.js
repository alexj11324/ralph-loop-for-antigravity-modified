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
exports.configureIterations = configureIterations;
exports.setConfigMode = setConfigMode;
exports.setConfigModel = setConfigModel;
exports.setConfigPromptFile = setConfigPromptFile;
exports.setConfigTaskFile = setConfigTaskFile;
exports.setConfigProgressFile = setConfigProgressFile;
exports.configureStableThreshold = configureStableThreshold;
exports.configureGracePolls = configureGracePolls;
exports.configurePollInterval = configurePollInterval;
const vscode = __importStar(require("vscode"));
const state = __importStar(require("../state"));
const discovery_1 = require("../utils/discovery");
const config_1 = require("../loop/config");
async function configureIterations(context) {
    const currentIterations = context.workspaceState.get("ralph.lastMaxIterations") ?? 200;
    const result = await vscode.window.showInputBox({
        prompt: vscode.l10n.t("Enter maximum iterations per loop"),
        value: currentIterations.toString(),
        validateInput: (value) => {
            const num = parseInt(value);
            if (isNaN(num) || num <= 0 || num > 1000) {
                return vscode.l10n.t("Please enter a number between 1 and 1000");
            }
            return null;
        },
    });
    if (result) {
        const value = parseInt(result);
        await context.workspaceState.update("ralph.lastMaxIterations", value);
        state.setMaxIterations(value);
        state.ralphLoopProvider.refresh();
        state.progressLogger?.info(`Max iterations set to ${value}`, "Config");
    }
}
async function setConfigMode(context) {
    const modes = ["Fast", "Planning"];
    const currentMode = context.workspaceState.get("ralph.lastMode") ?? "Planning";
    const sortedModes = [currentMode, ...modes.filter((m) => m !== currentMode)];
    const result = await vscode.window.showQuickPick(sortedModes, {
        placeHolder: vscode.l10n.t("Select mode"),
    });
    if (result) {
        await context.workspaceState.update("ralph.lastMode", result);
        state.ralphLoopProvider.refresh();
        state.progressLogger?.info(`Mode set to ${result}`, "Config");
    }
}
async function setConfigModel(context) {
    const models = [
        "Gemini 3.1 Pro (High)",
        "Gemini 3.1 Pro (Low)",
        "Gemini 3 Flash",
        "Claude Sonnet 4.6 (Thinking)",
        "Claude Opus 4.6 (Thinking)",
        "GPT-OSS 120B (Medium)",
    ];
    const currentModel = context.workspaceState.get("ralph.lastModel") ?? "Claude Opus 4.6 (Thinking)";
    const sortedModels = [
        currentModel,
        ...models.filter((m) => m !== currentModel),
    ];
    const result = await vscode.window.showQuickPick(sortedModels, {
        placeHolder: vscode.l10n.t("Select AI model"),
    });
    if (result) {
        await context.workspaceState.update("ralph.lastModel", result);
        state.ralphLoopProvider.refresh();
        state.progressLogger?.info(`Model set to ${result}`, "Config");
    }
}
async function setConfigPromptFile(context) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders)
        return;
    // Get workspace from active editor, fall back to first workspace
    let workspaceRoot = workspaceFolders[0].uri.fsPath;
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const activeWorkspace = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
        if (activeWorkspace) {
            workspaceRoot = activeWorkspace.uri.fsPath;
        }
    }
    const promptFiles = await (0, discovery_1.discoverPromptFiles)(workspaceRoot);
    const skipPromptLabel = vscode.l10n.t("None (skip prompt)");
    const options = [skipPromptLabel, ...promptFiles];
    const result = await vscode.window.showQuickPick(options, {
        placeHolder: vscode.l10n.t("Select prompt file"),
    });
    if (result !== undefined) {
        const file = result === skipPromptLabel ? "" : result;
        await context.workspaceState.update("ralph.lastPromptFile", file);
        state.ralphLoopProvider.refresh();
        state.progressLogger?.info(`Prompt file set to ${file || "None"}`, "Config");
    }
}
async function setConfigTaskFile(context) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders)
        return;
    // Get workspace from active editor, fall back to first workspace
    let workspaceRoot = workspaceFolders[0].uri.fsPath;
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const activeWorkspace = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
        if (activeWorkspace) {
            workspaceRoot = activeWorkspace.uri.fsPath;
        }
    }
    const taskFiles = await (0, discovery_1.discoverTaskFiles)(workspaceRoot);
    const currentTaskFile = context.workspaceState.get("ralph.lastTaskFile") ?? "PRD.md";
    // Build options: detected files first (with indicator), then manual input option
    const detectedItems = taskFiles.map((f) => ({
        label: f === currentTaskFile ? `$(check) ${f}` : f,
        description: vscode.l10n.t("Detected in workspace"),
        value: f,
    }));
    const manualItem = {
        label: "$(pencil) " + vscode.l10n.t("Enter custom path..."),
        description: "",
        value: "__custom__",
    };
    const noneItem = {
        label: "$(x) None",
        description: vscode.l10n.t("No task file"),
        value: "None",
    };
    const options = [...detectedItems, manualItem, noneItem];
    const result = await vscode.window.showQuickPick(options, {
        placeHolder: taskFiles.length > 0
            ? vscode.l10n.t("Select task file") + ` (${taskFiles.length} ` + vscode.l10n.t("detected") + ")"
            : vscode.l10n.t("No task files detected — enter custom path"),
    });
    if (!result)
        return;
    let file;
    if (result.value === "__custom__") {
        const customPath = await vscode.window.showInputBox({
            prompt: vscode.l10n.t("Enter task file path (relative to workspace root)"),
            value: currentTaskFile,
            placeHolder: "PRD.md",
        });
        if (!customPath)
            return;
        file = customPath;
    }
    else if (result.value === "None") {
        file = undefined;
    }
    else {
        file = result.value;
    }
    await context.workspaceState.update("ralph.lastTaskFile", file ?? "None");
    state.ralphLoopProvider.refresh();
    state.progressLogger?.info(`Task file set to ${file || "None"}`, "Config");
}
async function setConfigProgressFile(context) {
    const currentProgressFile = context.workspaceState.get("ralph.lastProgressFile") ??
        "progress.txt";
    const result = await vscode.window.showInputBox({
        prompt: vscode.l10n.t("Enter progress file path (relative to workspace root)"),
        value: currentProgressFile,
        placeHolder: "progress.txt",
    });
    if (result !== undefined) {
        await context.workspaceState.update("ralph.lastProgressFile", result || "progress.txt");
        state.ralphLoopProvider.refresh();
        state.progressLogger?.info(`Progress file set to ${result || "progress.txt"}`, "Config");
    }
}
async function configureStableThreshold(context) {
    const currentThreshold = context.workspaceState.get("ralph.lastStableThreshold") ?? 7;
    const result = await vscode.window.showInputBox({
        prompt: vscode.l10n.t("Enter stable threshold (number of stable polls before considering agent done)"),
        value: currentThreshold.toString(),
        validateInput: (value) => {
            const num = parseInt(value);
            if (isNaN(num) || num < 1 || num > 200) {
                return vscode.l10n.t("Please enter a number between 1 and 200");
            }
            return null;
        },
    });
    if (result) {
        const value = parseInt(result);
        const pollIntervalRaw = context.workspaceState.get("ralph.lastPollInterval") ?? "4s";
        const pollIntervalMs = (0, config_1.parsePollInterval)(pollIntervalRaw);
        const stableWindowMs = value * pollIntervalMs;
        const stableWindowDisplay = stableWindowMs >= 60000
            ? `${(stableWindowMs / 60000).toFixed(1)}m`
            : `${Math.round(stableWindowMs / 1000)}s`;
        await context.workspaceState.update("ralph.lastStableThreshold", value);
        state.ralphLoopProvider.refresh();
        state.progressLogger?.info(`Stable threshold set to ${value} (${stableWindowDisplay} at ${pollIntervalRaw})`, "Config");
    }
}
async function configurePollInterval(context) {
    const currentInterval = context.workspaceState.get("ralph.lastPollInterval") ?? "4s";
    const result = await vscode.window.showInputBox({
        prompt: vscode.l10n.t("Enter poll interval (e.g. 4s, 30s, 1m, 2.5m)"),
        value: currentInterval,
        placeHolder: "4s",
        validateInput: (value) => {
            const str = value.trim().toLowerCase();
            if (!str)
                return vscode.l10n.t("Please enter a value");
            const valid = /^[\d.]+\s*(s|sec|seconds?|m|min|minutes?)?$/.test(str);
            if (!valid)
                return vscode.l10n.t("Invalid format. Use: 4s, 30s, 1m, 2.5m");
            const ms = (0, config_1.parsePollInterval)(str);
            if (ms < 1000)
                return vscode.l10n.t("Minimum interval is 1s");
            if (ms > 600000)
                return vscode.l10n.t("Maximum interval is 10m");
            return null;
        },
    });
    if (result) {
        const ms = (0, config_1.parsePollInterval)(result);
        await context.workspaceState.update("ralph.lastPollInterval", result.trim());
        state.ralphLoopProvider.refresh();
        const display = ms >= 60000 ? `${(ms / 60000).toFixed(1)}m` : `${(ms / 1000).toFixed(0)}s`;
        state.progressLogger?.info(`Poll interval set to ${result.trim()} (${ms}ms / ${display})`, "Config");
    }
}
async function configureGracePolls(context) {
    const currentGrace = context.workspaceState.get("ralph.lastGracePolls") ?? 5;
    const result = await vscode.window.showInputBox({
        prompt: vscode.l10n.t("Enter grace polls (number of polls after progress update before next iteration)"),
        value: currentGrace.toString(),
        validateInput: (value) => {
            const num = parseInt(value);
            if (isNaN(num) || num < 1) {
                return vscode.l10n.t("Please enter a number >= 1");
            }
            return null;
        },
    });
    if (result) {
        const value = parseInt(result);
        await context.workspaceState.update("ralph.lastGracePolls", value);
        state.ralphLoopProvider.refresh();
        state.progressLogger?.info(`Grace polls set to ${value}`, "Config");
    }
}
//# sourceMappingURL=config.js.map
