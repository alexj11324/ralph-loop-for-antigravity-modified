import * as http2 from 'http2';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Test script for Antigravity API using GetCascadeTrajectorySteps polling.
 * Task: Create a.py and b.py, then delete them via bash command.
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

// Parse protobuf fields from raw bytes
interface ProtoField {
    fieldNum: number;
    wireType: number;
    value: number | string | Buffer;
    offset: number;
}

function parseProtobufFields(buf: Buffer, maxBytes: number = 100): ProtoField[] {
    const fields: ProtoField[] = [];
    let pos = 0;
    const limit = Math.min(buf.length, maxBytes);

    while (pos < limit) {
        const startPos = pos;
        const tag = buf[pos++];
        if (tag === undefined) break;

        const fieldNum = tag >> 3;
        const wireType = tag & 0x07;

        let value: number | string | Buffer;

        try {
            switch (wireType) {
                case 0: // Varint
                    let varint = 0;
                    let shift = 0;
                    while (pos < limit) {
                        const byte = buf[pos++];
                        varint |= (byte & 0x7F) << shift;
                        if ((byte & 0x80) === 0) break;
                        shift += 7;
                    }
                    value = varint;
                    break;
                case 1: // 64-bit
                    value = Number(buf.readBigInt64LE(pos));
                    pos += 8;
                    break;
                case 2: // Length-delimited
                    let len = 0;
                    let lenShift = 0;
                    while (pos < limit) {
                        const byte = buf[pos++];
                        len |= (byte & 0x7F) << lenShift;
                        if ((byte & 0x80) === 0) break;
                        lenShift += 7;
                    }
                    value = buf.slice(pos, pos + len);
                    pos += len;
                    break;
                case 5: // 32-bit
                    value = buf.readInt32LE(pos);
                    pos += 4;
                    break;
                default:
                    value = `unknown:${wireType}`;
                    break;
            }

            fields.push({ fieldNum, wireType, value, offset: startPos });
        } catch {
            break; // Stop on parse error
        }
    }

    return fields;
}

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
            // Windows: Use PowerShell Get-CimInstance
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
            // Unix: Use ps command
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
            // Windows: Use netstat
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
            // Unix: Use lsof
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

        // Probe each port to find the gRPC port
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

        // Extract OAuth token from Antigravity storage
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
        } else {
            console.error(`OAuth token database not found at: ${dbPath}`);
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

async function testAntigravityAPI() {
    const credentials = await extractAntigravityCredentials();
    if (!credentials) {
        console.error('Could not get Antigravity credentials. Is Antigravity running?');
        process.exit(1);
    }

    const { port: PORT, csrfToken: CSRF_TOKEN, oauthToken: OAUTH_TOKEN } = credentials;

    const MODEL_IDS: Record<string, number> = {
        'Gemini 3 Flash': 1018,
        'Gemini 3 Pro (Low)': 1007,
        'Gemini 3 Pro (High)': 1008,
        'Claude Sonnet 4.5': 333,
        'Claude Sonnet 4.5 (Thinking)': 334,
        'Claude Opus 4.5 (Thinking)': 1012,
        'GPT-OSS-120B (Medium)': 342,
    };

    function encodeVarint(value: number): Buffer {
        const bytes: number[] = [];
        while (value > 0x7f) {
            bytes.push((value & 0x7f) | 0x80);
            value >>= 7;
        }
        bytes.push(value & 0x7f);
        return Buffer.from(bytes);
    }

    function buildSafetyConfig(modelName: string): Buffer {
        const modelId = MODEL_IDS[modelName] || MODEL_IDS['Gemini 3 Flash'];

        const modelIdVarint = encodeVarint(modelId);
        const modelField = Buffer.concat([
            Buffer.from([0x08]),
            modelIdVarint,
        ]);
        const field15 = Buffer.concat([
            Buffer.from([0x7a]),
            Buffer.from([modelField.length]),
            modelField,
        ]);

        const beforeModel = Buffer.from(
            '0a631204200170006a4c42451a43120275761a07676974206164641a096769742073746173681a096769742072657365741a0c67697420636865636b6f75741a09707974686f6e202d631a0370697030038a02020801',
            'hex',
        );

        const afterModel = Buffer.from('aa0102080182020208013a0208015801', 'hex');

        const innerContent = Buffer.concat([beforeModel, field15, afterModel]);

        return Buffer.concat([
            Buffer.from([0x2a]),
            encodeVarint(innerContent.length),
            innerContent,
        ]);
    }

    const buildMetadata = () => Buffer.concat([
        ldField(1, 'antigravity'),
        ldField(3, OAUTH_TOKEN),
        ldField(4, 'en'),
        ldField(7, '1.15.6'),
        ldField(12, 'antigravity'),
    ]);

    // Start a cascade session
    async function startCascade(client: http2.ClientHttp2Session): Promise<string> {
        console.log('Starting Cascade...');
        const inner = buildMetadata();
        const outer = Buffer.concat([
            ldField(1, inner),
            Buffer.from([0x20, 0x01])  // enable_planning = true
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

    async function sendMessage(client: http2.ClientHttp2Session, cascadeId: string, text: string, mode: string = 'Fast', modelName: string = 'Gemini 3 Flash'): Promise<void> {
        console.log(`Sending message to agent (mode=${mode}, model=${modelName})...`);
        const messageBody = ldField(1, text);

        const planningMode = mode === 'Planning' ? 1 : 0;
        const modeField = Buffer.from([0x70, planningMode]);

        const safetyConfig = buildSafetyConfig(modelName);

        const outer = Buffer.concat([
            ldField(1, cascadeId),
            ldField(2, messageBody),
            ldField(3, buildMetadata()),
            safetyConfig,
            modeField,
        ]);

        console.log(`  Payload length: ${outer.length} bytes`);

        return new Promise((resolve, reject) => {
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

            req.on('data', (chunk: Buffer) => {
                responseData = Buffer.concat([responseData, chunk]);
            });

            req.on('response', (headers) => {
                console.log(`Message sent, status: ${headers[':status']}`);
                if (headers[':status'] === 200) {
                    resolve();
                } else {
                    // Log response body for debugging
                    req.on('end', () => {
                        console.log(`Response body (${responseData.length} bytes): ${responseData.toString('utf8').substring(0, 500)}`);
                        reject(new Error(`SendMessage failed with status ${headers[':status']}`));
                    });
                }
            });
            req.on('error', reject);
            req.write(outer);
            req.end();
        });
    }

    async function streamCascadeUpdates(
        client: http2.ClientHttp2Session,
        cascadeId: string,
        maxWaitMs: number
    ): Promise<{ success: boolean; error?: string; bytesReceived?: number }> {
        console.log(`Streaming cascade updates (max ${maxWaitMs / 1000}s)...`);

        const varintField1 = Buffer.from([0x08, 0x01]);
        const protoPayload = Buffer.concat([
            varintField1,
            ldField(2, cascadeId),
            ldField(3, 'chat-client-trajectories')
        ]);

        const envelope = Buffer.alloc(5);
        envelope[0] = 0x00;
        envelope.writeUInt32BE(protoPayload.length, 1);

        const outer = Buffer.concat([envelope, protoPayload]);

        return new Promise((resolve) => {
            let totalBytes = 0;
            let streamOpened = false;
            let receivedData = false;

            const timeout = setTimeout(() => {
                req.close();
                if (streamOpened && receivedData) {
                    console.log(`  Stream working - received ${totalBytes} bytes before timeout`);
                    resolve({ success: true, bytesReceived: totalBytes });
                } else {
                    resolve({ success: false, error: 'timeout - no data received' });
                }
            }, maxWaitMs);

            const req = client.request({
                ':method': 'POST',
                ':path': '/exa.language_server_pb.LanguageServerService/StreamCascadeReactiveUpdates',
                'content-type': 'application/connect+proto',
                'connect-protocol-version': '1',
                'origin': 'vscode-file://vscode-app',
                'x-codeium-csrf-token': CSRF_TOKEN,
            });

            req.on('response', (headers) => {
                console.log(`  Stream opened, status: ${headers[':status']}`);
                streamOpened = headers[':status'] === 200;
            });

            req.on('data', (chunk: Buffer) => {
                totalBytes += chunk.length;
                receivedData = true;

                if (totalBytes % 20000 < chunk.length) {
                    console.log(`  Received ${totalBytes} bytes...`);
                }

                if (totalBytes > 5000) {
                    clearTimeout(timeout);
                    console.log(`  Stream verified - received ${totalBytes} bytes`);
                    req.close();
                    resolve({ success: true, bytesReceived: totalBytes });
                }
            });

            req.on('end', () => {
                clearTimeout(timeout);
                console.log(`  Stream ended. Total: ${totalBytes} bytes`);
                resolve({ success: totalBytes > 0, bytesReceived: totalBytes });
            });

            req.on('error', (err) => {
                clearTimeout(timeout);
                console.log(`  Stream error: ${err.message}`);
                resolve({ success: false, error: err.message });
            });

            req.write(outer);
            req.end();
        });
    }

    // Poll GetCascadeTrajectorySteps
    async function pollTrajectorySteps(client: http2.ClientHttp2Session, cascadeId: string, maxWaitMs: number): Promise<{ success: boolean; error?: string }> {
        console.log(`Polling trajectory steps (max ${maxWaitMs / 1000}s)...`);
        const startTime = Date.now();
        let lastContentLen = 0;
        let stableCount = 0;
        let hasGrown = false;  // Track if content has grown at least once

        while (Date.now() - startTime < maxWaitMs) {
            const outer = ldField(1, cascadeId);

            const result = await new Promise<{ status: number; data: Buffer }>((resolve, reject) => {
                const req = client.request({
                    ':method': 'POST',
                    ':path': '/exa.language_server_pb.LanguageServerService/GetCascadeTrajectorySteps',
                    'content-type': 'application/proto',
                    'connect-protocol-version': '1',
                    'origin': 'vscode-file://vscode-app',
                    'x-codeium-csrf-token': CSRF_TOKEN,
                    'content-length': outer.length.toString()
                });

                let responseData = Buffer.alloc(0);
                req.on('data', (chunk: Buffer) => {
                    responseData = Buffer.concat([responseData, chunk]);
                });
                req.on('response', (headers) => {
                    req.on('end', () => resolve({ status: headers[':status'] as number, data: responseData }));
                });
                req.on('error', reject);
                req.write(outer);
                req.end();
            });

            if (result.status !== 200) {
                console.log(`  Poll status: ${result.status}`);
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }

            const elapsed = Math.round((Date.now() - startTime) / 1000);
            const raw = result.data.toString('utf8');
            const text = raw.replace(/[^\x20-\x7E\n\r\t]/g, '');

            // DEBUG: Parse protobuf structure to find status fields
            const bytes = result.data;
            const topFields = parseProtobufFields(bytes, 100);

            // Parse inside Field 1 (the nested steps message)
            const nestedMsg = topFields.find(f => f.fieldNum === 1 && Buffer.isBuffer(f.value));
            const nestedFields = nestedMsg ? parseProtobufFields(nestedMsg.value as Buffer, 200) : [];

            // Log parsed fields periodically
            if (elapsed === 0 || elapsed === 3) {
                console.log(`  Nested fields inside Field 1:`);
                for (const f of nestedFields.slice(0, 10)) {
                    const valStr = Buffer.isBuffer(f.value) ? `[${f.value.length}b]` : f.value;
                    const wt = ['vint', '64b', 'len', '', '', '32b'][f.wireType] || `w${f.wireType}`;
                    console.log(`    F${f.fieldNum}(${wt}): ${valStr}`);
                }
            }

            // Look for varint fields (potential status)
            const nestedVarints = nestedFields.filter(f => f.wireType === 0 && typeof f.value === 'number');
            if (elapsed % 6 === 0 && nestedVarints.length > 0) {
                console.log(`  Varints: ${nestedVarints.slice(0, 5).map(f => `F${f.fieldNum}=${f.value}`).join(', ')}`);
            }

            // Track content changes
            const contentChanged = text.length !== lastContentLen;
            const contentGrew = text.length > lastContentLen;

            if (contentGrew) {
                hasGrown = true;
                stableCount = 0;
                console.log(`  [${elapsed}s] len=${text.length} (+${text.length - lastContentLen}) - agent working...`);
            } else if (!contentChanged && hasGrown) {
                stableCount++;
                console.log(`  [${elapsed}s] len=${text.length} (stable ${stableCount}/5)`);

                // Content must be stable for 5 consecutive polls (15s) after having grown
                if (stableCount >= 5) {
                    console.log('  Agent appears to be done (content stable for 15s)');

                    // Final check for expected operations
                    const hasAPy = text.includes('a.py');
                    const hasBPy = text.includes('b.py');
                    const hasRm = text.includes('rm ') || text.includes('deleted');
                    console.log(`  Final check: a.py=${hasAPy}, b.py=${hasBPy}, rm=${hasRm}`);

                    // Check for errors in response
                    const errorPatterns = /(UnauthorizedError|permission denied|EACCES|ENOENT|failed to execute|error occurred|CORTEX_ERROR)/i;
                    const errorMatch = text.match(errorPatterns);
                    if (errorMatch) {
                        return { success: false, error: errorMatch[0] };
                    }

                    return { success: hasAPy && hasBPy };
                }
            } else {
                // Content shrunk or no change before growth - keep waiting
                console.log(`  [${elapsed}s] len=${text.length} - waiting for agent to start...`);
            }

            lastContentLen = text.length;
            await new Promise(r => setTimeout(r, 3000));  // Poll every 3s
        }

        console.log('  Timeout reached');
        return { success: false, error: 'timeout' };
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

            req.on('response', (headers) => {
                console.log(`Delete trajectory: ${headers[':status']}`);
                resolve();
            });
            req.write(outer);
            req.end();
        });
    }

    try {
        const client = http2.connect(`https://127.0.0.1:${PORT}`);

        console.log('\n=== Antigravity API Integration Test ===\n');

        console.log('1. Starting cascade...');
        const cascadeId = await startCascade(client);
        console.log(`   [OK] Cascade ID: ${cascadeId.substring(0, 8)}...`);

        console.log('\n2. Sending message...');
        const prompt = 'Say hello and explain what you can do in one sentence.';
        await sendMessage(client, cascadeId, prompt);
        console.log('   [OK] Message sent');

        console.log('\n3. Streaming response...');
        const result = await streamCascadeUpdates(client, cascadeId, 15000);
        if (result.success) {
            console.log(`   [OK] Stream received ${result.bytesReceived} bytes`);
        } else {
            console.log(`   [FAIL] Stream failed: ${result.error}`);
        }

        console.log('\n4. Cleaning up...');
        await deleteTrajectory(client, cascadeId);
        console.log('   [OK] Cascade deleted');

        client.close();

        if (result.success) {
            console.log('\n=== Test PASSED ===');
            process.exit(0);
        } else {
            console.log(`\n=== Test FAILED: ${result.error} ===`);
            process.exit(1);
        }
    } catch (error) {
        console.error('\n=== Test FAILED ===');
        console.error(error);
        process.exit(1);
    }
}

testAntigravityAPI();
