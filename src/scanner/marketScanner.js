class MarketScanner {
  constructor(technicalAnalyzer, strategyBuilder) {
    this.technicalAnalyzer = technicalAnalyzer;
    this.strategyBuilder = strategyBuilder;
    this.scanResults = new Map();
    this.alerts = new Map();
  }

  async scanMarket(
    symbols = ["NVDA", "TSLA", "AAPL", "SPY", "QQQ", "AMD", "MSFT"]
  ) {
    console.log(`🔍 Scanning ${symbols.length} stocks...`);

    const results = {
      bullish: [],
      bearish: [],
      breakouts: [],
      oversold: [],
      overbought: [],
      unusualVolume: [],
    };

    for (const symbol of symbols) {
      const analysis = await this.analyzeSymbol(symbol);
      this.categorizeStock(analysis, results);
    }

    this.scanResults.set(Date.now(), results);
    return this.formatScanResults(results);
  }

  async analyzeSymbol(symbol) {
    // Simulated analysis - replace with real data later
    return {
      symbol,
      price: 100 + Math.random() * 400,
      change: (Math.random() - 0.5) * 10,
      rsi: 20 + Math.random() * 60,
      volume: Math.random() * 10000000,
      avgVolume: 5000000,
      macd: {
        histogram: (Math.random() - 0.5) * 2,
      },
      nearResistance: Math.random() > 0.8,
      nearSupport: Math.random() > 0.8,
    };
  }

  categorizeStock(analysis, results) {
    const { symbol, rsi, change, volume, avgVolume, macd, nearResistance } =
      analysis;

    // Bullish signals
    if (rsi < 40 && macd.histogram > 0 && change > 0) {
      results.bullish.push({
        symbol,
        reason: "Oversold bounce starting",
        confidence: 85,
      });
    }

    // Bearish signals
    if (rsi > 70 && macd.histogram < 0 && change < 0) {
      results.bearish.push({
        symbol,
        reason: "Overbought reversal",
        confidence: 80,
      });
    }

    // Breakout candidates
    if (nearResistance && volume > avgVolume * 2) {
      results.breakouts.push({
        symbol,
        reason: "Volume surge at resistance",
        confidence: 75,
      });
    }

    // Oversold
    if (rsi < 30) {
      results.oversold.push({ symbol, rsi: rsi.toFixed(1) });
    }

    // Overbought
    if (rsi > 70) {
      results.overbought.push({ symbol, rsi: rsi.toFixed(1) });
    }

    // Unusual volume
    if (volume > avgVolume * 3) {
      results.unusualVolume.push({
        symbol,
        ratio: (volume / avgVolume).toFixed(1),
      });
    }
  }

  formatScanResults(results) {
    return `
🔍 **Market Scanner Results**

${
  results.bullish.length > 0
    ? `🟢 **BULLISH SETUPS:**
${results.bullish
  .map((s) => `• ${s.symbol}: ${s.reason} (${s.confidence}%)`)
  .join("\n")}
`
    : ""
}

${
  results.bearish.length > 0
    ? `🔴 **BEARISH SETUPS:**
${results.bearish
  .map((s) => `• ${s.symbol}: ${s.reason} (${s.confidence}%)`)
  .join("\n")}
`
    : ""
}

${
  results.breakouts.length > 0
    ? `🚀 **BREAKOUT WATCH:**
${results.breakouts.map((s) => `• ${s.symbol}: ${s.reason}`).join("\n")}
`
    : ""
}

${
  results.oversold.length > 0
    ? `💚 **OVERSOLD (RSI < 30):**
${results.oversold.map((s) => `• ${s.symbol} (RSI: ${s.rsi})`).join("\n")}
`
    : ""
}

${
  results.unusualVolume.length > 0
    ? `📊 **UNUSUAL VOLUME:**
${results.unusualVolume
  .map((s) => `• ${s.symbol} (${s.ratio}x normal)`)
  .join("\n")}
`
    : ""
}

_Scanned at ${new Date().toLocaleTimeString()}_
Use \`/alert [symbol]\` to monitor any stock
    `;
  }

  async createAlert(userId, symbol, conditions) {
    const alertId = `alert_${Date.now()}`;
    const alert = {
      id: alertId,
      userId,
      symbol,
      conditions,
      created: new Date(),
      triggered: false,
    };

    this.alerts.set(alertId, alert);

    // Start monitoring
    this.monitorAlert(alert);

    return alertId;
  }

  async monitorAlert(alert) {
    // In production, this would connect to real-time data
    // For now, simulate checking every 30 seconds
    const interval = setInterval(async () => {
      if (alert.triggered) {
        clearInterval(interval);
        return;
      }

      const analysis = await this.analyzeSymbol(alert.symbol);

      if (this.checkAlertConditions(analysis, alert.conditions)) {
        alert.triggered = true;
        alert.triggeredAt = new Date();

        // Notify user (you'll need to pass bot instance)
        console.log(
          `🚨 ALERT TRIGGERED: ${alert.symbol} - ${alert.conditions.type}`
        );

        clearInterval(interval);
      }
    }, 30000); // Check every 30 seconds
  }

  checkAlertConditions(analysis, conditions) {
    switch (conditions.type) {
      case "rsi_oversold":
        return analysis.rsi <= conditions.value;
      case "rsi_overbought":
        return analysis.rsi >= conditions.value;
      case "price_above":
        return analysis.price >= conditions.value;
      case "price_below":
        return analysis.price <= conditions.value;
      default:
        return false;
    }
  }
}

module.exports = MarketScanner;
