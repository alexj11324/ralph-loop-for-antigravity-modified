import * as http2 from 'http2';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Test script to test all models in Fast and Planning mode.
 * This tests different sendMessage payload structures to find the correct encoding.
 */

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

// Model IDs from observed traffic
const MODEL_MAP: Record<string, number> = {
    'Gemini 3 Flash': 1018,
    'Gemini 3 Pro (Low)': 1007,
    'Gemini 3 Pro (High)': 1008,
    'Claude Sonnet 4.5': 333,
    'Claude Sonnet 4.5 (Thinking)': 334,
    'Claude Opus 4.5 (Thinking)': 1012,
    'GPT-OSS-120B (Medium)': 342,
};

const SAFETY_CONFIG_HEX = '2a690a631204200170006a4c42451a43120275761a07676974206164641a096769742073746173681a096769742072657365741a0c67697420636865636b6f75741a09707974686f6e202d631a0370697030038a020208017a0308fa07aa0102080182020208013a0208015801';

// Probe a port to check if it responds to gRPC/Connect
async function probeGrpcPort(port: number, csrfToken: string): Promise<boolean> {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 2000);

        try {
            const client = http2.connect(`https://127.0.0.1:${port}`);

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

// Extract credentials from running Antigravity process
async function extractAntigravityCredentials(): Promise<{ port: number; csrfToken: string; oauthToken: string } | null> {
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
            const lines = psOutput.split('\n');

            for (const line of lines) {
                const isLanguageServer = line.includes('language_server_macos') || line.includes('language_server');
                const isAntigravity = line.includes('--app_data_dir antigravity') || line.toLowerCase().includes('/antigravity/');

                if (isLanguageServer && isAntigravity) {
                    const pidMatch = line.trim().match(/^(\d+)/);
                    const csrfMatch = line.match(/--csrf_token\s+([a-f0-9-]+)/i);

                    if (pidMatch) pid = parseInt(pidMatch[1], 10);
                    if (csrfMatch) csrfToken = csrfMatch[1];
                }
            }
        }

        if (!pid || !csrfToken) {
            console.error('Could not extract PID or CSRF token from Antigravity process');
            return null;
        }

        console.log(`Found Antigravity process: pid=${pid}, csrf=${csrfToken.substring(0, 8)}...`);

        // Discover gRPC port
        let listeningPorts: number[] = [];

        if (isWindows) {
            try {
                const netstatOutput = execSync('netstat -ano', { encoding: 'utf8', maxBuffer: 1024 * 1024 });
                for (const line of netstatOutput.split('\n')) {
                    if (line.includes('LISTENING') && line.includes(pid.toString())) {
                        const match = line.match(/:(\d+)\s+/);
                        if (match) {
                            const port = parseInt(match[1], 10);
                            if (!listeningPorts.includes(port)) listeningPorts.push(port);
                        }
                    }
                }
            } catch {
                console.error('netstat failed');
                return null;
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

        // Extract OAuth token
        const homeDir = os.homedir();
        let dbPath: string;

        if (isWindows) {
            dbPath = path.join(homeDir, 'AppData', 'Roaming', 'Antigravity', 'User', 'globalStorage', 'state.vscdb');
        } else {
            dbPath = path.join(homeDir, 'Library', 'Application Support', 'Antigravity', 'User', 'globalStorage', 'state.vscdb');
        }

        let oauthToken: string | null = null;

        if (fs.existsSync(dbPath)) {
            const content = fs.readFileSync(dbPath).toString('utf8');
            const tokenMatch = content.match(/ya29\.[A-Za-z0-9_-]{50,}/);
            if (tokenMatch) oauthToken = tokenMatch[0];
        }

        if (!oauthToken) {
            console.error('Could not extract OAuth token');
            return null;
        }

        return { port: grpcPort, csrfToken, oauthToken };
    } catch (error) {
        console.error('Failed to extract credentials:', error);
        return null;
    }
}

async function testAllModelsAndModes() {
    const credentials = await extractAntigravityCredentials();
    if (!credentials) {
        console.error('Could not get Antigravity credentials. Is Antigravity running?');
        process.exit(1);
    }

    const { port: PORT, csrfToken: CSRF_TOKEN, oauthToken: OAUTH_TOKEN } = credentials;

    const buildMetadata = () => Buffer.concat([
        ldField(1, 'antigravity'),
        ldField(3, OAUTH_TOKEN),
        ldField(4, 'en'),
        ldField(7, '1.14.2'),
        ldField(12, 'antigravity'),
    ]);

    // Start cascade with planning mode
    async function startCascade(client: http2.ClientHttp2Session, enablePlanning: boolean): Promise<string> {
        const inner = buildMetadata();
        const outer = Buffer.concat([
            ldField(1, inner),
            Buffer.from([0x20, enablePlanning ? 0x01 : 0x00])  // field 4, bool: enable_planning
        ]);

        return new Promise((resolve, reject) => {
            const req = client.request({
                ':method': 'POST',
                ':path': '/exa.language_server_pb.LanguageServerService/StartCascade',
                'content-type': 'application/proto',
                'connect-protocol-version': '1',
                'origin': 'vscode-file://vscode-app',
                'x-codeium-csrf-token': CSRF_TOKEN,
                'content-length': outer.length.toString()
            });

            let responseData = Buffer.alloc(0);
            req.on('data', (chunk) => { responseData = Buffer.concat([responseData, chunk]); });
            req.on('end', () => {
                if (responseData.length > 0) {
                    const len = responseData[1];
                    const id = responseData.slice(2, 2 + len).toString();
                    resolve(id);
                } else {
                    reject(new Error('Empty response from StartCascade'));
                }
            });
            req.on('error', reject);
            req.write(outer);
            req.end();
        });
    }

    // Test different sendMessage payloads
    interface SendResult {
        status: number;
        body: string;
    }

    async function sendMessageVariant(
        client: http2.ClientHttp2Session,
        cascadeId: string,
        text: string,
        variant: string,
        modeField?: Buffer,
        modelField?: Buffer
    ): Promise<SendResult> {
        const messageBody = ldField(1, text);

        const parts = [
            ldField(1, cascadeId),
            ldField(2, messageBody),
            ldField(3, buildMetadata()),
            Buffer.from(SAFETY_CONFIG_HEX, 'hex')
        ];

        if (modeField) parts.push(modeField);
        if (modelField) parts.push(modelField);

        const outer = Buffer.concat(parts);

        return new Promise((resolve) => {
            const req = client.request({
                ':method': 'POST',
                ':path': '/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage',
                'content-type': 'application/proto',
                'connect-protocol-version': '1',
                'origin': 'vscode-file://vscode-app',
                'x-codeium-csrf-token': CSRF_TOKEN,
                'content-length': outer.length.toString()
            });

            let responseData = Buffer.alloc(0);
            let status = 0;

            req.on('data', (chunk: Buffer) => {
                responseData = Buffer.concat([responseData, chunk]);
            });

            req.on('response', (headers) => {
                status = headers[':status'] as number;
            });

            req.on('end', () => {
                resolve({
                    status,
                    body: responseData.toString('utf8').substring(0, 200)
                });
            });

            req.on('error', (err) => {
                resolve({
                    status: 0,
                    body: err.message
                });
            });

            req.write(outer);
            req.end();
        });
    }

    // Delete trajectory
    async function deleteTrajectory(client: http2.ClientHttp2Session, cascadeId: string): Promise<void> {
        const outer = ldField(1, cascadeId);

        return new Promise((resolve) => {
            const req = client.request({
                ':method': 'POST',
                ':path': '/exa.language_server_pb.LanguageServerService/DeleteCascadeTrajectory',
                'content-type': 'application/proto',
                'connect-protocol-version': '1',
                'origin': 'vscode-file://vscode-app',
                'x-codeium-csrf-token': CSRF_TOKEN,
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
    console.log('\n========================================');
    console.log('Testing All Models in Fast and Planning Mode');
    console.log('========================================\n');

    const client = http2.connect(`https://127.0.0.1:${PORT}`);

    const results: { variant: string; mode: string; model: string; status: number; body: string }[] = [];
    const prompt = 'Say "Hello" and nothing else.';

    // Test 1: No mode/model fields (baseline - should work)
    {
        console.log('--- Test 1: No mode/model fields (baseline) ---');
        const cascadeId = await startCascade(client, false);
        console.log(`Cascade ID: ${cascadeId.substring(0, 8)}...`);

        const result = await sendMessageVariant(client, cascadeId, prompt, 'baseline');
        console.log(`  Status: ${result.status}, Body: ${result.body.substring(0, 100)}`);
        results.push({ variant: 'baseline', mode: 'N/A', model: 'N/A', ...result });

        await deleteTrajectory(client, cascadeId);
        await new Promise(r => setTimeout(r, 500));
    }

    // Test 2: Mode field only (Field 14)
    for (const mode of ['Fast', 'Planning']) {
        console.log(`\n--- Test 2: Mode field only (${mode}) ---`);
        const cascadeId = await startCascade(client, mode === 'Planning');
        console.log(`Cascade ID: ${cascadeId.substring(0, 8)}...`);

        const planningMode = mode === 'Planning' ? 1 : 0;
        const modeField = Buffer.from([0x70, planningMode]); // Field 14, varint

        const result = await sendMessageVariant(client, cascadeId, prompt, 'mode-only', modeField);
        console.log(`  Mode field: ${modeField.toString('hex')}`);
        console.log(`  Status: ${result.status}, Body: ${result.body.substring(0, 100)}`);
        results.push({ variant: 'mode-only', mode, model: 'N/A', ...result });

        await deleteTrajectory(client, cascadeId);
        await new Promise(r => setTimeout(r, 500));
    }

    // Test 3: Mode + Model fields (current extension approach)
    for (const mode of ['Fast', 'Planning']) {
        for (const [modelName, modelId] of Object.entries(MODEL_MAP)) {
            console.log(`\n--- Test 3: Mode + Model (${mode}, ${modelName}) ---`);
            const cascadeId = await startCascade(client, mode === 'Planning');
            console.log(`Cascade ID: ${cascadeId.substring(0, 8)}...`);

            const planningMode = mode === 'Planning' ? 1 : 0;
            const modeField = Buffer.from([0x70, planningMode]); // Field 14

            const modelConfig = Buffer.concat([
                Buffer.from([0x08]), // field 1, varint
                encodeVarint(modelId),
            ]);
            const modelField = ldField(15, modelConfig); // Field 15

            const result = await sendMessageVariant(client, cascadeId, prompt, 'mode+model', modeField, modelField);
            console.log(`  Mode: ${modeField.toString('hex')}, Model (${modelId}): ${modelField.toString('hex')}`);
            console.log(`  Status: ${result.status}, Body: ${result.body.substring(0, 100)}`);
            results.push({ variant: 'mode+model', mode, model: modelName, ...result });

            await deleteTrajectory(client, cascadeId);
            await new Promise(r => setTimeout(r, 500));

            // Stop early if we find a working combination
            if (result.status === 200) {
                console.log('\n[PASS] FOUND WORKING COMBINATION!');
                break;
            }
        }
    }

    client.close();

    // Summary
    console.log('\n========================================');
    console.log('RESULTS SUMMARY');
    console.log('========================================\n');

    for (const r of results) {
        const marker = r.status === 200 ? '[PASS]' : '[FAIL]';
        console.log(`${marker} ${r.variant.padEnd(12)} | ${r.mode.padEnd(10)} | ${r.model.padEnd(30)} | ${r.status} | ${r.body.substring(0, 50)}`);
    }

    const success = results.filter(r => r.status === 200);
    const failures = results.filter(r => r.status !== 200);

    console.log(`\nSuccess: ${success.length}/${results.length}`);
    console.log(`Failures: ${failures.length}/${results.length}`);

    process.exit(failures.length === results.length ? 1 : 0);
}

testAllModelsAndModes();
