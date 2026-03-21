const http2 = require('http2');
const assert = require('assert');
const Module = require('module');
const fs = require('fs');
const path = require('path');

// Mock vscode
const vscodeMock = {
    workspace: {
        getConfiguration: () => ({
            get: () => false
        })
    },
    window: {
        createOutputChannel: () => ({
            appendLine: () => {}
        })
    }
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function(reqPath) {
    if (reqPath === 'vscode') {
        return vscodeMock;
    }
    return originalRequire.apply(this, arguments);
};

// Intercept http2.connect
let lastConnectOptions = null;
const originalConnect = http2.connect;
http2.connect = function(authority, options) {
    lastConnectOptions = options;
    // Return a dummy client
    const dummyClient = {
        on: function(event, cb) {
            if (event === 'connect') {
                // We don't want to actually trigger connection logic in discovery
                // but we might need it for client.js
            }
            return this;
        },
        close: () => {},
        request: () => ({
            on: () => {},
            write: () => {},
            end: () => {}
        })
    };
    return dummyClient;
};

async function runTest() {
    console.log("Starting security verification test...");
    let overallSuccess = true;

    // 1. Check file contents (static analysis)
    console.log("\n--- Static Analysis ---");
    const filesToCheck = [
        'out/antigravityClient/discovery.js',
        'out/antigravityClient/client.js',
        'test/integration/test_antigravity_api.ts',
        'test/integration/test_models_fixed.ts',
        'test/integration/test_models.ts',
        'test/integration/test_oauth_401_diagnosis.ts'
    ];

    filesToCheck.forEach(file => {
        if (fs.existsSync(file)) {
            const content = fs.readFileSync(file, 'utf8');
            if (content.includes('rejectUnauthorized: false')) {
                console.log(`[FAIL] Vulnerability FOUND in ${file}`);
                overallSuccess = false;
            } else {
                console.log(`[PASS] Vulnerability NOT found in ${file}`);
            }
        } else {
            console.log(`[SKIP] File not found: ${file}`);
        }
    });

    // 2. Functional check for AntigravityClient
    console.log("\n--- Functional Check: AntigravityClient ---");
    try {
        const { AntigravityClient } = require('../out/antigravityClient/client');
        const client = new AntigravityClient({ port: 1234 }, { appendLine: () => {} });

        // We don't await because it might hang waiting for 'connect' event
        client.connect().catch(() => {});

        if (lastConnectOptions && lastConnectOptions.rejectUnauthorized === false) {
            console.log("[FAIL] AntigravityClient.connect() used rejectUnauthorized: false");
            overallSuccess = false;
        } else if (lastConnectOptions && lastConnectOptions.rejectUnauthorized === true) {
            console.log("[PASS] AntigravityClient.connect() used rejectUnauthorized: true");
        } else {
            console.log("[PASS] AntigravityClient.connect() did NOT use rejectUnauthorized: false (defaulting to true)");
        }
    } catch (err) {
        console.log(`[ERROR] Could not test AntigravityClient: ${err.message}`);
        overallSuccess = false;
    }

    if (overallSuccess) {
        console.log("\nOverall Security Verification: PASSED");
        process.exit(0);
    } else {
        console.log("\nOverall Security Verification: FAILED");
        process.exit(1);
    }
}

runTest().catch(err => {
    console.error(err);
    process.exit(1);
});
