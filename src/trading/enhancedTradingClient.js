const EventEmitter = require("events");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

class EnhancedTradingClient extends EventEmitter {
  constructor(telegramBot) {
    super();
    this.telegramBot = telegramBot;
    this.isAuthenticated = true;
    this.accountInfo = {
      buyingPower: parseFloat(process.env.STARTING_CAPITAL || 50000),
      totalValue: parseFloat(process.env.STARTING_CAPITAL || 50000),
      mode: "alert",
    };
    this.positions = new Map();
    this.orders = new Map();
    this.alerts = new Map();
    this.executedTrades = [];

    console.log(`🤖 Enhanced Trading Client - Mode: 📱 Mobile Alerts`);
  }

  async authenticate() {
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

      const estimatedPrice = price || 2.5;
      const totalCost = estimatedPrice * quantity * 100;

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
      };

      this.alerts.set(alert.id, alert);

      await this.sendTradingAlert(alert);
      await this.saveAlert(alert);

      this.emit("alertCreated", alert);
      return alert;
    } catch (error) {
      console.error("❌ Error creating trading alert:", error.message);
      throw error;
    }
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
    } = alert;

    const urgencyEmoji = confidence >= 8 ? "🚨🚨🚨" : "🚨";

    // Use HTML formatting to avoid Telegram Markdown issues
    const message = `
${urgencyEmoji} <b>EXECUTE TRADE NOW</b> ${urgencyEmoji}

<b>Action:</b> ${action.toUpperCase()} ${quantity} contracts
<b>Symbol:</b> ${symbol}
<b>Type:</b> $${strike} ${optionType.toUpperCase()}
<b>Expiration:</b> ${expiration}
<b>Estimated Price:</b> $${estimatedPrice.toFixed(2)}

<b>Confidence:</b> ${confidence}/10

⏰ <b>TIME SENSITIVE - EXECUTE NOW</b>
Reply with "DONE ${alert.id.substring(0, 8)}" when executed
`;

    if (this.telegramBot && this.telegramBot.telegram) {
      try {
        await this.telegramBot.telegram.sendMessage(
          process.env.TELEGRAM_USER_ID || process.env.TELEGRAM_CHAT_ID,
          message,
          { parse_mode: "HTML" }
        );
        console.log("📱 Alert sent to Telegram");
      } catch (error) {
        console.error("Error sending Telegram alert:", error);
      }
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

  async markAlertExecuted(alertId, actualPrice = null) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    alert.executed = true;
    alert.executedAt = new Date().toISOString();
    alert.actualPrice = actualPrice || alert.estimatedPrice;

    console.log(`✅ Alert ${alertId} marked as executed`);
    return alert;
  }

  getAlerts() {
    return Array.from(this.alerts.values());
  }

  getPositions() {
    return [];
  }

  getTradingStats() {
    const alerts = this.getAlerts();
    const executed = alerts.filter((a) => a.executed);

    return {
      totalAlerts: alerts.length,
      executedAlerts: executed.length,
      executionRate:
        alerts.length > 0
          ? ((executed.length / alerts.length) * 100).toFixed(1)
          : 0,
    };
  }
}

module.exports = EnhancedTradingClient;
