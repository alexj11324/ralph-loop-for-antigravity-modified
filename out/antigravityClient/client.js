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
exports.AntigravityClient = void 0;
const http2 = __importStar(require("http2"));
const vscode = __importStar(require("vscode"));
const protobuf_1 = require("./protobuf");
function isDebugLoggingEnabled() {
    return vscode.workspace
        .getConfiguration("ralphLoop")
        .get("debugLogging", false);
}
class AntigravityClient {
    constructor(config, outputChannel) {
        this.client = null;
        this.config = config;
        this.outputChannel = outputChannel;
    }
    async connect() {
        return new Promise((resolve, reject) => {
            this.client = http2.connect(`https://127.0.0.1:${this.config.port}`, {
                rejectUnauthorized: false,
            });
            let connected = false;
            this.client.on("connect", () => {
                connected = true;
                this.log("Connected to Antigravity server");
                resolve();
            });
            this.client.on("error", (err) => {
                this.log(`Connection error: ${err.message}`);
                reject(err);
            });
            setTimeout(() => {
                if (!connected) {
                    reject(new Error("Connection timeout"));
                }
            }, 5000);
        });
    }
    /**
     * Connect with exponential backoff retry.
     * Retries on ECONNREFUSED/ECONNRESET with increasing delays.
     */
    async connectWithRetry(maxRetries = 5, baseDelayMs = 2000) {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                await this.connect();
                if (attempt > 0) {
                    this.log(`Reconnected successfully after ${attempt} retries`);
                }
                return;
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                if (attempt >= maxRetries) {
                    this.log(`Connection failed after ${maxRetries} retries: ${msg}`);
                    throw error;
                }
                const delay = baseDelayMs * Math.pow(2, attempt);
                this.log(`Connection attempt ${attempt + 1} failed (${msg}), retrying in ${delay / 1000}s...`);
                await new Promise((r) => setTimeout(r, delay));
                // Clean up failed client before retry
                if (this.client) {
                    try { this.client.close(); } catch (_) { }
                    this.client = null;
                }
            }
        }
    }
    disconnect() {
        if (!this.client)
            return;
        this.client.close();
        this.client = null;
        this.log("Disconnected from Antigravity server");
    }
    async startCascade(enablePlanning = false) {
        if (!this.client) {
            throw new Error("Not connected to Antigravity server");
        }
        const metadata = (0, protobuf_1.buildMetadata)(this.config.oauthToken);
        const payload = Buffer.concat([
            (0, protobuf_1.ldField)(1, metadata),
            Buffer.from([0x20, enablePlanning ? 0x01 : 0x00]),
        ]);
        return new Promise((resolve, reject) => {
            const req = this.client.request({
                ":method": "POST",
                ":path": "/exa.language_server_pb.LanguageServerService/StartCascade",
                "content-type": "application/proto",
                "connect-protocol-version": "1",
                origin: "vscode-file://vscode-app",
                "x-codeium-csrf-token": this.config.csrfToken,
                "content-length": payload.length.toString(),
            });
            let responseData = Buffer.alloc(0);
            req.on("response", (headers) => {
                if (headers[":status"] !== 200) {
                    reject(new Error(`StartCascade failed with status ${headers[":status"]}`));
                }
            });
            req.on("data", (chunk) => {
                responseData = Buffer.concat([responseData, chunk]);
            });
            req.on("end", () => {
                if (responseData.length > 2) {
                    const len = responseData[1];
                    const cascadeId = responseData.subarray(2, 2 + len).toString("utf8");
                    this.log(`Cascade started: ${cascadeId}`);
                    resolve(cascadeId);
                    return;
                }
                reject(new Error("Empty response from StartCascade"));
            });
            req.on("error", reject);
            req.write(payload);
            req.end();
        });
    }
    async sendMessage(cascadeId, message, mode = "Fast", modelName = "Gemini 3 Flash") {
        if (!this.client) {
            throw new Error("Not connected to Antigravity server");
        }
        const messageBody = (0, protobuf_1.ldField)(1, message);
        const planningMode = mode === "Planning" ? 1 : 0;
        const modeField = Buffer.from([0x70, planningMode]);
        const safetyConfig = (0, protobuf_1.buildSafetyConfig)(modelName);
        const payload = Buffer.concat([
            (0, protobuf_1.ldField)(1, cascadeId),
            (0, protobuf_1.ldField)(2, messageBody),
            (0, protobuf_1.ldField)(3, (0, protobuf_1.buildMetadata)(this.config.oauthToken)),
            safetyConfig,
            modeField,
        ]);
        return new Promise((resolve, reject) => {
            const req = this.client.request({
                ":method": "POST",
                ":path": "/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage",
                "content-type": "application/proto",
                "connect-protocol-version": "1",
                origin: "vscode-file://vscode-app",
                "x-codeium-csrf-token": this.config.csrfToken,
                "content-length": payload.length.toString(),
            });
            req.on("response", (headers) => {
                if (headers[":status"] === 200) {
                    this.log(`Message sent (mode=${mode}, model=${modelName})`);
                    resolve();
                    return;
                }
                reject(new Error(`SendMessage failed with status ${headers[":status"]}`));
            });
            req.on("error", reject);
            req.write(payload);
            req.end();
        });
    }
    async *streamUpdates(cascadeId, abortSignal) {
        if (!this.client) {
            throw new Error("Not connected to Antigravity server");
        }
        const varintField1 = Buffer.from([0x08, 0x01]);
        const protoPayload = Buffer.concat([
            varintField1,
            (0, protobuf_1.ldField)(2, cascadeId),
            (0, protobuf_1.ldField)(3, "chat-client-trajectories"),
        ]);
        const payload = (0, protobuf_1.frame)(protoPayload);
        const eventQueue = [];
        let streamEnded = false;
        let resolveNext = null;
        const idleTimeoutMs = 15000;
        let bytesReceived = 0;
        let idleTimeout = null;
        let pendingBuffer = Buffer.alloc(0); // Buffer for incomplete frames across chunks
        const clearIdleTimeout = () => {
            if (idleTimeout) {
                clearTimeout(idleTimeout);
                idleTimeout = null;
            }
        };
        const wake = () => {
            if (resolveNext) {
                resolveNext();
                resolveNext = null;
            }
        };
        const req = this.client.request({
            ":method": "POST",
            ":path": "/exa.language_server_pb.LanguageServerService/StreamCascadeReactiveUpdates",
            "content-type": "application/connect+proto",
            accept: "application/connect+proto",
            "connect-protocol-version": "1",
            origin: "vscode-file://vscode-app",
            "x-codeium-csrf-token": this.config.csrfToken,
        });
        const endStream = (event) => {
            if (streamEnded)
                return;
            streamEnded = true;
            clearIdleTimeout();
            eventQueue.push(event);
            try {
                req.close();
            }
            catch (error) {
                void error;
            }
            wake();
        };
        const armIdleTimeout = () => {
            clearIdleTimeout();
            if (bytesReceived <= 0)
                return;
            idleTimeout = setTimeout(() => {
                if (streamEnded || bytesReceived <= 0)
                    return;
                endStream({ type: "end", content: "idle-timeout" });
            }, idleTimeoutMs);
        };
        if (abortSignal) {
            abortSignal.addEventListener("abort", () => {
                this.log("Stream aborted via signal");
                endStream({ type: "error", content: "Stream aborted" });
            });
        }
        req.on("data", (chunk) => {
            if (streamEnded) {
                return;
            }
            if (chunk.length > 0) {
                bytesReceived += chunk.length;
                armIdleTimeout();
            }
            // Append new chunk to pending buffer
            pendingBuffer = Buffer.concat([pendingBuffer, chunk]);
            let pos = 0;
            let frameCount = 0;
            while (pos < pendingBuffer.length) {
                // Need at least 5 bytes for frame header
                if (pendingBuffer.length < pos + 5) {
                    break;
                }
                const len = pendingBuffer.readUInt32BE(pos + 1);
                // Sanity check: frame length should be reasonable (< 10MB)
                if (len > 10 * 1024 * 1024) {
                    this.log(`  WARNING: Unreasonable frame length ${len}, skipping 1 byte`);
                    pos += 1;
                    continue;
                }
                // Check if we have the complete frame
                if (pendingBuffer.length < pos + 5 + len) {
                    break;
                }
                const data = pendingBuffer.subarray(pos + 5, pos + 5 + len);
                const raw = data.toString("utf8");
                const text = raw.replace(/[^\x20-\x7E\n\r\t]/g, "").trim();
                if (text.length > 2) {
                    eventQueue.push({ type: "text", content: text, raw: data });
                }
                pos += 5 + len;
                frameCount++;
            }
            // Keep only unprocessed data in buffer
            if (pos > 0) {
                pendingBuffer = pendingBuffer.subarray(pos);
            }
            wake();
        });
        req.on("end", () => {
            this.log(`Stream ended event fired (bytesReceived=${bytesReceived})`);
            endStream({ type: "end", content: "" });
        });
        req.on("error", (err) => {
            this.log(`Stream error: ${err.message}`);
            endStream({ type: "error", content: err.message });
        });
        req.write(payload);
        req.end();
        while (!streamEnded || eventQueue.length > 0) {
            if (eventQueue.length > 0) {
                const event = eventQueue.shift();
                yield event;
                if (event.type === "end" || event.type === "error")
                    break;
            }
            else {
                await new Promise((resolve) => {
                    resolveNext = resolve;
                });
            }
        }
    }
    /**
     * Poll GetCascadeTrajectorySteps to monitor agent completion.
     * Returns when agent is done (content stable) or abort signal.
     */
    async *pollForCompletion(cascadeId, abortSignal, stableThreshold = 7) {
        if (!this.client) {
            throw new Error("Not connected to Antigravity server");
        }
        const pollIntervalMs = 2000; // Poll every 2 seconds
        let lastContentLen = 0;
        let stableCount = 0;
        let hasGrown = false;
        const startTime = Date.now();
        while (true) {
            if (abortSignal?.aborted) {
                yield { type: "error", content: "Polling aborted" };
                return;
            }
            const payload = (0, protobuf_1.ldField)(1, cascadeId);
            const result = await new Promise((resolve, reject) => {
                const req = this.client.request({
                    ":method": "POST",
                    ":path": "/exa.language_server_pb.LanguageServerService/GetCascadeTrajectorySteps",
                    "content-type": "application/proto",
                    "connect-protocol-version": "1",
                    origin: "vscode-file://vscode-app",
                    "x-codeium-csrf-token": this.config.csrfToken,
                    "content-length": payload.length.toString(),
                });
                let responseData = Buffer.alloc(0);
                req.on("data", (chunk) => {
                    responseData = Buffer.concat([responseData, chunk]);
                });
                req.on("response", (headers) => {
                    req.on("end", () => resolve({ status: headers[":status"], data: responseData }));
                });
                req.on("error", reject);
                req.write(payload);
                req.end();
            });
            if (result.status !== 200) {
                this.log(`Poll status: ${result.status}, waiting...`);
                await new Promise((r) => setTimeout(r, pollIntervalMs));
                continue;
            }
            const raw = result.data.toString("utf8");
            const text = raw.replace(/[^\x20-\x7E\n\r\t]/g, "");
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            // Yield text content as event
            if (text.length > 0) {
                yield { type: "text", content: text, raw: result.data };
            }
            // Track content changes
            const contentGrew = text.length > lastContentLen;
            if (contentGrew) {
                hasGrown = true;
                stableCount = 0;
                this.debugLog(`[${elapsed}s] Content grew: ${lastContentLen} -> ${text.length}`);
            }
            else if (hasGrown) {
                stableCount++;
                this.debugLog(`[${elapsed}s] Content stable (${stableCount}/${stableThreshold})`);
                if (stableCount >= stableThreshold) {
                    this.debugLog(`Agent completed (content stable for ${stableCount * pollIntervalMs / 1000}s)`);
                    yield { type: "end", content: "completed" };
                    return;
                }
            }
            else {
                this.debugLog(`[${elapsed}s] Waiting for agent to start (len=${text.length})`);
            }
            lastContentLen = text.length;
            await new Promise((r) => setTimeout(r, pollIntervalMs));
        }
    }
    /**
     * Send a message and wait for agent response with polling.
     * Uses same logic as pollForCompletion: continues while content grows,
     * stops when content is stable.
     */
    async sendMessageAndWait(cascadeId, message, mode, model) {
        if (!this.client) {
            throw new Error("Not connected to Antigravity server");
        }
        // First send the message
        await this.sendMessage(cascadeId, message, mode, model);
        // Then poll for response using same logic as pollForCompletion
        const responses = [];
        for await (const event of this.pollForCompletion(cascadeId)) {
            if (event.type === "text") {
                responses.push(event.content);
            }
            else if (event.type === "end" || event.type === "error") {
                break;
            }
        }
        return responses.join("\n");
    }
    async cancelCascade(cascadeId) {
        if (!this.client) {
            throw new Error("Not connected to Antigravity server");
        }
        const payload = (0, protobuf_1.ldField)(1, cascadeId);
        return new Promise((resolve, reject) => {
            const req = this.client.request({
                ":method": "POST",
                ":path": "/exa.language_server_pb.LanguageServerService/CancelCascadeInvocation",
                "content-type": "application/proto",
                "connect-protocol-version": "1",
                origin: "vscode-file://vscode-app",
                "x-codeium-csrf-token": this.config.csrfToken,
                "content-length": payload.length.toString(),
            });
            req.on("response", (headers) => {
                if (headers[":status"] === 200) {
                    this.log(`Cascade cancelled: ${cascadeId}`);
                    resolve();
                    return;
                }
                reject(new Error(`CancelCascade failed with status ${headers[":status"]}`));
            });
            req.on("error", reject);
            req.write(payload);
            req.end();
        });
    }
    async deleteCascade(cascadeId) {
        if (!this.client) {
            throw new Error("Not connected to Antigravity server");
        }
        const payload = (0, protobuf_1.ldField)(1, cascadeId);
        return new Promise((resolve, reject) => {
            const req = this.client.request({
                ":method": "POST",
                ":path": "/exa.language_server_pb.LanguageServerService/DeleteCascadeTrajectory",
                "content-type": "application/proto",
                "connect-protocol-version": "1",
                origin: "vscode-file://vscode-app",
                "x-codeium-csrf-token": this.config.csrfToken,
                "content-length": payload.length.toString(),
            });
            req.on("response", (headers) => {
                if (headers[":status"] === 200) {
                    this.log(`Cascade deleted: ${cascadeId}`);
                    resolve();
                    return;
                }
                reject(new Error(`DeleteCascade failed with status ${headers[":status"]}`));
            });
            req.on("error", reject);
            req.write(payload);
            req.end();
        });
    }
    async getUserStatus() {
        if (!this.client) {
            throw new Error("Not connected to Antigravity server");
        }
        const metadata = (0, protobuf_1.buildMetadata)(this.config.oauthToken);
        const payload = (0, protobuf_1.ldField)(1, metadata);
        return new Promise((resolve, reject) => {
            const req = this.client.request({
                ":method": "POST",
                ":path": "/exa.language_server_pb.LanguageServerService/GetUserStatus",
                "content-type": "application/proto",
                "connect-protocol-version": "1",
                origin: "vscode-file://vscode-app",
                "x-codeium-csrf-token": this.config.csrfToken,
                "content-length": payload.length.toString(),
            });
            let responseData = Buffer.alloc(0);
            req.on("data", (chunk) => {
                responseData = Buffer.concat([responseData, chunk]);
            });
            req.on("end", () => {
                const responseStr = responseData.toString("utf8");
                const status = {
                    cascadeCanAutoRunCommands: responseStr.includes("cascadeCanAutoRunCommands") ||
                        responseData.includes(Buffer.from([0x08, 0x01])),
                    allowAutoRunCommands: true,
                    allowMcpServers: true,
                    cascadeWebSearchEnabled: true,
                };
                this.log(`User status retrieved: autoRun=${status.cascadeCanAutoRunCommands}`);
                resolve(status);
            });
            req.on("error", reject);
            req.write(payload);
            req.end();
        });
    }
    log(message) {
        this.outputChannel.appendLine(`[AntigravityClient] ${message}`);
    }
    debugLog(message) {
        if (isDebugLoggingEnabled()) {
            this.outputChannel.appendLine(`[AntigravityClient DEBUG] ${message}`);
        }
    }
}
exports.AntigravityClient = AntigravityClient;
//# sourceMappingURL=client.js.map