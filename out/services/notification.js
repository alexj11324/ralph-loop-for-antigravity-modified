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
exports.NotificationService = void 0;
const vscode = __importStar(require("vscode"));
class NotificationService {
    constructor() {
        this.config = this.loadConfig();
    }
    loadConfig() {
        const config = vscode.workspace.getConfiguration("ralphLoop.notifications");
        return {
            enabled: config.get("enabled", true),
            onCompletion: config.get("onCompletion", true),
            onError: config.get("onError", true),
            onStop: config.get("onStop", true),
            showProgressModal: config.get("showProgressModal", false),
            includeStats: config.get("includeStats", true),
        };
    }
    refreshConfig() {
        this.config = this.loadConfig();
    }
    async notify(options) {
        if (!this.config.enabled) {
            return undefined;
        }
        const { type, message, detail, iterations, maxIterations, elapsedTime, actions, } = options;
        if (type === "completion" && !this.config.onCompletion)
            return undefined;
        if (type === "error" && !this.config.onError)
            return undefined;
        if (type === "stop" && !this.config.onStop)
            return undefined;
        let fullMessage = message;
        if (this.config.includeStats && (iterations !== undefined || elapsedTime)) {
            const stats = [];
            if (iterations !== undefined && maxIterations !== undefined) {
                stats.push(`Iterations: ${iterations}/${maxIterations}`);
            }
            else if (iterations !== undefined) {
                stats.push(`Iterations: ${iterations}`);
            }
            if (elapsedTime) {
                stats.push(`Time: ${elapsedTime}`);
            }
            if (stats.length > 0) {
                fullMessage = `${message} (${stats.join(", ")})`;
            }
        }
        if (detail) {
            fullMessage = `${fullMessage}\n${detail}`;
        }
        const actionItems = actions ?? [];
        switch (type) {
            case "completion":
                return this.showCompletionNotification(fullMessage, actionItems);
            case "error":
                return this.showErrorNotification(fullMessage, actionItems);
            case "stop":
                return this.showStopNotification(fullMessage, actionItems);
            case "warning":
                return this.showWarningNotification(fullMessage, actionItems);
            case "info":
            default:
                return this.showInfoNotification(fullMessage, actionItems);
        }
    }
    async showCompletionNotification(message, actions) {
        if (this.config.showProgressModal) {
            return vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Ralph Loop",
                cancellable: false,
            }, async (progress) => {
                progress.report({ message, increment: 100 });
                await new Promise((resolve) => setTimeout(resolve, 3000));
                return undefined;
            });
        }
        return vscode.window.showInformationMessage(`DONE: ${message}`, ...actions);
    }
    async showErrorNotification(message, actions) {
        return vscode.window.showErrorMessage(`ERROR: ${message}`, ...actions);
    }
    async showStopNotification(message, actions) {
        return vscode.window.showInformationMessage(`STOP: ${message}`, ...actions);
    }
    async showWarningNotification(message, actions) {
        return vscode.window.showWarningMessage(`WARN: ${message}`, ...actions);
    }
    async showInfoNotification(message, actions) {
        return vscode.window.showInformationMessage(message, ...actions);
    }
    async notifyCompletion(iterations, maxIterations, elapsedTime) {
        return this.notify({
            type: "completion",
            message: "Ralph Loop completed successfully",
            iterations,
            maxIterations,
            elapsedTime,
            actions: ["Show Output", "Dismiss"],
        });
    }
    async notifyError(errorMessage, iterations) {
        return this.notify({
            type: "error",
            message: "Ralph Loop encountered an error",
            detail: errorMessage,
            iterations,
            actions: ["Show Output", "Dismiss"],
        });
    }
    async notifyStop(isEmergency, iterations, elapsedTime) {
        return this.notify({
            type: "stop",
            message: isEmergency
                ? "Ralph Loop emergency stopped"
                : "Ralph Loop stopped",
            iterations,
            elapsedTime,
            actions: ["Show Output"],
        });
    }
    async notifyIterationError(iteration, errorMessage) {
        return this.notify({
            type: "error",
            message: `Error in iteration ${iteration}`,
            detail: errorMessage,
            iterations: iteration,
            actions: ["Show Output", "Stop Loop"],
        });
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=notification.js.map