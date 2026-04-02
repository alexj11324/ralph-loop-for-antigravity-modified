const assert = require('assert');
const cp = require('child_process');
const util = require('util');
const path = require('path');
const Module = require('module');

// Mock vscode module
const vscodeMock = {
    workspace: {
        getConfiguration: () => ({
            get: () => false
        })
    }
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return vscodeMock;
    }
    return originalRequire.apply(this, arguments);
};

// Mock child_process.execFile
let execFileCalled = false;
let execFileArgs = [];

cp.execFile = (file, args, options, callback) => {
    execFileCalled = true;
    execFileArgs.push({ file, args, options });
    if (typeof options === 'function') {
        callback = options;
    }
    callback(null, { stdout: 'mock-output\n', stderr: '' });
};

// Load the module
const discovery = require('../out/antigravityClient/discovery.js');

async function testDiscovery() {
    console.log('Testing discovery.js...');

    // We need to test the internal execCommand but it's not exported.
    // However, we can call functions that use it.
    // extractAntigravityFromProcess calls it.

    execFileCalled = false;
    execFileArgs = [];

    // On Linux/macOS it calls "ps -ax -o pid=,command="
    // On Windows it calls "cmd.exe /c ver"

    await discovery.extractAntigravityFromProcess('/mock/workspace');

    assert.strictEqual(execFileCalled, true);
    console.log('✓ extractAntigravityFromProcess verified (at least one execFile call)');

    // Verify first call arguments
    const firstCall = execFileArgs[0];
    if (process.platform === 'win32') {
        assert.strictEqual(firstCall.file, 'cmd.exe');
        assert.deepStrictEqual(firstCall.args, ['/c', 'ver']);
    } else {
        assert.strictEqual(firstCall.file, 'ps');
        assert.deepStrictEqual(firstCall.args, ['-ax', '-o', 'pid=,command=']);
    }
    console.log(`✓ execCommand arguments verified for ${process.platform}`);
}

testDiscovery().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
