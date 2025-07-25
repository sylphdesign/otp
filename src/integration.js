// integration.js - Drop-in replacement for your existing setup

require("dotenv").config();
const TradingBot = require("./bot");
const EnhancedTradingClient = require("./trading/robinhoodClient");
const EnhancedTradingEngine = require("./trading/tradingEngine");

async function setupEnhancedBot() {
  console.log("🚀 Setting up Enhanced Trading Bot with Alert System...");

  // 1. Initialize your existing bot
  const bot = new TradingBot();

  // 2. Replace RobinhoodClient with EnhancedTradingClient
  const tradingClient = new EnhancedTradingClient(bot.bot);

  // 3. Create Enhanced Trading Engine
  const tradingEngine = new EnhancedTradingEngine(
    tradingClient,
    bot.aiAnalyzer,
    bot.bot
  );

  // 4. Connect AI decisions to trading engine
  bot.aiAnalyzer.on("tradingDecision", async (decision) => {
    if (decision.shouldTrade && decision.confidence >= 7) {
      await tradingEngine.executeTradeFromDecision(decision);
    }
  });

  // 5. Add new commands to your bot
  setupNewCommands(bot, tradingClient, tradingEngine);

  // 6. Start everything
  await bot.start();
  await tradingEngine.start();

  console.log("✅ Enhanced bot is running with alert system!");
  console.log("📱 Alerts will be sent to Telegram");
  console.log("💡 Reply 'DONE xxxxx' to confirm execution");

  return { bot, tradingClient, tradingEngine };
}

function setupNewCommands(bot, tradingClient, tradingEngine) {
  // Add alert management commands
  bot.bot.command("alerts", async (ctx) => {
    const alerts = tradingClient.getAlerts();
    const recent = alerts.slice(-5);

    if (recent.length === 0) {
      await ctx.reply("No recent alerts");
      return;
    }

    const message = `📋 **RECENT ALERTS**\n\n${recent
      .map(
        (a) =>
          `• ${a.symbol} $${a.strike}${a.optionType[0].toUpperCase()} - ${
            a.executed ? "✅ Executed" : "⏳ Pending"
          } (${a.id.substring(0, 8)})`
      )
      .join("\n")}`;

    await ctx.reply(message, { parse_mode: "Markdown" });
  });

  bot.bot.command("positions", async (ctx) => {
    const positions = tradingClient.getPositions();

    if (positions.length === 0) {
      await ctx.reply("No open positions");
      return;
    }

    const message = `📊 **OPEN POSITIONS**\n\n${positions
      .map(
        (p) =>
          `• ${p.symbol} $${
            p.strike
          }${p.optionType[0].toUpperCase()}\n  Entry: $${p.entryPrice} | Qty: ${
            p.quantity
          }`
      )
      .join("\n\n")}`;

    await ctx.reply(message, { parse_mode: "Markdown" });
  });

  bot.bot.command("performance", async (ctx) => {
    const stats = tradingEngine.getPerformanceStats();
    const message = tradingEngine.formatPerformanceMessage(stats);
    await ctx.reply(message, { parse_mode: "Markdown" });
  });

  // Manual trade command
  bot.bot.command("trade", async (ctx) => {
    const args = ctx.message.text.split(" ").slice(1);

    if (args.length < 4) {
      await ctx.reply(
        "Usage: /trade SYMBOL STRIKE CALL/PUT QUANTITY\n" +
          "Example: /trade AAPL 185 CALL 2"
      );
      return;
    }

    const [symbol, strike, type, quantity] = args;

    // Create manual alert
    const alert = await tradingClient.placeOptionOrder({
      symbol: symbol.toUpperCase(),
      strike: parseFloat(strike),
      optionType: type.toLowerCase(),
      quantity: parseInt(quantity),
      action: "buy",
      expiration: getNextFriday(), // Helper function
      decision: {
        confidence: 10,
        reasoning: "Manual trade command",
      },
    });

    await ctx.reply(`✅ Alert created: ${alert.id.substring(0, 8)}`);
  });
}

function getNextFriday() {
  const today = new Date();
  const friday = new Date(today);
  friday.setDate(today.getDate() + ((5 - today.getDay() + 7) % 7 || 7));
  return friday.toISOString().split("T")[0];
}

// Environment variables to add to your .env file:
const requiredEnvVars = `
# Add these to your .env file:

# Telegram Configuration
TELEGRAM_USER_ID=YOUR_TELEGRAM_USER_ID
TELEGRAM_CHAT_ID=YOUR_TELEGRAM_CHAT_ID

# Push Notifications (Optional)
PUSHOVER_TOKEN=your_pushover_token
PUSHOVER_USER=your_pushover_user

# Trading Parameters
STOP_LOSS_PERCENTAGE=20
PROFIT_TARGET_PERCENTAGE=50
MAX_POSITION_SIZE=1000
COOLDOWN_PERIOD=30

# Alert Settings
ALERT_EXPIRATION_MINUTES=5
ENABLE_PUSH_NOTIFICATIONS=true
`;

// Export for use
module.exports = { setupEnhancedBot, requiredEnvVars };

// Run if called directly
if (require.main === module) {
  setupEnhancedBot().catch(console.error);
}
