console.log("🚀 STARTING BOT WITH NLP + TECHNICAL ANALYSIS");

require("dotenv").config();
const { Telegraf } = require("telegraf");
const NaturalLanguageProcessor = require("./ai/naturalLanguage");
const TechnicalAnalyzer = require("./analysis/technicalAnalyzer");
const StrategyBuilder = require("./strategies/strategyBuilder");
const MarketScanner = require("./scanner/marketScanner");

async function startBot() {
  try {
    const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    console.log("✅ Bot created");

    // Create minimal dependencies for NLP
    const mockAladdin = {
      gatherMarketIntelligence: async () => ({
        spy: { price: 453.24, change: 1.2 },
        vix: 15.3,
        unusualCount: 23,
      }),
      findDayTrades: async () => [],
      findOptionPlays: async () => [
        {
          symbol: "NVDA",
          strike: 500,
          type: "call",
          premium: 2.5,
          contracts: 4,
          cost: 1000,
          flowType: "SWEEP",
        },
      ],
    };

    const mockPortfolioHandler = {
      sessions: new Map(),
    };

    const mockTradingClient = {
      getAlerts: () => [],
    };

    // Create all components INSIDE the function
    const technicalAnalyzer = new TechnicalAnalyzer(mockAladdin);
    console.log("✅ Technical Analyzer created");

    const strategyBuilder = new StrategyBuilder();
    console.log("✅ Strategy Builder created");

    const marketScanner = new MarketScanner(technicalAnalyzer, strategyBuilder);
    console.log("✅ Market Scanner created");

    // Create NLP with analyzer
    const nlp = new NaturalLanguageProcessor(
      mockAladdin,
      mockPortfolioHandler,
      mockTradingClient
    );
    nlp.technicalAnalyzer = technicalAnalyzer;
    console.log("✅ NLP created with Technical Analysis");

    // Message logger
    bot.use((ctx, next) => {
      console.log(`📨 Message: ${ctx.message?.text || "[non-text]"}`);
      return next();
    });

    // Add commands
    bot.command("strategy", async (ctx) => {
      const args = ctx.message.text.split(" ").slice(1);

      if (args.length === 0) {
        await ctx.reply(strategyBuilder.listPresets(), {
          parse_mode: "Markdown",
        });
        return;
      }

      const strategyType = args[0];
      const preset = strategyBuilder.presets[strategyType];

      if (preset) {
        const strategy = await strategyBuilder.buildStrategy(ctx.from.id, {
          name: preset.name,
          rules: preset,
        });

        await ctx.reply(
          `
✅ Strategy "${preset.name}" created!

**Entry Rules:**
${JSON.stringify(preset.entry, null, 2)}

**Exit Rules:**
${JSON.stringify(preset.exit, null, 2)}

To backtest: \`/backtest ${strategy.id} SYMBOL\`
Example: \`/backtest ${strategy.id} NVDA\`
        `,
          { parse_mode: "Markdown" }
        );
      }
    });

    bot.command("backtest", async (ctx) => {
      const args = ctx.message.text.split(" ").slice(1);

      if (args.length < 2) {
        await ctx.reply("Usage: /backtest [strategy_id] [symbol]");
        return;
      }

      const [strategyId, symbol] = args;

      try {
        await ctx.reply("🔄 Running backtest...");
        const results = await strategyBuilder.backtest(strategyId, symbol);
        await ctx.reply(results, { parse_mode: "Markdown" });
      } catch (error) {
        await ctx.reply(`❌ Error: ${error.message}`);
      }
    });

    bot.command("scan", async (ctx) => {
      await ctx.reply("🔍 Scanning markets...");

      const results = await marketScanner.scanMarket();
      await ctx.reply(results, { parse_mode: "Markdown" });
    });

    bot.command("alert", async (ctx) => {
      const args = ctx.message.text.split(" ").slice(1);

      if (args.length < 3) {
        await ctx.reply(
          `
📢 **Alert Commands:**

\`/alert NVDA rsi_oversold 30\` - Alert when RSI < 30
\`/alert TSLA rsi_overbought 70\` - Alert when RSI > 70  
\`/alert SPY price_above 460\` - Alert when price > $460
\`/alert AAPL price_below 170\` - Alert when price < $170
        `,
          { parse_mode: "Markdown" }
        );
        return;
      }

      const [symbol, type, value] = args;
      const alertId = await marketScanner.createAlert(
        ctx.from.id,
        symbol.toUpperCase(),
        { type, value: parseFloat(value) }
      );

      await ctx.reply(
        `
✅ Alert created!

**Symbol**: ${symbol.toUpperCase()}
**Condition**: ${type} ${value}
**Alert ID**: ${alertId}

I'll notify you when triggered!
      `,
        { parse_mode: "Markdown" }
      );
    });

    bot.command("watchlist", async (ctx) => {
      const symbols = ["NVDA", "TSLA", "AAPL", "AMD", "SPY"];
      let report = "👀 **Watchlist Overview**\n\n";

      for (const symbol of symbols) {
        const analysis = await marketScanner.analyzeSymbol(symbol);
        const emoji = analysis.change > 0 ? "🟢" : "🔴";

        report += `${emoji} **${symbol}**: $${analysis.price.toFixed(2)} (${
          analysis.change > 0 ? "+" : ""
        }${analysis.change.toFixed(2)}%)\n`;
        report += `   RSI: ${analysis.rsi.toFixed(1)} | Vol: ${(
          analysis.volume / 1000000
        ).toFixed(1)}M\n\n`;
      }

      await ctx.reply(report, { parse_mode: "Markdown" });
    });

    // Enhanced text handler with NLP
    bot.on("text", async (ctx) => {
      console.log("🎯 TEXT HANDLER FIRED!");
      const text = ctx.message.text;
      const userId = ctx.from.id;

      if (text.startsWith("/")) return;

      try {
        console.log("🧠 Processing with NLP...");
        const response = await nlp.processMessage(text, userId, ctx);

        if (response) {
          await ctx.reply(response, { parse_mode: "Markdown" });
          console.log("✅ NLP response sent");
        }
      } catch (error) {
        console.error("NLP Error:", error.message);
        await ctx.reply("I understand but had an error. Try again!");
      }
    });

    console.log("✅ All handlers registered");

    bot.launch();
    console.log("🚀 BOT LAUNCHED WITH FULL FEATURES!");
    console.log("\n💡 Commands:");
    console.log('📊 Analysis: "analyze NVDA"');
    console.log("🎯 Strategy: /strategy");
    console.log("📈 Backtest: /backtest [id] [symbol]");
    console.log("🔍 Scanner: /scan");
    console.log("👀 Watchlist: /watchlist");
    console.log("🚨 Alerts: /alert [symbol] [condition] [value]");

    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  } catch (error) {
    console.error("Error:", error);
  }
}

startBot();
