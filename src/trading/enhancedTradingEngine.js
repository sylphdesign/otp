const EventEmitter = require("events");

class EnhancedTradingEngine extends EventEmitter {
  constructor(tradingClient, aiAnalyzer) {
    super();
    this.tradingClient = tradingClient;
    this.aiAnalyzer = aiAnalyzer;
    this.isActive = false;
    this.activeAlerts = new Map();

    this.setupEventListeners();
  }

  setupEventListeners() {
    // We'll add more later
  }

  async start() {
    try {
      console.log("🚀 Starting trading engine...");
      await this.tradingClient.authenticate();
      this.isActive = true;
      console.log("✅ Trading engine started");
      return true;
    } catch (error) {
      console.error("❌ Failed to start trading engine:", error.message);
      return false;
    }
  }

  async executeTradeFromDecision(decision) {
    try {
      const { symbol, action, tradeParameters } = decision;

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
        decision: decision,
      };

      const alert = await this.tradingClient.placeOptionOrder(orderParams);

      this.activeAlerts.set(alert.id, alert);

      return alert;
    } catch (error) {
      console.error("❌ Error creating trade alert:", error.message);
      return null;
    }
  }
}

module.exports = EnhancedTradingEngine;
