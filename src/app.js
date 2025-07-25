require("dotenv").config();
const TradingBot = require("./bot");

async function main() {
  // Validate environment variables
  const requiredEnvVars = ["TELEGRAM_BOT_TOKEN"];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.error(`❌ Missing required environment variable: ${envVar}`);
      process.exit(1);
    }
  }

  console.log("🚀 Starting AI Trading Bot...");
  console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);

  try {
    const bot = new TradingBot();
    await bot.start();

    console.log("✅ Bot is running! Send /start to begin.");
  } catch (error) {
    console.error("💥 Failed to start bot:", error.message);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

main();
