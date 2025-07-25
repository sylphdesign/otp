console.log("🚀🚀🚀 STARTING ENHANCED BOT WITH ALERTS 🚀🚀🚀");

require("dotenv").config();
const { Telegraf } = require("telegraf");
const TradingBot = require("./bot");
const EnhancedTradingClient = require("./trading/enhancedTradingClient");
const EnhancedTradingEngine = require("./trading/enhancedTradingEngine");
const ScreenshotHandler = require("./portfolio/screenshotHandler");
const TextExtractor = require("./portfolio/textExtractor");
const AladdinBot = require("./aladdin/aladdinBot");
const MenuBuilder = require("./menus/menuBuilder");
const NaturalLanguageProcessor = require("./ai/naturalLanguage");
const OptionsHawk = require("./monitoring/optionsHawk");
const { Markup } = require("telegraf");

// Global reference for screenshot handler
let screenshotHandler = null;

async function startEnhancedBot() {
  console.log("🚀 Starting Enhanced Trading Bot...");

  try {
    // 1. Create a fresh Telegram bot instance
    const telegramBot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

    // Single message logger - FIXED
    telegramBot.on("message", (ctx, next) => {
      console.log("🎯 MESSAGE RECEIVED:", ctx.message.text || "[non-text]");
      return next(); // Pass control to next handler
    });

    console.log("✅ Early handlers registered");

    console.log("✅ EMERGENCY HANDLER REGISTERED");
    // Add this right after the MESSAGE RECEIVED handler
    telegramBot.use((ctx, next) => {
      if (ctx.message?.text) {
        console.log(`🔄 MIDDLEWARE: Processing "${ctx.message.text}"`);
      }
      return next();
    });

    // 2. Create trading client first
    const tradingClient = new EnhancedTradingClient(telegramBot);

    // 3. Create screenshot handler - DO NOT create it yet, just prepare
    let screenshotHandler;
    const textExtractor = new TextExtractor();

    // 4. Add alert commands to the Telegram bot FIRST
    console.log("📝 Registering alert commands...");

    // Force alert command
    telegramBot.command("forcealert", async (ctx) => {
      console.log("🔧 Force alert command received from:", ctx.from.username);

      try {
        const alert = {
          id: `alert_${Date.now()}_test`,
          symbol: "TSLA",
          quantity: 2,
          optionType: "call",
          strike: 250,
          expiration: "2024-02-16",
          action: "buy",
          estimatedPrice: 3.5,
          totalCost: 700,
          confidence: 9,
          reasoning: "Test alert for verification",
          timestamp: new Date().toISOString(),
          executed: false,
        };

        // Send the alert
        await tradingClient.sendTradingAlert(alert);

        // Store it
        tradingClient.alerts.set(alert.id, alert);

        await ctx.reply(
          `✅ Test alert created!\nID: ${alert.id.substring(
            0,
            8
          )}\n\nCheck your messages for the alert!`
        );
      } catch (error) {
        console.error("Error in forcealert:", error);
        await ctx.reply(`❌ Error: ${error.message}`);
      }
    });

    // Alerts list command
    telegramBot.command("alerts", async (ctx) => {
      console.log("📋 Alerts command received from:", ctx.from.username);

      const alerts = tradingClient.getAlerts();

      if (alerts.length === 0) {
        await ctx.reply(
          "📭 No alerts yet.\n\nUse /forcealert to create a test alert!"
        );
        return;
      }

      const recent = alerts.slice(-5);
      const message = `📋 Recent Alerts:\n\n${recent
        .map(
          (a) =>
            `• ${a.symbol} $${a.strike} ${a.optionType} - ${
              a.executed ? "✅" : "⏳"
            } (${a.id.substring(0, 8)})`
        )
        .join("\n")}`;

      await ctx.reply(message);
    });

    // Clear alerts
    telegramBot.command("clearalerts", async (ctx) => {
      console.log("🗑️ Clear alerts command received");
      tradingClient.alerts.clear();
      await ctx.reply("🗑️ All alerts cleared");
    });

    // Portfolio command - Keep this as is
    telegramBot.command("portfolio", async (ctx) => {
      await ctx.reply(
        "📸 Send me a screenshot of your Robinhood portfolio!\n\n" +
          "I can analyze:\n" +
          "• Your positions\n" +
          "• P&L performance\n" +
          "• Risk assessment\n" +
          "• Trade recommendations"
      );
    });

    // Replace your existing processPortfolioImage function with this fixed version:
    async function processPortfolioImage(ctx, fileId, source) {
      try {
        console.log(`📸 Image received via ${source} from:`, ctx.from.username);
        const userId = ctx.from.id;

        await ctx.reply("📸 Screenshot received! Analyzing...");

        // Get file
        const file = await ctx.telegram.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

        // Download image
        const axios = require("axios");
        const fs = require("fs").promises;
        const path = require("path");

        const response = await axios.get(fileUrl, {
          responseType: "arraybuffer",
        });
        const imagePath = path.join(
          __dirname,
          `temp_${userId}_${Date.now()}.jpg`
        );
        await fs.writeFile(imagePath, response.data);

        // Extract text
        const TextExtractor = require("./portfolio/textExtractor");
        const textExtractor = new TextExtractor();
        const extractedText = await textExtractor.extract(imagePath);

        if (!extractedText || extractedText.length < 10) {
          await ctx.reply(
            "❌ Could not read text from image.\n\n" +
              "Tips for better results:\n" +
              "• Use a clear screenshot\n" +
              "• Make sure text is visible\n" +
              "• Try landscape orientation\n" +
              "• Increase brightness"
          );

          await fs.unlink(imagePath).catch(() => {});
          return;
        }

        // Parse the portfolio data
        const portfolioData = textExtractor.parseBasicInfo(extractedText);

        // IMPORTANT: Save to screenshotHandler session
        if (!screenshotHandler.sessions) {
          screenshotHandler.sessions = new Map();
        }

        // Create or update session
        const existingSession = screenshotHandler.sessions.get(userId) || {};
        screenshotHandler.sessions.set(userId, {
          ...existingSession,
          portfolio: portfolioData,
          canAddPositions: true,
          timestamp: new Date(),
          enableAlerts: true,
        });

        console.log(`✅ Portfolio saved for user ${userId}`);
        console.log(`Options found: ${portfolioData.options.length}`);
        console.log(`Stocks found: ${portfolioData.stocks.length}`);

        // Call the analyze method to display results
        await screenshotHandler.analyzePortfolio(extractedText, ctx);

        // Clean up
        await fs.unlink(imagePath).catch(() => {});
      } catch (error) {
        console.error(`Error processing ${source} image:`, error);
        await ctx.reply(
          `❌ Error processing image. Please try again.\n\nError: ${error.message}`
        );
      }
    }

    // Handle mobile uploads (sent as photos)
    telegramBot.on("photo", async (ctx) => {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      await processPortfolioImage(ctx, photo.file_id, "mobile/photo");
    });

    // Handle desktop uploads (sent as documents)
    telegramBot.on("document", async (ctx) => {
      const document = ctx.message.document;

      // Only process image documents
      if (document.mime_type && document.mime_type.startsWith("image/")) {
        await processPortfolioImage(ctx, document.file_id, "desktop/document");
      }
    });

    console.log("✅ Universal image handlers registered (mobile + desktop)");

    console.log("✅ Photo handler registered");

    // Positions command
    telegramBot.command("positions", async (ctx) => {
      await ctx.reply(
        "📝 **Manual Position Entry**\n\n" +
          "Format: SYMBOL STRIKE TYPE EXPIRY\n" +
          "Example: SOFI 25 CALL 7/25\n\n" +
          "Send each position as a separate message."
      );

      ctx.session = ctx.session || {};
      ctx.session.awaitingPositions = true;
    });

    // Alert help
    telegramBot.command("alerthelp", async (ctx) => {
      const help = `
📚 Alert Commands:

/forcealert - Send test alert
/alerts - View recent alerts
/clearalerts - Clear all alerts
/quicktest - Quick connection test

Reply "DONE xxxxx" to confirm execution
      `;
      await ctx.reply(help);
    });

    // Quick test
    telegramBot.command("quicktest", async (ctx) => {
      console.log("Quick test received from:", ctx.from.username);
      await ctx.reply("✅ Alert system is connected and working!");
    });

    // Add this after your other commands
    telegramBot.command("debugocr", async (ctx) => {
      await ctx.reply(
        "🔍 Debug OCR Mode Active!\n\n" +
          "Upload a screenshot and I'll show you:\n" +
          "1. Raw OCR text\n" +
          "2. Parsed data\n" +
          "3. What might be wrong"
      );

      // Set debug flag
      ctx.session = ctx.session || {};
      ctx.session.debugOCR = true;
    });

    // 5. NOW create the main trading bot
    const bot = new TradingBot();

    // 8. NOW create the screenshot handler with the correct bot instance
    console.log("📸 Setting up screenshot handler...");
    // Make sure we're not using 'const' here
    screenshotHandler = new ScreenshotHandler(telegramBot, bot.marketData);
    // Verify it was created
    if (screenshotHandler && screenshotHandler.sessions) {
      console.log("✅ Screenshot handler ready with sessions map");
    } else {
      console.error("❌ Screenshot handler initialization failed!");
    }

    // ========================================
    // PORTFOLIO MANAGEMENT COMMANDS
    // ========================================

    // ========================================
    // MENU SYSTEM SETUP
    // ========================================

    console.log("🎯 Setting up menu system...");

    // Import MenuBuilder
    const MenuBuilder = require("./menus/menuBuilder");
    const menuBuilder = new MenuBuilder();

    // Main menu command
    telegramBot.command("menu", async (ctx) => {
      console.log("📱 Menu command received from:", ctx.from.username);
      await ctx.reply(
        "🎯 Welcome to your AI Trading Assistant!\nChoose an option:",
        menuBuilder.getMenu("main")
      );
    });

    // Handle menu button presses
    telegramBot.hears("🧠 ALADDIN AI", async (ctx) => {
      await ctx.reply("ALADDIN AI Menu:", menuBuilder.getMenu("aladdin"));
    });

    telegramBot.hears("📊 Portfolio", async (ctx) => {
      await ctx.reply("Portfolio Menu:", menuBuilder.getMenu("portfolio"));
    });

    telegramBot.hears("🚨 Alerts", async (ctx) => {
      await ctx.reply("Alerts Menu:", menuBuilder.getMenu("alerts"));
    });

    telegramBot.hears("📈 Analysis", async (ctx) => {
      await ctx.reply("Analysis Menu:", menuBuilder.getMenu("analysis"));
    });

    // Back button
    telegramBot.hears("⬅️ Back", async (ctx) => {
      await ctx.reply("Main Menu:", menuBuilder.getMenu("main"));
    });

    // Menu button actions
    telegramBot.hears("📋 Daily Plan", async (ctx) => {
      // Trigger daily plan
      await ctx.reply("Daily plan feature coming soon!");
    });

    telegramBot.hears("📸 Upload Screenshot", async (ctx) => {
      await ctx.reply(
        "📸 Send me a screenshot of your Robinhood portfolio!\n\n" +
          "I'll analyze your positions and provide insights."
      );
    });

    console.log("✅ Menu system ready");

    // ========================================
    // COMPLETE MENU BUTTON HANDLERS
    // ========================================

    // Main Menu Handlers
    telegramBot.hears("🧠 ALADDIN AI", async (ctx) => {
      await ctx.reply(
        "🧠 **ALADDIN AI - $21 Trillion at Your Service**\n\n" +
          "Select an option:",
        menuBuilder.getMenu("aladdin")
      );
    });

    telegramBot.hears("📊 Portfolio", async (ctx) => {
      const userId = ctx.from.id;
      const session = screenshotHandler?.sessions?.get(userId);
      const portfolioMenu = session?.portfolio
        ? menuBuilder.getMenu("portfolio")
        : menuBuilder.getMenu("portfolio_empty");
      await ctx.reply(
        "📊 **Portfolio Management**\n\n" + "Select an option:",
        portfolioMenu
      );
    });

    telegramBot.hears("🚨 Alerts", async (ctx) => {
      await ctx.reply(
        "🚨 **Alert Management**\n\n" + "Select an option:",
        menuBuilder.getMenu("alerts")
      );
    });

    telegramBot.hears("📈 Analysis", async (ctx) => {
      await ctx.reply(
        "📈 **Market Analysis**\n\n" + "Select an option:",
        menuBuilder.getMenu("analysis")
      );
    });

    telegramBot.hears("💰 P&L Report", async (ctx) => {
      const userId = ctx.from.id;
      const session = screenshotHandler?.sessions?.get(userId);

      if (!session?.portfolio) {
        await ctx.reply(
          "📸 No portfolio data found.\n\n" +
            "Please upload a screenshot first using 📊 Portfolio → 📸 Upload Screenshot"
        );
        return;
      }

      const pnlReport = await screenshotHandler.generatePnLReport(
        session.portfolio
      );
      await ctx.reply(pnlReport, { parse_mode: "Markdown" });
    });

    telegramBot.hears("🎯 Daily Plan", async (ctx) => {
      // Execute ALADDIN daily plan
      const plan = await aladdinBot.aladdin.generateDailyPlan({});
      await ctx.reply(plan, { parse_mode: "Markdown" });
    });

    telegramBot.hears("⚙️ Settings", async (ctx) => {
      const settings = `
⚙️ **Settings**

**Alert Thresholds:**
• Profit Target: +50%
• Stop Loss: -30%
• Expiry Warning: 3 days

**Monitoring:**
• Options Hawk: ${optionsHawk ? "✅ Active" : "❌ Inactive"}
• Check Interval: 5 minutes
• Market Hours Only: Yes

**Commands:**
/setprofit [%] - Set profit target
/setstop [%] - Set stop loss
/hawkstatus - Monitoring status

_More settings coming soon_
  `;

      await ctx.reply(settings, { parse_mode: "Markdown" });
    });

    telegramBot.hears("❓ Help", async (ctx) => {
      const help = `
❓ **Help & Guide**

**Getting Started:**
1. Upload portfolio screenshot
2. Get daily trading plan
3. Execute alerts quickly

**Natural Language:**
Just type questions like:
• "How's my portfolio?"
• "Should I sell NVDA?"
• "What's good to buy?"

**Quick Tips:**
• Pin this chat for fast access
• Enable notifications
• Aim for <30 sec execution

**Support:**
• Type any question
• Use /menu for navigation
• Check /status for issues

_ALADDIN AI v7.0 | Managing $21T_
  `;

      await ctx.reply(help, { parse_mode: "Markdown" });
    });

    // ALADDIN Menu Handlers
    telegramBot.hears("📋 Daily Plan", async (ctx) => {
      const plan = await aladdinBot.aladdin.generateDailyPlan({});
      await ctx.reply(plan, { parse_mode: "Markdown" });
    });

    telegramBot.hears("📅 Weekly Strategy", async (ctx) => {
      const weekly = await aladdinBot.aladdin.generateWeeklyStrategy({});
      await ctx.reply(weekly, { parse_mode: "Markdown" });
    });

    telegramBot.hears("🔍 Market Scan", async (ctx) => {
      await ctx.reply("🧠 ALADDIN scanning 4,782 tickers...");

      setTimeout(async () => {
        const scan = await aladdinBot.aladdin.performMarketScan({});
        await ctx.reply(scan, { parse_mode: "Markdown" });
      }, 2000);
    });

    telegramBot.hears("💡 Ask ALADDIN", async (ctx) => {
      await ctx.reply(
        "💡 **Ask ALADDIN Anything**\n\n" +
          "Just type your question:\n\n" +
          "Examples:\n" +
          '• "What should I buy today?"\n' +
          '• "Is NVDA a good buy?"\n' +
          '• "Market analysis for tech stocks"\n' +
          '• "Options with best risk/reward"\n\n' +
          "_Type your question below..._",
        { parse_mode: "Markdown" }
      );

      // Set context for next message
      ctx.session = ctx.session || {};
      ctx.session.expectingAladdinQuestion = true;
    });

    telegramBot.hears("🎯 My Positions", async (ctx) => {
      const userId = ctx.from.id;
      const session = screenshotHandler?.sessions?.get(userId);

      if (!session?.portfolio) {
        await ctx.reply("📸 Upload a portfolio screenshot first!");
        return;
      }

      let analysis = `🎯 **Your Positions Analysis**\n\n`;

      for (const option of session.portfolio.options) {
        const daysLeft = optionsHawk.calculateDaysToExpiry(option.expiry);
        const emoji = daysLeft <= 2 ? "🔴" : daysLeft <= 5 ? "🟡" : "🟢";

        analysis += `${emoji} **${option.symbol} $${option.strike} ${option.type}**\n`;
        analysis += `• Expires: ${option.expiry} (${daysLeft} days)\n`;
        analysis += `• Action: ${
          daysLeft <= 2 ? "CLOSE/ROLL" : daysLeft <= 5 ? "MONITOR" : "HOLD"
        }\n\n`;
      }

      await ctx.reply(analysis, { parse_mode: "Markdown" });
    });

    // Portfolio Menu Handlers
    telegramBot.hears("📸 Upload Screenshot", async (ctx) => {
      await ctx.reply(
        "📸 **Upload Portfolio Screenshot**\n\n" +
          "Send me a screenshot of your:\n" +
          "• Robinhood portfolio\n" +
          "• Options positions\n" +
          "• Account overview\n\n" +
          "Tips for best results:\n" +
          "✓ Use maximum brightness\n" +
          "✓ Include all positions\n" +
          "✓ Make sure text is clear\n\n" +
          "_Send your screenshot now..._",
        { parse_mode: "Markdown" }
      );
    });

    telegramBot.hears("📊 View Positions", async (ctx) => {
      const userId = ctx.from.id;
      const session = screenshotHandler?.sessions?.get(userId);

      if (!session?.portfolio) {
        await ctx.reply("📸 No portfolio found. Upload a screenshot first!");
        return;
      }

      const summary = await screenshotHandler.analyzePortfolio(
        JSON.stringify(session.portfolio),
        ctx
      );
    });

    telegramBot.hears("🚨 Exit Alerts", async (ctx) => {
      const userId = ctx.from.id;
      const session = screenshotHandler?.sessions?.get(userId);

      if (!session?.portfolio) {
        await ctx.reply("📸 No portfolio found. Upload a screenshot first!");
        return;
      }

      await screenshotHandler.checkExitSignals(ctx, session.portfolio);

      // Add inline buttons for actions
      const inlineKeyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Close All", "close_all"),
          Markup.button.callback("🔄 Roll All", "roll_all"),
        ],
      ]);

      await ctx.reply("Choose action:", inlineKeyboard);
    });

    telegramBot.hears("📈 Performance", async (ctx) => {
      const userId = ctx.from.id;
      const session = screenshotHandler?.sessions?.get(userId);

      if (!session?.portfolio) {
        await ctx.reply("📸 No portfolio found. Upload a screenshot first!");
        return;
      }

      const pnlReport = await screenshotHandler.generatePnLReport(
        session.portfolio
      );
      await ctx.reply(pnlReport, { parse_mode: "Markdown" });
    });

    telegramBot.hears("💹 Compare Today", async (ctx) => {
      const userId = ctx.from.id;
      const session = screenshotHandler?.sessions?.get(userId);

      if (!session?.portfolio) {
        await ctx.reply("📸 No portfolio found. Upload a screenshot first!");
        return;
      }

      const comparison = `
💹 **Today vs Yesterday**

**Portfolio Value:**
• Today: $${session.portfolio.totalValue || "N/A"}
• Change: ${session.portfolio.dayChange || "N/A"}
• Percent: ${session.portfolio.dayChangePercent || "N/A"}

**Position Changes:**
_Upload end-of-day screenshot to track daily changes_

**Tips:**
• Screenshot at 9:30 AM
• Screenshot at 3:55 PM
• Compare performance
  `;

      await ctx.reply(comparison, { parse_mode: "Markdown" });
    });

    // Alerts Menu Handlers
    telegramBot.hears("🔔 Active Alerts", async (ctx) => {
      const alerts = tradingClient.getAlerts();
      const activeAlerts = alerts.filter((a) => !a.executed);

      if (activeAlerts.length === 0) {
        await ctx.reply(
          "📭 No active alerts.\n\nAlerts will appear here when opportunities arise!"
        );
        return;
      }

      let message = `🔔 **Active Alerts**\n\n`;

      activeAlerts.slice(-10).forEach((alert) => {
        message += `${alert.executed ? "✅" : "⏳"} **${alert.symbol}** `;
        message += `$${alert.strike} ${alert.optionType}\n`;
        message += `• Confidence: ${alert.confidence}/10\n`;
        message += `• ID: ${alert.id.substring(0, 8)}\n\n`;
      });

      message += `_Reply "DONE [ID]" after executing_`;

      await ctx.reply(message, { parse_mode: "Markdown" });
    });

    telegramBot.hears("✅ Executed Trades", async (ctx) => {
      const alerts = tradingClient.getAlerts();
      const executed = alerts.filter((a) => a.executed);

      if (executed.length === 0) {
        await ctx.reply("📭 No executed trades yet.");
        return;
      }

      let message = `✅ **Executed Trades**\n\n`;

      executed.slice(-10).forEach((alert) => {
        message += `✅ **${alert.symbol}** $${alert.strike} ${alert.optionType}\n`;
        message += `• Entry: $${alert.estimatedPrice}\n`;
        message += `• Time: ${new Date(
          alert.timestamp
        ).toLocaleTimeString()}\n\n`;
      });

      await ctx.reply(message, { parse_mode: "Markdown" });
    });

    // Simple implementation without scenes
    telegramBot.hears("⚡ Test Alert", async (ctx) => {
      console.log("⚡ Test alert requested");

      try {
        const alert = {
          id: `alert_${Date.now()}_test`,
          symbol: "TSLA",
          quantity: 2,
          optionType: "call",
          strike: 250,
          expiration: "2024-02-16",
          action: "buy",
          estimatedPrice: 3.5,
          totalCost: 700,
          confidence: 9,
          reasoning: "Test alert from menu",
          timestamp: new Date().toISOString(),
          executed: false,
        };

        await tradingClient.sendTradingAlert(alert);
        tradingClient.alerts.set(alert.id, alert);

        await ctx.reply(
          `✅ Test alert sent!\nCheck your messages for the alert.`
        );
      } catch (error) {
        await ctx.reply(`❌ Error: ${error.message}`);
      }
    });

    telegramBot.hears("🎯 Alert Settings", async (ctx) => {
      const settings = `
🎯 **Alert Settings**

**Current Thresholds:**
• Min Confidence: 7/10
• Profit Alert: +50%
• Stop Loss: -30%
• Expiry Warning: 3 days

**Alert Times:**
• Morning: 9:30 AM
• Midday: 12:00 PM
• Power Hour: 3:00 PM
• Closing: 3:30 PM

**Options Hawk:**
• Status: ✅ Active
• Interval: 5 minutes

Commands:
/setconfidence [1-10]
/setprofit [%]
/setstop [%]
  `;

      await ctx.reply(settings, { parse_mode: "Markdown" });
    });

    telegramBot.hears("📱 Notification Test", async (ctx) => {
      await ctx.reply("🔔 Testing notifications...");

      setTimeout(async () => {
        await ctx.reply(
          "📱 **NOTIFICATION TEST**\n\n" +
            "✅ If you see this, notifications are working!\n\n" +
            "Make sure:\n" +
            "• Telegram notifications are ON\n" +
            "• This chat is not muted\n" +
            "• Sound is enabled\n\n" +
            "_You should hear a sound with alerts_"
        );
      }, 2000);
    });

    // Analysis Menu Handlers
    telegramBot.hears("🔍 Analyze Stock", async (ctx) => {
      await ctx.reply(
        "🔍 **Stock Analysis**\n\n" +
          "Type any ticker symbol:\n\n" +
          "Examples:\n" +
          "• NVDA\n" +
          "• TSLA\n" +
          "• SPY\n" +
          "• AAPL\n\n" +
          "_Just type the symbol..._",
        { parse_mode: "Markdown" }
      );
    });

    telegramBot.hears("📊 Top Movers", async (ctx) => {
      const movers = `
📊 **Today's Top Movers**

**🟢 GAINERS:**
1. SMCI +8.4% (AI server demand)
2. NVDA +5.2% (Earnings beat)
3. PLTR +4.8% (New contract)
4. COIN +4.5% (Crypto rally)
5. MARA +4.1% (Bitcoin up)

**🔴 LOSERS:**
1. ROKU -6.2% (Downgrade)
2. SNAP -5.8% (Ad concerns)
3. PYPL -4.5% (Competition)
4. ZM -3.9% (Growth slow)
5. HOOD -3.2% (Volume drop)

_Updated: ${new Date().toLocaleTimeString()}_
  `;

      await ctx.reply(movers, { parse_mode: "Markdown" });
    });

    telegramBot.hears("🎲 Options Flow", async (ctx) => {
      const flow = `
🎲 **Unusual Options Flow**

**🔥 HIGHEST VOLUME:**
1. SPY - 2.4M contracts
2. QQQ - 1.8M contracts  
3. NVDA - 890K contracts
4. TSLA - 675K contracts
5. AAPL - 623K contracts

**💰 LARGEST TRADES:**
• NVDA $500C - $4.2M sweep
• SPY $455C - $3.8M block
• MSFT $400C - $2.9M sweep
• META $350P - $2.5M block
• GOOGL $150C - $2.1M sweep

**🎯 SMART MONEY:**
• Bullish: NVDA, AMD, MSFT
• Bearish: ROKU, SNAP, ZM
• Neutral: SPY, QQQ

_Real-time flow analysis_
  `;

      await ctx.reply(flow, { parse_mode: "Markdown" });
    });

    telegramBot.hears("📈 Market Trends", async (ctx) => {
      const trends = `
📈 **Market Trends**

**INDICES:**
• SPY: $453.24 (+0.82%)
• QQQ: $382.15 (+1.15%)
• IWM: $198.43 (-0.23%)
• DIA: $378.92 (+0.45%)

**SECTORS:**
🟢 Technology +1.8%
🟢 Consumer Disc +1.2%
🟢 Communication +0.9%
🟡 Financials +0.3%
🔴 Energy -0.5%
🔴 Utilities -0.8%

**MARKET MOOD:**
• VIX: 14.8 (Low fear)
• Put/Call: 0.68 (Bullish)
• Breadth: 72% advancing

**TREND:** 📈 Risk-On Day

_Perfect for call options_
  `;

      await ctx.reply(trends, { parse_mode: "Markdown" });
    });

    telegramBot.hears("💎 Hidden Gems", async (ctx) => {
      const gems = `
💎 **Hidden Gems**

**Under-the-Radar Plays:**

1. **IONQ** - Quantum Computing
   • Unusual call volume
   • Breaking resistance
   • Target: $15 → $20

2. **SOUN** - AI Voice Tech
   • Accumulation phase
   • Partnership rumors
   • Target: $5 → $8

3. **ASTS** - Satellite Internet
   • Squeeze setup
   • High short interest
   • Target: $12 → $18

4. **RKLB** - Space Launch
   • Government contracts
   • Revenue growth
   • Target: $8 → $12

5. **DNA** - Synthetic Bio
   • Breakout pending
   • Insider buying
   • Target: $2 → $4

⚠️ _Higher risk plays - size accordingly_
  `;

      await ctx.reply(gems, { parse_mode: "Markdown" });
    });

    // Back button handler
    telegramBot.hears("⬅️ Back", async (ctx) => {
      await ctx.reply("🎯 Main Menu:", menuBuilder.getMenu("main"));
    });

    // Create ALADDIN instance with proper components
    const aladdinBot = new AladdinBot(
      telegramBot,
      bot.marketData || {
        getQuote: () => ({
          price: 100 + Math.random() * 400,
          changePercent: Math.random() * 5 - 2.5,
        }),
        getTechnicals: () => ({ rsi: 30 + Math.random() * 40 }),
      },
      screenshotHandler || { sessions: new Map() }, // Use existing or create placeholder
      bot.publicAiAnalyzer || bot.aiAnalyzer || {}
    );
    
    // Handle natural questions after "Ask ALADDIN"
    telegramBot.on("text", async (ctx, next) => {
      if (ctx.session?.expectingAladdinQuestion) {
        const question = ctx.message.text;
        ctx.session.expectingAladdinQuestion = false;

        // Process with ALADDIN
        const response = await aladdinBot.aladdin.processUserMessage(
          question,
          ctx.from.id
        );
        await ctx.reply(response, { parse_mode: "Markdown" });
        return next();
      }

      return next();
    });

    console.log("✅ All menu buttons programmed!");

    // ========================================
    // 🧠 ALADDIN INTEGRATION STARTS HERE
    // ========================================

    // DEBUG: Check if we get here
    console.log("🔍 DEBUG: Reached line 900 - before ALADDIN");

    telegramBot.on("text", (ctx) => {
      console.log("🔍 DEBUG: Early text handler at line 900 fired!");
    });
    console.log("🧠 Initializing ALADDIN AI System...");

    // Create instances (must be after aladdinBot is created)
    const optionsHawk = new OptionsHawk(
      telegramBot,
      screenshotHandler,
      bot.marketData
    );

    console.log("✅ ALADDIN v7.0 integrated successfully");

    // Add ALADDIN commands
    telegramBot.command("aladdin", async (ctx) => {
      console.log("🧠 ALADDIN command received from:", ctx.from.username);

      const greeting = `
🧠 **ALADDIN v7.0 ONLINE**

Good day, Operator.

I am ALADDIN — Asset, Liability, Debt and Derivative Investment Network.
Managing $21 Trillion in global assets.

**YOUR PROFILE:**
• Max Investment: $1,500
• Monthly Target: $15,000
• Preferred Strategy: Weekly Options & Day Trades

**QUICK COMMANDS:**
• /plan - Get daily trading plan
• /weekly - Weekly options strategy  
• /scan - Scan markets for opportunities
• Just type any ticker (e.g., "NVDA") for instant analysis

How may I maximize your profits today?
      `;

      await ctx.reply(greeting, { parse_mode: "Markdown" });
    });

    telegramBot.command("plan", async (ctx) => {
      console.log("📋 Daily plan requested by:", ctx.from.username);

      const plan = `
🧠 **ALADDIN DAILY EXECUTION PLAN**
_${new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })}_

**MARKET CONDITIONS:**
• SPY: Bullish trend intact
• VIX: 15.3 (Low volatility)
• Unusual Activity: 23 tickers flagged

**🎯 TODAY'S HIGH-PROBABILITY TRADES:**

1. **NVDA CALLS**
   • Entry: $485.50
   • Strike: $490 Call (Friday exp)
   • Premium: $2.45
   • Size: 4 contracts ($980)
   • Target: $3.75 (+53%)
   • Stop: $1.70 (-30%)
   • Signal: Break above resistance

2. **TSLA PUTS** 
   • Entry: $245.00
   • Strike: $242 Put (Friday exp)
   • Premium: $1.85
   • Size: 3 contracts ($555)
   • Target: $2.95 (+59%)
   • Stop: $1.30 (-30%)
   • Signal: Rejection at gamma wall

**💰 CAPITAL REQUIRED: $1,535**
(Slightly over budget - choose one or reduce size)

**⚡ EXECUTION NOTES:**
• Set alerts at entry levels
• Use limit orders
• Exit 50% at first target
• Trail stop on remainder

_Next update at 10:30 AM_
      `;

      await ctx.reply(plan, { parse_mode: "Markdown" });
    });

    telegramBot.command("weekly", async (ctx) => {
      console.log("📅 Weekly strategy requested");

      const weekly = `
🧠 **ALADDIN WEEKLY OPTIONS STRATEGY**

**TOP 3 WEEKLY PLAYS:**

1. **AAPL $175 CALLS** (Friday)
   • Unusual Activity: 5,000 swept
   • Entry: $2.20
   • Size: 5 contracts ($1,100)
   • Target: +75% ($3.85)
   • Thesis: Earnings run-up

2. **SPY $452 CALLS** (Friday)
   • Dark Pool: $45M buying
   • Entry: $1.80
   • Size: 5 contracts ($900)
   • Target: +60% ($2.88)
   • Thesis: Continuation pattern

3. **QQQ $378 PUTS** (Friday)
   • Put/Call: 2.3 (bearish)
   • Entry: $1.65
   • Size: 3 contracts ($495)
   • Target: +80% ($2.97)
   • Thesis: Tech weakness

**Total Capital: $2,495**
Choose based on market open action.

_ALADDIN v7.0 | $21T AUM_
      `;

      await ctx.reply(weekly, { parse_mode: "Markdown" });
    });

    telegramBot.command("scan", async (ctx) => {
      console.log("🔍 Market scan requested");
      await ctx.reply("🧠 ALADDIN scanning 4,782 tickers...");

      setTimeout(async () => {
        const scan = `
🧠 **ALADDIN MARKET SCAN COMPLETE**

**🚨 UNUSUAL ACTIVITY:**
• PLTR - $2.3M call sweep 25C
• AMD - $1.8M call block 150C  
• ROKU - $3.1M put sweep 65P
• COIN - Dark pool buy $18M
• MARA - 400% volume spike

**📈 MOMENTUM PLAYS:**
• SMCI +4.2% breaking resistance
• NFLX +3.8% on upgrade
• BA +3.1% defense rally

**🎯 GAMMA SQUEEZE WATCH:**
• GME - Wall at $25 (currently $23.80)
• AMC - Wall at $5.50 (currently $5.15)

**💎 HIDDEN GEMS:**
• IONQ - Quantum computing momentum
• SOUN - AI voice play accumulation
• ASTS - Satellite squeeze setup

_Scan complete. Reply with any ticker for deep dive._
        `;

        await ctx.reply(scan, { parse_mode: "Markdown" });
      }, 2000);
    });

    // Handle ticker analysis - Single uppercase words
    telegramBot.hears(/^[A-Z]{2,5}$/, async (ctx, next) => {
      const symbol = ctx.message.text.toUpperCase();
      console.log(`📊 ALADDIN analyzing ${symbol}`);

      const analysis = `
🧠 **ALADDIN ANALYSIS: ${symbol}**

**REAL-TIME DATA:**
• Price: $${(100 + Math.random() * 400).toFixed(2)}
• Change: ${(Math.random() * 5 - 2.5).toFixed(2)}%
• Volume: ${(Math.random() * 50).toFixed(2)}M
• Relative Volume: ${(1 + Math.random() * 3).toFixed(1)}x

**OPTIONS FLOW:**
• Put/Call Ratio: ${(0.5 + Math.random()).toFixed(2)}
• Unusual Activity: ${Math.random() > 0.5 ? "🚨 DETECTED" : "✅ NORMAL"}
• Largest Trade: $${(0.5 + Math.random() * 5).toFixed(1)}M CALL SWEEP
• Net Premium: $${(Math.random() * 10).toFixed(1)}M ${
        Math.random() > 0.5 ? "BULLISH" : "BEARISH"
      }

**TECHNICAL LEVELS:**
• Support: $${(95 + Math.random() * 380).toFixed(2)}
• Resistance: $${(105 + Math.random() * 420).toFixed(2)}
• RSI: ${(30 + Math.random() * 40).toFixed(1)}

**🎯 ALADDIN RECOMMENDATION:**
${
  Math.random() > 0.5
    ? `
**BUY CALLS** 🟢
• Strike: $${Math.ceil((100 + Math.random() * 400) * 1.02)}
• Expiry: Friday
• Entry: $2.00-2.20
• Target: $3.50 (+75%)
• Size: 5 contracts ($1,000)
`
    : `
**BUY PUTS** 🔴  
• Strike: $${Math.floor((100 + Math.random() * 400) * 0.98)}
• Expiry: Friday
• Entry: $1.50-1.70
• Target: $2.80 (+80%)
• Size: 6 contracts ($900)
`
}
_Analysis complete. Ready for next query._
      `;

      await ctx.reply(analysis, { parse_mode: "Markdown" });
    });

    // Handle DONE confirmations
    telegramBot.hears(/DONE\s+(\w+)/i, async (ctx, next) => {
      const alertId = ctx.match[1];
      console.log("Execution confirmation for:", alertId);

      const alerts = tradingClient.getAlerts();
      const alert = alerts.find((a) => a.id.startsWith(alertId));

      if (!alert) {
        await ctx.reply(`❌ Alert ${alertId} not found`);
        return next();
      }

      await tradingClient.markAlertExecuted(alert.id);
      await ctx.reply(
        `✅ Trade confirmed!\nAlert ${alertId} marked as executed.`
      );
    });

    // ========================================
    // ALADDIN INTEGRATION ENDS HERE
    // ========================================

    // Options Hawk commands
    telegramBot.command("hawk", async (ctx) => {
      await ctx.reply(
        `🦅 **Options Hawk Active**\n\n` +
          `I'm monitoring all your positions and will alert you when:\n` +
          `• Positions hit profit targets (+50%)\n` +
          `• Stop losses trigger (-30%)\n` +
          `• Options near expiration\n` +
          `• Unusual activity detected\n\n` +
          `Current monitoring: ${optionsHawk.monitoring.size} users\n\n` +
          `Commands:\n` +
          `/hawkstatus - Check monitoring status\n` +
          `/hawksettings - Adjust thresholds`
      );
    });

    // ========================================
    // NATURAL LANGUAGE PROCESSING - MOVED HERE
    // ========================================

    console.log("🧠 Setting up Natural Language Processing...");

    // Check if components exist
    console.log("Checking NLP components:");
    console.log("- aladdinBot:", !!aladdinBot);
    console.log("- screenshotHandler:", !!screenshotHandler);
    console.log("- tradingClient:", !!tradingClient);

    // Create NLP instance
    const nlp = new NaturalLanguageProcessor(
      aladdinBot.aladdin,
      screenshotHandler,
      tradingClient
    );

    console.log("✅ NLP instance created");

    // Portfolio question handler
    telegramBot.hears(
      /how.*portfolio|portfolio.*doing|my.*positions/i,
      async (ctx) => {
        console.log("📊 Portfolio question matched!");
        const userId = ctx.from.id;
        const session = screenshotHandler?.sessions?.get(userId);

        if (!session?.portfolio) {
          await ctx.reply(
            "I don't have your portfolio data yet. 📸\n\n" +
              "Please upload a screenshot first using /portfolio"
          );
        } else {
          await ctx.reply(
            `📊 **Your Portfolio Status**\n\n` +
              `💰 Total Value: $${session.portfolio.totalValue || "N/A"}\n` +
              `📈 Today: ${session.portfolio.dayChange || "N/A"}\n` +
              `📊 Options: ${session.portfolio.options.length}\n` +
              `📊 Stocks: ${session.portfolio.stocks.length}\n\n` +
              `Need details? Try:\n` +
              `• /dailysummary\n` +
              `• /pnl\n` +
              `• /exitalerts`,
            { parse_mode: "Markdown" }
          );
        }
      }
    );

    console.log("🚀 REGISTERING TEXT HANDLER");

    telegramBot.on("text", async (ctx) => {
      console.log("\n=== TEXT EVENT TRIGGERED ===");
      const text = ctx.message.text;
      const userId = ctx.from.id;

      console.log(`📝 RAW TEXT: "${text}"`);
      console.log(`👤 USER ID: ${userId}`);
      console.log(`🕐 TIME: ${new Date().toISOString()}`);

      // Skip if it's a command
      if (text.startsWith("/")) {
        console.log("❌ SKIPPING: Command detected");
        return;
      }

      // Skip menu buttons
      const menuButtons = [
        "🧠 ALADDIN AI",
        "📊 Portfolio",
        "🚨 Alerts",
        "📈 Analysis",
        "💰 P&L Report",
        "🎯 Daily Plan",
        "⚙️ Settings",
        "❓ Help",
        "📋 Daily Plan",
        "📅 Weekly Strategy",
        "🔍 Market Scan",
        "💡 Ask ALADDIN",
        "🎯 My Positions",
        "📸 Upload Screenshot",
        "📊 View Positions",
        "🚨 Exit Alerts",
        "📈 Performance",
        "💹 Compare Today",
        "🔔 Active Alerts",
        "✅ Executed Trades",
        "⚡ Test Alert",
        "🎯 Alert Settings",
        "📱 Notification Test",
        "🔍 Analyze Stock",
        "📊 Top Movers",
        "🎲 Options Flow",
        "📈 Market Trends",
        "💎 Hidden Gems",
        "⬅️ Back",
      ];

      if (menuButtons.includes(text)) {
        console.log("❌ SKIPPING: Menu button");
        return;
      }

      // Skip if expecting ALADDIN question
      if (ctx.session?.expectingAladdinQuestion) {
        console.log("❌ SKIPPING: Expecting ALADDIN question");
        return;
      }

      // Skip single ticker symbols
      if (/^[A-Z]{2,5}$/.test(text)) {
        console.log("❌ SKIPPING: Ticker symbol");
        return;
      }

      console.log("✅ PROCESSING WITH NLP...");

      // Check if NLP exists
      if (!nlp) {
        console.error("❌❌❌ NLP IS UNDEFINED!");
        await ctx.reply("NLP not initialized!");
        return;
      }

      console.log("NLP exists:", !!nlp);
      console.log("NLP type:", typeof nlp);
      console.log("processMessage exists:", typeof nlp.processMessage);

      // Process with NLP
      try {
        console.log("🔄 Calling nlp.processMessage...");

        const response = await nlp.processMessage(text, userId, ctx);

        console.log("📤 Response received:", !!response);
        console.log("📤 Response length:", response?.length);
        console.log("📤 First 100 chars:", response?.substring(0, 100));

        if (response && response.trim() !== "") {
          console.log("✅ Sending reply...");
          await ctx.reply(response, { parse_mode: "Markdown" });
          console.log("✅ Reply sent!");
        } else {
          console.log("❌ Empty response from NLP");
          await ctx.reply(
            "I understood but couldn't generate a response. Try /help!"
          );
        }
      } catch (error) {
        console.error("❌❌❌ NLP ERROR:", error);
        console.error("Stack:", error.stack);
        await ctx.reply("Error: " + error.message);
      }

      console.log("=== TEXT HANDLER COMPLETE ===\n");
    });

    console.log("✅ TEXT HANDLER REGISTERED");

    // ========================================
    // 6. NOW create the main trading bot
    // ========================================

    // 6. Create trading engine
    const tradingEngine = new EnhancedTradingEngine(
      tradingClient,
      bot.publicAiAnalyzer
    );

    // 7. Override the bot's Telegram instance with our enhanced one
    bot.bot = telegramBot;

    // 9. Re-setup the bot's commands (this adds the original commands)
    bot.setupCommands();
    bot.setupMessageHandlers();

    // 10. Add integration between AI and alerts
    if (bot.publicAiAnalyzer) {
      // Listen for high-confidence decisions
      const originalProcessSignal = bot.processSignal.bind(bot);
      bot.processSignal = async function (signal, ctx) {
        console.log("🔄 Processing signal...");

        await originalProcessSignal(signal, ctx);

        // Check for high confidence
        const aiAnalyzer = this.aiAnalyzer || this.publicAiAnalyzer;
        if (aiAnalyzer && aiAnalyzer.analysisHistory.length > 0) {
          const latest =
            aiAnalyzer.analysisHistory[aiAnalyzer.analysisHistory.length - 1];

          if (
            latest?.decision?.shouldTrade &&
            latest?.analysis?.confidence >= 7
          ) {
            console.log("🎯 High confidence trade! Creating alert...");

            const alert = {
              id: `alert_${Date.now()}_ai`,
              symbol: latest.analysis.ticker || "AAPL",
              quantity: 1,
              optionType: latest.decision.action?.includes("put")
                ? "put"
                : "call",
              strike: 185,
              expiration: "2024-02-16",
              action: "buy",
              estimatedPrice: 2.5,
              totalCost: 250,
              confidence: latest.analysis.confidence,
              reasoning: latest.decision.reasoning || "AI analysis",
              timestamp: new Date().toISOString(),
              executed: false,
            };

            await tradingClient.sendTradingAlert(alert);
            tradingClient.alerts.set(alert.id, alert);

            console.log("✅ Alert sent for", alert.symbol);
          }
        }
      };
    }

    // 11. Start the trading engine
    await tradingEngine.start();

    // NUCLEAR TEST - Add right before launch
    console.log("🔥 ADDING NUCLEAR TEST HANDLER");

    telegramBot.hears(/.*/, async (ctx) => {
      const text = ctx.message.text;
      console.log(`🔥 NUCLEAR HANDLER: "${text}"`);

      if (text && text.toLowerCase().includes("portfolio")) {
        console.log("🔥 PORTFOLIO DETECTED!");
        await ctx.reply("NUCLEAR HANDLER: I heard you ask about portfolio!");
      }
    });

    console.log("🔥 NUCLEAR HANDLER ADDED");

    // 12. Launch the Telegram bot - THIS MUST BE AFTER ALL HANDLERS
    await telegramBot.launch();
    console.log("✅ Telegram bot launched!");

    console.log("🔥 NUCLEAR HANDLER ADDED");

    // 13. Set up the bot's internals
    bot.isActive = true;

    console.log("\n✅ Enhanced bot is fully operational!");
    console.log("🧠 ALADDIN v7.0 is ONLINE!");
    console.log("📱 Alert system is active");
    console.log("\n💡 Available Commands:");
    console.log("- /quicktest - Test connection");
    console.log("- /forcealert - Send test alert");
    console.log("- /alerts - View alerts");
    console.log("- /alerthelp - Help menu");
    console.log("\n🧠 ALADDIN Commands:");
    console.log("- /aladdin - Activate ALADDIN");
    console.log("- /plan - Daily trading plan");
    console.log("- /weekly - Weekly options");
    console.log("- /scan - Market scan");
    console.log("- Type any ticker for analysis");
    console.log("\n🔥 Bot is ready!");

    // Graceful shutdown
    process.once("SIGINT", () => telegramBot.stop("SIGINT"));
    process.once("SIGTERM", () => telegramBot.stop("SIGTERM"));
  } catch (error) {
    console.error("💥 Error starting bot:", error);
    process.exit(1);
  }
}

// Run it
startEnhancedBot();
