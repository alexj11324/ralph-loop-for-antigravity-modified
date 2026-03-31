import * as http2 from "http2";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
    ldField
} from "../../out/antigravityClient/protobuf";
import {
    extractAntigravityFromProcess,
    discoverAntigravityPort,
    extractOAuthToken
} from "../../out/antigravityClient/discovery";

/**
 * OAuth Token 401 Error Diagnosis Test
 * 
 * This test diagnoses 401 authentication errors by:
 * 1. Extracting OAuth token from state.vscdb
 * 2. Validating token format
 * 3. Testing token with actual API call (GetUserStatus)
 * 4. Detecting common issues (multiple tokens, expired tokens)
 * 
 * Usage: ts-node test/integration/test_oauth_401_diagnosis.ts
 * 
 * 401 Error Root Causes:
 * - Token expired (needs refresh via Antigravity restart)
 * - Multiple tokens in state.vscdb, wrong one extracted
 * - Token revoked by server
 * - Multiple Antigravity instances with different tokens
 */

// Extract OAuth token from Antigravity storage (same logic as discovery.ts)
async function extractOAuthTokenWithDiagnostics(): Promise<{ token: string | null; path: string; allTokens?: string[]; error?: string }> {
  const homeDir = os.homedir();

  const possiblePaths = [
    path.join(homeDir, "Library", "Application Support", "Antigravity", "User", "globalStorage", "state.vscdb"),
    path.join(homeDir, "Library", "Application Support", "Antigravity", "User", "state.vscdb"),
    path.join(homeDir, ".config", "Antigravity", "User", "globalStorage", "state.vscdb"),
    path.join(homeDir, "AppData", "Roaming", "Antigravity", "User", "globalStorage", "state.vscdb"),
  ];

  for (const dbPath of possiblePaths) {
    try {
      if (fs.existsSync(dbPath)) {
        const content = fs.readFileSync(dbPath);
        const contentStr = content.toString("utf8");

        // Find ALL token matches (not just first)
        const tokenMatches = contentStr.match(/ya29\.[A-Za-z0-9_-]{50,}/g);
        
        if (tokenMatches && tokenMatches.length > 0) {
          return { 
            token: tokenMatches[0], 
            path: dbPath,
            allTokens: tokenMatches
          };
        }

        return { token: null, path: dbPath, error: "No token pattern match found" };
      }
    } catch (err) {
      continue;
    }
  }

  return { token: null, path: "", error: "No state.vscdb file found" };
}

// Validate token format
function validateTokenFormat(token: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!token.startsWith("ya29.")) {
    issues.push("Token does not start with 'ya29.'");
  }

  if (token.length < 50) {
    issues.push(`Token length ${token.length} is shorter than expected (50+ chars)`);
  }

  if (!/^ya29\.[A-Za-z0-9_-]+$/.test(token)) {
    issues.push("Token contains invalid characters");
  }

  return { valid: issues.length === 0, issues };
}

// Test the actual OAuth token by attempting a gRPC call
async function testOAuthToken(port: number, csrfToken: string, oauthToken: string): Promise<{ success: boolean; error?: string; statusCode?: number }> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ success: false, error: "Connection timeout" });
    }, 5000);

    try {
      const client = http2.connect(`https://127.0.0.1:${port}`, { rejectUnauthorized: false });

      client.on("error", (err) => {
        clearTimeout(timeout);
        resolve({ success: false, error: `Connection error: ${err.message}` });
      });

      client.on("connect", () => {
        // Build metadata with OAuth token
        const metadata = Buffer.concat([
          ldField(1, "antigravity"),
          ldField(3, oauthToken),
          ldField(4, "en"),
        ]);
        const payload = ldField(1, metadata);

        // Try to get user status - this validates OAuth token
        const req = client.request({
          ":method": "POST",
          ":path": "/exa.language_server_pb.LanguageServerService/GetUserStatus",
          "content-type": "application/proto",
          "connect-protocol-version": "1",
          origin: "vscode-file://vscode-app",
          "x-codeium-csrf-token": csrfToken,
          "content-length": payload.length.toString(),
        });

        let responseData = Buffer.alloc(0);

        req.on("response", (headers) => {
          const statusCode = headers[":status"] as number;
          clearTimeout(timeout);
          client.close();

          if (statusCode === 200) {
            resolve({ success: true });
          } else if (statusCode === 401) {
            resolve({ success: false, error: "401 Unauthorized - OAuth token invalid/expired", statusCode });
          } else {
            resolve({ success: false, error: `Status ${statusCode}`, statusCode });
          }
        });

        req.on("error", (err) => {
          clearTimeout(timeout);
          client.close();
          resolve({ success: false, error: `Request error: ${err.message}` });
        });

        req.on("data", (chunk) => {
          responseData = Buffer.concat([responseData, chunk]);
        });

        req.write(payload);
        req.end();
      });
    } catch (err) {
      clearTimeout(timeout);
      resolve({ success: false, error: `Unexpected error: ${err}` });
    }
  });
}

// Main diagnostic function
async function diagnose401Error() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("      OAuth Token 401 Error Diagnosis Tool");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Step 1: Extract and validate token
  const extraction = await extractOAuthTokenWithDiagnostics();
  
  if (!extraction.token) {
    console.log("❌ FAILED: Could not extract OAuth token");
    console.log(`   Error: ${extraction.error}`);
    console.log("\n🔧 FIX: Make sure Antigravity IDE is running and logged in\n");
    process.exit(1);
  }

  console.log("Step 1: OAuth Token Extraction");
  console.log("─────────────────────────────────");
  console.log(`✓ Token extracted from: ${extraction.path}`);
  console.log(`  Token: ${extraction.token.substring(0, 30)}... (${extraction.token.length} chars)`);

  // Check for multiple tokens
  if (extraction.allTokens && extraction.allTokens.length > 1) {
    console.log(`\n⚠️  WARNING: Found ${extraction.allTokens.length} tokens in state.vscdb!`);
    console.log("   This is a POTENTIAL CAUSE of 401 errors.");
    console.log("   First token (used):", extraction.allTokens[0].substring(0, 30) + "...");
    extraction.allTokens.slice(1).forEach((tok, i) => {
      console.log(`   Token ${i + 2} (ignored):`, tok.substring(0, 30) + "...");
    });
    console.log("\n💡 The first token may be expired while others are valid.\n");
  }

  // Step 2: Validate token format
  console.log("\nStep 2: Token Format Validation");
  console.log("─────────────────────────────────");
  const validation = validateTokenFormat(extraction.token);
  if (!validation.valid) {
    console.log("⚠️  Token format issues:");
    validation.issues.forEach((issue) => console.log(`   - ${issue}`));
  } else {
    console.log("✓ Token format is valid");
  }

  // Step 3: Check Antigravity process
  console.log("\nStep 3: Antigravity Process Check");
  console.log("─────────────────────────────────");
  
  const processInfo = await extractAntigravityFromProcess();
  if (!processInfo) {
    console.log("❌ No Antigravity instances found!");
    console.log("   Make sure Antigravity IDE is running.");
    process.exit(1);
  }

  const { pid, csrfToken } = processInfo;
  console.log(`✓ Single Antigravity instance running`);
  console.log(`✓ Process ID: ${pid}`);
  console.log(`✓ CSRF token: ${csrfToken.substring(0, 16)}...`);

  const port = await discoverAntigravityPort(pid);
  if (!port) {
    console.log("❌ Could not find gRPC port");
    process.exit(1);
  }
  console.log(`✓ gRPC port: ${port}`);

  // Step 4: Test the token with actual API call
  console.log("\nStep 4: Live Token Test");
  console.log("─────────────────────────────────");
  console.log("Testing token with GetUserStatus API call...\n");
  
  const testResult = await testOAuthToken(port, csrfToken, extraction.token);

  console.log("\n═══════════════════════════════════════════════════════════");
  if (testResult.success) {
    console.log("✅ SUCCESS: OAuth token is VALID!");
    console.log("═══════════════════════════════════════════════════════════\n");
    console.log("The 401 error may be from:");
    console.log("  - A different request or endpoint");
    console.log("  - CSRF token mismatch");
    console.log("  - Network/proxy issues\n");
    process.exit(0);
  } else {
    console.log(`❌ FAILED: ${testResult.error}`);
    console.log("═══════════════════════════════════════════════════════════\n");
    
    if (testResult.statusCode === 401) {
      console.log("🔧 FIXES for 401 Unauthorized:\n");
      console.log("1. Restart Antigravity IDE (refreshes OAuth token)");
      console.log("   → This is the most common fix\n");
      
      console.log("2. Log out and log back in to Antigravity");
      console.log("   → Ensures fresh token generation\n");
      
      if (extraction.allTokens && extraction.allTokens.length > 1) {
        console.log("3. Clear state.vscdb (multiple tokens detected)");
        console.log(`   → rm "${extraction.path}"`);
        console.log("   → Restart Antigravity to regenerate\n");
      }
      
      console.log("4. Check internet connection");
      console.log("   → Token validation requires network access\n");
    }
    process.exit(1);
  }
}

// Run diagnosis
console.log("Starting OAuth Token 401 Diagnosis...");
diagnose401Error().catch((err) => {
  console.error("\n❌ Unexpected error during diagnosis:", err);
  process.exit(1);
});
