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
exports.isGitRepo = isGitRepo;
exports.getCurrentBranch = getCurrentBranch;
exports.createBranch = createBranch;
exports.generateLoopId = generateLoopId;
exports.generateBranchName = generateBranchName;
exports.generateSessionBranchName = generateSessionBranchName;
exports.generateDoneMarker = generateDoneMarker;
exports.initializeGitBranch = initializeGitBranch;
exports.initializeGitSession = initializeGitSession;
const cp = __importStar(require("child_process"));
const util = __importStar(require("util"));
const execAsync = util.promisify(cp.exec);
/**
 * Check if the given directory is a git repository
 */
async function isGitRepo(workspaceRoot) {
    try {
        const { stdout } = await execAsync("git rev-parse --git-dir", {
            cwd: workspaceRoot,
        });
        return stdout.trim().length > 0;
    }
    catch {
        return false;
    }
}
/**
 * Get the current git branch name
 */
async function getCurrentBranch(workspaceRoot) {
    try {
        const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", {
            cwd: workspaceRoot,
        });
        return stdout.trim();
    }
    catch {
        return undefined;
    }
}
/**
 * Create a new branch from current HEAD
 * Returns the name of the created branch
 */
async function createBranch(workspaceRoot, branchName) {
    try {
        await execAsync(`git checkout -b ${branchName}`, {
            cwd: workspaceRoot,
        });
        return branchName;
    }
    catch (error) {
        // If branch already exists, try to checkout existing branch
        try {
            await execAsync(`git checkout ${branchName}`, {
                cwd: workspaceRoot,
            });
            return branchName;
        }
        catch {
            return undefined;
        }
    }
}
/**
 * Generate a unique loop ID (random suffix like pi23v)
 */
function generateLoopId(length = 5) {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    let suffix = "";
    for (let i = 0; i < length; i += 1) {
        const index = Math.floor(Math.random() * alphabet.length);
        suffix += alphabet[index];
    }
    return suffix;
}
/**
 * Generate a branch name from iteration and loop ID
 */
function generateBranchName(iteration, loopId) {
    return `ralph-loop-${iteration}-${loopId}`;
}
/**
 * Generate a session branch name from loop ID
 */
function generateSessionBranchName(loopId) {
    return `ralph-loop-${loopId}`;
}
/**
 * Generate a done marker from loop ID
 */
function generateDoneMarker(loopId) {
    return `ralph-done-${loopId}`;
}
/**
 * Initialize git integration for the workspace
 * - Checks if it's a git repo
 * - Creates a new branch if it is
 * - Returns git info for the config
 */
async function initializeGitBranch(workspaceRoot, iteration, loopId) {
    const isRepo = await isGitRepo(workspaceRoot);
    if (!isRepo) {
        return { isGitRepo: false };
    }
    const currentBranch = await getCurrentBranch(workspaceRoot);
    const branchName = generateBranchName(iteration, loopId);
    const createdBranch = await createBranch(workspaceRoot, branchName);
    return {
        isGitRepo: true,
        currentBranch,
        createdBranch,
    };
}
/**
 * Initialize git session for the loop
 * - Checks if it's a git repo
 * - Creates a new session branch if requested
 * - Returns git info for the config
 */
async function initializeGitSession(workspaceRoot, loopId, shouldCreateBranch) {
    const isRepo = await isGitRepo(workspaceRoot);
    if (!isRepo) {
        return { isGitRepo: false };
    }
    const currentBranch = await getCurrentBranch(workspaceRoot);
    if (!shouldCreateBranch) {
        return {
            isGitRepo: true,
            currentBranch,
            createdBranch: undefined,
        };
    }
    const branchName = generateSessionBranchName(loopId);
    const createdBranch = await createBranch(workspaceRoot, branchName);
    return {
        isGitRepo: true,
        currentBranch,
        createdBranch,
    };
}
//# sourceMappingURL=git.js.map