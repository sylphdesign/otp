const EventEmitter = require("events");
const cron = require("node-cron");

class EnhancedTradingEngine extends EventEmitter {
  constructor(tradingClient, aiAnalyzer, telegramBot) {
    super();
    this.tradingClient = tradingClient;
    this.aiAnalyzer = aiAnalyzer;
    this.telegramBot = telegramBot;
    this.isActive = false;
    this.activeAlerts = new Map();
    this.tradeCooldowns = new Map();
    this.performanceTracker = {
      alerts: [],
      executed: [],
      wins: 0,
      losses: 0,
      totalPnL: 0,
    };

    this.setupEventListeners();
    this.setupScheduledTasks();
    this.setupTelegramCommands();
  }

  setupTelegramCommands() {
    if (!this.telegramBot) return;

    // Handle execution confirmations
    this.telegramBot.hears(/DONE\s+(\w+)/i, async (ctx) => {
      const alertId = ctx.match[1];
      await this.handleExecutionConfirmation(alertId, ctx);
    });

    // Handle price updates
    this.telegramBot.hears(/FILLED\s+(\w+)\s+@\s*([\d.]+)/i, async (ctx) => {
      const alertId = ctx.match[1];
      const price = parseFloat(ctx.match[2]);
      await this.handleFilledConfirmation(alertId, price, ctx);
    });

    // Performance command
    this.telegramBot.command("performance", async (ctx) => {
      const stats = this.getPerformanceStats();
      const message = this.formatPerformanceMessage(stats);
      await ctx.reply(message, { parse_mode: "Markdown" });
    });
  }

  async handleExecutionConfirmation(alertId, ctx) {
    try {
      // Find the alert
      const fullAlert = Array.from(this.tradingClient.alerts.values()).find(
        (a) => a.id.startsWith(alertId)
      );

      if (!fullAlert) {
        await ctx.reply(`❌ Alert ${alertId} not found`);
        return;
      }

      // Mark as executed
      const position = await this.tradingClient.markAlertExecuted(fullAlert.id);

      // Track performance
      this.performanceTracker.executed.push({
        alertId: fullAlert.id,
        symbol: fullAlert.symbol,
        executedAt: new Date().toISOString(),
      });

      await ctx.reply(
        `✅ Trade confirmed! Tracking position ${position.id.substring(0, 8)}`
      );

      // Start monitoring this position
      this.startPositionMonitoring(position);
    } catch (error) {
      await ctx.reply(`❌ Error: ${error.message}`);
    }
  }

  async handleFilledConfirmation(alertId, price, ctx) {
    try {
      const fullAlert = Array.from(this.tradingClient.alerts.values()).find(
        (a) => a.id.startsWith(alertId)
      );

      if (!fullAlert) {
        await ctx.reply(`❌ Alert ${alertId} not found`);
        return;
      }

      // Mark as executed with actual price
      const position = await this.tradingClient.markAlertExecuted(
        fullAlert.id,
        price
      );

      const slippage = (
        ((price - fullAlert.estimatedPrice) / fullAlert.estimatedPrice) *
        100
      ).toFixed(2);

      await ctx.reply(
        `✅ Filled at $${price.toFixed(2)}\n` +
          `Slippage: ${slippage > 0 ? "+" : ""}${slippage}%\n` +
          `Tracking position ${position.id.substring(0, 8)}`
      );
    } catch (error) {
      await ctx.reply(`❌ Error: ${error.message}`);
    }
  }

  async executeTradeFromDecision(decision) {
    try {
      const { symbol, action, tradeParameters } = decision;

      // Check cooldown
      if (this.isInCooldown(symbol)) {
        console.log(`⏱️ ${symbol} is in cooldown period`);
        return null;
      }

      // Validate trade parameters
      if (!this.validateTradeParameters(tradeParameters)) {
        console.log("❌ Invalid trade parameters");
        return null;
      }

      console.log(`🎯 Creating trading alert for ${symbol}`);

      const orderParams = {
        symbol: tradeParameters.ticker,
        quantity: parseInt(tradeParameters.contracts) || 1,
        optionType: tradeParameters.optionType.toLowerCase(),
        strike: parseFloat(tradeParameters.strikePrice),
        expiration: tradeParameters.expiration,
        action: action.includes("buy") ? "buy" : "sell",
        price: tradeParameters.entryPrice
          ? parseFloat(tradeParameters.entryPrice)
          : null,
        decision: decision, // Pass the full decision for context
      };

      // Create alert instead of executing trade
      const alert = await this.tradingClient.placeOptionOrder(orderParams);

      // Track alert
      this.activeAlerts.set(alert.id, {
        ...alert,
        decision,
        monitoringStarted: false,
      });

      // Set cooldown
      this.setCooldown(symbol);

      // Update performance tracker
      this.performanceTracker.alerts.push({
        alertId: alert.id,
        symbol: alert.symbol,
        timestamp: alert.timestamp,
        confidence: decision.confidence,
      });

      // Set expiration reminder
      this.setAlertExpiration(alert);

      return alert;
    } catch (error) {
      console.error("❌ Error creating trade alert:", error.message);
      this.emit("alertError", { decision, error: error.message });
      return null;
    }
  }

  setAlertExpiration(alert) {
    // Alert expires in 5 minutes if not executed
    setTimeout(() => {
      if (!alert.executed) {
        this.handleExpiredAlert(alert);
      }
    }, 5 * 60 * 1000);
  }

  async handleExpiredAlert(alert) {
    console.log(`⏰ Alert ${alert.id} expired without execution`);

    const message = `
⚠️ **ALERT EXPIRED**

**Symbol:** ${alert.symbol}
**Strike:** $${alert.strike}${alert.optionType[0].toUpperCase()}
**Alert ID:** ${alert.id.substring(0, 8)}

This alert was not executed within 5 minutes and has expired.
`;

    if (this.telegramBot) {
      await this.telegramBot.telegram.sendMessage(
        process.env.TELEGRAM_USER_ID || process.env.TELEGRAM_CHAT_ID,
        message,
        { parse_mode: "Markdown" }
      );
    }

    this.activeAlerts.delete(alert.id);
  }

  startPositionMonitoring(position) {
    console.log(`👁️ Starting position monitoring for ${position.symbol}`);

    // Check position every minute
    const monitorInterval = setInterval(async () => {
      try {
        await this.checkPosition(position);
      } catch (error) {
        console.error(`Error monitoring position ${position.id}:`, error);
      }
    }, 60000); // Every minute

    // Store interval for cleanup
    position.monitorInterval = monitorInterval;
  }

  async checkPosition(position) {
    // Get current price (you'd integrate with your market data here)
    const currentPrice = await this.getCurrentOptionPrice(position);

    if (!currentPrice) return;

    const entryPrice = position.entryPrice;
    const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

    // Check stop loss
    const stopLossPercent = parseFloat(process.env.STOP_LOSS_PERCENTAGE) || 20;
    if (pnlPercent <= -stopLossPercent) {
      await this.sendCloseAlert(
        position,
        currentPrice,
        "STOP_LOSS",
        pnlPercent
      );
      clearInterval(position.monitorInterval);
      return;
    }

    // Check profit target
    const profitTargetPercent =
      parseFloat(process.env.PROFIT_TARGET_PERCENTAGE) || 50;
    if (pnlPercent >= profitTargetPercent) {
      await this.sendCloseAlert(
        position,
        currentPrice,
        "PROFIT_TARGET",
        pnlPercent
      );
      clearInterval(position.monitorInterval);
      return;
    }

    // Check expiration
    const expiration = new Date(position.expiration);
    const daysToExpiry = (expiration - new Date()) / (1000 * 60 * 60 * 24);

    if (daysToExpiry <= 1) {
      await this.sendCloseAlert(
        position,
        currentPrice,
        "EXPIRATION_NEAR",
        pnlPercent
      );
      clearInterval(position.monitorInterval);
    }
  }

  async sendCloseAlert(position, currentPrice, reason, pnlPercent) {
    const closeAlert = await this.tradingClient.closePosition(
      position.id,
      currentPrice,
      reason
    );

    // Update performance
    const pnl = (currentPrice - position.entryPrice) * position.quantity * 100;
    this.performanceTracker.totalPnL += pnl;

    if (pnl > 0) {
      this.performanceTracker.wins++;
    } else {
      this.performanceTracker.losses++;
    }

    console.log(
      `📊 Position closed: ${reason} - P&L: ${pnlPercent.toFixed(1)}%`
    );
  }

  async getCurrentOptionPrice(position) {
    // This would integrate with your market data provider
    // For now, simulate price movement
    const volatility = 0.1;
    const change = (Math.random() - 0.5) * volatility;
    return position.entryPrice * (1 + change);
  }

  formatPerformanceMessage(stats) {
    return `
📊 **TRADING PERFORMANCE**

**Alerts Generated:** ${stats.totalAlerts}
**Alerts Executed:** ${stats.executedAlerts} (${stats.executionRate}%)
**Open Positions:** ${stats.openPositions}

**Win Rate:** ${stats.winRate}%
**Total P&L:** ${stats.totalPnL >= 0 ? "+" : ""}$${stats.totalPnL.toFixed(2)}
**Average Win:** $${stats.avgWin.toFixed(2)}
**Average Loss:** $${stats.avgLoss.toFixed(2)}

**Today's Alerts:** ${stats.todayAlerts}
**This Week:** ${stats.weekAlerts}

_Last Updated: ${new Date().toLocaleString()}_
`;
  }

  getPerformanceStats() {
    const alerts = Array.from(this.tradingClient.alerts.values());
    const executed = alerts.filter((a) => a.executed);
    const today = new Date().toDateString();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const todayAlerts = alerts.filter(
      (a) => new Date(a.timestamp).toDateString() === today
    );

    const weekAlerts = alerts.filter((a) => new Date(a.timestamp) >= weekAgo);

    const winRate =
      this.performanceTracker.wins + this.performanceTracker.losses > 0
        ? (this.performanceTracker.wins /
            (this.performanceTracker.wins + this.performanceTracker.losses)) *
          100
        : 0;

    return {
      totalAlerts: alerts.length,
      executedAlerts: executed.length,
      executionRate:
        alerts.length > 0
          ? ((executed.length / alerts.length) * 100).toFixed(1)
          : 0,
      openPositions: this.tradingClient.getPositions().length,
      winRate: winRate.toFixed(1),
      totalPnL: this.performanceTracker.totalPnL,
      avgWin:
        this.performanceTracker.wins > 0
          ? this.performanceTracker.totalPnL / this.performanceTracker.wins
          : 0,
      avgLoss:
        this.performanceTracker.losses > 0
          ? Math.abs(
              this.performanceTracker.totalPnL / this.performanceTracker.losses
            )
          : 0,
      todayAlerts: todayAlerts.length,
      weekAlerts: weekAlerts.length,
    };
  }

  // ... (rest of the existing methods with minor modifications)
}

module.exports = EnhancedTradingEngine;
