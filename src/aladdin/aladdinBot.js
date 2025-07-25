const AladdinCore = require("./aladdinCore");

class AladdinBot {
  constructor(bot, marketData, portfolioHandler, aiAnalyzer) {
    this.bot = bot;
    this.aladdin = new AladdinCore(aiAnalyzer, marketData, portfolioHandler);
    this.sessions = new Map();

    this.setupCommands();
    this.setupConversation();
  }

  setupCommands() {
    // Main ALADDIN activation
    this.bot.command("aladdin", async (ctx) => {
      const response = this.aladdin.generateGreeting({
        marketOpen: this.aladdin.isMarketOpen(),
      });
      await ctx.reply(response, { parse_mode: "Markdown" });
    });

    // Quick commands
    this.bot.command("plan", async (ctx) => {
      const response = await this.aladdin.generateDailyPlan({});
      await ctx.reply(response, { parse_mode: "Markdown" });
    });

    this.bot.command("weekly", async (ctx) => {
      const response = await this.aladdin.generateWeeklyStrategy({});
      await ctx.reply(response, { parse_mode: "Markdown" });
    });

    this.bot.command("scan", async (ctx) => {
      const response = await this.aladdin.performMarketScan({});
      await ctx.reply(response, { parse_mode: "Markdown" });
    });
  }

  setupConversation() {
    // Handle all text messages for ALADDIN
    this.bot.on("text", async (ctx) => {
      // Skip if it's a command
      if (ctx.message.text.startsWith("/")) return;

      const userId = ctx.from.id;
      const message = ctx.message.text;

      // Check if ALADDIN is active for this user
      const session = this.sessions.get(userId);
      if (!session?.aladdinActive) {
        // Only respond to ALADDIN-related keywords
        const aladdinKeywords = [
          "aladdin",
          "plan",
          "trade",
          "options",
          "daily",
          "weekly",
        ];
        const hasKeyword = aladdinKeywords.some((kw) =>
          message.toLowerCase().includes(kw)
        );

        if (!hasKeyword && !message.match(/^[A-Z]{1,5}$/)) {
          return; // Let other handlers process
        }
      }

      // Activate ALADDIN for this session
      this.sessions.set(userId, {
        ...session,
        aladdinActive: true,
        lastActivity: new Date(),
      });

      // Process with ALADDIN
      try {
        const response = await this.aladdin.processUserMessage(message, userId);
        await ctx.reply(response, { parse_mode: "Markdown" });
      } catch (error) {
        console.error("ALADDIN error:", error);
        await ctx.reply(
          "🧠 ALADDIN experienced a processing error. Recalibrating..."
        );
      }
    });
  }
}

module.exports = AladdinBot;
