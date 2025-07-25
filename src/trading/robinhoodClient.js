const EventEmitter = require("events");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

class EnhancedTradingClient extends EventEmitter {
  constructor(telegramBot) {
    super();
    this.telegramBot = telegramBot;
    this.isAuthenticated = true; // Always true for alert mode
    this.accountInfo = {
      buyingPower: parseFloat(process.env.STARTING_CAPITAL || 50000),
      totalValue: parseFloat(process.env.STARTING_CAPITAL || 50000),
      mode: "alert",
    };
    this.positions = new Map();
    this.orders = new Map();
    this.alerts = new Map();
    this.executedTrades = [];

    this.tradingEnabled = process.env.AUTO_TRADING_ENABLED === "true";
    this.alertMode = true; // Always true now

    console.log(`🤖 Enhanced Trading Client - Mode: 📱 Mobile Alerts`);
  }

  async authenticate() {
    // No actual authentication needed for alert mode
    console.log("📱 Alert mode active - Ready to send mobile notifications");
    this.emit("authenticated", { alertMode: true });
    return true;
  }

  async placeOptionOrder(orderParams) {
    const {
      symbol,
      quantity,
      optionType,
      strike,
      expiration,
      action,
      price = null,
      decision,
    } = orderParams;

    try {
      console.log(
        `📋 Creating alert for ${action} ${quantity} ${symbol} ${optionType}s`
      );

      // Calculate estimated cost
      const estimatedPrice =
        price || (await this.getOptionPrice(symbol, strike, optionType));
      const totalCost = estimatedPrice * quantity * 100;

      // Create detailed alert
      const alert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        symbol,
        quantity,
        optionType,
        strike,
        expiration,
        action,
        estimatedPrice,
        totalCost,
        confidence: decision?.confidence || 0,
        reasoning: decision?.reasoning || "",
        timestamp: new Date().toISOString(),
        executed: false,
        // Robinhood-specific formatting
        robinhoodFormat: this.formatForRobinhood(orderParams),
      };

      // Store alert
      this.alerts.set(alert.id, alert);

      // Send mobile notification
      await this.sendTradingAlert(alert);

      // Track for performance
      await this.saveAlert(alert);

      this.emit("alertCreated", alert);

      return alert;
    } catch (error) {
      console.error("❌ Error creating trading alert:", error.message);
      throw error;
    }
  }

  formatForRobinhood(params) {
    const { symbol, optionType, strike, expiration, quantity, action } = params;

    // Format expiration date for Robinhood
    const expDate = new Date(expiration);
    const expMonth = (expDate.getMonth() + 1).toString().padStart(2, "0");
    const expDay = expDate.getDate().toString().padStart(2, "0");
    const expYear = expDate.getFullYear().toString().substr(2);

    return {
      searchTerm: `${symbol} ${expMonth}/${expDay}/${expYear} ${strike}${optionType[0].toUpperCase()}`,
      steps: [
        `1. Open Robinhood app`,
        `2. Search: "${symbol}"`,
        `3. Tap "Trade Options"`,
        `4. Select "${expMonth}/${expDay}" expiration`,
        `5. Choose $${strike} ${optionType}`,
        `6. ${action === "buy" ? "Buy" : "Sell"} ${quantity} contract${
          quantity > 1 ? "s" : ""
        }`,
        `7. Review and confirm order`,
      ],
    };
  }

  async sendTradingAlert(alert) {
    const {
      symbol,
      optionType,
      strike,
      expiration,
      quantity,
      action,
      estimatedPrice,
      confidence,
      reasoning,
      robinhoodFormat,
    } = alert;

    // Format message for Telegram
    const urgencyEmoji =
      confidence >= 8 ? "🚨🚨🚨" : confidence >= 7 ? "🚨🚨" : "🚨";

    const message = `
${urgencyEmoji} **EXECUTE TRADE NOW** ${urgencyEmoji}

**Action:** ${action.toUpperCase()} ${quantity} contract${
      quantity > 1 ? "s" : ""
    }
**Symbol:** ${symbol}
**Type:** $${strike} ${optionType.toUpperCase()}
**Expiration:** ${expiration}
**Estimated Price:** $${estimatedPrice.toFixed(2)}/contract
**Total Cost:** $${(estimatedPrice * quantity * 100).toFixed(2)}

**Confidence:** ${confidence}/10 ${this.getConfidenceBar(confidence)}
**Reasoning:** ${reasoning.substring(0, 200)}...

**📱 ROBINHOOD QUICK COPY:**
\`${robinhoodFormat.searchTerm}\`

**Steps to Execute:**
${robinhoodFormat.steps.join("\n")}

**⏰ TIME SENSITIVE - EXECUTE IMMEDIATELY**

_Reply with "DONE ${alert.id.substring(0, 8)}" when executed_
`;

    // Send to Telegram
    if (this.telegramBot) {
      await this.telegramBot.telegram.sendMessage(
        process.env.TELEGRAM_USER_ID || process.env.TELEGRAM_CHAT_ID,
        message,
        {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }
      );
    }

    // Also log to console
    console.log("📱 ALERT SENT:", robinhoodFormat.searchTerm);

    // Send push notification if configured
    await this.sendPushNotification(alert);
  }

  async sendPushNotification(alert) {
    // Integration with Pushover, Pushbullet, or native notifications
    if (process.env.PUSHOVER_TOKEN && process.env.PUSHOVER_USER) {
      try {
        await axios.post("https://api.pushover.net/1/messages.json", {
          token: process.env.PUSHOVER_TOKEN,
          user: process.env.PUSHOVER_USER,
          title: `🚨 Trade Alert: ${alert.symbol}`,
          message: `${alert.action.toUpperCase()} ${alert.quantity} ${
            alert.symbol
          } $${alert.strike}${alert.optionType[0].toUpperCase()}`,
          priority: alert.confidence >= 8 ? 2 : 1, // High priority for high confidence
          expire: 300, // 5 minute expiration for urgent alerts
          retry: 60, // Retry every minute
        });
        console.log("📲 Push notification sent");
      } catch (error) {
        console.warn("Push notification failed:", error.message);
      }
    }
  }

  getConfidenceBar(confidence) {
    const filled = Math.round(confidence);
    const empty = 10 - filled;
    return "🟩".repeat(filled) + "⬜".repeat(empty);
  }

  async getOptionPrice(symbol, strike, optionType) {
    // Try to get real option price from market data
    try {
      // This would integrate with your market data provider
      // For now, return estimated price based on basic calculation
      const stockPrice = await this.getStockPrice(symbol);
      const intrinsic =
        optionType === "call"
          ? Math.max(0, stockPrice - strike)
          : Math.max(0, strike - stockPrice);

      const timeValue = 0.5 + Math.random() * 2; // Simplified
      return parseFloat((intrinsic + timeValue).toFixed(2));
    } catch (error) {
      // Fallback to simple estimation
      return 2.5; // Default estimate
    }
  }

  async getStockPrice(symbol) {
    // This would connect to your market data provider
    // For now, return mock price
    return 100 + (symbol.charCodeAt(0) % 50);
  }

  async markAlertExecuted(alertId, actualPrice = null) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    alert.executed = true;
    alert.executedAt = new Date().toISOString();
    alert.actualPrice = actualPrice || alert.estimatedPrice;

    // Create position tracking
    const position = {
      id: `pos_${Date.now()}`,
      alertId: alert.id,
      symbol: alert.symbol,
      quantity: alert.quantity,
      entryPrice: alert.actualPrice,
      optionType: alert.optionType,
      strike: alert.strike,
      expiration: alert.expiration,
      entryTime: alert.executedAt,
    };

    this.positions.set(position.id, position);

    // Update tracking
    await this.updateExecutedTrades(alert, position);

    console.log(
      `✅ Alert ${alertId} marked as executed at $${alert.actualPrice}`
    );

    return position;
  }

  async updateExecutedTrades(alert, position) {
    const trade = {
      ...alert,
      positionId: position.id,
      status: "executed",
    };

    this.executedTrades.push(trade);

    // Save to file
    const tradesFile = path.join(__dirname, "../../logs/executed_trades.json");

    try {
      let trades = [];
      try {
        const existing = await fs.readFile(tradesFile, "utf8");
        trades = JSON.parse(existing);
      } catch (err) {}

      trades.push(trade);

      if (trades.length > 1000) {
        trades = trades.slice(-1000);
      }

      await fs.writeFile(tradesFile, JSON.stringify(trades, null, 2));
    } catch (error) {
      console.error("Error saving executed trade:", error);
    }
  }

  async saveAlert(alert) {
    const alertsFile = path.join(__dirname, "../../logs/trading_alerts.json");

    try {
      let alerts = [];
      try {
        const existing = await fs.readFile(alertsFile, "utf8");
        alerts = JSON.parse(existing);
      } catch (err) {}

      alerts.push(alert);

      if (alerts.length > 500) {
        alerts = alerts.slice(-500);
      }

      await fs.writeFile(alertsFile, JSON.stringify(alerts, null, 2));
    } catch (error) {
      console.error("Error saving alert:", error);
    }
  }

  async closePosition(positionId, currentPrice, reason = "manual") {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    // Calculate P&L
    const exitPrice = currentPrice;
    const contracts = position.quantity;
    const entryTotal = position.entryPrice * contracts * 100;
    const exitTotal = exitPrice * contracts * 100;
    const pnl = exitTotal - entryTotal;
    const pnlPercent = (pnl / entryTotal) * 100;

    // Create exit alert
    const exitAlert = {
      id: `exit_${Date.now()}`,
      positionId,
      symbol: position.symbol,
      action: "CLOSE",
      reason,
      entryPrice: position.entryPrice,
      exitPrice,
      quantity: contracts,
      pnl,
      pnlPercent,
      timestamp: new Date().toISOString(),
    };

    // Send exit notification
    const message = `
📊 **CLOSE POSITION ALERT**

**Symbol:** ${position.symbol} $${
      position.strike
    }${position.optionType[0].toUpperCase()}
**Reason:** ${reason}
**Entry:** $${position.entryPrice.toFixed(2)}
**Current:** $${exitPrice.toFixed(2)}
**P&L:** ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} (${
      pnlPercent >= 0 ? "+" : ""
    }${pnlPercent.toFixed(1)}%)

**Action Required:** CLOSE ${contracts} contract${contracts > 1 ? "s" : ""}

${pnl >= 0 ? "✅ TAKE PROFIT" : "🛑 STOP LOSS"}
`;

    if (this.telegramBot) {
      await this.telegramBot.telegram.sendMessage(
        process.env.TELEGRAM_USER_ID || process.env.TELEGRAM_CHAT_ID,
        message,
        { parse_mode: "Markdown" }
      );
    }

    // Update position
    this.positions.delete(positionId);

    return exitAlert;
  }

  getAccountInfo() {
    return this.accountInfo;
  }

  getPositions() {
    return Array.from(this.positions.values());
  }

  getAlerts() {
    return Array.from(this.alerts.values());
  }

  getTradingStats() {
    const alerts = this.getAlerts();
    const positions = this.getPositions();
    const today = new Date().toDateString();

    const todayAlerts = alerts.filter(
      (a) => new Date(a.timestamp).toDateString() === today
    );

    const executedAlerts = alerts.filter((a) => a.executed);
    const executionRate =
      alerts.length > 0
        ? ((executedAlerts.length / alerts.length) * 100).toFixed(1)
        : 0;

    return {
      totalAlerts: alerts.length,
      todayAlerts: todayAlerts.length,
      executedAlerts: executedAlerts.length,
      executionRate: executionRate + "%",
      openPositions: positions.length,
      mode: "Alert Mode",
      pushNotifications: !!process.env.PUSHOVER_TOKEN,
    };
  }
}

module.exports = EnhancedTradingClient;
