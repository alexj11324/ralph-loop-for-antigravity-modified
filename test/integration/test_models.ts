import * as http2 from 'http2';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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
 * Test script to verify model selection works by testing the new nested Field 15 encoding.
 * This matches exactly what the captured Antigravity traffic uses.
 */

async function extractCredentials(): Promise<{ port: number; csrfToken: string; oauthToken: string } | null> {
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

async function testModelSelection() {
    const creds = await extractCredentials();
    if (!creds) {
        console.error('Could not get credentials. Is Antigravity running?');
        process.exit(1);
    }

    const { port, csrfToken, oauthToken } = creds;

    async function startCascade(client: http2.ClientHttp2Session): Promise<string> {
        const inner = buildMetadata(oauthToken, '1.15.6');
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
            ldField(3, buildMetadata(oauthToken, '1.15.6')),
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
