const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Missing GEMINI_API_KEY");
  process.exit(1);
}

const ai = new GoogleGenerativeAI(apiKey);

async function test() {
  const models = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
  for (const modelName of models) {
    console.log(`Testing model: ${modelName}...`);
    try {
      const model = ai.getGenerativeModel({ model: modelName });
      const start = Date.now();
      const response = await model.generateContent("Respond with 'Hello World' only.");
      const text = response.response.text();
      console.log(`✅ Success for ${modelName} in ${Date.now() - start}ms: "${text.trim()}"`);
    } catch (e) {
      console.log(`❌ Failed for ${modelName}: ${e.message}`);
    }
  }
}

test();
