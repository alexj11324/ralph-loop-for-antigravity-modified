import * as http2 from 'http2';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Test script to verify model selection works by testing the new nested Field 15 encoding.
 * This matches exactly what the captured Antigravity traffic uses.
 */

// Model IDs (same as in src/antigravityClient/protobuf.ts)
const MODEL_IDS: Record<string, number> = {
    'Gemini 3 Flash': 1018,
    'Gemini 3 Pro (Low)': 1007,
    'Gemini 3 Pro (High)': 1008,
    'Claude Sonnet 4.5': 333,
    'Claude Sonnet 4.5 (Thinking)': 334,
    'Claude Opus 4.5 (Thinking)': 1012,
    'GPT-OSS-120B (Medium)': 342,
};

// Protobuf Helper: Length-delimited field
function ldField(tag: number, data: string | Buffer): Buffer {
    const tagByte = (tag << 3) | 2;
    const body = typeof data === 'string' ? Buffer.from(data) : data;
    let l = body.length;
    let lenBytes: number[] = [];
    if (l < 128) { lenBytes = [l]; } else { lenBytes = [(l & 0x7F) | 0x80, l >> 7]; }
    return Buffer.concat([Buffer.from([tagByte]), Buffer.from(lenBytes), body]);
}

// Encode varint
function encodeVarint(value: number): Buffer {
    const bytes: number[] = [];
    while (value > 0x7f) {
        bytes.push((value & 0x7f) | 0x80);
        value >>= 7;
    }
    bytes.push(value & 0x7f);
    return Buffer.from(bytes);
}

// Build safety config with model ID (Field 5)
function buildSafetyConfig(modelName: string): Buffer {
    const modelId = MODEL_IDS[modelName] || MODEL_IDS['Gemini 3 Flash'];

    // Build the model ID field dynamically
    const modelIdVarint = encodeVarint(modelId);
    const modelField = Buffer.concat([
        Buffer.from([0x08]), // Field 1, varint
        modelIdVarint,
    ]);
    const field15 = Buffer.concat([
        Buffer.from([0x7a]), // Field 15, length-delimited
        Buffer.from([modelField.length]), // Length
        modelField,
    ]);

    // Content before model ID (from captured traffic)
    const beforeModel = Buffer.from(
        '0a631204200170006a4c42451a43120275761a07676974206164641a096769742073746173681a096769742072657365741a0c67697420636865636b6f75741a09707974686f6e202d631a0370697030038a02020801',
        'hex',
    );

    // Content after model ID (from captured traffic)
    const afterModel = Buffer.from(
        'aa0102080182020208013a0208015801',
        'hex',
    );

    const innerContent = Buffer.concat([beforeModel, field15, afterModel]);

    return Buffer.concat([
        Buffer.from([0x2a]), // Field 5, length-delimited
        encodeVarint(innerContent.length),
        innerContent,
    ]);
}

async function probeGrpcPort(port: number, csrfToken: string): Promise<boolean> {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 2000);

        try {
            const client = http2.connect(`https://127.0.0.1:${port}`, { rejectUnauthorized: false });

            client.on('error', () => {
                clearTimeout(timeout);
                client.close();
                resolve(false);
            });

            client.on('connect', () => {
                const metadata = Buffer.concat([
                    ldField(1, 'antigravity'),
                    ldField(4, 'en'),
                ]);
                const payload = ldField(1, metadata);

                const req = client.request({
                    ':method': 'POST',
                    ':path': '/exa.language_server_pb.LanguageServerService/GetUnleashData',
                    'content-type': 'application/proto',
                    'connect-protocol-version': '1',
                    'x-codeium-csrf-token': csrfToken,
                    'content-length': payload.length.toString(),
                });

                req.on('response', (headers) => {
                    clearTimeout(timeout);
                    client.close();
                    resolve(headers[':status'] === 200);
                });

                req.on('error', () => {
                    clearTimeout(timeout);
                    client.close();
                    resolve(false);
                });

                req.write(payload);
                req.end();
            });
        } catch {
            clearTimeout(timeout);
            resolve(false);
        }
    });
}

async function extractCredentials(): Promise<{ port: number; csrfToken: string; oauthToken: string } | null> {
    const isWindows = process.platform === 'win32';

    try {
        let pid: number | null = null;
        let csrfToken: string | null = null;

        if (isWindows) {
            const psOutput = execSync(
                'powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress"',
                { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
            );

            const processes = JSON.parse(psOutput);
            for (const proc of processes) {
                if (!proc.CommandLine) continue;
                const cmdLine = proc.CommandLine;

                const isLanguageServer = cmdLine.includes('language_server_windows') || cmdLine.includes('language_server');
                const isAntigravity = cmdLine.includes('--app_data_dir antigravity') || cmdLine.toLowerCase().includes('\\antigravity\\');

                if (isLanguageServer && isAntigravity) {
                    pid = proc.ProcessId;
                    const csrfMatch = cmdLine.match(/--csrf_token\s+([a-f0-9-]+)/i);
                    if (csrfMatch) csrfToken = csrfMatch[1];
                    if (pid && csrfToken) break;
                }
            }
        } else {
            const psOutput = execSync('ps -ax -o pid=,command=', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
            for (const line of psOutput.split('\n')) {
                const isLanguageServer = line.includes('language_server_macos') || line.includes('language_server');
                const isAntigravity = line.includes('--app_data_dir antigravity') || line.toLowerCase().includes('/antigravity/');

                if (isLanguageServer && isAntigravity) {
                    const pidMatch = line.trim().match(/^(\d+)/);
                    const csrfMatch = line.match(/--csrf_token\s+([a-f0-9-]+)/i);
                    if (pidMatch) pid = parseInt(pidMatch[1], 10);
                    if (csrfMatch) csrfToken = csrfMatch[1];
                    if (pid && csrfToken) break;
                }
            }
        }

        if (!pid || !csrfToken) {
            console.error('Could not find Antigravity process');
            return null;
        }

        console.log(`Found Antigravity: pid=${pid}, csrf=${csrfToken.substring(0, 8)}...`);

        let listeningPorts: number[] = [];

        if (isWindows) {
            const netstatOutput = execSync('netstat -ano', { encoding: 'utf8', maxBuffer: 1024 * 1024 });
            for (const line of netstatOutput.split('\n')) {
                if (line.includes('LISTENING')) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 5) {
                        const linePid = parseInt(parts[parts.length - 1], 10);
                        if (linePid === pid) {
                            const localAddr = parts[1];
                            const portMatch = localAddr.match(/:(\d+)$/);
                            if (portMatch) {
                                const port = parseInt(portMatch[1], 10);
                                if (!listeningPorts.includes(port)) listeningPorts.push(port);
                            }
                        }
                    }
                }
            }
        } else {
            try {
                const lsofOutput = execSync(`lsof -nP -iTCP -sTCP:LISTEN -p ${pid}`, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
                for (const line of lsofOutput.split('\n')) {
                    if (line.includes('TCP') && line.includes('LISTEN')) {
                        const portMatch = line.match(/:(\d+)\s*\(LISTEN\)/);
                        if (portMatch) {
                            const port = parseInt(portMatch[1], 10);
                            if (!listeningPorts.includes(port)) listeningPorts.push(port);
                        }
                    }
                }
            } catch {
                console.error('lsof failed');
                return null;
            }
        }

        console.log(`Found ${listeningPorts.length} listening ports`);

        let grpcPort: number | null = null;
        for (const port of listeningPorts) {
            const isGrpc = await probeGrpcPort(port, csrfToken);
            if (isGrpc) {
                grpcPort = port;
                console.log(`Found gRPC port: ${port}`);
                break;
            }
        }

        if (!grpcPort) {
            console.error('Could not find gRPC port');
            return null;
        }

        const homeDir = os.homedir();
        const possiblePaths = isWindows
            ? [path.join(homeDir, 'AppData', 'Roaming', 'Antigravity', 'User', 'globalStorage', 'state.vscdb')]
            : [
                path.join(homeDir, 'Library', 'Application Support', 'Antigravity', 'User', 'globalStorage', 'state.vscdb'),
                path.join(homeDir, 'Library', 'Application Support', 'Antigravity', 'User', 'state.vscdb'),
            ];

        let oauthToken: string | null = null;
        for (const dbPath of possiblePaths) {
            try {
                const content = await fs.promises.readFile(dbPath);
                const contentStr = content.toString('utf8');
                const tokenMatch = contentStr.match(/ya29\.[A-Za-z0-9_-]{50,}/);
                if (tokenMatch) {
                    oauthToken = tokenMatch[0];
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!oauthToken) {
            console.error('Could not extract OAuth token');
            return null;
        }

        return { port: grpcPort, csrfToken, oauthToken };
    } catch (error) {
        console.error('Error:', error);
        return null;
    }
}

async function testModelSelection() {
    const creds = await extractCredentials();
    if (!creds) {
        console.error('Could not get credentials. Is Antigravity running?');
        process.exit(1);
    }

    const { port, csrfToken, oauthToken } = creds;

    const buildMetadata = () => Buffer.concat([
        ldField(1, 'antigravity'),
        ldField(3, oauthToken),
        ldField(4, 'en'),
        ldField(7, '1.15.6'),
        ldField(12, 'antigravity'),
    ]);

    async function startCascade(client: http2.ClientHttp2Session): Promise<string> {
        const inner = buildMetadata();
        const outer = Buffer.concat([ldField(1, inner), Buffer.from([0x20, 0x00])]);

        return new Promise((resolve, reject) => {
            const req = client.request({
                ':method': 'POST',
                ':path': '/exa.language_server_pb.LanguageServerService/StartCascade',
                'content-type': 'application/proto',
                'connect-protocol-version': '1',
                'origin': 'vscode-file://vscode-app',
                'x-codeium-csrf-token': csrfToken,
                'content-length': outer.length.toString()
            });

            let data = Buffer.alloc(0);
            req.on('data', (chunk) => { data = Buffer.concat([data, chunk]); });
            req.on('end', () => {
                if (data.length > 2) {
                    const len = data[1];
                    resolve(data.slice(2, 2 + len).toString());
                } else {
                    reject(new Error('Empty response'));
                }
            });
            req.on('error', reject);
            req.write(outer);
            req.end();
        });
    }

    async function sendMessage(
        client: http2.ClientHttp2Session,
        cascadeId: string,
        text: string,
        mode: string,
        modelName: string
    ): Promise<{ status: number; body: string }> {
        const messageBody = ldField(1, text);
        const planningMode = mode === 'Planning' ? 1 : 0;
        const modeField = Buffer.from([0x70, planningMode]);
        const safetyConfig = buildSafetyConfig(modelName);

        const payload = Buffer.concat([
            ldField(1, cascadeId),
            ldField(2, messageBody),
            ldField(3, buildMetadata()),
            safetyConfig,
            modeField,
        ]);

        return new Promise((resolve) => {
            const req = client.request({
                ':method': 'POST',
                ':path': '/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage',
                'content-type': 'application/proto',
                'connect-protocol-version': '1',
                'origin': 'vscode-file://vscode-app',
                'x-codeium-csrf-token': csrfToken,
                'content-length': payload.length.toString()
            });

            let data = Buffer.alloc(0);
            let status = 0;

            req.on('data', (chunk: Buffer) => { data = Buffer.concat([data, chunk]); });
            req.on('response', (headers) => { status = headers[':status'] as number; });
            req.on('end', () => resolve({ status, body: data.toString('utf8').substring(0, 100) }));
            req.on('error', (err) => resolve({ status: 0, body: err.message }));
            req.write(payload);
            req.end();
        });
    }

    async function deleteTrajectory(client: http2.ClientHttp2Session, cascadeId: string): Promise<void> {
        const outer = ldField(1, cascadeId);
        return new Promise((resolve) => {
            const req = client.request({
                ':method': 'POST',
                ':path': '/exa.language_server_pb.LanguageServerService/DeleteCascadeTrajectory',
                'content-type': 'application/proto',
                'connect-protocol-version': '1',
                'origin': 'vscode-file://vscode-app',
                'x-codeium-csrf-token': csrfToken,
                'content-length': outer.length.toString()
            });
            req.on('response', () => resolve());
            req.on('error', () => resolve());
            req.write(outer);
            req.end();
        });
    }

    // =====================
    // MAIN TEST
    // =====================
    console.log('\n=== Testing All Models with New Encoding ===\n');

    const client = http2.connect(`https://127.0.0.1:${port}`, { rejectUnauthorized: false });
    const results: { model: string; mode: string; status: number; ok: boolean }[] = [];

    for (const modelName of Object.keys(MODEL_IDS)) {
        for (const mode of ['Fast', 'Planning']) {
            console.log(`Testing: ${mode} ${modelName}...`);

            const cascadeId = await startCascade(client);
            const result = await sendMessage(client, cascadeId, 'hi', mode, modelName);

            const ok = result.status === 200;
            console.log(`  ${ok ? '[PASS]' : '[FAIL]'} Status: ${result.status}`);

            results.push({ model: modelName, mode, status: result.status, ok });

            await deleteTrajectory(client, cascadeId);
            await new Promise(r => setTimeout(r, 300));
        }
    }

    client.close();

    // Summary
    console.log('\n=== RESULTS ===\n');
    const success = results.filter(r => r.ok);
    const failures = results.filter(r => !r.ok);

    console.log('[PASS] Passed:');
    for (const r of success) {
        console.log(`   ${r.mode} ${r.model}`);
    }

    if (failures.length > 0) {
        console.log('\n[FAIL] Failed:');
        for (const r of failures) {
            console.log(`   ${r.mode} ${r.model} (status ${r.status})`);
        }
    }

    console.log(`\nTotal: ${success.length}/${results.length} passed`);
    process.exit(failures.length > 0 ? 1 : 0);
}

testModelSelection();
