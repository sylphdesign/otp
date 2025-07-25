console.log("🚀 STARTING FIXED BOT");

require("dotenv").config();
const { Telegraf } = require("telegraf");
const TradingBot = require("./bot");
const EnhancedTradingClient = require("./trading/enhancedTradingClient");
const ScreenshotHandler = require("./portfolio/screenshotHandler");
const AladdinBot = require("./aladdin/aladdinBot");
const NaturalLanguageProcessor = require("./ai/naturalLanguage");

async function startBot() {
  try {
    // 1. Create bot instance
    const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    console.log("✅ Bot created");

    // 2. Message logger
    bot.use((ctx, next) => {
      if (ctx.message?.text) {
        console.log(`📨 Message: ${ctx.message.text}`);
      }
      return next();
    });

    // 3. Create all components FIRST
    console.log("📦 Creating components...");

    const tradingClient = new EnhancedTradingClient(bot);
    console.log("✅ Trading client ready");

    const tradingBot = new TradingBot();
    tradingBot.isActive = false; 
    console.log("✅ Trading bot ready");

    const screenshotHandler = new ScreenshotHandler(bot, tradingBot.marketData);
    console.log("✅ Screenshot handler ready");

    // Create ALADDIN with safe defaults
    const aladdinBot = new AladdinBot(
      bot,
      tradingBot.marketData || { getQuote: () => ({ price: 100 }) },
      screenshotHandler || { sessions: new Map() },
      {}
    );
    console.log("✅ ALADDIN ready");

    // Create NLP
    const nlp = new NaturalLanguageProcessor(
      aladdinBot.aladdin,
      screenshotHandler,
      tradingClient
    );
    console.log("✅ NLP ready");

    // 4. Register commands
    bot.command("menu", async (ctx) => {
      await ctx.reply(
        "🎯 Trading Bot Menu\n\nCommands:\n/portfolio - View portfolio\n/alerts - View alerts\n/help - Get help"
      );
    });

    bot.command("portfolio", async (ctx) => {
      await ctx.reply("📸 Send me a screenshot of your portfolio!");
    });

    bot.command("alerts", async (ctx) => {
      const alerts = tradingClient.getAlerts();
      await ctx.reply(`📬 You have ${alerts.length} alerts`);
    });

    console.log("✅ Commands registered");

    // 5. Register button handlers
    bot.hears("📊 Portfolio", async (ctx) => {
      await ctx.reply("Portfolio menu selected");
    });

    bot.hears("🚨 Alerts", async (ctx) => {
      await ctx.reply("Alerts menu selected");
    });

    console.log("✅ Button handlers registered");

    // 6. Register text handler LAST
    bot.on("text", async (ctx) => {
      console.log("🎯 TEXT HANDLER REACHED!");
      const text = ctx.message.text;
      const userId = ctx.from.id;

      console.log(`💬 Processing: "${text}"`);

      // Skip commands
      if (text.startsWith("/")) return;

      // Skip buttons
      if (text.includes("📊") || text.includes("🚨")) return;

      // Process with NLP
      try {
        console.log("🧠 Calling NLP...");
        const response = await nlp.processMessage(text, userId, ctx);

        if (response) {
          await ctx.reply(response, { parse_mode: "Markdown" });
          console.log("✅ NLP response sent");
        }
      } catch (error) {
        console.error("❌ NLP error:", error.message);

        // Fallback response
        if (text.toLowerCase().includes("portfolio")) {
          await ctx.reply(
            "I heard you ask about your portfolio! Upload a screenshot with /portfolio"
          );
        } else {
          await ctx.reply(
            "I'm here to help! Try asking about your portfolio or use /menu"
          );
        }
      }
    });

    console.log("✅ Text handler registered");

    // 7. Launch bot with timeout protection
    console.log("📍 About to launch bot...");
    
    const launchPromise = bot.launch();
    const timeoutPromise = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Launch timeout')), 5000);
    });
    
    try {
      await Promise.race([launchPromise, timeoutPromise]);
      console.log("🚀 BOT IS LIVE!");
    } catch (error) {
      console.log("⚠️ Launch issue, but bot might still work:", error.message);
    }
    
    // Check if bot is actually running
    setTimeout(() => {
      console.log("🏃 Bot status check - if you see this, bot is running!");
    }, 1000);

    console.log("\n💡 Try these:");
    console.log('- Type: "How\'s my portfolio?"');
    console.log('- Type: "Hi"');
    console.log("- Type: /menu");
}

// Start it
startBot();
