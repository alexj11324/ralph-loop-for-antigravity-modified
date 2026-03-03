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
exports.createAntigravityClient = createAntigravityClient;
const vscode = __importStar(require("vscode"));
const client_1 = require("./client");
const discovery_1 = require("./discovery");
async function createAntigravityClient(outputChannel, configOverrides, workspacePath) {
    const wsConfig = vscode.workspace.getConfiguration("ralphLoop.antigravity");
    if (workspacePath) {
        outputChannel.appendLine(`[AntigravityClient] Searching for workspace: ${workspacePath}`);
    }
    const processInfo = await (0, discovery_1.extractAntigravityFromProcess)(workspacePath);
    if (workspacePath && processInfo?.workspaceId) {
        outputChannel.appendLine(`[AntigravityClient] Found Antigravity process for workspace: ${processInfo.workspaceId}`);
        if (processInfo.workspaceId !== (0, discovery_1.pathToWorkspaceId)(workspacePath)) {
            outputChannel.appendLine(`[AntigravityClient] WARNING: Workspace mismatch! Expected: ${(0, discovery_1.pathToWorkspaceId)(workspacePath)}`);
        }
    }
    let port = configOverrides?.port ?? wsConfig.get("port", 0);
    if (!port || port === 0) {
        outputChannel.appendLine("[AntigravityClient] Discovering Antigravity gRPC port...");
        const discoveredPort = await (0, discovery_1.discoverAntigravityPort)(processInfo?.pid, workspacePath);
        if (discoveredPort) {
            port = discoveredPort;
            outputChannel.appendLine(`[AntigravityClient] Found gRPC port: ${port}`);
        }
        else {
            throw new Error("Could not discover Antigravity gRPC port. Is Antigravity running?");
        }
    }
    let csrfToken = configOverrides?.csrfToken ?? wsConfig.get("csrfToken", "");
    if (!csrfToken) {
        if (processInfo?.csrfToken) {
            csrfToken = processInfo.csrfToken;
            outputChannel.appendLine(`[AntigravityClient] Extracted CSRF token from process: ${csrfToken.substring(0, 8)}...`);
        }
        else {
            throw new Error("CSRF token not found. Antigravity process may not be running.");
        }
    }
    let oauthToken = configOverrides?.oauthToken ?? wsConfig.get("oauthToken", "");
    if (!oauthToken) {
        outputChannel.appendLine("[AntigravityClient] Attempting to extract OAuth token...");
        const extractedToken = await (0, discovery_1.extractOAuthToken)();
        if (extractedToken) {
            oauthToken = extractedToken;
            outputChannel.appendLine("[AntigravityClient] OAuth token extracted successfully");
        }
        else {
            throw new Error("Could not extract OAuth token. Please set ralphLoop.antigravity.oauthToken manually.");
        }
    }
    const client = new client_1.AntigravityClient({ port, csrfToken, oauthToken }, outputChannel);
    await client.connectWithRetry();
    return client;
}
//# sourceMappingURL=factory.js.map