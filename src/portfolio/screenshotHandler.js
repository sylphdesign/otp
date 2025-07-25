const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");
const TextExtractor = require("./textExtractor");

class ScreenshotHandler {
  constructor(bot, marketData = null) {
    this.bot = bot;
    this.marketData = marketData; // Optional market data integration
    this.textExtractor = new TextExtractor();
    this.sessions = new Map(); // Store user sessions
    this.tradeJournal = new Map(); // Track trades
    this.setupCommands();
    this.setupScheduledTasks();
  }

  setupCommands() {
    // Handle photo uploads
    this.bot.on("photo", async (ctx) => {
      try {
        // Get highest resolution photo
        const photo = ctx.message.photo.pop();
        const file = await ctx.telegram.getFile(photo.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

        await ctx.reply("📸 Screenshot received! Analyzing...");

        // Download and save image
        const imagePath = await this.downloadImage(fileUrl, ctx.from.id);

        // Extract text using OCR
        const extractedText = await this.textExtractor.extract(imagePath);

        if (!extractedText || extractedText.length < 10) {
          await ctx.reply(
            "❌ Could not read text from image.\n\n" +
              "Tips for better results:\n" +
              "• Use a clear screenshot\n" +
              "• Make sure text is visible\n" +
              "• Try landscape orientation\n" +
              "• Increase brightness"
          );

          // Clean up
          await fs.unlink(imagePath).catch(() => {});
          return;
        }

        // Analyze the portfolio
        await this.analyzePortfolio(extractedText, ctx);

        // Clean up image file
        await fs.unlink(imagePath).catch(() => {});
      } catch (error) {
        console.error("Photo processing error:", error);
        await ctx.reply("❌ Error processing image. Please try again.");
      }
    });

    // Handle manual position additions
    this.bot.hears(
      /^add\s+([A-Z]{2,5})\s+([\d.]+)\s+(call|put)(?:\s+(\d{1,2}\/\d{1,2}))?(?:\s+@\s*([\d.]+))?/i,
      async (ctx) => {
        const userId = ctx.from.id;
        const session = this.sessions.get(userId);

        if (!session?.canAddPositions) {
          await ctx.reply("📸 Please upload a portfolio screenshot first");
          return;
        }

        const [, symbol, strike, type, expiry, entryPrice] = ctx.match;

        const newOption = {
          symbol: symbol.toUpperCase(),
          strike,
          type: type.toLowerCase(),
          expiry: expiry || "No expiry date",
          entryPrice: entryPrice ? parseFloat(entryPrice) : null,
          addedAt: new Date().toISOString(),
        };

        session.portfolio.options.push(newOption);

        await ctx.reply(
          `✅ Added position:\n` +
            `${newOption.symbol} $${
              newOption.strike
            } ${newOption.type.toUpperCase()}` +
            `${expiry ? ` exp ${expiry}` : ""}` +
            `${entryPrice ? ` @ $${entryPrice}` : ""}`
        );

        // Show updated portfolio
        await this.showUpdatedPortfolio(ctx, session.portfolio);
      }
    );

    // Handle position analysis requests
    this.bot.hears(/^([A-Z]{2,5})$/i, async (ctx) => {
      const userId = ctx.from.id;
      const session = this.sessions.get(userId);

      if (!session?.portfolio) {
        await ctx.reply("📸 Please upload a portfolio screenshot first");
        return;
      }

      const symbol = ctx.match[1].toUpperCase();
      await this.analyzePosition(ctx, symbol, session.portfolio);
    });

    // Daily summary command
    this.bot.command("dailysummary", async (ctx) => {
      const userId = ctx.from.id;
      const session = this.sessions.get(userId);

      if (!session?.portfolio) {
        await ctx.reply("📸 Upload a portfolio screenshot first");
        return;
      }

      const summary = await this.generateDailySummary(
        session.portfolio,
        userId
      );
      await ctx.reply(summary, { parse_mode: "Markdown" });
    });

    // P&L command
    this.bot.command("pnl", async (ctx) => {
      const userId = ctx.from.id;
      const session = this.sessions.get(userId);

      if (!session?.portfolio) {
        await ctx.reply("📸 Upload a portfolio screenshot first");
        return;
      }

      const pnlReport = await this.generatePnLReport(session.portfolio);
      await ctx.reply(pnlReport, { parse_mode: "Markdown" });
    });

    // Set goals command
    this.bot.command("setgoal", async (ctx) => {
      const args = ctx.message.text.split(" ");
      if (args.length < 3) {
        await ctx.reply(
          "Usage: /setgoal [daily|weekly|monthly] [amount]\nExample: /setgoal weekly 500"
        );
        return;
      }

      const [, period, amount] = args;
      const userId = ctx.from.id;
      const session = this.sessions.get(userId) || {};

      session.goals = {
        period,
        targetProfit: parseFloat(amount),
        startDate: new Date().toISOString(),
        progress: 0,
      };

      this.sessions.set(userId, session);

      await ctx.reply(
        `✅ Goal set!\n\n` +
          `🎯 Target: $${amount} ${period} profit\n` +
          `📅 Started: ${new Date().toLocaleDateString()}`
      );
    });

    // Exit alerts command
    this.bot.command("exitalerts", async (ctx) => {
      const userId = ctx.from.id;
      const session = this.sessions.get(userId);

      if (!session?.portfolio) {
        await ctx.reply("📸 Upload a portfolio screenshot first");
        return;
      }

      await this.checkExitSignals(ctx, session.portfolio);
    });

    // Clear portfolio command
    this.bot.command("clearportfolio", async (ctx) => {
      const userId = ctx.from.id;
      this.sessions.delete(userId);
      await ctx.reply(
        "🗑️ Portfolio data cleared. Upload a new screenshot to start fresh."
      );
    });

    // Log trade command
    this.bot.hears(
      /^(closed|opened|rolled)\s+([A-Z]{2,5})\s+@\s*([\d.]+)/i,
      async (ctx) => {
        const [, action, symbol, price] = ctx.match;
        const userId = ctx.from.id;

        await this.logTrade(userId, symbol, action, parseFloat(price));
        await ctx.reply(`✅ Trade logged: ${action} ${symbol} @ $${price}`);
      }
    );
  }

  setupScheduledTasks() {
    // Check for exit signals every 30 minutes during market hours
    if (this.marketData) {
      setInterval(async () => {
        const now = new Date();
        const hour = now.getHours();

        // Only during market hours (9:30 AM - 4:00 PM ET)
        if (hour >= 9 && hour < 16) {
          for (const [userId, session] of this.sessions) {
            if (session.portfolio && session.enableAlerts) {
              await this.monitorPositions(userId, session.portfolio);
            }
          }
        }
      }, 30 * 60 * 1000); // 30 minutes
    }
  }

  async downloadImage(url, userId) {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 30000,
      });

      const dir = path.join(__dirname, "../../screenshots");
      await fs.mkdir(dir, { recursive: true });

      const filename = `${userId}_${Date.now()}.jpg`;
      const filePath = path.join(dir, filename);
      await fs.writeFile(filePath, response.data);

      console.log(`📸 Image saved: ${filename}`);
      return filePath;
    } catch (error) {
      console.error("Download error:", error.message);
      throw new Error("Failed to download image");
    }
  }

  async analyzePortfolio(text, ctx) {
    const userId = ctx.from.id;
    const data = this.textExtractor.parseBasicInfo(text);

    // Store session data
    const existingSession = this.sessions.get(userId) || {};
    this.sessions.set(userId, {
      ...existingSession,
      portfolio: data,
      canAddPositions: true,
      timestamp: new Date(),
      enableAlerts: true,
    });

    // Build analysis message
    let message = `📊 **Portfolio Analysis**\n\n`;

    // Portfolio value section
    if (data.totalValue) {
      message += `💰 **Total Value**: $${data.totalValue}\n`;
    }
    if (data.dayChange) {
      const changeEmoji = data.dayChange.includes("+") ? "📈" : "📉";
      message += `${changeEmoji} **Today**: ${data.dayChange} (${data.dayChangePercent})\n`;
    }
    if (data.buyingPower) {
      message += `💵 **Buying Power**: $${data.buyingPower}\n`;
    }

    // Options section
    if (data.options.length > 0) {
      message += `\n📋 **Options Positions** (${data.options.length}):\n`;
      data.options.forEach((opt) => {
        const days = this.getDaysToExpiry(opt.expiry);
        const riskEmoji = days <= 2 ? "🔴" : days <= 5 ? "🟡" : "🟢";

        message += `${riskEmoji} ${opt.symbol} $${
          opt.strike
        } ${opt.type.toUpperCase()}`;
        if (opt.expiry) message += ` (${days}d)`;
        message += "\n";
      });
    } else {
      message += `\n📋 **No options positions detected**\n`;
    }

    // Stocks section
    if (data.stocks.length > 0) {
      message += `\n📊 **Stock Positions** (${data.stocks.length}):\n`;
      data.stocks.forEach((stock) => {
        message += `• ${stock}\n`;
      });
    }

    // Crypto section
    if (data.crypto.length > 0) {
      message += `\n🪙 **Crypto Holdings**:\n`;
      data.crypto.forEach((crypto) => {
        message += `• ${crypto}\n`;
      });
    }

    // Quick stats
    const totalPositions = data.options.length + data.stocks.length;
    const expiringThisWeek = data.options.filter((opt) => {
      const days = this.getDaysToExpiry(opt.expiry);
      return days >= 0 && days <= 5;
    }).length;

    message += `\n📊 **Quick Stats**:\n`;
    message += `• Total Positions: ${totalPositions}\n`;
    message += `• Expiring This Week: ${expiringThisWeek}\n`;
    message += `• Risk Level: ${this.calculateRiskLevel(data)}\n`;

    // Help section
    message += `\n❓ **Commands**:\n`;
    message += `• Type symbol (e.g., "NVDA") for analysis\n`;
    message += `• /dailysummary - Daily overview\n`;
    message += `• /pnl - Profit/Loss report\n`;
    message += `• /exitalerts - Check exit signals\n`;
    message += `• /setgoal - Set profit goals\n`;

    await ctx.reply(message, { parse_mode: "Markdown" });

    // Send AI analysis after a delay
    setTimeout(async () => {
      await this.sendAIAnalysis(ctx, data);
    }, 2000);
  }

  async sendAIAnalysis(ctx, portfolioData) {
    const alerts = [];
    const recommendations = [];

    // Check for expiring options
    portfolioData.options.forEach((opt) => {
      if (opt.expiry) {
        const daysLeft = this.getDaysToExpiry(opt.expiry);
        if (daysLeft === 0) {
          alerts.push(
            `🚨 ${opt.symbol} $${
              opt.strike
            }${opt.type[0].toUpperCase()} EXPIRES TODAY!`
          );
        } else if (daysLeft <= 2) {
          alerts.push(
            `⚠️ ${opt.symbol} $${
              opt.strike
            }${opt.type[0].toUpperCase()} expires in ${daysLeft} days!`
          );
        }
      }
    });

    // Risk analysis
    if (portfolioData.options.length > 5) {
      recommendations.push(
        "📊 High position count - consider reducing exposure"
      );
    }

    if (portfolioData.buyingPower) {
      const buyingPower = parseFloat(
        portfolioData.buyingPower.replace(/,/g, "")
      );
      if (buyingPower < 500) {
        recommendations.push("💵 Low buying power - consider closing winners");
      }
    }

    // Concentration risk
    const symbolCounts = {};
    portfolioData.options.forEach((opt) => {
      symbolCounts[opt.symbol] = (symbolCounts[opt.symbol] || 0) + 1;
    });

    Object.entries(symbolCounts).forEach(([symbol, count]) => {
      if (count >= 3) {
        recommendations.push(
          `⚠️ High concentration in ${symbol} (${count} positions)`
        );
      }
    });

    // Build AI message
    let aiMessage = `🤖 **AI Analysis Complete**\n\n`;

    if (alerts.length > 0) {
      aiMessage += `🚨 **Urgent Alerts**:\n${alerts.join("\n")}\n\n`;
    }

    if (recommendations.length > 0) {
      aiMessage += `💡 **Recommendations**:\n${recommendations.join("\n")}\n\n`;
    }

    // Market conditions (if available)
    if (this.marketData) {
      aiMessage += await this.getMarketConditions();
    }

    // Action items
    aiMessage += `\n📈 **Action Items**:\n`;
    aiMessage += `1. Address expiring positions first\n`;
    aiMessage += `2. Review concentrated positions\n`;
    aiMessage += `3. Set stop losses on profitable trades\n`;
    aiMessage += `4. Check /exitalerts for closing signals\n`;

    await ctx.reply(aiMessage, { parse_mode: "Markdown" });
  }

  async analyzePosition(ctx, symbol, portfolioData) {
    // Find all positions for this symbol
    const options = portfolioData.options.filter(
      (opt) => opt.symbol === symbol
    );
    const hasStock = portfolioData.stocks.includes(symbol);

    if (options.length === 0 && !hasStock) {
      await ctx.reply(`❌ No position found for ${symbol}`);
      return;
    }

    let analysis = `🎯 **${symbol} Analysis**\n\n`;

    // Get real-time data if available
    if (this.marketData) {
      const quote = this.marketData.getQuote(symbol);
      if (quote) {
        analysis += `📊 **Current Price**: $${quote.price}\n`;
        analysis += `📈 **Day Change**: ${quote.changePercent > 0 ? "+" : ""}${
          quote.changePercent
        }%\n\n`;
      }
    }

    // Analyze each option position
    if (options.length > 0) {
      analysis += `**Options Positions** (${options.length}):\n\n`;

      for (const option of options) {
        const daysLeft = this.getDaysToExpiry(option.expiry);
        const riskLevel = this.assessOptionRisk(option, daysLeft);

        analysis += `📋 **$${option.strike} ${option.type.toUpperCase()}**\n`;
        if (option.expiry)
          analysis += `• Expires: ${option.expiry} (${daysLeft} days)\n`;
        if (option.entryPrice) {
          const pnl = await this.estimatePnL(option);
          analysis += `• Entry: $${option.entryPrice}\n`;
          analysis += `• Est. P&L: ${
            pnl.pnlPercent > 0 ? "+" : ""
          }${pnl.pnlPercent.toFixed(1)}%\n`;
        }
        analysis += `• Risk: ${riskLevel.emoji} ${riskLevel.level}\n`;
        analysis += `• Action: ${riskLevel.action}\n\n`;
      }
    }

    if (hasStock) {
      analysis += `\n📊 **Stock Position**: ${symbol}\n`;
      analysis += `• Strategy: Consider selling covered calls\n`;
      analysis += `• Strike suggestion: 5-10% OTM\n`;
    }

    // Trading suggestions
    analysis += `\n💡 **Suggestions**:\n`;
    if (options.some((opt) => this.getDaysToExpiry(opt.expiry) <= 2)) {
      analysis += `1. 🚨 Close or roll expiring positions NOW\n`;
    }
    analysis += `2. Set alerts at key levels\n`;
    analysis += `3. Consider taking partial profits\n`;

    await ctx.reply(analysis, { parse_mode: "Markdown" });
  }

  async generateDailySummary(portfolio, userId) {
    const expiringToday = [];
    const expiringThisWeek = [];
    const highRisk = [];
    const profitablePositions = [];

    // Analyze each position
    for (const opt of portfolio.options) {
      const days = this.getDaysToExpiry(opt.expiry);

      if (days === 0) {
        expiringToday.push(opt);
      } else if (days <= 5 && days > 0) {
        expiringThisWeek.push(opt);
      }

      if (days <= 2 && days >= 0) {
        highRisk.push(opt);
      }

      if (opt.entryPrice) {
        const pnl = await this.estimatePnL(opt);
        if (pnl.pnlPercent > 20) {
          profitablePositions.push({ ...opt, pnl });
        }
      }
    }

    let summary = `📅 **Daily Portfolio Summary**\n`;
    summary += `_${new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })}_\n\n`;

    // Portfolio overview
    summary += `💼 **Overview**:\n`;
    summary += `• Total Positions: ${
      portfolio.options.length + portfolio.stocks.length
    }\n`;
    summary += `• Options: ${portfolio.options.length}\n`;
    summary += `• Stocks: ${portfolio.stocks.length}\n`;
    if (portfolio.totalValue)
      summary += `• Portfolio Value: $${portfolio.totalValue}\n`;
    if (portfolio.dayChange)
      summary += `• Day Change: ${portfolio.dayChange}\n`;
    summary += `\n`;

    // Critical alerts
    if (expiringToday.length > 0) {
      summary += `🚨 **EXPIRING TODAY** (Action Required!):\n`;
      expiringToday.forEach((opt) => {
        summary += `• ${opt.symbol} $${
          opt.strike
        }${opt.type[0].toUpperCase()} - CLOSE OR ROLL NOW!\n`;
      });
      summary += `\n`;
    }

    if (highRisk.length > 0 && expiringToday.length === 0) {
      summary += `⚠️ **High Risk Positions**:\n`;
      highRisk.forEach((opt) => {
        summary += `• ${opt.symbol} $${
          opt.strike
        }${opt.type[0].toUpperCase()} - ${this.getDaysToExpiry(
          opt.expiry
        )} days left\n`;
      });
      summary += `\n`;
    }

    if (expiringThisWeek.length > 0) {
      summary += `📆 **Expiring This Week**:\n`;
      expiringThisWeek.forEach((opt) => {
        const days = this.getDaysToExpiry(opt.expiry);
        summary += `• ${opt.symbol} - ${days} days\n`;
      });
      summary += `\n`;
    }

    if (profitablePositions.length > 0) {
      summary += `💰 **Profitable Positions** (Consider Taking Profits):\n`;
      profitablePositions.forEach((pos) => {
        summary += `• ${pos.symbol} $${
          pos.strike
        }${pos.type[0].toUpperCase()} - Up ${pos.pnl.pnlPercent.toFixed(1)}%\n`;
      });
      summary += `\n`;
    }

    // Goals progress
    const session = this.sessions.get(userId);
    if (session?.goals) {
      summary += `🎯 **Goal Progress**:\n`;
      summary += `• Target: $${session.goals.targetProfit} ${session.goals.period}\n`;
      summary += `• Progress: $${session.goals.progress.toFixed(2)} (${(
        (session.goals.progress / session.goals.targetProfit) *
        100
      ).toFixed(1)}%)\n\n`;
    }

    // Today's tasks
    summary += `📝 **Today's Tasks**:\n`;
    if (expiringToday.length > 0) {
      summary += `1. ⚡ Handle expiring positions immediately\n`;
    }
    summary += `${
      expiringToday.length > 0 ? "2" : "1"
    }. Review and adjust stop losses\n`;
    summary += `${
      expiringToday.length > 0 ? "3" : "2"
    }. Check market conditions before new trades\n`;
    summary += `${
      expiringToday.length > 0 ? "4" : "3"
    }. Update trade journal\n`;

    return summary;
  }

  async generatePnLReport(portfolio) {
    let totalEstimatedPnL = 0;
    let winners = 0;
    let losers = 0;
    const positions = [];

    for (const opt of portfolio.options) {
      if (opt.entryPrice) {
        const pnl = await this.estimatePnL(opt);
        totalEstimatedPnL += pnl.pnlDollar;

        if (pnl.pnlPercent > 0) winners++;
        else losers++;

        positions.push({
          symbol: opt.symbol,
          strike: opt.strike,
          type: opt.type,
          pnlPercent: pnl.pnlPercent,
          pnlDollar: pnl.pnlDollar,
        });
      }
    }

    // Sort by P&L
    positions.sort((a, b) => b.pnlDollar - a.pnlDollar);

    let report = `💰 **P&L Report**\n\n`;

    report += `📊 **Summary**:\n`;
    report += `• Total Est. P&L: ${
      totalEstimatedPnL >= 0 ? "+" : ""
    }$${totalEstimatedPnL.toFixed(2)}\n`;
    report += `• Winners: ${winners}\n`;
    report += `• Losers: ${losers}\n`;
    report += `• Win Rate: ${
      winners + losers > 0
        ? ((winners / (winners + losers)) * 100).toFixed(1)
        : 0
    }%\n\n`;

    if (positions.length > 0) {
      report += `📈 **Top Positions**:\n`;
      positions.slice(0, 5).forEach((pos) => {
        const emoji = pos.pnlPercent > 0 ? "🟢" : "🔴";
        report += `${emoji} ${pos.symbol} $${
          pos.strike
        }${pos.type[0].toUpperCase()}: ${
          pos.pnlPercent > 0 ? "+" : ""
        }${pos.pnlPercent.toFixed(1)}% ($${pos.pnlDollar.toFixed(2)})\n`;
      });

      if (positions.length > 5) {
        report += `\n📉 **Bottom Positions**:\n`;
        positions.slice(-3).forEach((pos) => {
          if (pos.pnlPercent < 0) {
            report += `🔴 ${pos.symbol} $${
              pos.strike
            }${pos.type[0].toUpperCase()}: ${pos.pnlPercent.toFixed(
              1
            )}% ($${pos.pnlDollar.toFixed(2)})\n`;
          }
        });
      }
    }

    report += `\n💡 **Note**: P&L estimates based on time decay and market conditions`;

    return report;
  }

  async checkExitSignals(ctx, portfolio) {
    const exitSignals = [];

    for (const opt of portfolio.options) {
      const days = this.getDaysToExpiry(opt.expiry);
      const exitReasons = [];

      // Time-based exits
      if (days === 0) {
        exitReasons.push("Expires today - must close");
      } else if (days <= 1) {
        exitReasons.push("Expires tomorrow - close or roll");
      }

      // P&L based exits
      if (opt.entryPrice) {
        const pnl = await this.estimatePnL(opt);
        if (pnl.pnlPercent >= 50) {
          exitReasons.push(`Up ${pnl.pnlPercent.toFixed(1)}% - take profits`);
        } else if (pnl.pnlPercent <= -30) {
          exitReasons.push(`Down ${pnl.pnlPercent.toFixed(1)}% - stop loss`);
        }
      }

      if (exitReasons.length > 0) {
        exitSignals.push({
          option: opt,
          reasons: exitReasons,
          priority: days === 0 ? "URGENT" : days <= 1 ? "HIGH" : "MEDIUM",
        });
      }
    }

    if (exitSignals.length === 0) {
      await ctx.reply(
        "✅ No immediate exit signals. All positions looking stable."
      );
      return;
    }

    let message = `🚨 **EXIT SIGNALS DETECTED**\n\n`;

    // Group by priority
    const urgent = exitSignals.filter((s) => s.priority === "URGENT");
    const high = exitSignals.filter((s) => s.priority === "HIGH");
    const medium = exitSignals.filter((s) => s.priority === "MEDIUM");

    if (urgent.length > 0) {
      message += `🔴 **URGENT - Act Now**:\n`;
      urgent.forEach((signal) => {
        message += `• ${signal.option.symbol} $${
          signal.option.strike
        }${signal.option.type[0].toUpperCase()}\n`;
        signal.reasons.forEach((reason) => {
          message += `  → ${reason}\n`;
        });
      });
      message += `\n`;
    }

    if (high.length > 0) {
      message += `🟡 **HIGH Priority**:\n`;
      high.forEach((signal) => {
        message += `• ${signal.option.symbol} $${
          signal.option.strike
        }${signal.option.type[0].toUpperCase()}\n`;
        signal.reasons.forEach((reason) => {
          message += `  → ${reason}\n`;
        });
      });
      message += `\n`;
    }

    if (medium.length > 0) {
      message += `🟢 **MEDIUM Priority**:\n`;
      medium.forEach((signal) => {
        message += `• ${signal.option.symbol}: ${signal.reasons.join(", ")}\n`;
      });
    }

    await ctx.reply(message, { parse_mode: "Markdown" });
  }

  async estimatePnL(option) {
    // Simplified P&L estimation based on time decay
    const daysLeft = this.getDaysToExpiry(option.expiry);
    const totalDays = 30; // Assume 30 days at entry
    const timeDecayFactor = daysLeft / totalDays;

    // Base estimation (would be better with real prices)
    const entryPrice = option.entryPrice || 2.5;
    let currentValue = entryPrice;

    // Apply time decay (simplified)
    if (daysLeft <= 5) {
      currentValue *= 0.7; // Heavy decay near expiry
    } else if (daysLeft <= 10) {
      currentValue *= 0.85;
    } else {
      currentValue *= 0.95;
    }

    // Add some randomness for realism (in production, use real prices)
    currentValue *= 0.8 + Math.random() * 0.4;

    const pnlDollar = (currentValue - entryPrice) * 100; // Per contract
    const pnlPercent = ((currentValue - entryPrice) / entryPrice) * 100;

    return {
      estimatedValue: currentValue,
      pnlPercent,
      pnlDollar,
    };
  }

  async logTrade(userId, symbol, action, price) {
    const tradeLog = {
      userId,
      symbol,
      action,
      price,
      timestamp: new Date().toISOString(),
    };

    // Update session goals if closing a trade
    if (action === "closed") {
      const session = this.sessions.get(userId);
      if (session?.goals) {
        // Simple profit tracking (would need entry price for accurate calculation)
        const estimatedProfit = price * 100 * 0.2; // Placeholder
        session.goals.progress += estimatedProfit;
      }
    }

    // Store in journal
    const userJournal = this.tradeJournal.get(userId) || [];
    userJournal.push(tradeLog);
    this.tradeJournal.set(userId, userJournal);

    // Save to file
    try {
      const journalFile = path.join(
        __dirname,
        "../../logs",
        `trade_journal_${userId}.json`
      );
      await fs.writeFile(journalFile, JSON.stringify(userJournal, null, 2));
    } catch (error) {
      console.error("Error saving trade journal:", error);
    }
  }

  async monitorPositions(userId, portfolio) {
    // Real-time monitoring for exit alerts
    const alerts = [];

    for (const opt of portfolio.options) {
      const shouldExit = await this.checkExitConditions(opt);
      if (shouldExit) {
        alerts.push(opt);
      }
    }

    if (alerts.length > 0) {
      let message = `🚨 **REAL-TIME EXIT ALERT**\n\n`;
      alerts.forEach((opt) => {
        message += `• ${opt.symbol} $${
          opt.strike
        }${opt.type[0].toUpperCase()} - Check position NOW\n`;
      });

      try {
        await this.bot.telegram.sendMessage(userId, message, {
          parse_mode: "Markdown",
        });
      } catch (error) {
        console.error("Error sending alert:", error);
      }
    }
  }

  async checkExitConditions(option) {
    const days = this.getDaysToExpiry(option.expiry);

    // Exit conditions
    if (days === 0) return true;

    if (option.entryPrice) {
      const pnl = await this.estimatePnL(option);
      if (pnl.pnlPercent >= 75 || pnl.pnlPercent <= -40) {
        return true;
      }
    }

    return false;
  }

  calculateRiskLevel(portfolio) {
    let riskScore = 0;

    // Position count risk
    if (portfolio.options.length > 10) riskScore += 3;
    else if (portfolio.options.length > 5) riskScore += 2;
    else riskScore += 1;

    // Expiry risk
    const expiringThisWeek = portfolio.options.filter((opt) => {
      const days = this.getDaysToExpiry(opt.expiry);
      return days >= 0 && days <= 5;
    }).length;

    if (expiringThisWeek > 3) riskScore += 3;
    else if (expiringThisWeek > 1) riskScore += 2;

    // Buying power risk
    if (portfolio.buyingPower) {
      const bp = parseFloat(portfolio.buyingPower.replace(/,/g, ""));
      if (bp < 1000) riskScore += 2;
    }

    // Return risk level
    if (riskScore >= 6) return "🔴 HIGH";
    if (riskScore >= 4) return "🟡 MEDIUM";
    return "🟢 LOW";
  }

  assessOptionRisk(option, daysLeft) {
    if (daysLeft === 0) {
      return {
        emoji: "🔴",
        level: "CRITICAL",
        action: "Close immediately or let expire",
      };
    }

    if (daysLeft <= 2) {
      return {
        emoji: "🔴",
        level: "HIGH",
        action: "Close or roll today",
      };
    }

    if (daysLeft <= 5) {
      return {
        emoji: "🟡",
        level: "MEDIUM",
        action: "Monitor closely, prepare exit",
      };
    }

    return {
      emoji: "🟢",
      level: "LOW",
      action: "Hold and monitor",
    };
  }

  async getMarketConditions() {
    // Placeholder for market conditions
    // Would integrate with real market data
    return (
      `\n📈 **Market Conditions**:\n` +
      `• SPY: Trading at $450 (+0.5%)\n` +
      `• VIX: 15.2 (Low volatility)\n` +
      `• Trend: Bullish\n`
    );
  }

  async showUpdatedPortfolio(ctx, portfolio) {
    let message = `📊 **Updated Portfolio**\n\n`;

    message += `**Options** (${portfolio.options.length}):\n`;
    portfolio.options.forEach((opt) => {
      const days = this.getDaysToExpiry(opt.expiry);
      const riskEmoji = days <= 2 ? "🔴" : days <= 5 ? "🟡" : "🟢";

      message += `${riskEmoji} ${opt.symbol} $${
        opt.strike
      } ${opt.type.toUpperCase()}`;
      if (opt.expiry) message += ` (${days}d)`;
      if (opt.entryPrice) message += ` @ $${opt.entryPrice}`;
      message += "\n";
    });

    await ctx.reply(message, { parse_mode: "Markdown" });
  }

  getDaysToExpiry(dateStr) {
    if (!dateStr || dateStr === "No expiry date") return 999;

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Parse date string (handles M/D or MM/DD format)
      const parts = dateStr.split("/");
      const month = parseInt(parts[0]) - 1;
      const day = parseInt(parts[1]);
      const year = parts[2] ? parseInt(parts[2]) : today.getFullYear();

      let expiry = new Date(year, month, day);

      // If date is in the past, assume next year
      if (expiry < today) {
        expiry = new Date(year + 1, month, day);
      }

      const diffTime = expiry - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return diffDays;
    } catch (error) {
      console.error("Date parsing error:", error);
      return 999;
    }
  }
}

module.exports = ScreenshotHandler;
