-require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");

async function testAPI() {
  console.log("🧪 Testing Anthropic API...");
  console.log("API Key exists:", !!process.env.ANTHROPIC_API_KEY);
  console.log(
    "API Key starts with:",
    process.env.ANTHROPIC_API_KEY?.substring(0, 10)
  );

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    console.log("📡 Making test API call...");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content:
            'Say \'API test successful\' in JSON format: {"status": "success", "message": "API test successful"}',
        },
      ],
    });

    console.log("✅ API Response:", response.content[0].text);
  } catch (error) {
    console.error("💥 API Test Failed:");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);

    if (error.status) {
      console.error("HTTP Status:", error.status);
    }

    if (error.message.includes("api_key")) {
      console.error("🔑 API Key issue detected!");
      console.error("Check your ANTHROPIC_API_KEY in .env file");
    }
  }
}

testAPI();