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
exports.runRalphLoopIteration = runRalphLoopIteration;
const vscode = __importStar(require("vscode"));
const state = __importStar(require("../state"));
const agentRunner_1 = require("./agentRunner");
const git_1 = require("../utils/git");
async function isCompletionMarkerPresent(config) {
    if (!config.progressFile || !config.doneMarker) {
        return false;
    }
    const progressUri = vscode.Uri.file(`${config.workspaceRoot}/${config.progressFile}`);
    try {
        const content = await vscode.workspace.fs.readFile(progressUri);
        // Optimize memory and CPU for large progress files by only decoding the end
        // since the done marker is always appended at the end of the file.
        const readSize = Math.min(content.length, 4096);
        const tailBuffer = content.subarray(content.length - readSize);
        const tailText = new TextDecoder().decode(tailBuffer);
        return tailText.includes(config.doneMarker);
    }
    catch (error) {
        state.progressLogger?.warn(`Could not read progress file: ${error}`, "Loop");
        return false;
    }
}
async function runRalphLoopIteration(config, context) {
    while ((state.ralphLoopStatus === "running" ||
        state.ralphLoopStatus === "paused") &&
        state.currentIteration < state.maxIterations &&
        !state.stopRequested) {
        while (state.ralphLoopStatus === "paused" && !state.stopRequested) {
            state.progressLogger?.setIteration(state.currentIteration, state.maxIterations);
            state.progressLogger?.info("Paused - waiting for resume...", "Loop");
            const pausedSession = {
                status: "paused",
                mode: config.mode,
                model: config.model,
                currentIteration: state.currentIteration,
                maxIterations: state.maxIterations,
                startTime: state.startTime,
            };
            state.ralphLoopProvider.updateSession(pausedSession);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        if (state.ralphLoopStatus !== "running" || state.stopRequested) {
            break;
        }
        // Generate unique loop ID for this session (only once, used for all iterations)
        if (!config.loopId) {
            config.loopId = (0, git_1.generateLoopId)();
        }
        config.doneMarker = (0, git_1.generateDoneMarker)(config.loopId);
        const completionMarkerFound = await isCompletionMarkerPresent(config);
        if (completionMarkerFound) {
            state.progressLogger?.info(`Completion marker detected (${config.doneMarker}). Ending loop.`, "Loop");
            break;
        }
        state.incrementIteration();
        state.progressLogger?.setIteration(state.currentIteration, state.maxIterations);
        // Check if this iteration is a reconnect-resume
        if (config._reconnectAttempts && config._reconnectAttempts > 0) {
            state.progressLogger?.streamSection(`✅ 断点续跑成功 — 恢复迭代 ${state.currentIteration}/${state.maxIterations}`);
            state.progressLogger?.info(
                `重连成功！从迭代 ${state.currentIteration} 继续执行（经过 ${config._reconnectAttempts} 次重连尝试）`,
                "Reconnect"
            );
            vscode.window.setStatusBarMessage(`✅ Ralph Loop: 断点续跑成功 — 迭代 ${state.currentIteration}`, 10000);
            // Clear stale error notifications from Antigravity
            vscode.commands.executeCommand("notifications.clearAll");
            config._reconnectAttempts = 0; // Reset after successful resume
        }
        else {
            state.progressLogger?.streamSection(`Iteration ${state.currentIteration}/${state.maxIterations}`);
        }
        state.progressLogger?.streamProgress("Starting", 1, 5, "Initializing iteration");
        try {
            const agentContext = await (0, agentRunner_1.spawnFreshAgentContext)(config);
            const session = {
                status: "running",
                mode: config.mode,
                model: config.model,
                currentIteration: state.currentIteration,
                maxIterations: state.maxIterations,
                startTime: state.startTime,
            };
            state.ralphLoopProvider.updateSession(session);
            // Clear any stale error notifications on successful cascade start
            vscode.commands.executeCommand("notifications.clearAll");
            await (0, agentRunner_1.processIterationWithFreshContext)(agentContext, config, context);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            state.progressLogger?.error(`Error: ${errorMessage}`, "Iteration");
            if (state.stopRequested) {
                state.progressLogger?.warn("Stopped due to user request", "Iteration");
                break;
            }
            // Check if this is a connection error (server crash/restart/session destroyed/cascade failed)
            const isConnectionError = /ECONNREFUSED|ECONNRESET|EPIPE|Connection timeout|connection.*closed|server.*closed|Not connected|session.*destroyed|ERR_HTTP2|INVALID_SESSION|GOAWAY|[Cc]ascade.*start|[Cc]ould not start|crashed unexpectedly/i.test(errorMessage);
            if (isConnectionError) {
                // Track reconnect attempts for this iteration
                if (!config._reconnectAttempts) config._reconnectAttempts = 0;
                config._reconnectAttempts++;
                const maxReconnectAttempts = 5;
                if (config._reconnectAttempts <= maxReconnectAttempts) {
                    // Longer delays: 15s, 30s, 60s, 120s, 120s (total ~6 min)
                    const delay = Math.min(15000 * Math.pow(2, config._reconnectAttempts - 1), 120000);
                    const delaySec = Math.round(delay / 1000);
                    state.progressLogger?.warn(
                        `Connection lost (attempt ${config._reconnectAttempts}/${maxReconnectAttempts}). Waiting ${delaySec}s before reconnecting...`,
                        "Reconnect"
                    );
                    // Clear old client
                    if (state.antigravityClient) {
                        try { state.antigravityClient.disconnect(); } catch (_) { }
                        state.setAntigravityClient(null);
                    }
                    // Show visible progress notification to user
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: `Ralph Loop: Antigravity 连接断开，${delaySec} 秒后重连 (${config._reconnectAttempts}/${maxReconnectAttempts})...`,
                        cancellable: true,
                    }, async (progress, token) => {
                        const steps = 20;
                        const stepDelay = delay / steps;
                        for (let i = 0; i < steps; i++) {
                            if (token.isCancellationRequested || state.stopRequested) {
                                state.progressLogger?.warn("Reconnect cancelled by user", "Reconnect");
                                state.setStopRequested(true);
                                state.setRalphLoopStatus("stopped");
                                vscode.commands.executeCommand("setContext", "ralph.isRunning", false);
                                return;
                            }
                            progress.report({
                                increment: 100 / steps,
                                message: `等待中... ${Math.round((steps - i) * stepDelay / 1000)}s`,
                            });
                            await new Promise((r) => setTimeout(r, stepDelay));
                        }
                    });
                    if (state.stopRequested) break;
                    // Roll back iteration counter so this iteration is retried
                    state.decrementIteration();
                    const resumeIteration = state.currentIteration + 1;
                    state.progressLogger?.streamSection("═══ 断点续跑 (Resume from Breakpoint) ═══");
                    state.progressLogger?.info(
                        `🔄 将从迭代 ${resumeIteration}/${state.maxIterations} 开始断点续跑 (重连尝试 ${config._reconnectAttempts}/${maxReconnectAttempts})`,
                        "Reconnect"
                    );
                    state.progressLogger?.info("Attempting to reconnect to Antigravity server...", "Reconnect");
                    // Show reconnecting notification
                    vscode.window.setStatusBarMessage(`$(sync~spin) Ralph Loop: 断点续跑 — 正在重连，将恢复迭代 ${resumeIteration}...`, 15000);
                    continue; // Retry this iteration
                }
                else {
                    state.progressLogger?.error(
                        `Failed to reconnect after ${maxReconnectAttempts} attempts. Stopping loop.`,
                        "Reconnect"
                    );
                    vscode.window.showErrorMessage(`Ralph Loop: ${maxReconnectAttempts} 次重连均失败，循环已停止。请重启 Antigravity 后重试。`);
                    config._reconnectAttempts = 0;
                }
            }
            else {
                // Reset reconnect counter on non-connection errors
                config._reconnectAttempts = 0;
            }
            const action = await state.notificationService?.notifyIterationError(state.currentIteration, errorMessage);
            if (action === "Show Output") {
                state.outputChannel.show();
            }
            else if (action === "Stop Loop") {
                await vscode.commands.executeCommand("ralph.stop");
                return;
            }
            throw error;
        }
        // Reset reconnect counter on successful iteration
        config._reconnectAttempts = 0;
        state.progressLogger?.streamProgress("Completed", 5, 5, "Iteration finished successfully");
        if (state.ralphLoopStatus !== "running" || state.stopRequested) {
            break;
        }
        // In Pseudo Ralph mode, send reminder about completion marker before next iteration
        if (state.pseudoRalphMode && state.antigravityClient && config.loopId) {
            state.progressLogger?.streamSubSection("Pre-iteration Reminder");
            const reminderMessage = `REMINDER: Before the next iteration starts, verify that you have appended the completion marker "${(0, git_1.generateDoneMarker)(config.loopId)}" to ${config.progressFile} if ALL tasks are complete. If you forgot, add it now or you will continue in an infinite loop.`;
            try {
                const response = await state.antigravityClient.sendMessageAndWait(state.persistentCascadeId || "", reminderMessage, config.mode, config.model, config.pollIntervalMs ?? 4000);
                state.progressLogger?.debug(`Agent acknowledged pre-iteration reminder (response length: ${response.length})`, "Loop");
            }
            catch (reminderError) {
                state.progressLogger?.debug(`Pre-iteration reminder response timeout or error: ${reminderError}`, "Loop");
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (state.ralphLoopStatus === "running" && !state.stopRequested) {
        state.setRalphLoopStatus("stopped");
        vscode.commands.executeCommand("setContext", "ralph.isRunning", false);
        state.progressLogger?.streamSection("Ralph Loop Completed");
        state.progressLogger?.info(`Total iterations: ${state.currentIteration}`, "Summary");
        let elapsedTimeStr = "";
        if (state.startTime) {
            const elapsed = new Date().getTime() - state.startTime.getTime();
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            elapsedTimeStr = `${minutes}m ${seconds}s`;
            state.progressLogger?.info(`Total time: ${elapsedTimeStr}`, "Summary");
        }
        const action = await state.notificationService?.notifyCompletion(state.currentIteration, state.maxIterations, elapsedTimeStr);
        if (action === "Show Output") {
            state.outputChannel.show();
        }
        const session = {
            status: "stopped",
            mode: config.mode,
            model: config.model,
            currentIteration: state.currentIteration,
            maxIterations: state.maxIterations,
            startTime: state.startTime,
        };
        state.ralphLoopProvider.updateSession(session);
    }
}
//# sourceMappingURL=iteration.js.map
