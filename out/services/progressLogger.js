"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProgressLogger = void 0;
class ProgressLogger {
    constructor(channel) {
        this.currentIteration = 0;
        this.maxIterations = 0;
        this.logBuffer = [];
        this.showTimestamp = true;
        this.outputChannel = channel;
    }
    setIteration(current, max) {
        this.currentIteration = current;
        this.maxIterations = max;
    }
    formatTimestamp() {
        const now = new Date();
        return `${now.toLocaleTimeString("en-US", { hour12: false })}.${now.getMilliseconds().toString().padStart(3, "0")}`;
    }
    formatLogLevel(level) {
        switch (level) {
            case "info":
                return "[INFO] ";
            case "debug":
                return "[DEBUG]";
            case "warn":
                return "[WARN] ";
            case "error":
                return "[ERROR]";
            case "progress":
                return "[PROGRESS]";
            default:
                return "  ";
        }
    }
    formatIterationPrefix() {
        if (this.currentIteration > 0 && this.maxIterations > 0) {
            return `[${this.currentIteration}/${this.maxIterations}]`;
        }
        return "";
    }
    stream(message, level = "info", category) {
        const entry = {
            timestamp: new Date(),
            level,
            message,
            iteration: this.currentIteration,
            category,
        };
        this.logBuffer.push(entry);
        const parts = [];
        if (this.showTimestamp) {
            parts.push(`[${this.formatTimestamp()}]`);
        }
        parts.push(this.formatLogLevel(level));
        const iterationPrefix = this.formatIterationPrefix();
        if (iterationPrefix) {
            parts.push(iterationPrefix);
        }
        if (category) {
            parts.push(`[${category}]`);
        }
        parts.push(message);
        this.outputChannel.appendLine(parts.join(" "));
    }
    streamProgress(phase, step, totalSteps, detail) {
        const progressBar = this.createProgressBar(step, totalSteps);
        const message = detail
            ? `${phase}: ${progressBar} (${step}/${totalSteps}) - ${detail}`
            : `${phase}: ${progressBar} (${step}/${totalSteps})`;
        this.stream(message, "progress");
    }
    createProgressBar(current, total) {
        const width = 20;
        const filled = Math.round((current / total) * width);
        const empty = width - filled;
        return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
    }
    streamSection(title) {
        this.outputChannel.appendLine("");
        this.outputChannel.appendLine(`${"═".repeat(60)}`);
        this.outputChannel.appendLine(`  ${title}`);
        this.outputChannel.appendLine(`${"═".repeat(60)}`);
    }
    streamSubSection(title) {
        this.outputChannel.appendLine(`  ─── ${title} ${"─".repeat(Math.max(0, 50 - title.length))}`);
    }
    info(message, category) {
        this.stream(message, "info", category);
    }
    debug(message, category) {
        this.stream(message, "debug", category);
    }
    warn(message, category) {
        this.stream(message, "warn", category);
    }
    error(message, category) {
        this.stream(message, "error", category);
    }
    progress(message, category) {
        this.stream(message, "progress", category);
    }
    getLogHistory() {
        return [...this.logBuffer];
    }
    clearHistory() {
        this.logBuffer = [];
    }
    show() {
        this.outputChannel.show(true);
    }
}
exports.ProgressLogger = ProgressLogger;
//# sourceMappingURL=progressLogger.js.map