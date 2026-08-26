const { spawn } = require('child_process');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const TEST_PORT = '3096';
const API_URL = `http://127.0.0.1:${TEST_PORT}`;
let apiProcess = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startApiServer() {
  console.log(`🚀 Starting API backend on port ${TEST_PORT}...`);
  apiProcess = spawn('node', ['apps/api/dist/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: TEST_PORT },
  });

  for (let i = 1; i <= 15; i++) {
    try {
      const res = await fetch(`${API_URL}/api/health`);
      if (res.ok) {
        console.log('✅ API backend is healthy.');
        return;
      }
    } catch (e) {}
    await wait(1000);
  }
  throw new Error('API server failed to start.');
}

async function runAuthTests() {
  let failed = false;
  const assert = (condition, message) => {
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      failed = true;
      throw new Error(message);
    }
    console.log(`✅ PASS: ${message}`);
  };

  try {
    await startApiServer();

    const randomSuffix = Math.random().toString(36).substring(7);
    const testEmail = `newuser_${randomSuffix}@brainbox.ai`;
    const testPassword = 'Password123!';
    const testName = 'New User Test';

    // TEST 1: New user signup creates active account immediately without email verification blockage
    console.log('\n🧪 TEST 1: Instant Registration without email confirmation blockage');
    const regRes = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword, name: testName }),
    });
    assert(regRes.ok, 'POST /api/auth/register returned HTTP 2xx status');
    const regData = await regRes.json();
    assert(regData.success === true, 'Register response contains success: true');
    assert(!!regData.data.token, 'Register returned valid access token immediately');
    assert(!!regData.data.refreshToken, 'Register returned valid refresh token');
    assert(!!regData.data.workspaceId, 'Register auto-created personal workspaceId');
    assert(regData.data.user.email === testEmail, 'User email matches registered email');

    const authToken = regData.data.token;

    // TEST 2: Session verification via authenticated route
    console.log('\n🧪 TEST 2: Authenticated Session Persistence');
    const settingsRes = await fetch(`${API_URL}/api/settings`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert(settingsRes.ok, 'GET /api/settings with token returned HTTP 200');
    const settingsData = await settingsRes.json();
    assert(!!settingsData.workspaceId, 'Authenticated session returned settings & workspaceId');

    // TEST 3: Login with registered email & password
    console.log('\n🧪 TEST 3: Instant Login with Registered Credentials');
    const loginRes = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    assert(loginRes.ok, 'POST /api/auth/login returned HTTP 200');
    const loginData = await loginRes.json();
    assert(loginData.success === true, 'Login response contains success: true');
    assert(!!loginData.data.token, 'Login returned valid access token immediately');
    assert(loginData.data.user.email === testEmail, 'Login returned correct user profile');

    // TEST 4: Invalid Password Error
    console.log('\n🧪 TEST 4: Invalid Password Handling');
    const badLoginRes = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'WrongPassword999' }),
    });
    assert(badLoginRes.status === 400, 'Invalid password returned HTTP 400 Bad Request');
    const badLoginData = await badLoginRes.json();
    assert(badLoginData.success === false, 'Invalid password returns success: false');
    assert(!!badLoginData.error.message, 'Invalid password returns structured error message');

    // TEST 5: Duplicate Email Prevention
    console.log('\n🧪 TEST 5: Duplicate Email Prevention');
    const dupRegRes = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword, name: testName }),
    });
    assert(dupRegRes.status === 400, 'Duplicate signup returned HTTP 400 Bad Request');
    const dupRegData = await dupRegRes.json();
    assert(dupRegData.success === false, 'Duplicate signup returns success: false');

    // TEST 6: Demo Mode Login Remains Operational
    console.log('\n🧪 TEST 6: Independent Demo Mode Login');
    const demoRes = await fetch(`${API_URL}/api/auth/demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    assert(demoRes.ok, 'Demo login returned HTTP 200');
    const demoData = await demoRes.json();
    assert(demoData.success === true, 'Demo login returns success: true');
    assert(!!demoData.data.token, 'Demo login returns token');

    console.log('\n🎉 ALL AUTHENTICATION TESTS PASSED SUCCESSFULLY! 🎉\n');
  } catch (err) {
    console.error('\n❌ AUTHENTICATION TEST FAILED:', err.message);
    failed = true;
  } finally {
    if (apiProcess) apiProcess.kill();
    process.exit(failed ? 1 : 0);
  }
}

runAuthTests();
