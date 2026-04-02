"use strict";
const assert = require('assert');
const Module = require('module');

// Mock vscode module
const vscodeMock = {
    workspace: {
        workspaceFolders: [],
        getConfiguration: () => ({
            get: (key, defaultValue) => defaultValue
        })
    },
    window: {
        showErrorMessage: () => {},
        activeTextEditor: null
    }
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
    if (id === 'vscode') {
        return vscodeMock;
    }
    return originalRequire.apply(this, arguments);
};

const { parsePollInterval } = require('../../out/loop/config');

function testParsePollInterval() {
    console.log('Running parsePollInterval tests...');

    // Default/empty values
    assert.strictEqual(parsePollInterval(null), 4000, 'null should return 4000');
    assert.strictEqual(parsePollInterval(undefined), 4000, 'undefined should return 4000');
    assert.strictEqual(parsePollInterval(''), 4000, 'empty string should return 4000');

    // Minute formats
    assert.strictEqual(parsePollInterval('1m'), 60000, '1m should be 60000ms');
    assert.strictEqual(parsePollInterval('1 min'), 60000, '1 min should be 60000ms');
    assert.strictEqual(parsePollInterval('2minutes'), 120000, '2minutes should be 120000ms');
    assert.strictEqual(parsePollInterval('0.5m'), 30000, '0.5m should be 30000ms');
    assert.strictEqual(parsePollInterval('1.5 minutes'), 90000, '1.5 minutes should be 90000ms');

    // Second formats
    assert.strictEqual(parsePollInterval('4s'), 4000, '4s should be 4000ms');
    assert.strictEqual(parsePollInterval('30 sec'), 30000, '30 sec should be 30000ms');
    assert.strictEqual(parsePollInterval('10seconds'), 10000, '10seconds should be 10000ms');
    assert.strictEqual(parsePollInterval('0.5s'), 500, '0.5s should be 500ms');

    // Bare numbers
    assert.strictEqual(parsePollInterval('5'), 5000, '"5" should be 5000ms');
    assert.strictEqual(parsePollInterval(10), 10000, '10 (number) should be 10000ms');
    assert.strictEqual(parsePollInterval('2.5'), 2500, '"2.5" should be 2500ms');

    // Case sensitivity and whitespace
    assert.strictEqual(parsePollInterval('  2 M  '), 120000, 'Spaces and uppercase M should work');
    assert.strictEqual(parsePollInterval(' 10 S '), 10000, 'Spaces and uppercase S should work');

    // Invalid inputs
    assert.strictEqual(parsePollInterval('abc'), 4000, 'Invalid string should return 4000');
    assert.strictEqual(parsePollInterval('10x'), 10000, 'parseFloat("10x") is 10, so 10000ms');

    console.log('All parsePollInterval tests passed!');
}

try {
    testParsePollInterval();
} catch (error) {
    console.error('Tests failed!');
    console.error(error);
    process.exit(1);
}
