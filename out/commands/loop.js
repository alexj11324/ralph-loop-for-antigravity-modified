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
exports.startRalphLoop = startRalphLoop;
exports.stopRalphLoop = stopRalphLoop;
exports.pauseRalphLoop = pauseRalphLoop;
exports.emergencyStopRalphLoop = emergencyStopRalphLoop;
exports.showQuickActions = showQuickActions;
const vscode = __importStar(require("vscode"));
const state = __importStar(require("../state"));
const config_1 = require("../loop/config");
const iteration_1 = require("../loop/iteration");
async function startRalphLoop(context) {
    if (state.ralphLoopStatus === "running") {
        vscode.window.showInformationMessage("Ralph Loop is already running");
        return;
    }
    try {
        const config = await (0, config_1.getLoopConfiguration)(context);
        if (!config) {
            state.progressLogger?.info("Ralph Loop start cancelled by user", "Loop");
            return;
        }
        // Validate task file exists before starting
        if (config.taskFile) {
            const taskFilePath = vscode.Uri.file(`${config.workspaceRoot}/${config.taskFile}`);
            try {
                await vscode.workspace.fs.stat(taskFilePath);
            }
            catch {
                vscode.window.showErrorMessage(`Task file not found: ${config.taskFile}. Please create it or select a different task file.`);
                state.progressLogger?.error(`Task file not found: ${config.taskFile}`, "Validation");
                return;
            }
        }
        else {
            vscode.window.showErrorMessage("No task file selected. Please select a task file before starting.");
            state.progressLogger?.error("No task file selected", "Validation");
            return;
        }
        // Create progress file if it doesn't exist
        const progressFilePath = vscode.Uri.file(`${config.workspaceRoot}/${config.progressFile}`);
        try {
            await vscode.workspace.fs.stat(progressFilePath);
        }
        catch {
            const pathMod = require("path");
            const progressDir = vscode.Uri.file(pathMod.dirname(progressFilePath.fsPath));
            await vscode.workspace.fs.createDirectory(progressDir);
            await vscode.workspace.fs.writeFile(progressFilePath, Buffer.from(""));
            state.progressLogger?.info(`Created progress file: ${config.progressFile}`, "Setup");
        }
        // Check for empty files and warn the user
        const emptyFiles = [];
        const filesToCheck = [
            { name: config.taskFile, label: vscode.l10n.t("Task File") },
            { name: config.promptFile, label: vscode.l10n.t("Prompt File") },
        ];
        for (const { name, label } of filesToCheck) {
            if (name) {
                try {
                    const fileUri = vscode.Uri.file(`${config.workspaceRoot}/${name}`);
                    const fileStat = await vscode.workspace.fs.stat(fileUri);
                    if (fileStat.size === 0) {
                        emptyFiles.push(`${label} (${name})`);
                    }
                }
                catch { /* file doesn't exist, already handled elsewhere */ }
            }
        }
        if (emptyFiles.length > 0) {
            const warningMsg = vscode.l10n.t("The following files are empty: {0}. Please add content before starting the loop.", emptyFiles.join(", "));
            const choice = await vscode.window.showWarningMessage(warningMsg, vscode.l10n.t("Continue Anyway"), vscode.l10n.t("Cancel"));
            if (choice !== vscode.l10n.t("Continue Anyway")) {
                state.setRalphLoopStatus("stopped");
                vscode.commands.executeCommand("setContext", "ralph.isRunning", false);
                state.progressLogger?.info("Ralph Loop cancelled — empty files detected", "Validation");
                return;
            }
            state.progressLogger?.warn(`Empty files detected: ${emptyFiles.join(", ")}`, "Validation");
        }
        state.setRalphLoopStatus("running");
        vscode.commands.executeCommand("setContext", "ralph.isRunning", true);
        // Check progress file for completed entries to determine resume point
        let progressEntryCount = 0;
        let hasProgress = false;
        if (config.progressFile) {
            try {
                const progressUri = vscode.Uri.file(`${config.workspaceRoot}/${config.progressFile}`);
                const progressContent = await vscode.workspace.fs.readFile(progressUri);
                const progressText = new TextDecoder().decode(progressContent);
                if (progressText.trim().length > 0) {
                    // Count only explicit completion entries. Started / progress log lines
                    // should not advance the resume point.
                    const lines = progressText.split("\n");
                    progressEntryCount = lines.filter((line) => /^\s*\[[^\]]+\]\s+Completed:/i.test(line)).length;
                    hasProgress = progressEntryCount > 0;
                }
            }
            catch (_) {
                // Progress file doesn't exist or can't be read
            }
        }
        let startFromIteration = 0;
        if (hasProgress) {
            const resumeChoice = await vscode.window.showQuickPick(
                [
                    {
                        label: `$(debug-continue) 断点续跑 — 从迭代 ${progressEntryCount + 1} 继续`,
                        description: `progress 文件中已有 ${progressEntryCount} 条完成记录`,
                        value: "resume",
                    },
                    {
                        label: "$(debug-restart) 重新开始 — 从迭代 1 开始",
                        description: "清除上次进度，从头开始",
                        value: "restart",
                    },
                ],
                { placeHolder: "检测到 progress 文件中有已完成记录，是否从断点续跑？" }
            );
            if (!resumeChoice) {
                state.setRalphLoopStatus("stopped");
                vscode.commands.executeCommand("setContext", "ralph.isRunning", false);
                state.progressLogger?.info("Ralph Loop start cancelled by user", "Loop");
                return;
            }
            if (resumeChoice.value === "resume") {
                startFromIteration = progressEntryCount;
            }
        }
        state.setCurrentIteration(startFromIteration);
        state.setMaxIterations(config.maxIterations);
        state.setExtensionContext(context);
        state.setStartTime(new Date());
        if (startFromIteration > 0) {
            state.progressLogger?.streamSection(`═══ 断点续跑 — 从迭代 ${startFromIteration + 1} 继续 (基于 progress 文件: ${progressEntryCount} 条记录) ═══`);
            state.progressLogger?.info(`progress 文件中已有 ${progressEntryCount} 条完成记录，从迭代 ${startFromIteration + 1} 继续`, "Loop");
            vscode.window.setStatusBarMessage(`✅ Ralph Loop: 断点续跑 — 从迭代 ${startFromIteration + 1} 开始 (${progressEntryCount} 条已完成)`, 10000);
        }
        else {
            state.progressLogger?.streamSection("Ralph Loop Started");
        }
        state.progressLogger?.setIteration(startFromIteration, state.maxIterations);
        state.progressLogger?.info(`Mode: ${config.mode}`, "Config");
        state.progressLogger?.info(`Model: ${config.model}`, "Config");
        state.progressLogger?.info(`Max Iterations: ${state.maxIterations}`, "Config");
        state.progressLogger?.info(`Git: ${config.useGit ? "enabled" : "disabled"}`, "Config");
        if (config.useGit) {
            state.progressLogger?.info(`Branch: ${config.createBranchEverySession ? "new per session" : "current branch"}`, "Config");
        }
        state.progressLogger?.info(`Prompt File: ${config.promptFile}`, "Config");
        if (config.taskFile) {
            state.progressLogger?.info(`Task File: ${config.taskFile}`, "Config");
        }
        if (config.backpressure.enabledBackpressure.length > 0) {
            state.progressLogger?.info(`Backpressure: ${config.backpressure.enabledBackpressure.join(", ")}`, "Config");
        }
        state.progressLogger?.show();
        const session = {
            status: "running",
            mode: config.mode,
            model: config.model,
            currentIteration: startFromIteration,
            maxIterations: config.maxIterations,
            startTime: state.startTime,
        };
        state.ralphLoopProvider.updateSession(session);
        const loopPromise = (0, iteration_1.runRalphLoopIteration)(config, context);
        state.setCurrentLoopPromise(loopPromise);
        await loopPromise;
    }
    catch (error) {
        state.setRalphLoopStatus("stopped");
        vscode.commands.executeCommand("setContext", "ralph.isRunning", false);
        const errorMessage = error instanceof Error ? error.message : String(error);
        state.progressLogger?.error(`Loop failed to start: ${errorMessage}`, "Loop");
        state.notificationService?.notifyError(errorMessage);
        // Save current iteration for cross-session resume on crash
        context.workspaceState.update("ralph.lastIteration", state.currentIteration);
        context.workspaceState.update("ralph.lastMaxIterations", state.maxIterations);
    }
    finally {
        state.setCurrentLoopPromise(null);
    }
}
async function stopRalphLoop() {
    if (state.ralphLoopStatus === "stopped") {
        vscode.window.showInformationMessage("Ralph Loop is not running");
        return;
    }
    const currentSession = state.ralphLoopProvider.currentSession;
    state.progressLogger?.info("Stopping Ralph Loop...", "Loop");
    state.setStopRequested(true);
    if (state.ralphLoopStatus === "paused") {
        state.setRalphLoopStatus("running");
    }
    // Abort any active stream to unblock the loop
    if (state.streamAbortController) {
        state.progressLogger?.info("Aborting active stream...", "Loop");
        state.streamAbortController.abort();
        state.setStreamAbortController(null);
    }
    await state.currentLoopPromise;
    state.setRalphLoopStatus("stopped");
    state.setStopRequested(false);
    vscode.commands.executeCommand("setContext", "ralph.isRunning", false);
    // Save current iteration for cross-session resume
    const wsContext = state._extensionContext;
    if (wsContext) {
        wsContext.workspaceState.update("ralph.lastIteration", state.currentIteration);
        wsContext.workspaceState.update("ralph.lastMaxIterations", state.maxIterations);
    }
    // Clear persistent cascade ID since loop is ending
    state.setPersistentCascadeId(null);
    let elapsedTimeStr = "";
    if (state.startTime) {
        const elapsed = new Date().getTime() - state.startTime.getTime();
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        elapsedTimeStr = `${minutes}m ${seconds}s`;
    }
    await state.notificationService?.notifyStop(false, state.currentIteration, elapsedTimeStr);
    state.progressLogger?.info("Ralph Loop stopped", "Loop");
    const session = {
        status: "stopped",
        mode: currentSession?.mode ?? "Unknown",
        model: currentSession?.model ?? "Unknown",
        currentIteration: state.currentIteration,
        maxIterations: state.maxIterations,
        startTime: state.startTime,
    };
    state.ralphLoopProvider.updateSession(session);
}
function pauseRalphLoop() {
    if (state.ralphLoopStatus === "stopped") {
        vscode.window.showInformationMessage("Ralph Loop is not running");
        return;
    }
    const currentSession = state.ralphLoopProvider.currentSession;
    if (state.ralphLoopStatus === "running") {
        state.setRalphLoopStatus("paused");
        state.progressLogger?.warn("Ralph Loop paused", "Loop");
        vscode.window.showInformationMessage("Ralph Loop paused");
    }
    else if (state.ralphLoopStatus === "paused") {
        state.setRalphLoopStatus("running");
        state.progressLogger?.info("Ralph Loop resumed", "Loop");
        vscode.window.showInformationMessage("Ralph Loop resumed");
    }
    if (state.startTime) {
        const session = {
            status: state.ralphLoopStatus,
            mode: currentSession?.mode ?? "Unknown",
            model: currentSession?.model ?? "Unknown",
            currentIteration: state.currentIteration,
            maxIterations: state.maxIterations,
            startTime: state.startTime,
        };
        state.ralphLoopProvider.updateSession(session);
    }
}
async function emergencyStopRalphLoop() {
    if (state.ralphLoopStatus === "stopped") {
        vscode.window.showInformationMessage("Ralph Loop is not running");
        return;
    }
    const currentSession = state.ralphLoopProvider.currentSession;
    state.progressLogger?.error("!!! EMERGENCY STOP REQUESTED !!!", "Loop");
    state.setStopRequested(true);
    state.setRalphLoopStatus("stopped");
    vscode.commands.executeCommand("setContext", "ralph.isRunning", false);
    // Abort any active stream first to unblock the loop
    if (state.streamAbortController) {
        state.progressLogger?.info("Aborting active stream...", "Emergency");
        state.streamAbortController.abort();
        state.setStreamAbortController(null);
    }
    // Delete the active cascade if one exists (skip in Pseudo Ralph mode)
    if (state.currentCascadeId &&
        state.antigravityClient &&
        !state.pseudoRalphMode) {
        try {
            state.progressLogger?.info("Deleting active cascade...", "Emergency");
            await state.antigravityClient.deleteCascade(state.currentCascadeId);
            state.progressLogger?.info("Cascade deleted", "Emergency");
            state.setCurrentCascadeId(null);
        }
        catch (error) {
            state.progressLogger?.warn(`Failed to delete cascade: ${error}`, "Emergency");
        }
    }
    else if (state.pseudoRalphMode) {
        state.progressLogger?.info("Preserving cascade (Pseudo Ralph mode)", "Emergency");
    }
    // Clear persistent cascade ID since loop is ending
    state.setPersistentCascadeId(null);
    if (state.currentLoopPromise) {
        try {
            await Promise.race([
                state.currentLoopPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error("Emergency stop timeout")), 2000)),
            ]);
        }
        catch {
            state.progressLogger?.error("Loop forcefully terminated due to timeout", "Emergency");
        }
    }
    state.progressLogger?.error("!!! RALPH LOOP EMERGENCY STOPPED !!!", "Loop");
    let elapsedTimeStr = "";
    if (state.startTime) {
        const elapsed = new Date().getTime() - state.startTime.getTime();
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        elapsedTimeStr = `${minutes}m ${seconds}s`;
    }
    const action = await state.notificationService?.notifyStop(true, state.currentIteration, elapsedTimeStr);
    if (action === "Show Output") {
        state.outputChannel.show();
    }
    if (state.startTime) {
        const session = {
            status: "stopped",
            mode: currentSession?.mode ?? "Unknown",
            model: currentSession?.model ?? "Unknown",
            currentIteration: state.currentIteration,
            maxIterations: state.maxIterations,
            startTime: state.startTime,
        };
        state.ralphLoopProvider.updateSession(session);
    }
    state.setStopRequested(false);
    state.setCurrentLoopPromise(null);
    // Save current iteration for cross-session resume
    const wsContext = state._extensionContext;
    if (wsContext) {
        wsContext.workspaceState.update("ralph.lastIteration", state.currentIteration);
        wsContext.workspaceState.update("ralph.lastMaxIterations", state.maxIterations);
    }
}
async function showQuickActions(context) {
    const items = [
        {
            label: state.ralphLoopStatus === "running"
                ? "PAUSE Loop"
                : state.ralphLoopStatus === "paused"
                    ? "RESUME Loop"
                    : "START Loop",
            description: state.ralphLoopStatus === "running"
                ? "Pause the current loop"
                : state.ralphLoopStatus === "paused"
                    ? "Resume the paused loop"
                    : "Start a new Ralph Loop",
            action: state.ralphLoopStatus === "running" ||
                state.ralphLoopStatus === "paused"
                ? "pause"
                : "start",
        },
        {
            label: "STOP Loop",
            description: "Stop the loop gracefully",
            action: "stop",
            disabled: state.ralphLoopStatus === "stopped",
        },
        {
            label: "EMERGENCY Stop",
            description: "Immediately stop the loop",
            action: "emergency",
            disabled: state.ralphLoopStatus === "stopped",
        },
        {
            label: "SHOW Output",
            description: "Open the Ralph Loop output channel",
            action: "output",
        },
    ].filter((item) => !item.disabled);
    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Ralph Loop Actions",
    });
    if (selected) {
        switch (selected.action) {
            case "start":
                await startRalphLoop(context);
                break;
            case "pause":
                pauseRalphLoop();
                break;
            case "stop":
                await stopRalphLoop();
                break;
            case "emergency":
                await emergencyStopRalphLoop();
                break;
            case "output":
                state.outputChannel.show();
                break;
        }
    }
}
//# sourceMappingURL=loop.js.map
