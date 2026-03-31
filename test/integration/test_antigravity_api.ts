import * as http2 from 'http2';
import {
    ldField,
    encodeVarint,
    buildSafetyConfig,
    buildMetadata,
    MODEL_IDS
} from '../../out/antigravityClient/protobuf';
import {
    discoverAntigravityPort,
    extractAntigravityFromProcess,
    extractOAuthToken
} from '../../out/antigravityClient/discovery';

/**
 * Test script for Antigravity API using GetCascadeTrajectorySteps polling.
 * Task: Create a.py and b.py, then delete them via bash command.
 */

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

async function extractAntigravityCredentials(): Promise<{ port: number; csrfToken: string; oauthToken: string } | null> {
    try {
        const processInfo = await extractAntigravityFromProcess();
        if (!processInfo) {
            console.error('Could not find Antigravity process');
            return null;
        }

        const { pid, csrfToken } = processInfo;
        console.log(`Found Antigravity: pid=${pid}, csrf=${csrfToken.substring(0, 8)}...`);

        const port = await discoverAntigravityPort(pid);
        if (!port) {
            console.error('Could not find gRPC port');
            return null;
        }
        console.log(`Found gRPC port: ${port}`);

        const oauthToken = await extractOAuthToken();
        if (!oauthToken) {
            console.error('Could not extract OAuth token');
            return null;
        }

        return { port, csrfToken, oauthToken };
    } catch (error) {
        console.error('Error extracting credentials:', error);
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

    // Start a cascade session
    async function startCascade(client: http2.ClientHttp2Session): Promise<string> {
        console.log('Starting Cascade...');
        const inner = buildMetadata(OAUTH_TOKEN, '1.15.6');
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
            ldField(3, buildMetadata(OAUTH_TOKEN, '1.15.6')),
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
        const client = http2.connect(`https://127.0.0.1:${PORT}`, { rejectUnauthorized: false });

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
