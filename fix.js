const fs = require('fs');

const targetFile = 'out/antigravityClient/discovery.js';

let fileContent = fs.readFileSync(targetFile, 'utf8');

const regex = /function execCommand\(command, options = \{\}\) \{\n    const cmdName = options.commandName \|\| command.slice\(0, 50\);\n    debugLog\(`Executing command: \$\{cmdName\}`\);\n    debugLog\(`Full command`, command\);\n    try \{\n        const output = \(0, child_process_1.execSync\)\(command, \{\n            encoding: "utf8",\n            maxBuffer: 10 \* 1024 \* 1024,\n            \.\.\.options,\n        \}\);/g;

const replacement = `function execCommand(command, args = [], options = {}) {
    if (typeof command === 'string' && arguments.length === 2 && !Array.isArray(arguments[1])) {
        // Handle legacy call: execCommand('cmd arg1 arg2', {options})
        options = arguments[1] || {};

        // We're switching from execSync to execFileSync for security against command injection.
        // For backwards compatibility with calls passing strings, parse them

        // If it looks like a powershell command, preserve the whole command string
        // this is tricky since we really should be using spawn/execFile with proper array args
        if (command.startsWith('powershell.exe')) {
             const parts = command.match(/(?:[^\\s"]+|"[^"]*")+/g);
             if (parts && parts.length > 0) {
                 command = parts[0];
                 args = parts.slice(1).map(p => p.replace(/^"|"$/g, ''));
             } else {
                 args = [];
             }
        }
        else if (command.startsWith('wmic ')) {
            args = command.substring(5).split(' ');
            command = 'wmic';
        }
        else if (command.startsWith('ps ')) {
             args = command.substring(3).split(' ').filter(x => x);
             command = 'ps';
        }
        else if (command.startsWith('netstat ')) {
             args = command.substring(8).split(' ').filter(x => x);
             command = 'netstat';
        }
        else if (command.startsWith('lsof ')) {
             args = command.substring(5).split(' ').filter(x => x);
             command = 'lsof';
        }
        else {
             // Fallback for simple space delimited commands
             const parts = command.split(' ').filter(x => x);
             command = parts[0];
             args = parts.slice(1);
        }
    }

    const cmdName = options.commandName || (command + ' ' + args.join(' ')).slice(0, 50);
    debugLog(\`Executing command: \${cmdName}\`);
    debugLog(\`Command: \${command}, args: \${JSON.stringify(args)}\`);
    try {
        const output = (0, child_process_1.execFileSync)(command, args, {
            encoding: "utf8",
            maxBuffer: 10 * 1024 * 1024,
            ...options,
        });`;

fileContent = fileContent.replace(regex, replacement);

const psReplaceRegex = /const result = execCommand\(psCommand, \{\n            commandName: "Get-CimInstance Win32_Process",\n        \}\);/g;
fileContent = fileContent.replace(psReplaceRegex, `const result = execCommand("powershell.exe", ["-NoProfile", "-Command", "Get-CimInstance Win32_Process | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress"], {\n            commandName: "Get-CimInstance Win32_Process",\n        });`);


const wmicReplaceRegex = /const wmicCommand = "wmic process get ProcessId,CommandLine \/format:csv";\n    const result = execCommand\(wmicCommand, \{\n        commandName: "wmic process",\n    \}\);/g;
fileContent = fileContent.replace(wmicReplaceRegex, `const result = execCommand("wmic", ["process", "get", "ProcessId,CommandLine", "/format:csv"], {\n        commandName: "wmic process",\n    });`);

const unixPsReplaceRegex = /const psCommand = "ps -ax -o pid=,command=";\n    const result = execCommand\(psCommand, \{ commandName: "ps -ax" \}\);/g;
fileContent = fileContent.replace(unixPsReplaceRegex, `const result = execCommand("ps", ["-ax", "-o", "pid=,command="], { commandName: "ps -ax" });`);


const netstatReplaceRegex = /const netstatCommand = "netstat -ano";\n    const result = execCommand\(netstatCommand, \{ commandName: "netstat -ano" \}\);/g;
fileContent = fileContent.replace(netstatReplaceRegex, `const result = execCommand("netstat", ["-ano"], { commandName: "netstat -ano" });`);


const lsofReplaceRegex = /const lsofCommand = \`lsof -nP -iTCP -sTCP:LISTEN -p \$\{pid\}\`;\n    const result = execCommand\(lsofCommand, \{ commandName: \`lsof -p \$\{pid\}\` \}\);/g;
fileContent = fileContent.replace(lsofReplaceRegex, `const result = execCommand("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-p", pid.toString()], { commandName: \`lsof -p \$\{pid\}\` });`);

fs.writeFileSync(targetFile, fileContent, 'utf8');
