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
exports.HelpProvider = void 0;
const vscode = __importStar(require("vscode"));
class HelpProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return Promise.resolve([]);
        }
        const config = vscode.workspace.getConfiguration("ralphLoop");
        const debugEnabled = config.get("debugLogging", false);
        const debugLoggingItem = new HelpItem("Debug Logging", debugEnabled ? "Enabled" : "Disabled", new vscode.ThemeIcon(debugEnabled ? "check" : "circle-large-outline"), {
            command: "ralph.toggleDebugLogging",
            title: "Toggle Debug Logging",
        });
        const bugReportItem = new HelpItem("Report a Bug", "Open GitHub issue", new vscode.ThemeIcon("bug"), {
            command: "ralph.reportBug",
            title: "Report a Bug",
        });
        return Promise.resolve([debugLoggingItem, bugReportItem]);
    }
}
exports.HelpProvider = HelpProvider;
class HelpItem extends vscode.TreeItem {
    constructor(label, description, iconPath, command) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.label = label;
        this.description = description;
        this.iconPath = iconPath;
        this.command = command;
        this.tooltip = `${this.label}: ${this.description}`;
    }
}
//# sourceMappingURL=helpProvider.js.map