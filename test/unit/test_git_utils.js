const assert = require('assert');
const cp = require('child_process');

let mockExecResult = { stdout: '', stderr: '' };
let mockExecError = null;
let lastCommand = '';

// Mock cp.exec
// Note: util.promisify(cp.exec) uses cp.exec[util.promisify.custom] if it exists.
// In Node.js, cp.exec does not have a custom promisifier by default.
// It will use the callback-based version.

const originalExec = cp.exec;
cp.exec = (command, options, callback) => {
    lastCommand = command;
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    // Simulate async behavior
    process.nextTick(() => {
        if (mockExecError) {
            callback(mockExecError, { stdout: '', stderr: mockExecError.message });
        } else {
            callback(null, { stdout: mockExecResult.stdout, stderr: mockExecResult.stderr });
        }
    });
};

const gitUtils = require('../../out/utils/git.js');

async function testGetCurrentBranch() {
    console.log('Testing getCurrentBranch...');

    // Test case 1: Successful branch retrieval
    mockExecResult = { stdout: 'main\n', stderr: '' };
    mockExecError = null;
    let branch = await gitUtils.getCurrentBranch('/tmp');
    assert.strictEqual(lastCommand, 'git rev-parse --abbrev-ref HEAD', 'Should call correct git command');
    assert.strictEqual(branch, 'main', 'Should return trimmed branch name');
    console.log('✓ Successful branch retrieval passed');

    // Test case 2: Git error
    mockExecResult = { stdout: '', stderr: 'fatal: not a git repository' };
    mockExecError = new Error('Command failed');
    branch = await gitUtils.getCurrentBranch('/tmp');
    assert.strictEqual(branch, undefined, 'Should return undefined on error');
    console.log('✓ Git error handling passed');

    // Test case 3: Different whitespace
    mockExecResult = { stdout: '  feature-branch  \r\n', stderr: '' };
    mockExecError = null;
    branch = await gitUtils.getCurrentBranch('/tmp');
    assert.strictEqual(branch, 'feature-branch', 'Should trim all whitespace');
    console.log('✓ Whitespace trimming passed');

    // Test case 4: Empty output
    mockExecResult = { stdout: '\n', stderr: '' };
    mockExecError = null;
    branch = await gitUtils.getCurrentBranch('/tmp');
    assert.strictEqual(branch, '', 'Should return empty string if output is just whitespace');
    console.log('✓ Empty output handling passed');
}

testGetCurrentBranch().then(() => {
    console.log('\nAll tests passed!');
}).catch(err => {
    console.error('\nTest failed!');
    console.error(err);
    process.exit(1);
});
