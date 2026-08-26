const { spawn } = require('child_process');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const TEST_PORT = '3097';
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

async function runLiveTest() {
  try {
    await startApiServer();

    console.log('\n1. Logging in demo user...');
    const loginRes = await fetch(`${API_URL}/api/auth/demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const loginData = await loginRes.json();
    const token = loginData.data.token;
    console.log('✓ Logged in as:', loginData.data.user.email);

    console.log('\n2. Creating conversation...');
    const convRes = await fetch(`${API_URL}/api/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: 'Live Hello Test' }),
    });
    const convData = await convRes.json();
    const convId = convData.data?.id || convData.id;
    console.log('✓ Conversation created ID:', convId);

    console.log('\n3. Sending message: "Hello" ...');
    const chatRes = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        conversationId: convId,
        content: 'Hello',
        useSSE: true,
      }),
    });

    console.log('✓ Response HTTP status:', chatRes.status);
    console.log('--- BEGIN STREAMED RESPONSE ---');

    const reader = chatRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponseText = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const dataStr = trimmed.slice(6).trim();
        if (!dataStr) continue;

        try {
          const event = JSON.parse(dataStr);
          if (event.type === 'message:delta') {
            process.stdout.write(event.content || '');
            fullResponseText += event.content || '';
          } else if (event.type === 'message:complete') {
            console.log('\n--- END STREAMED RESPONSE ---');
            console.log('✓ Received message:complete!');
            if (event.message) {
              console.log('✓ Saved Message ID:', event.message.id);
              console.log('✓ Saved Role:', event.message.role);
              console.log('✓ Saved Content:', JSON.stringify(event.message.content));
            }
          }
        } catch (e) {}
      }
    }

    if (!fullResponseText && !chatRes.ok) {
      throw new Error(`Chat API request failed with status ${chatRes.status}`);
    }

    console.log('\n🎉 LIVE "Hello" TEST PASSED PERFECTLY!');
  } catch (err) {
    console.error('\n❌ LIVE TEST FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    if (apiProcess) apiProcess.kill();
  }
}

runLiveTest();
