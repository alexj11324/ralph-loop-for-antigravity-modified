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
exports.spawnFreshAgentContext = spawnFreshAgentContext;
exports.processIterationWithFreshContext = processIterationWithFreshContext;
const vscode = __importStar(require("vscode"));
const state = __importStar(require("../state"));
const antigravityClient_1 = require("../antigravityClient");
const git_1 = require("../utils/git");
async function spawnFreshAgentContext(config) {
    state.progressLogger?.streamProgress("Spawning", 2, 5, "Creating fresh agent context");
    const agentContext = {
        iteration: state.currentIteration,
        promptFile: config.promptFile,
        mode: config.mode,
        model: config.model,
        workspaceRoot: config.workspaceRoot,
        taskFile: config.taskFile,
        startTime: new Date(),
        logs: [],
    };
    state.progressLogger?.streamSubSection("Loading Resources");
    if (config.promptFile) {
        try {
            const promptUri = vscode.Uri.file(`${config.workspaceRoot}/${config.promptFile}`);
            const promptContent = await vscode.workspace.fs.readFile(promptUri);
            agentContext.promptContent = new TextDecoder().decode(promptContent);
            agentContext.logs.push(`Loaded prompt from ${config.promptFile}`);
            state.progressLogger?.debug(`Loaded prompt from ${config.promptFile}`, "Agent");
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            agentContext.logs.push(`Warning: Could not load prompt file: ${errorMessage}`);
            state.progressLogger?.warn(`Could not load prompt file: ${errorMessage}`, "Agent");
        }
    }
    else {
        state.progressLogger?.debug("No prompt file specified, skipping", "Agent");
    }
    if (config.taskFile) {
        try {
            const taskUri = vscode.Uri.file(`${config.workspaceRoot}/${config.taskFile}`);
            const taskContent = await vscode.workspace.fs.readFile(taskUri);
            agentContext.taskContent = new TextDecoder().decode(taskContent);
            agentContext.logs.push(`Loaded tasks from ${config.taskFile}`);
            state.progressLogger?.debug(`Loaded tasks from ${config.taskFile}`, "Agent");
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            agentContext.logs.push(`Warning: Could not load task file: ${errorMessage}`);
            state.progressLogger?.warn(`Could not load task file: ${errorMessage}`, "Agent");
        }
    }
    // Connect to Antigravity and start a cascade session
    state.progressLogger?.streamSubSection("Starting Cascade");
    try {
        if (!state.antigravityClient) {
            state.progressLogger?.info("Connecting to Antigravity...", "Agent");
            // Pass workspaceRoot to connect to the correct Antigravity process
            const client = await (0, antigravityClient_1.createAntigravityClient)(state.outputChannel, undefined, config.workspaceRoot);
            state.setAntigravityClient(client);
        }
        if (config.workspaceRoot) {
            try {
                const promptPath = config.promptFile
                    ? `${config.workspaceRoot}/${config.promptFile}`
                    : config.taskFile
                        ? `${config.workspaceRoot}/${config.taskFile}`
                        : null;
                if (promptPath) {
                    const uri = vscode.Uri.file(promptPath);
                    const doc = await vscode.workspace.openTextDocument(uri);
                    await vscode.window.showTextDocument(doc, {
                        preview: false,
                        preserveFocus: true,
                    });
                    state.progressLogger?.debug(`Activated workspace context: ${config.workspaceRoot}`, "Agent");
                    await new Promise((r) => setTimeout(r, 200));
                }
            }
            catch (contextError) {
                state.progressLogger?.debug(`Could not activate workspace context: ${contextError}`, "Agent");
            }
        }
        let cascadeId;
        // In Pseudo Ralph mode, reuse persistent cascade if available
        if (state.pseudoRalphMode && state.persistentCascadeId) {
            cascadeId = state.persistentCascadeId;
            state.progressLogger?.info(`Reusing cascade: ${cascadeId.substring(0, 8)}... (Pseudo Ralph mode)`, "Agent");
        }
        else {
            // Create new cascade
            const enablePlanning = config.mode === "Planning";
            cascadeId = await state.antigravityClient.startCascade(enablePlanning);
            // In Pseudo Ralph mode, store for reuse
            if (state.pseudoRalphMode) {
                state.setPersistentCascadeId(cascadeId);
                state.progressLogger?.info(`Stored cascade for reuse: ${cascadeId.substring(0, 8)}...`, "Agent");
            }
        }
        agentContext.cascadeId = cascadeId;
        state.setCurrentCascadeId(cascadeId);
        agentContext.cascadeSession = {
            cascadeId,
            status: "active",
            createdAt: new Date(),
        };
        agentContext.logs.push(`Cascade started: ${cascadeId}`);
        state.progressLogger?.info(`Cascade started: ${cascadeId.substring(0, 8)}...`, "Agent");
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        state.progressLogger?.error(`Could not start cascade: ${errorMessage}`, "Agent");
        throw new Error(`Cascade startup failed: ${errorMessage}`);
    }
    state.progressLogger?.info("Fresh agent context spawned successfully", "Agent");
    return agentContext;
}
async function processIterationWithFreshContext(agentContext, config, context) {
    state.progressLogger?.streamProgress("Processing", 3, 5, "Executing with fresh context");
    state.progressLogger?.streamSubSection("Agent Execution");
    agentContext.logs.push(`Processing iteration ${state.currentIteration} with fresh context`);
    agentContext.logs.push(`Mode: ${config.mode}, Model: ${config.model}`);
    state.progressLogger?.debug(`Mode: ${config.mode}, Model: ${config.model}`, "Execution");
    if (agentContext.cascadeId && state.antigravityClient) {
        try {
            // Use loopId from config (set once per session by iteration.ts)
            const loopId = config.loopId;
            // Initialize git session once per loop (only on first iteration)
            if (!config.gitInfo) {
                state.progressLogger?.streamSubSection("Initializing Git Session");
                if (config.useGit) {
                    const gitInfo = await (0, git_1.initializeGitSession)(config.workspaceRoot, loopId, config.createBranchEverySession);
                    config.gitInfo = gitInfo;
                    if (gitInfo.isGitRepo) {
                        if (gitInfo.createdBranch) {
                            state.progressLogger?.info(`Created and switched to session branch: ${gitInfo.createdBranch}`, "Git");
                            agentContext.logs.push(`Created session branch: ${gitInfo.createdBranch} from ${gitInfo.currentBranch}`);
                        }
                        else {
                            state.progressLogger?.info(`Using current branch: ${gitInfo.currentBranch}`, "Git");
                            agentContext.logs.push(`Using current branch: ${gitInfo.currentBranch}`);
                        }
                    }
                    else {
                        state.progressLogger?.info("Not a git repository, git operations disabled", "Git");
                    }
                }
                else {
                    state.progressLogger?.info("Git integration disabled", "Git");
                    config.gitInfo = { isGitRepo: false };
                }
            }
            if (!config.taskFile) {
                throw new Error("No task file selected. Please select a task file (e.g., PRD.md, TASKS.md).");
            }
            const taskFile = config.taskFile;
            const progressFile = config.progressFile;
            const isGitRepo = config.gitInfo?.isGitRepo ?? false;
            const gitBranch = config.gitInfo?.createdBranch ?? config.gitInfo?.currentBranch;
            let message = "";
            if (agentContext.promptContent) {
                message += agentContext.promptContent + "\n\n---\n\n";
            }
            // Build git instruction based on settings
            let gitInstruction;
            if (!config.useGit) {
                gitInstruction = "5. No git operations needed - git integration is disabled";
            }
            else if (!isGitRepo) {
                gitInstruction = "5. No git operations needed - this is not a git repository";
            }
            else if (gitBranch) {
                gitInstruction = `5. Commit your changes to branch \`${gitBranch}\` unless said otherwise in \`${taskFile}\``;
            }
            else {
                gitInstruction = "5. Commit your changes to the current branch unless said otherwise in the task file";
            }
            message += `# Instructions
## Identity
You are an autonomous AI sub-agent, specifically created to handle atomic coding tasks.
You are one of multiple sequential sub-agents in a loop.

Read the task list from \`${taskFile}\` and check progress in \`${progressFile}\`.

## Your Job
1. Review \`${progressFile}\` to see what's been done
2. Pick the next uncompleted task from \`${taskFile}\`
3. Implement one logical commit's worth of work. If the task is large, complete a meaningful chunk.
4. Append your progress to \`${progressFile}\` (only the part you worked on if task is large)
${gitInstruction}

## Rules
- **Append-only**: Add to \`${progressFile}\`, never remove entries
- **Do not edit** \`${taskFile}\` - it's read-only
- **One task only**: Complete exactly one task, then stop
- **Always log progress**: Even on failure, record what happened
${isGitRepo && config.useGit ? `- **Do not use** \`git add -A\` - select files manually` : ""}
- **Signal completion**: When ALL tasks in \`${taskFile}\` are complete, append this EXACT block at the end of \`${progressFile}\`:
----------
${(0, git_1.generateDoneMarker)(loopId)}

**CRITICAL WARNING**: If you fail to append this completion marker when ALL tasks are done, the Ralph Loop will continue running indefinitely in an infinite loop. You will be trapped in an endless cycle of being spawned repeatedly with no way to exit. The user will have to manually terminate you. DO NOT forget this marker when finished.
`;
            state.progressLogger?.progress("Sending instructions to cascade...", "Execution");
            await state.antigravityClient.sendMessage(agentContext.cascadeId, message, config.mode, config.model);
            agentContext.logs.push("Instructions sent to cascade");
            state.progressLogger?.streamSubSection("Monitoring Agent Progress");
            let responseCount = 0;
            // Create abort controller for polling
            const abortController = new AbortController();
            state.setStreamAbortController(abortController);
            // Record progress file mtime before iteration starts for early-exit detection
            let progressMtimeBefore = 0;
            if (config.progressFile) {
                try {
                    const progressUri = vscode.Uri.file(`${config.workspaceRoot}/${config.progressFile}`);
                    const stat = await vscode.workspace.fs.stat(progressUri);
                    progressMtimeBefore = stat.mtime;
                    state.progressLogger?.debug(`Progress file mtime before iteration: ${progressMtimeBefore}`, "Execution");
                }
                catch (_) {
                    // Progress file may not exist yet
                }
            }
            // Grace period: after progress file update, allow 5 more polls (20s) for agent to finish git commit etc.
            let progressGraceCountdown = -1; // -1 = not triggered yet
            // Use polling to monitor agent completion
            for await (const event of state.antigravityClient.pollForCompletion(agentContext.cascadeId, abortController.signal, config.stableThreshold ?? 7, config.pollIntervalMs ?? 4000)) {
                if (state.stopRequested) {
                    state.progressLogger?.warn("Stop requested, cancelling cascade...", "Execution");
                    await state.antigravityClient.cancelCascade(agentContext.cascadeId);
                    throw new Error("Stop requested during processing");
                }
                if (event.type === "text") {
                    responseCount++;
                    agentContext.logs.push(`Stream: ${event.content.substring(0, 200)}`);
                    // If grace period is active, count down
                    if (progressGraceCountdown > 0) {
                        progressGraceCountdown--;
                        state.progressLogger?.debug(`Progress grace period: ${progressGraceCountdown} polls remaining`, "Execution");
                    }
                    else if (progressGraceCountdown === 0) {
                        state.progressLogger?.info("Progress grace period complete (5 polls / 20s), moving to next iteration", "Execution");
                        agentContext.logs.push("Progress file updated — grace period complete, exiting polling");
                        break;
                    }
                    // Check if progress file was updated — if so, start grace countdown
                    if (progressGraceCountdown < 0 && config.progressFile) {
                        try {
                            const progressUri = vscode.Uri.file(`${config.workspaceRoot}/${config.progressFile}`);
                            const stat = await vscode.workspace.fs.stat(progressUri);
                            // Trigger if: file was modified (mtime changed) OR file was created (mtime was 0, now exists)
                            if (stat.mtime > progressMtimeBefore) {
                                const gp = config.gracePolls ?? 5;
                                progressGraceCountdown = gp;
                                state.progressLogger?.info(`Progress file updated (mtime: ${progressMtimeBefore} → ${stat.mtime}), starting ${gp}-poll grace period`, "Execution");
                            }
                        }
                        catch (_) {
                            // Ignore stat errors during polling
                        }
                    }
                }
                else if (event.type === "end") {
                    state.progressLogger?.info(`Stream completed (${responseCount} chunks)`, "Execution");
                    agentContext.logs.push("Stream completed");
                    break;
                }
                else if (event.type === "error") {
                    state.progressLogger?.error(`Stream error: ${event.content}`, "Execution");
                    agentContext.logs.push(`Stream error: ${event.content}`);
                    break;
                }
            }
            state.setStreamAbortController(null);
            state.progressLogger?.streamSubSection("Cleanup");
            // In Pseudo Ralph mode, don't delete the cascade (preserve for reuse)
            if (!state.pseudoRalphMode) {
                state.progressLogger?.debug("Sending final reminder before closing...", "Cleanup");
                // Send reminder message about completion marker and wait for response
                const reminderMessage = `REMINDER: Before I close this session, verify that you have appended the completion marker "${(0, git_1.generateDoneMarker)(loopId)}" to ${config.progressFile} if ALL tasks in ${config.taskFile} are complete. If you forgot, add it now or you will be respawned in an infinite loop.`;
                try {
                    const response = await state.antigravityClient.sendMessageAndWait(agentContext.cascadeId, reminderMessage, config.mode, config.model, config.pollIntervalMs ?? 4000);
                    state.progressLogger?.debug(`Agent acknowledged reminder (response length: ${response.length})`, "Cleanup");
                }
                catch (reminderError) {
                    state.progressLogger?.debug(`Reminder response timeout or error: ${reminderError}`, "Cleanup");
                }
                state.progressLogger?.debug("Deleting cascade trajectory...", "Cleanup");
                await state.antigravityClient.deleteCascade(agentContext.cascadeId);
                state.setCurrentCascadeId(null);
                agentContext.logs.push("Cascade trajectory deleted");
            }
            else {
                state.progressLogger?.debug("Preserving cascade (Pseudo Ralph mode)", "Cleanup");
                agentContext.logs.push("Cascade preserved for next iteration");
            }
            if (agentContext.cascadeSession) {
                agentContext.cascadeSession.status = "completed";
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            state.progressLogger?.error(`Cascade error: ${errorMessage}`, "Execution");
            agentContext.logs.push(`Cascade error: ${errorMessage}`);
            if (agentContext.cascadeId &&
                state.antigravityClient &&
                !state.pseudoRalphMode) {
                try {
                    await state.antigravityClient.deleteCascade(agentContext.cascadeId);
                    state.setCurrentCascadeId(null);
                }
                catch (cleanupError) {
                    state.progressLogger?.warn(`Cleanup failed: ${cleanupError}`, "Cleanup");
                }
            }
            if (agentContext.cascadeSession) {
                agentContext.cascadeSession.status = "error";
            }
            // Always throw the error so the loop stops on any failure
            throw error;
        }
    }
    else {
        state.progressLogger?.warn("No cascade session, using stub behavior", "Execution");
        const totalSteps = 4;
        for (let step = 1; step <= totalSteps; step++) {
            if (state.stopRequested) {
                throw new Error("Stop requested during processing");
            }
            const stepDelay = Math.random() * 250 + 250;
            await new Promise((resolve) => setTimeout(resolve, stepDelay));
            const stepNames = [
                "Analyzing prompt",
                "Processing context",
                "Generating response",
                "Finalizing output",
            ];
            state.progressLogger?.progress(`Step ${step}/${totalSteps}: ${stepNames[step - 1]}`, "Execution");
        }
    }
    agentContext.logs.push(`Iteration ${state.currentIteration} completed successfully`);
    agentContext.endTime = new Date();
    state.progressLogger?.streamProgress("Saving", 4, 5, "Storing iteration results");
    const iterationResult = {
        iteration: state.currentIteration,
        startTime: agentContext.startTime,
        endTime: agentContext.endTime,
        logs: agentContext.logs,
        success: true,
    };
    const history = context.workspaceState.get("ralph.iterationHistory", []);
    history.push(iterationResult);
    if (history.length > 10) {
        history.shift();
    }
    await context.workspaceState.update("ralph.iterationHistory", history);
    const duration = agentContext.endTime.getTime() - agentContext.startTime.getTime();
    state.progressLogger?.info(`Processing completed (${duration}ms)`, "Execution");
}
//# sourceMappingURL=agentRunner.js.map