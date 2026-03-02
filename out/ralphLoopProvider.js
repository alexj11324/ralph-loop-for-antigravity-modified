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
exports.RalphLoopItem = exports.RalphLoopProvider = void 0;
const vscode = __importStar(require("vscode"));
const state = __importStar(require("./state"));
class RalphLoopProvider {
    constructor(context) {
        this.context = context;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.currentSession = null;
    }
    refresh() {
        this._onDidChangeTreeData.fire(null);
    }
    updateSession(session) {
        this.currentSession = session;
        this.refresh();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            return Promise.resolve(this.getRootItems());
        }
        if (element.id === "session") {
            return Promise.resolve(this.getSessionItems());
        }
        if (element.id === "configuration") {
            return Promise.resolve(this.getConfigItems());
        }
        return Promise.resolve([]);
    }
    getRootItems() {
        if (state.hostBlocked) {
            const warningItem = new RalphLoopItem("host-blocked", "Not Antigravity", "Ralph Loop is disabled in this IDE", vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon("warning"));
            return [warningItem];
        }
        return [
            new RalphLoopItem("session", "Session", this.currentSession
                ? `Status: ${this.currentSession.status}`
                : "No active session", vscode.TreeItemCollapsibleState.Expanded, new vscode.ThemeIcon("play-circle")),
            new RalphLoopItem("configuration", "Configuration", "Settings for next loop", vscode.TreeItemCollapsibleState.Expanded, new vscode.ThemeIcon("settings-gear")),
        ];
    }
    getConfigItems() {
        const config = vscode.workspace.getConfiguration("ralphLoop");
        const workspaceState = this.context.workspaceState;
        const mode = workspaceState.get("ralph.lastMode") ??
            config.get("defaultMode", "Fast");
        const model = workspaceState.get("ralph.lastModel") ??
            config.get("defaultModel", "Gemini 3 Flash");
        const maxIterations = workspaceState.get("ralph.lastMaxIterations") ??
            config.get("maxIterations", 50);
        const promptFile = workspaceState.get("ralph.lastPromptFile") ??
            config.get("promptFile", "None");
        const taskFile = workspaceState.get("ralph.lastTaskFile") ??
            config.get("taskFile", "PRD.md");
        const progressFile = workspaceState.get("ralph.lastProgressFile") ??
            config.get("progressFile", "progress.txt");
        const stableThreshold = workspaceState.get("ralph.lastStableThreshold") ??
            config.get("stableThreshold", 7);
        const items = [
            new RalphLoopItem("config-mode", "Mode", mode, vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon("symbol-method")),
            new RalphLoopItem("config-model", "Model", model, vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon("hubot")),
            new RalphLoopItem("config-iterations", "Max Iterations", maxIterations.toString(), vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon("sync")),
            new RalphLoopItem("config-prompt", "Prompt File", promptFile || "None", vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon("file-code")),
            new RalphLoopItem("config-task", "Task File", taskFile || "None", vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon("list-unordered")),
            new RalphLoopItem("config-progress", "Progress File", progressFile || "progress.txt", vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon("output")),
            new RalphLoopItem("config-stable-threshold", "Stable Threshold", `${stableThreshold} (${stableThreshold * 2}s)`, vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon("clock")),
        ];
        // Add Pseudo Ralph checkbox
        const pseudoRalphEnabled = workspaceState.get("ralph.pseudoRalphMode", false);
        const pseudoRalphItem = new RalphLoopItem("config-pseudo-ralph", "Pseudo Ralph", "Reuse same cascade across iterations", vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon("link"));
        pseudoRalphItem.checkboxState = pseudoRalphEnabled
            ? vscode.TreeItemCheckboxState.Checked
            : vscode.TreeItemCheckboxState.Unchecked;
        items.push(pseudoRalphItem);
        // Add Git settings checkboxes
        const useGit = workspaceState.get("ralph.useGit", true);
        const createBranchEverySession = workspaceState.get("ralph.createBranchEverySession", true);
        const useGitItem = new RalphLoopItem("config-use-git", "Use Git", "Enable git integration (commit instructions and branch creation)", vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon("source-control"));
        useGitItem.checkboxState = useGit
            ? vscode.TreeItemCheckboxState.Checked
            : vscode.TreeItemCheckboxState.Unchecked;
        items.push(useGitItem);
        // Create new branch every session - disabled when Use Git is off
        if (useGit) {
            const createBranchItem = new RalphLoopItem("config-create-branch-every-session", "Create new branch every session", "Create and switch to a new branch when starting a loop", vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon("git-branch"));
            createBranchItem.checkboxState = createBranchEverySession
                ? vscode.TreeItemCheckboxState.Checked
                : vscode.TreeItemCheckboxState.Unchecked;
            items.push(createBranchItem);
        }
        else {
            // Show as disabled when Use Git is off
            const createBranchItem = new RalphLoopItem("config-create-branch-every-session", "Create new branch every session", "Disabled — enable Use Git", vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon("circle-slash"));
            // No checkboxState = disabled/unchecked appearance
            items.push(createBranchItem);
        }
        const commandById = {
            "config-mode": { command: "ralph.setConfigMode", title: "Set Mode" },
            "config-model": { command: "ralph.setConfigModel", title: "Set Model" },
            "config-iterations": {
                command: "ralph.configureIterations",
                title: "Configure Iterations",
            },
            "config-prompt": {
                command: "ralph.setConfigPromptFile",
                title: "Set Prompt File",
            },
            "config-task": {
                command: "ralph.setConfigTaskFile",
                title: "Set Task File",
            },
            "config-progress": {
                command: "ralph.setConfigProgressFile",
                title: "Set Progress File",
            },
            "config-stable-threshold": {
                command: "ralph.configureStableThreshold",
                title: "Configure Stable Threshold",
            },
            "config-pseudo-ralph": {
                command: "ralph.togglePseudoRalph",
                title: "Toggle Pseudo Ralph",
            },
            "config-use-git": {
                command: "ralph.toggleUseGit",
                title: "Toggle Use Git",
            },
            "config-create-branch-every-session": {
                command: "ralph.toggleCreateBranchEverySession",
                title: "Toggle Create Branch Every Session",
            },
        };
        if (!useGit) {
            commandById["config-create-branch-every-session"] = {
                command: "ralph.toggleUseGit",
                title: "Toggle Use Git",
            };
        }
        for (const item of items) {
            const command = commandById[item.id];
            if (command) {
                item.command = command;
            }
        }
        return items;
    }
    getSessionItems() {
        if (!this.currentSession) {
            return [
                new RalphLoopItem("no-session", "No active session", "", vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon("circle-outline")),
            ];
        }
        const items = [
            new RalphLoopItem("status", "Status", this.currentSession.status, vscode.TreeItemCollapsibleState.None, this.currentSession.status === "running"
                ? new vscode.ThemeIcon("play-circle")
                : this.currentSession.status === "paused"
                    ? new vscode.ThemeIcon("debug-pause")
                    : new vscode.ThemeIcon("circle-outline")),
            new RalphLoopItem("mode", "Mode", this.currentSession.mode, vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon("symbol-method")),
            new RalphLoopItem("model", "Model", this.currentSession.model, vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon("hubot")),
            new RalphLoopItem("iterations", "Iterations", `${this.currentSession.currentIteration}/${this.currentSession.maxIterations}`, vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon("sync")),
        ];
        if (this.currentSession.startTime) {
            const elapsed = new Date().getTime() - this.currentSession.startTime.getTime();
            const elapsedStr = this.formatElapsedTime(elapsed);
            items.push(new RalphLoopItem("elapsed", "Elapsed Time", elapsedStr, vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon("clock")));
        }
        return items;
    }
    formatElapsedTime(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }
}
exports.RalphLoopProvider = RalphLoopProvider;
class RalphLoopItem extends vscode.TreeItem {
    constructor(id, label, description, collapsibleState, iconPath) {
        super(label, collapsibleState);
        this.id = id;
        this.label = label;
        this.description = description;
        this.collapsibleState = collapsibleState;
        this.iconPath = iconPath;
        this.tooltip = `${this.label}: ${this.description}`;
        this.contextValue = id;
    }
}
exports.RalphLoopItem = RalphLoopItem;
//# sourceMappingURL=ralphLoopProvider.js.map