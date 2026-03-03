const fs = require('fs');

const targetFile = 'out/antigravityClient/discovery.js';
let content = fs.readFileSync(targetFile, 'utf8');

// Replace the actual execCommand definition
const searchDef = `function execCommand(command, options = {}) {
    const cmdName = options.commandName || command.slice(0, 50);
    debugLog(\`Executing command: \${cmdName}\`);
    debugLog(\`Full command\`, command);
    try {
        const output = (0, child_process_1.execSync)(command, {
            encoding: "utf8",
            maxBuffer: 10 * 1024 * 1024,
            ...options,
        });`;

const replaceDef = `function execCommand(command, argsOrOptions = [], options = {}) {
    let args = [];
    let opts = options;

    // Support old signature: execCommand(commandString, options)
    if (!Array.isArray(argsOrOptions)) {
        opts = argsOrOptions || {};
        const parts = command.match(/(?:[^\\s"]+|"[^"]*")+/g) || [];
        if (parts.length > 0) {
            command = parts[0];
            args = parts.slice(1).map(p => p.replace(/^"|"$/g, ''));
        }
    } else {
        args = argsOrOptions;
    }

    const cmdName = opts.commandName || (command + ' ' + args.join(' ')).slice(0, 50);
    debugLog(\`Executing command: \${cmdName}\`);
    debugLog(\`Command: \${command} args: \${JSON.stringify(args)}\`);
    try {
        const output = (0, child_process_1.execFileSync)(command, args, {
            encoding: "utf8",
            maxBuffer: 10 * 1024 * 1024,
            ...opts,
        });`;

content = content.replace(searchDef, replaceDef);

// Make sure other usages are updated
content = content.replace(/const psCommand = 'powershell\.exe -NoProfile -Command "Get-CimInstance Win32_Process \| Select-Object ProcessId, CommandLine \| ConvertTo-Json -Compress"';\s+const result = execCommand\(psCommand, {\s+commandName: "Get-CimInstance Win32_Process",\s+}\);/g,
`const result = execCommand('powershell.exe', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress'], {
            commandName: "Get-CimInstance Win32_Process",
        });`);

content = content.replace(/const wmicCommand = "wmic process get ProcessId,CommandLine \/format:csv";\s+const result = execCommand\(wmicCommand, {\s+commandName: "wmic process",\s+}\);/g,
`const result = execCommand('wmic', ['process', 'get', 'ProcessId,CommandLine', '/format:csv'], {
        commandName: "wmic process",
    });`);

content = content.replace(/const psCommand = "ps -ax -o pid=,command=";\s+const result = execCommand\(psCommand, { commandName: "ps -ax" }\);/g,
`const result = execCommand('ps', ['-ax', '-o', 'pid=,command='], { commandName: "ps -ax" });`);

content = content.replace(/const netstatCommand = "netstat -ano";\s+const result = execCommand\(netstatCommand, { commandName: "netstat -ano" }\);/g,
`const result = execCommand('netstat', ['-ano'], { commandName: "netstat -ano" });`);

content = content.replace(/const lsofCommand = `lsof -nP -iTCP -sTCP:LISTEN -p \$\{pid\}`;\s+const result = execCommand\(lsofCommand, { commandName: `lsof -p \$\{pid\}` }\);/g,
`const result = execCommand('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-p', pid.toString()], { commandName: \`lsof -p \$\{pid\}\` });`);

// The "ver" and reg query calls in getWindowsVersionInfo
content = content.replace(/\(0, child_process_1\.execSync\)\("ver", { encoding: "utf8" }\)/g,
`(0, child_process_1.execFileSync)("cmd.exe", ["/c", "ver"], { encoding: "utf8" })`);

content = content.replace(/\(0, child_process_1\.execSync\)\('reg query "HKLM\\\\SOFTWARE\\\\Microsoft\\\\Windows NT\\\\CurrentVersion" \/v CurrentBuildNumber', { encoding: "utf8" }\)/g,
`(0, child_process_1.execFileSync)("reg.exe", ["query", "HKLM\\\\SOFTWARE\\\\Microsoft\\\\Windows NT\\\\CurrentVersion", "/v", "CurrentBuildNumber"], { encoding: "utf8" })`);

fs.writeFileSync(targetFile, content, 'utf8');
