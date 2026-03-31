import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { extractOAuthToken } from "../../out/antigravityClient/discovery";

/**
 * Tests for OAuth token extraction and validation
 * These tests help diagnose 401 authentication failures
 */

// Mock data that could cause 401 errors
const mockValidToken = "ya29.a0AXooCgcAT7aLW3gX2jK9mNpQrStUvWxYz1234567890abcdefABCDEF_-test1234567890abcdef1234567890";
const mockExpiredToken = "ya29.a0AXooCgcB4bMX4hY3iL0nOpQrStUvWxYz1234567890abcdefABCDEF_-expired1234567890abc";
const mockInvalidFormat = "invalid_token_ya29.short";
const mockMultipleTokens = `${mockExpiredToken} some text ${mockValidToken}`;

suite("OAuth Token Extraction Tests", () => {
  let tempDir: string;
  let originalHomeDir: string;

  setup(() => {
    // Create temp directory for mock state files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-test-"));
    originalHomeDir = os.homedir();
    
    // Override homedir to use temp directory
    Object.defineProperty(os, "homedir", {
      value: () => tempDir,
      configurable: true,
    });
  });

  teardown(() => {
    // Restore original homedir
    Object.defineProperty(os, "homedir", {
      value: () => originalHomeDir,
      configurable: true,
    });
    
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test("should extract valid OAuth token from state.vscdb", async () => {
    // Create mock state.vscdb with valid token
    const stateDir = path.join(tempDir, "Library", "Application Support", "Antigravity", "User", "globalStorage");
    fs.mkdirSync(stateDir, { recursive: true });
    
    const stateFile = path.join(stateDir, "state.vscdb");
    fs.writeFileSync(stateFile, `some data ${mockValidToken} more data`);

    const token = await extractOAuthToken();
    assert.strictEqual(token, mockValidToken, "Should extract the valid token");
  });

  test("should return null when no token found", async () => {
    const token = await extractOAuthToken();
    assert.strictEqual(token, null, "Should return null when no state file exists");
  });

  test("should not extract invalid token format", async () => {
    const stateDir = path.join(tempDir, "Library", "Application Support", "Antigravity", "User", "globalStorage");
    fs.mkdirSync(stateDir, { recursive: true });
    
    const stateFile = path.join(stateDir, "state.vscdb");
    fs.writeFileSync(stateFile, `some data ${mockInvalidFormat} more data`);

    const token = await extractOAuthToken();
    assert.strictEqual(token, null, "Should not extract invalid token format");
  });

  test("should extract first token when multiple exist (potential 401 cause)", async () => {
    const stateDir = path.join(tempDir, "Library", "Application Support", "Antigravity", "User", "globalStorage");
    fs.mkdirSync(stateDir, { recursive: true });
    
    const stateFile = path.join(stateDir, "state.vscdb");
    fs.writeFileSync(stateFile, mockMultipleTokens);

    const token = await extractOAuthToken();
    // This test shows the bug - it extracts the first (possibly expired) token
    assert.strictEqual(token, mockExpiredToken, "Extracts first token which may be expired");
    console.log("WARNING: First token extracted may be expired, causing 401 errors");
  });

  test("should validate token format matches ya29 pattern", async () => {
    const stateDir = path.join(tempDir, "Library", "Application Support", "Antigravity", "User", "globalStorage");
    fs.mkdirSync(stateDir, { recursive: true });
    
    const stateFile = path.join(stateDir, "state.vscdb");
    fs.writeFileSync(stateFile, `data ${mockValidToken} end`);

    const token = await extractOAuthToken();
    
    // Validate token format
    assert.ok(token, "Token should be extracted");
    assert.ok(token?.startsWith("ya29."), "Token should start with ya29.");
    assert.ok(token!.length > 50, "Token should be at least 50 chars");
    assert.match(token!, /^ya29\.[A-Za-z0-9_-]+$/, "Token should match expected pattern");
  });

  test("should check multiple state file locations", async () => {
    // Create state file in alternative location
    const altDir = path.join(tempDir, ".config", "Antigravity", "User", "globalStorage");
    fs.mkdirSync(altDir, { recursive: true });
    
    const stateFile = path.join(altDir, "state.vscdb");
    fs.writeFileSync(stateFile, `data ${mockValidToken} end`);

    const token = await extractOAuthToken();
    assert.strictEqual(token, mockValidToken, "Should find token in alternative location");
  });
});

/**
 * Manual test to diagnose actual 401 error
 * Run this to check the real token from your system
 */
export async function diagnose401Error(): Promise<void> {
  console.log("\n=== Diagnosing 401 Authentication Error ===\n");
  
  const token = await extractOAuthToken();
  
  if (!token) {
    console.log("❌ No OAuth token found in any state.vscdb file");
    console.log("   This will cause 401 errors - token is missing");
    return;
  }
  
  console.log("✓ OAuth token found");
  console.log(`  Length: ${token.length} characters`);
  console.log(`  Prefix: ${token.substring(0, 20)}...`);
  console.log(`  Pattern match: ${/^ya29\.[A-Za-z0-9_-]+$/.test(token) ? "✓ Valid" : "✗ Invalid"}`);
  
  // Check if token looks expired (old format)
  if (token.length < 60) {
    console.log("\n⚠️  WARNING: Token seems shorter than expected, might be expired/invalid");
  }
  
  console.log("\n📋 To test if token is valid:");
  console.log("   1. Open Antigravity IDE");
  console.log("   2. Check Network tab in DevTools");
  console.log("   3. Look for Authorization header in API calls");
  console.log("   4. Compare with extracted token above");
  
  console.log("\n🔧 Potential fixes for 401:");
  console.log("   - Restart Antigravity IDE (refreshes token)");
  console.log("   - Check if multiple Antigravity instances running");
  console.log("   - Delete state.vscdb and let Antigravity recreate it");
}

// Run diagnosis if executed directly
if (require.main === module) {
  diagnose401Error().catch(console.error);
}
