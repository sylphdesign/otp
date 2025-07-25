const EventEmitter = require("events");

class OptionsHawk extends EventEmitter {
  constructor(bot, portfolioHandler, marketData) {
    super();
    this.bot = bot;
    this.portfolioHandler = portfolioHandler;
    this.marketData = marketData;

    // Monitoring state
    this.monitoring = new Map(); // userId -> monitoring config
    this.alerts = new Map(); // userId -> alerts array

    // Alert thresholds
    this.thresholds = {
      profitTarget: 0.5, // 50%
      stopLoss: -0.3, // -30%
      daysToExpiryWarning: 3,
      daysToExpiryUrgent: 1,
      unusualVolumeMultiple: 3,
    };

    // Start monitoring
    this.startMonitoring();
  }

  startMonitoring() {
    // Check positions every 5 minutes during market hours
    this.monitorInterval = setInterval(() => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();

      // Market hours: 9:30 AM - 4:00 PM ET
      const isMarketHours =
        (hour === 9 && minute >= 30) || (hour > 9 && hour < 16);

      if (isMarketHours) {
        this.checkAllPositions();
      }

      // Special checks at specific times
      if (hour === 9 && minute === 30) {
        this.morningCheck();
      }
      if (hour === 15 && minute === 30) {
        this.closingCheck();
      }
    }, 5 * 60 * 1000); // 5 minutes

    console.log("🦅 Options Hawk monitoring started");
  }

  async checkAllPositions() {
    for (const [userId, session] of this.portfolioHandler.sessions) {
      if (session.portfolio && session.enableAlerts !== false) {
        await this.monitorUserPositions(userId, session.portfolio);
      }
    }
  }

  async monitorUserPositions(userId, portfolio) {
    const alerts = [];

    for (const option of portfolio.options) {
      // Check expiration
      const expiryAlert = this.checkExpiration(option);
      if (expiryAlert) alerts.push(expiryAlert);

      // Check P&L (if we have entry price)
      if (option.entryPrice) {
        const pnlAlert = await this.checkPnL(option);
        if (pnlAlert) alerts.push(pnlAlert);
      }

      // Check unusual activity
      const activityAlert = await this.checkUnusualActivity(option);
      if (activityAlert) alerts.push(activityAlert);

      // Check technical levels
      const technicalAlert = await this.checkTechnicalLevels(option);
      if (technicalAlert) alerts.push(technicalAlert);
    }

    // Send alerts if any
    if (alerts.length > 0) {
      await this.sendAlerts(userId, alerts);
    }

    // Store alerts for history
    if (!this.alerts.has(userId)) {
      this.alerts.set(userId, []);
    }
    this.alerts.get(userId).push(...alerts);
  }

  checkExpiration(option) {
    const daysLeft = this.calculateDaysToExpiry(option.expiry);

    if (daysLeft === 0) {
      return {
        type: "EXPIRY_TODAY",
        urgency: "CRITICAL",
        symbol: option.symbol,
        message: `🚨 ${option.symbol} $${option.strike} ${option.type} EXPIRES TODAY!`,
        action: "Close position immediately or let expire",
        option,
      };
    }

    if (daysLeft === 1) {
      return {
        type: "EXPIRY_TOMORROW",
        urgency: "HIGH",
        symbol: option.symbol,
        message: `⚠️ ${option.symbol} $${option.strike} ${option.type} expires tomorrow!`,
        action: "Close or roll position today",
        option,
      };
    }

    if (daysLeft <= this.thresholds.daysToExpiryWarning) {
      return {
        type: "EXPIRY_SOON",
        urgency: "MEDIUM",
        symbol: option.symbol,
        message: `⏰ ${option.symbol} $${option.strike} ${option.type} expires in ${daysLeft} days`,
        action: "Consider closing or rolling",
        option,
      };
    }

    return null;
  }

  async checkPnL(option) {
    // Estimate current value (simplified - would use real prices)
    const currentPrice = await this.estimateOptionPrice(option);
    const pnlPercent =
      ((currentPrice - option.entryPrice) / option.entryPrice) * 100;

    if (pnlPercent >= this.thresholds.profitTarget * 100) {
      return {
        type: "PROFIT_TARGET",
        urgency: "HIGH",
        symbol: option.symbol,
        message: `💰 ${option.symbol} is up ${pnlPercent.toFixed(
          1
        )}%! Time to take profits?`,
        action: "Consider closing position or partial exit",
        option,
        pnl: pnlPercent,
      };
    }

    if (pnlPercent <= this.thresholds.stopLoss * 100) {
      return {
        type: "STOP_LOSS",
        urgency: "HIGH",
        symbol: option.symbol,
        message: `🛑 ${option.symbol} is down ${Math.abs(pnlPercent).toFixed(
          1
        )}%. Stop loss triggered!`,
        action: "Close position to limit losses",
        option,
        pnl: pnlPercent,
      };
    }

    return null;
  }

  async checkUnusualActivity(option) {
    // Check for unusual options activity
    const flow = await this.getOptionsFlow(option.symbol);

    if (flow && flow.volumeRatio > this.thresholds.unusualVolumeMultiple) {
      return {
        type: "UNUSUAL_ACTIVITY",
        urgency: "MEDIUM",
        symbol: option.symbol,
        message: `🔥 Unusual activity in ${option.symbol}! Volume ${flow.volumeRatio}x normal`,
        action:
          flow.sentiment === "bullish"
            ? "Consider adding"
            : "Consider reducing",
        option,
        flow,
      };
    }

    return null;
  }

  async checkTechnicalLevels(option) {
    // Check if underlying hit key levels
    const quote = this.marketData?.getQuote(option.symbol);
    if (!quote) return null;

    const technicals = this.marketData?.getTechnicals(option.symbol);
    if (!technicals) return null;

    // Check support/resistance
    if (option.type === "call" && quote.price <= technicals.support) {
      return {
        type: "SUPPORT_TEST",
        urgency: "MEDIUM",
        symbol: option.symbol,
        message: `📉 ${option.symbol} testing support at $${technicals.support}`,
        action: "Watch closely - may need to exit calls",
        option,
      };
    }

    if (option.type === "put" && quote.price >= technicals.resistance) {
      return {
        type: "RESISTANCE_TEST",
        urgency: "MEDIUM",
        symbol: option.symbol,
        message: `📈 ${option.symbol} testing resistance at $${technicals.resistance}`,
        action: "Watch closely - may need to exit puts",
        option,
      };
    }

    return null;
  }

  async sendAlerts(userId, alerts) {
    // Group by urgency
    const critical = alerts.filter((a) => a.urgency === "CRITICAL");
    const high = alerts.filter((a) => a.urgency === "HIGH");
    const medium = alerts.filter((a) => a.urgency === "MEDIUM");

    let message = "";

    if (critical.length > 0) {
      message += `🚨🚨 **CRITICAL ALERTS** 🚨🚨\n\n`;
      critical.forEach((alert) => {
        message += `${alert.message}\n`;
        message += `👉 ${alert.action}\n\n`;
      });
    }

    if (high.length > 0) {
      message += `⚠️ **HIGH PRIORITY ALERTS**\n\n`;
      high.forEach((alert) => {
        message += `${alert.message}\n`;
        message += `👉 ${alert.action}\n\n`;
      });
    }

    if (medium.length > 0) {
      message += `📊 **MONITORING ALERTS**\n\n`;
      medium.forEach((alert) => {
        message += `${alert.message}\n`;
        message += `👉 ${alert.action}\n\n`;
      });
    }

    if (message) {
      try {
        await this.bot.telegram.sendMessage(userId, message, {
          parse_mode: "Markdown",
        });

        // Log alerts sent
        console.log(`🦅 Sent ${alerts.length} alerts to user ${userId}`);
      } catch (error) {
        console.error("Error sending alerts:", error);
      }
    }
  }

  async morningCheck() {
    console.log("🌅 Running morning position check...");

    for (const [userId, session] of this.portfolioHandler.sessions) {
      if (session.portfolio) {
        const report = this.generateMorningReport(session.portfolio);

        await this.bot.telegram.sendMessage(userId, report, {
          parse_mode: "Markdown",
        });
      }
    }
  }

  async closingCheck() {
    console.log("🌆 Running closing position check...");

    for (const [userId, session] of this.portfolioHandler.sessions) {
      if (session.portfolio) {
        const report = this.generateClosingReport(session.portfolio);

        await this.bot.telegram.sendMessage(userId, report, {
          parse_mode: "Markdown",
        });
      }
    }
  }

  generateMorningReport(portfolio) {
    let report = `☀️ **GOOD MORNING TRADER**\n`;
    report += `_${new Date().toLocaleDateString()}_\n\n`;

    // Positions expiring today
    const expiringToday = portfolio.options.filter(
      (opt) => this.calculateDaysToExpiry(opt.expiry) === 0
    );

    if (expiringToday.length > 0) {
      report += `🚨 **EXPIRING TODAY**:\n`;
      expiringToday.forEach((opt) => {
        report += `• ${opt.symbol} $${opt.strike} ${opt.type}\n`;
      });
      report += `\n`;
    }

    // Positions needing attention
    const needsAttention = portfolio.options.filter(
      (opt) =>
        this.calculateDaysToExpiry(opt.expiry) <= 3 &&
        this.calculateDaysToExpiry(opt.expiry) > 0
    );

    if (needsAttention.length > 0) {
      report += `⚠️ **NEEDS ATTENTION**:\n`;
      needsAttention.forEach((opt) => {
        const days = this.calculateDaysToExpiry(opt.expiry);
        report += `• ${opt.symbol} - ${days} days left\n`;
      });
      report += `\n`;
    }

    report += `📊 **PORTFOLIO SUMMARY**:\n`;
    report += `• Total Positions: ${portfolio.options.length}\n`;
    report += `• Options Value: $${portfolio.totalValue || "N/A"}\n\n`;

    report += `🎯 **TODAY'S FOCUS**:\n`;
    report += `1. Handle expiring positions first\n`;
    report += `2. Check ALADDIN's daily plan (/plan)\n`;
    report += `3. Set stop losses on winners\n\n`;

    report += `_Options Hawk is monitoring all positions_`;

    return report;
  }

  generateClosingReport(portfolio) {
    let report = `🔔 **30 MINUTES TO CLOSE**\n\n`;

    const decisions = [];

    portfolio.options.forEach((opt) => {
      const days = this.calculateDaysToExpiry(opt.expiry);

      if (days === 0) {
        decisions.push(`🚨 ${opt.symbol} - MUST CLOSE NOW (expires today)`);
      } else if (days === 1) {
        decisions.push(`⚠️ ${opt.symbol} - Close or roll (expires tomorrow)`);
      }
    });

    if (decisions.length > 0) {
      report += `**DECISIONS NEEDED**:\n`;
      decisions.forEach((d) => {
        report += `${d}\n`;
      });
      report += `\n`;
    }

    report += `**CLOSING CHECKLIST**:\n`;
    report += `✓ Close expiring positions\n`;
    report += `✓ Take profits on winners\n`;
    report += `✓ Set GTC orders for tomorrow\n`;
    report += `✓ Note levels for gap plays\n\n`;

    report += `_Great trading day! See you tomorrow_ 🎯`;

    return report;
  }

  // Helper methods
  calculateDaysToExpiry(expiry) {
    if (!expiry) return 999;

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let expiryDate;
      if (expiry.includes("/")) {
        const parts = expiry.split("/");
        const month = parseInt(parts[0]) - 1;
        const day = parseInt(parts[1]);
        const year = parts[2] ? parseInt(parts[2]) : today.getFullYear();
        expiryDate = new Date(year, month, day);
      } else {
        expiryDate = new Date(expiry);
      }

      const diffTime = expiryDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return diffDays;
    } catch (error) {
      console.error("Error calculating expiry:", error);
      return 999;
    }
  }

  async estimateOptionPrice(option) {
    // Simplified estimation - in production, use real option pricing
    const daysLeft = this.calculateDaysToExpiry(option.expiry);
    const timeDecay = Math.max(0, 1 - (10 - daysLeft) / 10);

    return (option.entryPrice || 2.5) * timeDecay * (0.8 + Math.random() * 0.4);
  }

  async getOptionsFlow(symbol) {
    // Simplified - would connect to real flow data
    return {
      volumeRatio: Math.random() * 5,
      sentiment: Math.random() > 0.5 ? "bullish" : "bearish",
      largestTrade: Math.random() * 1000000,
    };
  }

  // Configuration methods
  setUserThresholds(userId, thresholds) {
    if (!this.monitoring.has(userId)) {
      this.monitoring.set(userId, {});
    }

    const config = this.monitoring.get(userId);
    config.thresholds = { ...this.thresholds, ...thresholds };
  }

  enableUserAlerts(userId, enabled = true) {
    const session = this.portfolioHandler.sessions.get(userId);
    if (session) {
      session.enableAlerts = enabled;
    }
  }

  getAlertHistory(userId, limit = 20) {
    const userAlerts = this.alerts.get(userId) || [];
    return userAlerts.slice(-limit);
  }
}

module.exports = OptionsHawk;
