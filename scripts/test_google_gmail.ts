import dotenv from "dotenv";
import path from "path";
import assert from "assert";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import {
  validateOAuthConfiguration,
  getGoogleOAuth2Client,
  mapGmailError,
  validateGoogleConnection,
  generateOAuthState,
  consumeOAuthState,
} from "@brain-box-ai/integrations";

async function runTests() {
  console.log("=== RUNNING GOOGLE & GMAIL SYSTEM VERIFICATION TESTS ===");

  // TEST 1: Startup Diagnostic Configuration
  console.log("\n--- TEST 1: Google OAuth Startup Diagnostic ---");
  const config = validateOAuthConfiguration();
  console.log("Config Result:", config);
  assert.strictEqual(typeof config.configured, "boolean", "configured should be a boolean");
  assert.ok(config.clientIdSuffix.startsWith("****"), "client id suffix should be masked");
  assert.ok(config.redirectUri.startsWith("http"), "redirect URI should be valid URL");
  console.log("✅ TEST 1 PASSED");

  // TEST 2: Redirect URI Consistency
  console.log("\n--- TEST 2: OAuth Redirect URI Consistency ---");
  const oauthClient = getGoogleOAuth2Client();
  const generatedRedirect = (oauthClient as any)._redirectUri || (oauthClient as any).redirectUri;
  assert.strictEqual(config.redirectUri, generatedRedirect, "Configured redirect URI must match generated client URI");
  console.log("✅ TEST 2 PASSED: Canonical Redirect URI verified ->", generatedRedirect);

  // TEST 3: State Generation & Validation
  console.log("\n--- TEST 3: OAuth CSRF State Token Validation ---");
  const state = generateOAuthState("test_user_id", "test_workspace_id");
  assert.strictEqual(typeof state, "string", "State should be a string");
  assert.strictEqual(state.length, 64, "State token should be 64 hex chars");
  const consumed = consumeOAuthState(state);
  assert.deepStrictEqual(consumed, { userId: "test_user_id", workspaceId: "test_workspace_id" });
  assert.throws(() => consumeOAuthState(state), /Invalid or already-used OAuth state/, "State must be single-use");
  console.log("✅ TEST 3 PASSED");

  // TEST 4: Google Error Mapper
  console.log("\n--- TEST 4: Google Error Code Mapping ---");
  
  const errApiDisabled = mapGmailError({ message: "Gmail API has not been used in project 412264053150 before or it is disabled." });
  assert.strictEqual(errApiDisabled.code, "API_DISABLED", "API disabled should map to API_DISABLED");

  const errInvalidGrant = mapGmailError({ message: "invalid_grant: Token has been expired or revoked." });
  assert.strictEqual(errInvalidGrant.code, "REAUTH_REQUIRED", "invalid_grant should map to REAUTH_REQUIRED");

  const errPermissionDenied = mapGmailError({ status: 403, message: "insufficientPermissions: Request had insufficient authentication scopes." });
  assert.strictEqual(errPermissionDenied.code, "PERMISSION_DENIED", "Insufficient scope should map to PERMISSION_DENIED");

  const errRateLimit = mapGmailError({ status: 429, message: "rateLimitExceeded" });
  assert.strictEqual(errRateLimit.code, "RATE_LIMITED", "429 rate limit should map to RATE_LIMITED");

  const err500 = mapGmailError({ status: 503, message: "Backend Error" });
  assert.strictEqual(err500.code, "TEMPORARY_ERROR", "5xx server error should map to TEMPORARY_ERROR");

  console.log("✅ TEST 4 PASSED: All Google error codes mapped accurately.");

  // TEST 5: Unconnected User Status Check
  console.log("\n--- TEST 5: Unconnected User Status Validation ---");
  const statusUnconnected = await validateGoogleConnection("non_existent_dummy_user_123");
  assert.strictEqual(statusUnconnected.connected, false, "Unconnected user must have connected=false");
  assert.strictEqual(statusUnconnected.status, "OAUTH_REQUIRED", "Unconnected user status must be OAUTH_REQUIRED");
  assert.strictEqual(statusUnconnected.requiresReconnect, false, "Requires reconnect should be false for fresh auth");
  console.log("✅ TEST 5 PASSED");

  console.log("\n🎉 ALL GOOGLE & GMAIL SYSTEM VERIFICATION TESTS PASSED!");
}

runTests().catch((err) => {
  console.error("❌ TEST FAILURE:", err);
  process.exit(1);
});
