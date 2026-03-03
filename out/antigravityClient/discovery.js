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
exports.pathToWorkspaceId = pathToWorkspaceId;
exports.extractAntigravityFromProcess = extractAntigravityFromProcess;
exports.extractOAuthToken = extractOAuthToken;
exports.discoverAntigravityPort = discoverAntigravityPort;
const http2 = __importStar(require("http2"));
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const util = __importStar(require("util"));
const state = __importStar(require("../state"));
const child_process_1 = require("child_process");
const protobuf_1 = require("./protobuf");
const execAsync = util.promisify(child_process_1.exec);
const isWindows = process.platform === "win32";
function isDebugLoggingEnabled() {
    return vscode.workspace
        .getConfiguration("ralphLoop")
        .get("debugLogging", false);
}
function debugLog(message, data) {
    if (!isDebugLoggingEnabled())
        return;
    const prefix = "[AntigravityClient DEBUG]";
    const fullMessage = data !== undefined
        ? `${prefix} ${message}: ${typeof data === "string" ? data : JSON.stringify(data)}`
        : `${prefix} ${message}`;
    if (state.outputChannel) {
        state.outputChannel.appendLine(fullMessage);
    }
}
async function execCommand(command, options = {}) {
    const cmdName = options.commandName || command.slice(0, 50);
    debugLog(`Executing command: ${cmdName}`);
    debugLog(`Full command`, command);
    try {
        const { stdout, stderr } = await execAsync(command, {
            encoding: "utf8",
            maxBuffer: 10 * 1024 * 1024,
            ...options,
        });
        const output = stdout;
        if (isDebugLoggingEnabled()) {
            const lines = output.split("\n");
            debugLog(`Command stdout (${lines.length} lines, ${output.length} chars)`);
            if (lines.length <= 10) {
                debugLog(`Output preview`, output);
            }
            else {
                debugLog(`Output preview (first 10 lines)`, lines.slice(0, 10).join("\n") + "\n...");
            }
            if (stderr && stderr.length > 0) {
                const errLines = stderr.split("\n");
                debugLog(`Command stderr (${errLines.length} lines, ${stderr.length} chars)`);
                if (errLines.length <= 5) {
                    debugLog(`Stderr preview`, stderr);
                }
                else {
                    debugLog(`Stderr preview (first 5 lines)`, errLines.slice(0, 5).join("\n") + "\n...");
                }
            }
        }
        return { output: output, stderr: stderr || "", error: null };
    }
    catch (err) {
        const error = err;
        debugLog(`Command failed: ${cmdName}`, {
            message: error.message,
            stderr: error.stderr?.slice(0, 500),
            stdout: error.stdout?.slice(0, 500),
        });
        return { output: null, stderr: error.stderr || "", error };
    }
}
function pathToWorkspaceId(filePath) {
    let normalized = filePath.replace(/\\/g, "/");
    if (normalized.endsWith("/")) {
        normalized = normalized.slice(0, -1);
    }
    if (normalized.startsWith("/")) {
        normalized = normalized.slice(1);
    }
    const encoded = normalized.replace(/:/g, "_3A").replace(/\//g, "_");
    return `file_${encoded}`;
}
function normalizeWorkspaceIdForComparison(workspaceId) {
    // Antigravity may normalize hyphens to underscores (or vice versa) in workspace IDs
    // Normalize for comparison by treating - and _ as equivalent
    return workspaceId.replace(/-/g, "_").toLowerCase();
}
async function extractAntigravityFromProcess(workspacePath) {
    try {
        if (isWindows) {
            return await extractAntigravityFromProcessWindows(workspacePath);
        }
        return await extractAntigravityFromProcessUnix(workspacePath);
    }
    catch {
        return null;
    }
}
async function getWindowsVersion() {
    const { output, error } = await execCommand("ver");
    if (!error && output) {
        // Output format: "Microsoft Windows [Version 10.0.19045.1234]"
        // Windows 11 also shows "10.0.xxxxx" - use build number to detect
        const match = output.match(/Version (\d+)\.(\d+)\.(\d+)/);
        if (match) {
            const build = parseInt(match[3], 10);
            // Windows 11 starts at build 22000 (even though major version is still 10)
            const isWin11 = build >= 22000;
            return {
                major: isWin11 ? 11 : parseInt(match[1], 10),
                build,
                isWin11,
            };
        }
    }
    // Fallback: try registry
    const registryResult = await execCommand('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" /v CurrentBuildNumber');
    if (!registryResult.error && registryResult.output) {
        const match = registryResult.output.match(/CurrentBuildNumber\s+REG_SZ\s+(\d+)/);
        if (match) {
            const build = parseInt(match[1], 10);
            const isWin11 = build >= 22000;
            return { major: isWin11 ? 11 : 10, build, isWin11 };
        }
    }
    return { major: 10, build: 0, isWin11: false }; // Default assume Windows 10
}
async function extractAntigravityFromProcessWindows(workspacePath) {
    const winVer = await getWindowsVersion();
    debugLog(`Detected Windows version: major=${winVer.major}, build=${winVer.build}, isWin11=${winVer.isWin11}`);
    // Use alternative approach for Windows 10 to avoid ConvertTo-Json errors
    // Windows 11 (build 22000+) generally has better PowerShell/.NET support
    const useLegacyApproach = !winVer.isWin11;
    let processes = [];
    if (useLegacyApproach) {
        debugLog("Using legacy process enumeration approach for Windows 10/older");
        processes = await getProcessesLegacy();
    }
    else {
        debugLog("Using JSON-based process enumeration for Windows 11+");
        const psCommand = 'powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress"';
        const result = await execCommand(psCommand, {
            commandName: "Get-CimInstance Win32_Process",
        });
        if (result.error || !result.output) {
            debugLog("PowerShell Get-CimInstance failed, falling back to legacy approach", result.error?.message);
            processes = getProcessesLegacy();
        }
        else {
            try {
                const parsed = JSON.parse(result.output);
                processes = Array.isArray(parsed) ? parsed : [parsed];
                debugLog(`Parsed ${processes.length} processes from PowerShell JSON output`);
            }
            catch (parseErr) {
                debugLog("Failed to parse PowerShell JSON output, using legacy fallback", parseErr.message);
                processes = await getProcessesLegacy();
            }
        }
    }
    const targetWorkspaceId = workspacePath ? pathToWorkspaceId(workspacePath) : null;
    if (targetWorkspaceId) {
        debugLog(`Searching for workspace: ${workspacePath}`);
        debugLog(`Target workspace ID: ${targetWorkspaceId}`);
    }
    let fallbackProcess = null;
    const foundProcesses = [];
    for (const proc of processes) {
        const cmdLine = proc.CommandLine || "";
        const isLanguageServer = cmdLine.includes("language_server_windows_arm") ||
            cmdLine.includes("language_server_windows") ||
            cmdLine.includes("language_server.exe") ||
            cmdLine.includes("language_server");
        const isAntigravity = cmdLine.includes("--app_data_dir antigravity") ||
            cmdLine.toLowerCase().includes("\\antigravity\\") ||
            cmdLine.toLowerCase().includes("/antigravity/");
        if (isLanguageServer && isAntigravity) {
            const pid = proc.ProcessId;
            const csrfMatch = cmdLine.match(/--csrf_token\s+([a-f0-9-]+)/i);
            const csrfToken = csrfMatch ? csrfMatch[1] : null;
            const portMatch = cmdLine.match(/--extension_server_port\s+(\d+)/);
            const extensionServerPort = portMatch ? parseInt(portMatch[1], 10) : undefined;
            const workspaceIdMatch = cmdLine.match(/--workspace_id\s+(\S+)/);
            const workspaceId = workspaceIdMatch ? workspaceIdMatch[1] : undefined;
            debugLog(`Found Antigravity process: PID=${pid}, workspaceId=${workspaceId}`);
            foundProcesses.push({ pid, workspaceId });
            if (csrfToken) {
                const processInfo = {
                    pid,
                    csrfToken,
                    extensionServerPort,
                    workspaceId,
                };
                if (targetWorkspaceId) {
                    const normalizedProcessId = normalizeWorkspaceIdForComparison(workspaceId || "");
                    const normalizedTargetId = normalizeWorkspaceIdForComparison(targetWorkspaceId);
                    debugLog(`Comparing: "${workspaceId}" === "${targetWorkspaceId}" ? ${normalizedProcessId === normalizedTargetId}`);
                    if (normalizedProcessId === normalizedTargetId) {
                        debugLog(`✓ Exact match found!`);
                        return processInfo;
                    }
                    if (!fallbackProcess) {
                        fallbackProcess = processInfo;
                    }
                }
                else {
                    return processInfo;
                }
            }
        }
    }
    if (targetWorkspaceId && foundProcesses.length > 0) {
        debugLog(`No exact match found. Found ${foundProcesses.length} Antigravity processes:`);
        foundProcesses.forEach((p) => debugLog(`  - PID=${p.pid}, workspaceId=${p.workspaceId}`));
        if (fallbackProcess) {
            debugLog(`Using fallback: PID=${fallbackProcess.pid}, workspaceId=${fallbackProcess.workspaceId}`);
        }
    }
    if (!fallbackProcess) {
        debugLog("No Antigravity process found after scanning all processes");
    }
    return fallbackProcess;
}
async function getProcessesLegacy() {
    // Use WMIC instead of PowerShell ConvertTo-Csv to avoid .NET Framework dependencies
    // WMIC is deprecated but still available on Windows 10 and doesn't use System.Web
    const wmicCommand = "wmic process get ProcessId,CommandLine /format:csv";
    const result = await execCommand(wmicCommand, {
        commandName: "wmic process",
    });
    if (result.error || !result.output) {
        debugLog("WMIC command failed", result.error?.message);
        return [];
    }
    const lines = result.output.trim().split("\n");
    if (lines.length < 2) {
        debugLog("WMIC output has insufficient lines");
        return [];
    }
    // WMIC CSV format: Node,CommandLine,ProcessId (order is fixed by WMIC)
    // First line is header, skip it
    const processes = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line)
            continue;
        // Parse WMIC CSV: COMPUTERNAME,"command line with spaces",1234
        // Format: Node (computer name), CommandLine, ProcessId
        const parts = line.split(",");
        if (parts.length >= 3) {
            // parts[0] = Node, parts[1] = CommandLine (may be empty), parts[2+] = ProcessId
            const pidStr = parts[parts.length - 1];
            // CommandLine is parts[1] through parts[parts.length - 2]
            const cmdLine = parts.slice(1, parts.length - 1).join(",").replace(/^"|"$/g, "");
            const pid = parseInt(pidStr, 10);
            if (!isNaN(pid) && pid > 0) {
                processes.push({
                    ProcessId: pid,
                    CommandLine: cmdLine || null,
                });
            }
        }
    }
    debugLog(`WMIC legacy approach parsed ${processes.length} processes`);
    return processes;
}
async function extractAntigravityFromProcessUnix(workspacePath) {
    const psCommand = "ps -ax -o pid=,command=";
    const result = await execCommand(psCommand, { commandName: "ps -ax" });
    if (result.error || !result.output) {
        debugLog("Unix ps command failed", result.error?.message);
        return null;
    }
    const lines = result.output.split("\n");
    const targetWorkspaceId = workspacePath ? pathToWorkspaceId(workspacePath) : null;
    if (targetWorkspaceId) {
        debugLog(`Searching for workspace: ${workspacePath}`);
        debugLog(`Target workspace ID: ${targetWorkspaceId}`);
    }
    let fallbackProcess = null;
    for (const line of lines) {
        const isLanguageServer = line.includes("language_server_macos") || line.includes("language_server");
        const isAntigravity = line.includes("--app_data_dir antigravity") ||
            line.toLowerCase().includes("/antigravity/");
        if (isLanguageServer && isAntigravity) {
            const pidMatch = line.trim().match(/^(\d+)/);
            const pid = pidMatch ? parseInt(pidMatch[1], 10) : 0;
            const csrfMatch = line.match(/--csrf_token\s+([a-f0-9-]+)/i);
            const csrfToken = csrfMatch ? csrfMatch[1] : null;
            const portMatch = line.match(/--extension_server_port\s+(\d+)/);
            const extensionServerPort = portMatch ? parseInt(portMatch[1], 10) : undefined;
            const workspaceIdMatch = line.match(/--workspace_id\s+(\S+)/);
            const workspaceId = workspaceIdMatch ? workspaceIdMatch[1] : undefined;
            debugLog(`Found Antigravity process: PID=${pid}, workspaceId=${workspaceId}`);
            if (csrfToken) {
                const processInfo = {
                    pid,
                    csrfToken,
                    extensionServerPort,
                    workspaceId,
                };
                if (targetWorkspaceId) {
                    const normalizedProcessId = normalizeWorkspaceIdForComparison(workspaceId || "");
                    const normalizedTargetId = normalizeWorkspaceIdForComparison(targetWorkspaceId);
                    debugLog(`Comparing: "${workspaceId}" === "${targetWorkspaceId}" ? ${normalizedProcessId === normalizedTargetId}`);
                    if (normalizedProcessId === normalizedTargetId) {
                        debugLog(`✓ Exact match found!`);
                        return processInfo;
                    }
                    if (!fallbackProcess) {
                        fallbackProcess = processInfo;
                    }
                }
                else {
                    return processInfo;
                }
            }
        }
    }
    if (!fallbackProcess) {
        debugLog("No Antigravity process found in Unix process scan");
    }
    return fallbackProcess;
}
async function extractOAuthToken() {
    const homeDir = os.homedir();
    const possiblePaths = [
        path.join(homeDir, "Library", "Application Support", "Antigravity", "User", "globalStorage", "state.vscdb"),
        path.join(homeDir, "Library", "Application Support", "Antigravity", "User", "state.vscdb"),
        path.join(homeDir, ".config", "Antigravity", "User", "globalStorage", "state.vscdb"),
        path.join(homeDir, "AppData", "Roaming", "Antigravity", "User", "globalStorage", "state.vscdb"),
    ];
    for (const dbPath of possiblePaths) {
        try {
            if (fs.existsSync(dbPath)) {
                const content = fs.readFileSync(dbPath);
                const contentStr = content.toString("utf8");
                const tokenMatch = contentStr.match(/ya29\.[A-Za-z0-9_-]{50,}/);
                if (tokenMatch) {
                    return tokenMatch[0];
                }
            }
        }
        catch {
            continue;
        }
    }
    return null;
}
async function discoverAntigravityPort(pid, workspacePath) {
    let processInfo = null;
    if (!pid) {
        processInfo = await extractAntigravityFromProcess(workspacePath);
        if (!processInfo?.pid) {
            return null;
        }
        pid = processInfo.pid;
    }
    let listeningPorts = [];
    if (isWindows) {
        listeningPorts = await getListeningPortsWindows(pid);
    }
    else {
        listeningPorts = await getListeningPortsUnix(pid);
    }
    if (listeningPorts.length === 0) {
        return null;
    }
    if (!processInfo) {
        processInfo = await extractAntigravityFromProcess(workspacePath);
    }
    const csrfToken = processInfo?.csrfToken;
    for (const port of listeningPorts) {
        const isGrpcPort = await probeGrpcPort(port, csrfToken);
        if (isGrpcPort) {
            return port;
        }
    }
    return null;
}
async function getListeningPortsWindows(pid) {
    debugLog(`Looking for listening ports on Windows for PID=${pid}`);
    const ports = [];
    const netstatCommand = "netstat -ano";
    const result = await execCommand(netstatCommand, { commandName: "netstat -ano" });
    if (result.error || !result.output) {
        debugLog("netstat command failed", result.error?.message);
        return ports;
    }
    const lines = result.output.split("\n");
    let listeningCount = 0;
    let pidMatchCount = 0;
    for (const line of lines) {
        if (line.includes("LISTENING")) {
            listeningCount++;
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 5) {
                const linePid = parseInt(parts[parts.length - 1], 10);
                if (linePid === pid) {
                    pidMatchCount++;
                    const localAddr = parts[1];
                    const portMatch = localAddr.match(/:(\d+)$/);
                    if (portMatch) {
                        const port = parseInt(portMatch[1], 10);
                        if (!ports.includes(port)) {
                            ports.push(port);
                            debugLog(`Found listening port ${port} for PID=${pid} (addr=${localAddr})`);
                        }
                    }
                }
            }
        }
    }
    debugLog(`netstat scan complete: ${listeningCount} LISTENING entries, ${pidMatchCount} matched PID=${pid}, ${ports.length} unique ports`);
    if (ports.length === 0) {
        debugLog(`No listening ports found for PID=${pid}. The process may not be listening or PID may be wrong.`);
    }
    return ports;
}
async function getListeningPortsUnix(pid) {
    debugLog(`Looking for listening ports on Unix for PID=${pid}`);
    const ports = [];
    const lsofCommand = `lsof -nP -iTCP -sTCP:LISTEN -p ${pid}`;
    const result = await execCommand(lsofCommand, { commandName: `lsof -p ${pid}` });
    if (result.error || !result.output) {
        debugLog("lsof command failed", result.error?.message);
        return ports;
    }
    const lines = result.output.split("\n");
    for (const line of lines) {
        if (line.includes("TCP") && line.includes("LISTEN")) {
            const portMatch = line.match(/:(\d+)\s*\(LISTEN\)/);
            if (portMatch) {
                const port = parseInt(portMatch[1], 10);
                if (!ports.includes(port)) {
                    ports.push(port);
                    debugLog(`Found listening port ${port} for PID=${pid}`);
                }
            }
        }
    }
    debugLog(`lsof scan complete: found ${ports.length} unique listening ports for PID=${pid}`);
    return ports;
}
async function probeGrpcPort(port, csrfToken) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            resolve(false);
        }, 2000);
        try {
            const client = http2.connect(`https://127.0.0.1:${port}`, {
                rejectUnauthorized: false,
            });
            client.on("error", () => {
                clearTimeout(timeout);
                client.close();
                resolve(false);
            });
            client.on("connect", () => {
                const metadata = Buffer.concat([
                    (0, protobuf_1.ldField)(1, "antigravity"),
                    (0, protobuf_1.ldField)(4, "en"),
                ]);
                const payload = (0, protobuf_1.ldField)(1, metadata);
                const req = client.request({
                    ":method": "POST",
                    ":path": "/exa.language_server_pb.LanguageServerService/GetUnleashData",
                    "content-type": "application/proto",
                    "connect-protocol-version": "1",
                    "x-codeium-csrf-token": csrfToken || "",
                    "content-length": payload.length.toString(),
                });
                req.on("response", (headers) => {
                    clearTimeout(timeout);
                    client.close();
                    resolve(headers[":status"] === 200);
                });
                req.on("error", () => {
                    clearTimeout(timeout);
                    client.close();
                    resolve(false);
                });
                req.write(payload);
                req.end();
            });
        }
        catch {
            clearTimeout(timeout);
            resolve(false);
        }
    });
}
//# sourceMappingURL=discovery.js.map