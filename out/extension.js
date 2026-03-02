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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const ralphLoopProvider_1 = require("./ralphLoopProvider");
const helpProvider_1 = require("./helpProvider");
const state = __importStar(require("./state"));
const configCommands = __importStar(require("./commands/config"));
const loopCommands = __importStar(require("./commands/loop"));
const discovery_1 = require("./utils/discovery");
const workspace_1 = require("./utils/workspace");
function activate(context) {
    const outputChannel = vscode.window.createOutputChannel("Ralph Loop");
    outputChannel.appendLine("Ralph Loop for Antigravity extension is now active!");
    const provider = new ralphLoopProvider_1.RalphLoopProvider(context);
    // Initialize global state
    state.initializeState(outputChannel, provider);
    const appName = vscode.env.appName.toLowerCase();
    const uriScheme = vscode.env.uriScheme.toLowerCase();
    const execPath = (process.execPath || "").toLowerCase();
    const isAntigravity = appName.includes("antigravity") ||
        uriScheme.includes("antigravity") ||
        execPath.includes("antigravity");
    const isVSCode = appName.includes("visual studio code") ||
        uriScheme === "vscode" ||
        execPath.includes("visual studio code.app") ||
        execPath.endsWith("/code") ||
        execPath.endsWith("/code-insiders") ||
        execPath.endsWith("/code-oss") ||
        execPath.endsWith("/code.exe");
    state.setHostBlocked(isVSCode && !isAntigravity);
    // Register tree view with checkbox support
    const treeView = vscode.window.createTreeView("ralphLoopView", {
        treeDataProvider: provider,
        manageCheckboxStateManually: true,
    });
    const helpProvider = new helpProvider_1.HelpProvider();
    const helpTreeView = vscode.window.createTreeView("ralphHelpView", {
        treeDataProvider: helpProvider,
    });
    // Handle checkbox state changes
    treeView.onDidChangeCheckboxState(async (e) => {
        for (const [item, newState] of e.items) {
            if (item.id === "config-pseudo-ralph") {
                const enabled = newState === vscode.TreeItemCheckboxState.Checked;
                await context.workspaceState.update("ralph.pseudoRalphMode", enabled);
                state.setPseudoRalphMode(enabled);
                state.progressLogger?.info(`Pseudo Ralph mode ${enabled ? "enabled" : "disabled"}`, "Config");
                provider.refresh();
            }
            else if (item.id === "config-use-git") {
                const enabled = newState === vscode.TreeItemCheckboxState.Checked;
                const workspaceState = context.workspaceState;
                await workspaceState.update("ralph.useGit", enabled);
                state.progressLogger?.info(`Git integration ${enabled ? "enabled" : "disabled"}`, "Config");
                // When turning off Use Git, also disable Create new branch every session
                if (!enabled) {
                    const currentCreateBranch = workspaceState.get("ralph.createBranchEverySession", true);
                    await workspaceState.update("ralph.createBranchEverySessionBeforeGitOff", currentCreateBranch);
                    await workspaceState.update("ralph.createBranchEverySession", false);
                    state.progressLogger?.info("Create new branch every session disabled (Git is off)", "Config");
                }
                else {
                    const previousCreateBranch = workspaceState.get("ralph.createBranchEverySessionBeforeGitOff") ?? true;
                    await workspaceState.update("ralph.createBranchEverySession", previousCreateBranch);
                    await workspaceState.update("ralph.createBranchEverySessionBeforeGitOff", undefined);
                }
                provider.refresh();
            }
            else if (item.id === "config-create-branch-every-session") {
                const useGit = context.workspaceState.get("ralph.useGit", true);
                // Only allow toggling if Use Git is enabled
                if (useGit) {
                    const enabled = newState === vscode.TreeItemCheckboxState.Checked;
                    await context.workspaceState.update("ralph.createBranchEverySession", enabled);
                    state.progressLogger?.info(`Create new branch every session ${enabled ? "enabled" : "disabled"}`, "Config");
                    provider.refresh();
                }
            }
        }
    });
    context.subscriptions.push(treeView);
    context.subscriptions.push(helpTreeView);
    // Initialize workspace state (defaults/migrations)
    (0, workspace_1.initializeWorkspaceState)(context);
    // Run initial autonomy check
    (0, workspace_1.checkAntigravityAutonomy)();
    // Register commands
    const commands = [
        vscode.commands.registerCommand("ralph.start", () => loopCommands.startRalphLoop(context)),
        vscode.commands.registerCommand("ralph.stop", () => loopCommands.stopRalphLoop()),
        vscode.commands.registerCommand("ralph.pause", () => loopCommands.pauseRalphLoop()),
        vscode.commands.registerCommand("ralph.emergency", () => loopCommands.emergencyStopRalphLoop()),
        vscode.commands.registerCommand("ralph.showQuickActions", () => loopCommands.showQuickActions(context)),
        vscode.commands.registerCommand("ralph.configureIterations", () => configCommands.configureIterations(context)),
        vscode.commands.registerCommand("ralph.setConfigMode", () => configCommands.setConfigMode(context)),
        vscode.commands.registerCommand("ralph.setConfigModel", () => configCommands.setConfigModel(context)),
        vscode.commands.registerCommand("ralph.setConfigPromptFile", () => configCommands.setConfigPromptFile(context)),
        vscode.commands.registerCommand("ralph.setConfigTaskFile", () => configCommands.setConfigTaskFile(context)),
        vscode.commands.registerCommand("ralph.setConfigProgressFile", () => configCommands.setConfigProgressFile(context)),
        vscode.commands.registerCommand("ralph.configureStableThreshold", () => configCommands.configureStableThreshold(context)),
        vscode.commands.registerCommand("ralph.selectTaskFile", () => (0, discovery_1.selectTaskFile)(context)),
        vscode.commands.registerCommand("ralph.showOutput", () => state.outputChannel.show()),
        vscode.commands.registerCommand("ralph.reportBug", () => {
            vscode.env.openExternal(vscode.Uri.parse("https://github.com/abhishekbhakat/ralph-loop-for-antigravity/issues/new?template=bug_report.yml"));
        }),
        vscode.commands.registerCommand("ralph.toggleDebugLogging", async () => {
            const config = vscode.workspace.getConfiguration("ralphLoop");
            const currentValue = config.get("debugLogging", false);
            await config.update("debugLogging", !currentValue, vscode.ConfigurationTarget.Global);
            helpProvider.refresh();
            state.progressLogger?.info(`Debug logging ${!currentValue ? "enabled" : "disabled"}`, "Config");
        }),
        vscode.commands.registerCommand("ralph.togglePseudoRalph", async () => {
            const current = context.workspaceState.get("ralph.pseudoRalphMode", false);
            const enabled = !current;
            await context.workspaceState.update("ralph.pseudoRalphMode", enabled);
            state.setPseudoRalphMode(enabled);
            state.progressLogger?.info(`Pseudo Ralph mode ${enabled ? "enabled" : "disabled"}`, "Config");
            provider.refresh();
        }),
        vscode.commands.registerCommand("ralph.toggleUseGit", async () => {
            const workspaceState = context.workspaceState;
            const current = workspaceState.get("ralph.useGit", true);
            const enabled = !current;
            await workspaceState.update("ralph.useGit", enabled);
            state.progressLogger?.info(`Git integration ${enabled ? "enabled" : "disabled"}`, "Config");
            if (!enabled) {
                const currentCreateBranch = workspaceState.get("ralph.createBranchEverySession", true);
                await workspaceState.update("ralph.createBranchEverySessionBeforeGitOff", currentCreateBranch);
                await workspaceState.update("ralph.createBranchEverySession", false);
                state.progressLogger?.info("Create new branch every session disabled (Git is off)", "Config");
            }
            else {
                const previousCreateBranch = workspaceState.get("ralph.createBranchEverySessionBeforeGitOff") ?? true;
                await workspaceState.update("ralph.createBranchEverySession", previousCreateBranch);
                await workspaceState.update("ralph.createBranchEverySessionBeforeGitOff", undefined);
            }
            provider.refresh();
        }),
        vscode.commands.registerCommand("ralph.toggleCreateBranchEverySession", async () => {
            const workspaceState = context.workspaceState;
            const useGit = workspaceState.get("ralph.useGit", true);
            if (!useGit) {
                return;
            }
            const current = workspaceState.get("ralph.createBranchEverySession", true);
            const enabled = !current;
            await workspaceState.update("ralph.createBranchEverySession", enabled);
            state.progressLogger?.info(`Create new branch every session ${enabled ? "enabled" : "disabled"}`, "Config");
            provider.refresh();
        }),
    ];
    context.subscriptions.push(...commands);
}
function deactivate() {
    if (state.antigravityClient) {
        state.antigravityClient.disconnect();
    }
}
//# sourceMappingURL=extension.js.map