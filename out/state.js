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
exports.hostBlocked = exports.persistentCascadeId = exports.pseudoRalphMode = exports.streamAbortController = exports.currentCascadeId = exports.notificationService = exports.antigravityClient = exports.progressLogger = exports.stopRequested = exports.currentLoopPromise = exports.ralphLoopProvider = exports.outputChannel = exports.startTime = exports.maxIterations = exports.currentIteration = exports.ralphLoopStatus = void 0;
exports.setRalphLoopStatus = setRalphLoopStatus;
exports.setCurrentIteration = setCurrentIteration;
exports.incrementIteration = incrementIteration;
exports.decrementIteration = decrementIteration;
exports.setMaxIterations = setMaxIterations;
exports.setStartTime = setStartTime;
exports.setStopRequested = setStopRequested;
exports.setCurrentLoopPromise = setCurrentLoopPromise;
exports.setAntigravityClient = setAntigravityClient;
exports.setCurrentCascadeId = setCurrentCascadeId;
exports.setStreamAbortController = setStreamAbortController;
exports.setPseudoRalphMode = setPseudoRalphMode;
exports.setPersistentCascadeId = setPersistentCascadeId;
exports.setHostBlocked = setHostBlocked;
exports.setExtensionContext = setExtensionContext;
exports.initializeState = initializeState;
const vscode = __importStar(require("vscode"));
const progressLogger_1 = require("./services/progressLogger");
const notification_1 = require("./services/notification");
// Global state - shared across all modules
exports.ralphLoopStatus = "stopped";
exports.currentIteration = 0;
exports.maxIterations = 200;
exports.startTime = undefined;
exports.currentLoopPromise = null;
exports.stopRequested = false;
exports.progressLogger = null;
exports.antigravityClient = null;
exports.notificationService = null;
exports.currentCascadeId = null;
exports.streamAbortController = null;
exports.pseudoRalphMode = false;
exports.persistentCascadeId = null;
exports.hostBlocked = false;
exports._extensionContext = null;
// State setters
function setRalphLoopStatus(status) {
    exports.ralphLoopStatus = status;
}
function setCurrentIteration(iteration) {
    exports.currentIteration = iteration;
}
function incrementIteration() {
    exports.currentIteration++;
}
function decrementIteration() {
    if (exports.currentIteration > 0) {
        exports.currentIteration--;
    }
}
function setMaxIterations(max) {
    exports.maxIterations = max;
}
function setStartTime(time) {
    exports.startTime = time;
}
function setStopRequested(requested) {
    exports.stopRequested = requested;
}
function setCurrentLoopPromise(promise) {
    exports.currentLoopPromise = promise;
}
function setAntigravityClient(client) {
    exports.antigravityClient = client;
}
function setCurrentCascadeId(id) {
    exports.currentCascadeId = id;
}
function setStreamAbortController(controller) {
    exports.streamAbortController = controller;
}
function setPseudoRalphMode(enabled) {
    exports.pseudoRalphMode = enabled;
}
function setPersistentCascadeId(id) {
    exports.persistentCascadeId = id;
}
function setHostBlocked(blocked) {
    exports.hostBlocked = blocked;
}
function setExtensionContext(ctx) {
    exports._extensionContext = ctx;
}
// Initialization
function initializeState(channel, provider) {
    exports.outputChannel = channel;
    exports.ralphLoopProvider = provider;
    exports.progressLogger = new progressLogger_1.ProgressLogger(channel);
    exports.notificationService = new notification_1.NotificationService();
    exports.maxIterations = vscode.workspace
        .getConfiguration("ralphLoop")
        .get("maxIterations", 200);
}
//# sourceMappingURL=state.js.map