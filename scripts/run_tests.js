const { spawn } = require('child_process');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const TEST_PORT = process.env.TEST_PORT || '3099';
const API_URL = `http://127.0.0.1:${TEST_PORT}`;
let apiProcess = null;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ------------------------------------------------------------------
// API Server Lifecycle
// ------------------------------------------------------------------
async function startApiServer() {
  console.log(`🚀 Starting API backend server for testing on port ${TEST_PORT}...`);
  apiProcess = spawn('node', ['apps/api/dist/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: TEST_PORT }
  });

  apiProcess.stdout.on('data', (data) => {
    console.log(`[API STDOUT] ${data}`);
  });

  apiProcess.stderr.on('data', (data) => {
    console.error(`[API STDERR] ${data}`);
  });

  const maxAttempts = 15;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await fetch(`${API_URL}/api/health`);
      if (res.ok) {
        console.log("✅ API backend is healthy and ready.");
        return;
      }
    } catch (e) {
      // Ignore and retry
    }
    console.log(`⏱️ Waiting for API server to start (attempt ${i}/${maxAttempts})...`);
    await wait(2000);
  }
  throw new Error("API server failed to start in time.");
}

function stopApiServer() {
  if (apiProcess) {
    console.log("🛑 Stopping API backend server...");
    apiProcess.kill();
  }
}

// ------------------------------------------------------------------
// Automated Test Runner
// ------------------------------------------------------------------
async function runTests() {
  let failed = false;

  console.log("\n🧪 Running Brain Box AI test suite...");

  const assert = (condition, message) => {
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      failed = true;
      throw new Error(message);
    }
    console.log(`✅ PASS: ${message}`);
  };

  try {
    // Test 1: Health Check
    const healthRes = await fetch(`${API_URL}/api/health`);
    assert(healthRes.ok, "API /api/health returned 200");
    const healthData = await healthRes.json();
    assert(healthData.status === "ok" || healthData.status === "degraded", "Health status is valid");
    assert(healthData.services.api === "ok", "API service status is ok");

    // Test 2: Security Isolation (Unauthorized request prevention without token)
    const badAuthRes = await fetch(`${API_URL}/api/conversations`, {
      headers: { Authorization: `Bearer bad_token_value` }
    });
    assert(badAuthRes.status === 401, "Protected API call with invalid token returned 401 Unauthorized");
    const badAuthData = await badAuthRes.json();
    assert(badAuthData.success === false, "Unauthorized response returns success: false");

    // Test 3: Unauthenticated request prevention (No header)
    const noAuthRes = await fetch(`${API_URL}/api/settings`);
    assert(noAuthRes.status === 401, "Protected API call with no token returned 401 Unauthorized");

    // Test 4: OAuth Connect endpoint requires authentication
    const oauthConnectRes = await fetch(`${API_URL}/api/integrations/google/connect`);
    assert(oauthConnectRes.status === 401, "Google OAuth connect endpoint requires authentication");

  } catch (err) {
    console.error("❌ Test run aborted due to error:", err.message);
    failed = true;
  }

  if (failed) {
    console.log("\n❌ TEST SUITE FAILED.");
    process.exit(1);
  } else {
    console.log("\n🌟 ALL TESTS PASSED SUCCESSFULLY.");
    process.exit(0);
  }
}

(async () => {
  try {
    await startApiServer();
    await runTests();
  } catch (e) {
    console.error("Fatal Error during testing:", e.message);
    process.exit(1);
  } finally {
    stopApiServer();
  }
})();
