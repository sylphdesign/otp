const axios = require("axios");
const EventEmitter = require("events");

class OptionsFlowMonitor extends EventEmitter {
  constructor() {
    super();
    console.log('[DEBUG] OptionsFlowMonitor constructed. this.emit:', typeof this.emit);
    this.cache = new Map();
    this.unusual_activity = [];
    this.monitoringSymbols = new Set();
    this.updateInterval = 30000; // 30 seconds
  }

  async startMonitoring(symbols) {
    symbols.forEach((symbol) => this.monitoringSymbols.add(symbol));

    // Start monitoring loop
    this.monitoringLoop = setInterval(() => {
      this.checkOptionsFlow();
    }, this.updateInterval);

    console.log(
      `📊 Options flow monitoring started for ${symbols.length} symbols`
    );
  }

  async checkOptionsFlow() {
    for (const symbol of this.monitoringSymbols) {
      try {
        await this.analyzeOptionsActivity(symbol);
      } catch (error) {
        console.error(
          `Error checking options flow for ${symbol}:`,
          error
        );
      }
    }
  }

  async analyzeOptionsActivity(symbol) {
    // For now, generate mock options flow data
    // In production, you'd use real options data APIs
    const mockFlow = this.generateMockOptionsFlow(symbol);

    // Analyze for unusual activity
    const signals = this.detectUnusualActivity(symbol, mockFlow);

    if (signals.length > 0) {
      for (const signal of signals) {
        this.emit("optionsSignal", {
          symbol,
          ...signal,
          timestamp: new Date().toISOString(),
        });
      }
    }

    this.cache.set(symbol, mockFlow);
  }

  generateMockOptionsFlow(symbol) {
    const baseActivity = {
      totalVolume: Math.floor(Math.random() * 100000) + 10000,
      callVolume: Math.floor(Math.random() * 60000) + 5000,
      putVolume: Math.floor(Math.random() * 40000) + 5000,
      callOI: Math.floor(Math.random() * 500000) + 50000,
      putOI: Math.floor(Math.random() * 300000) + 30000,
      avgIV: 0.2 + Math.random() * 0.8, // 20% to 100% IV
      gexLevel: Math.random() * 0.3, // 0 to 30% of float
      maxPain: this.calculateMockMaxPain(symbol),
      timestamp: Date.now(),
    };

    baseActivity.putCallRatio =
      baseActivity.putVolume / baseActivity.callVolume;
    baseActivity.unusualActivity = Math.random() > 0.8; // 20% chance

    return baseActivity;
  }

  calculateMockMaxPain(symbol) {
    // Mock max pain calculation
    const basePrice = 100 + (symbol.charCodeAt(0) % 50);
    return basePrice + (Math.random() - 0.5) * 10;
  }

  detectUnusualActivity(symbol, flow) {
    const signals = [];

    // High volume alert
    if (flow.totalVolume > 50000) {
      signals.push({
        type: "HIGH_VOLUME",
        message: `${symbol} high options volume: ${flow.totalVolume.toLocaleString()}`,
        priority: "medium",
        data: { volume: flow.totalVolume },
      });
    }

    // Unusual Put/Call ratio
    if (flow.putCallRatio > 2.0) {
      signals.push({
        type: "HIGH_PUT_CALL_RATIO",
        message: `${symbol} high put/call ratio: ${flow.putCallRatio.toFixed(
          2
        )}`,
        priority: "high",
        data: { ratio: flow.putCallRatio },
      });
    } else if (flow.putCallRatio < 0.3) {
      signals.push({
        type: "LOW_PUT_CALL_RATIO",
        message: `${symbol} low put/call ratio: ${flow.putCallRatio.toFixed(
          2
        )} (bullish)`,
        priority: "high",
        data: { ratio: flow.putCallRatio },
      });
    }

    // High IV alert
    if (flow.avgIV > 0.6) {
      signals.push({
        type: "HIGH_IV",
        message: `${symbol} high implied volatility: ${(
          flow.avgIV * 100
        ).toFixed(1)}%`,
        priority: "medium",
        data: { iv: flow.avgIV },
      });
    }

    // Gamma exposure alert
    if (flow.gexLevel > 0.15) {
      signals.push({
        type: "GAMMA_SQUEEZE_RISK",
        message: `${symbol} high gamma exposure: ${(
          flow.gexLevel * 100
        ).toFixed(1)}% of float`,
        priority: "high",
        data: { gex: flow.gexLevel },
      });
    }

    return signals;
  }

  getOptionsData(symbol) {
    return this.cache.get(symbol);
  }

  stopMonitoring() {
    if (this.monitoringLoop) {
      clearInterval(this.monitoringLoop);
      this.monitoringLoop = null;
    }
    console.log("📊 Options flow monitoring stopped");
  }

  addSymbol(symbol) {
    this.monitoringSymbols.add(symbol);
    console.log(`📊 Added ${symbol} to options monitoring`);
  }

  removeSymbol(symbol) {
    this.monitoringSymbols.delete(symbol);
    this.cache.delete(symbol);
    console.log(`📊 Removed ${symbol} from options monitoring`);
  }

  getMonitoringStatus() {
    return {
      monitoring: !!this.monitoringLoop,
      symbols: Array.from(this.monitoringSymbols),
      cacheSize: this.cache.size,
      updateInterval: this.updateInterval,
    };
  }
}

module.exports = OptionsFlowMonitor;
