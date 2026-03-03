const mockVscode = {
  workspace: { getConfiguration: () => ({ get: () => undefined }) },
  window: { createOutputChannel: () => ({ appendLine: () => {} }) },
};
require('module').prototype.require = new Proxy(require('module').prototype.require, {
  apply(target, thisArg, argumentsList) {
    if (argumentsList[0] === 'vscode') return mockVscode;
    return Reflect.apply(target, thisArg, argumentsList);
  }
});

const { extractOAuthToken } = require('./out/antigravityClient/discovery.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-perf-"));
const originalHomeDir = os.homedir();

Object.defineProperty(os, "homedir", {
  value: () => tempDir,
  configurable: true,
});

const stateDir = path.join(tempDir, "Library", "Application Support", "Antigravity", "User", "globalStorage");
fs.mkdirSync(stateDir, { recursive: true });

const stateFile = path.join(stateDir, "state.vscdb");
const largeContent = "a".repeat(10 * 1024 * 1024) + " ya29.a0AXooCgcAT7aLW3gX2jK9mNpQrStUvWxYz1234567890abcdefABCDEF_-test1234567890abcdef1234567890";
fs.writeFileSync(stateFile, largeContent);

async function runBenchmark() {
  console.log("Starting benchmark...");
  const start = performance.now();

  for (let i = 0; i < 50; i++) {
    await extractOAuthToken();
  }

  const end = performance.now();
  console.log(`Time taken: ${(end - start).toFixed(2)}ms`);

  Object.defineProperty(os, "homedir", {
    value: () => originalHomeDir,
    configurable: true,
  });
  fs.rmSync(tempDir, { recursive: true, force: true });
}

runBenchmark().catch(console.error);
