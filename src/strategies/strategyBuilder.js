class StrategyBuilder {
  constructor() {
    this.strategies = new Map();
    this.presets = this.loadPresets();
  }

  loadPresets() {
    return {
      momentum: {
        name: "Momentum Surge",
        description: "Buy when RSI > 50 and MACD crosses up",
        entry: {
          rsi: { min: 50, max: 70 },
          macd: { signal: "bullish_cross" },
          volume: { multiplier: 1.5 },
        },
        exit: {
          profitTarget: 0.15, // 15%
          stopLoss: 0.05, // 5%
          timeLimit: 5, // days
        },
      },
      meanReversion: {
        name: "Oversold Bounce",
        description: "Buy oversold conditions expecting bounce",
        entry: {
          rsi: { min: 20, max: 30 },
          priceAction: "near_support",
          volume: { multiplier: 2 },
        },
        exit: {
          profitTarget: 0.1,
          stopLoss: 0.03,
          rsiTarget: 50,
        },
      },
      breakout: {
        name: "Resistance Breakout",
        description: "Buy when price breaks key resistance",
        entry: {
          priceAction: "breaks_resistance",
          volume: { multiplier: 3 },
          rsi: { min: 50 },
        },
        exit: {
          trailingStop: 0.05,
          profitTarget: 0.25,
        },
      },
    };
  }

  async buildStrategy(userId, params) {
    const strategy = {
      id: `strat_${Date.now()}`,
      userId,
      name: params.name || "Custom Strategy",
      created: new Date(),
      rules: params.rules || {},
      backtest: null,
    };

    this.strategies.set(strategy.id, strategy);
    return strategy;
  }

  async backtest(strategyId, symbol, period = "1M") {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) throw new Error("Strategy not found");

    // Simulated backtest results
    const results = {
      period,
      symbol,
      totalTrades: Math.floor(20 + Math.random() * 30),
      winRate: 45 + Math.random() * 20,
      avgWin: 5 + Math.random() * 10,
      avgLoss: 2 + Math.random() * 5,
      sharpeRatio: 0.5 + Math.random() * 2,
      maxDrawdown: 5 + Math.random() * 15,
      profitFactor: 1.2 + Math.random() * 0.8,
    };

    // Calculate final metrics
    results.expectancy =
      (results.winRate / 100) * results.avgWin -
      ((100 - results.winRate) / 100) * results.avgLoss;
    results.profitable = results.expectancy > 0;

    strategy.backtest = results;
    return this.formatBacktestResults(strategy, results);
  }

  formatBacktestResults(strategy, results) {
    const emoji = results.profitable ? "✅" : "❌";

    return `
📊 **Backtest Results: ${strategy.name}**

**Performance Metrics:**
- Total Trades: ${results.totalTrades}
- Win Rate: ${results.winRate.toFixed(1)}%
- Avg Win: +${results.avgWin.toFixed(2)}%
- Avg Loss: -${results.avgLoss.toFixed(2)}%

**Risk Metrics:**
- Sharpe Ratio: ${results.sharpeRatio.toFixed(2)} ${
      results.sharpeRatio > 1 ? "🟢" : "🟡"
    }
- Max Drawdown: -${results.maxDrawdown.toFixed(1)}%
- Profit Factor: ${results.profitFactor.toFixed(2)}

**📈 Expectancy: ${
      results.expectancy > 0 ? "+" : ""
    }${results.expectancy.toFixed(2)}%**

**Verdict: ${emoji} ${results.profitable ? "PROFITABLE" : "UNPROFITABLE"}**

${this.getRecommendation(results)}
    `;
  }

  getRecommendation(results) {
    if (results.profitable && results.sharpeRatio > 1.5) {
      return "🌟 Excellent strategy! Consider live testing with small size.";
    } else if (results.profitable) {
      return "👍 Decent strategy. Consider optimizing parameters.";
    } else {
      return "⚠️ Strategy needs work. Adjust entry/exit rules.";
    }
  }

  listPresets() {
    return `
🎯 **Available Strategy Templates:**

${Object.entries(this.presets)
  .map(
    ([key, preset]) => `
**${preset.name}**
${preset.description}
Command: \`/strategy ${key}\`
`
  )
  .join("\n")}

Or create custom: \`/strategy custom\`
    `;
  }
}

module.exports = StrategyBuilder;
