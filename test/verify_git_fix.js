const assert = require('assert');
const cp = require('child_process');
const util = require('util');

// Mock child_process.execFile
let execFileCalled = false;
let execFileArgs = [];

const originalExecFile = cp.execFile;
cp.execFile = (file, args, options, callback) => {
    execFileCalled = true;
    execFileArgs.push({ file, args, options });
    if (typeof options === 'function') {
        callback = options;
    }
    callback(null, { stdout: 'mock-output\n', stderr: '' });
};

// Mock child_process.exec to ensure it's not called
let execCalled = false;
cp.exec = (command, options, callback) => {
    execCalled = true;
    if (typeof options === 'function') {
        callback = options;
    }
    callback(null, { stdout: 'mock-output\n', stderr: '' });
};

// Now load the module
const git = require('../out/utils/git.js');

async function testGit() {
    console.log('Testing git.js...');

    // Test isGitRepo
    execFileCalled = false;
    execFileArgs = [];
    const isRepo = await git.isGitRepo('/mock/root');
    assert.strictEqual(isRepo, true);
    assert.strictEqual(execFileCalled, true);
    assert.strictEqual(execFileArgs[0].file, 'git');
    assert.deepStrictEqual(execFileArgs[0].args, ['rev-parse', '--git-dir']);
    assert.strictEqual(execCalled, false);
    console.log('✓ isGitRepo verified');

    // Test getCurrentBranch
    execFileCalled = false;
    execFileArgs = [];
    const branch = await git.getCurrentBranch('/mock/root');
    assert.strictEqual(branch, 'mock-output');
    assert.strictEqual(execFileCalled, true);
    assert.strictEqual(execFileArgs[0].file, 'git');
    assert.deepStrictEqual(execFileArgs[0].args, ['rev-parse', '--abbrev-ref', 'HEAD']);
    assert.strictEqual(execCalled, false);
    console.log('✓ getCurrentBranch verified');

    // Test createBranch
    execFileCalled = false;
    execFileArgs = [];
    const created = await git.createBranch('/mock/root', 'new-branch');
    assert.strictEqual(created, 'new-branch');
    assert.strictEqual(execFileCalled, true);
    assert.strictEqual(execFileArgs[0].file, 'git');
    assert.deepStrictEqual(execFileArgs[0].args, ['checkout', '-b', 'new-branch']);
    assert.strictEqual(execCalled, false);
    console.log('✓ createBranch verified');
}

testGit().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
