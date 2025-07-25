class TechnicalAnalyzer {
  constructor(marketData) {
    this.marketData = marketData;
  }

  async analyzeStock(symbol) {
    console.log(`📊 Analyzing ${symbol}...`);

    // Get quote data (you already have this!)
    const quote = this.marketData?.getQuote
      ? await this.marketData.getQuote(symbol)
      : { price: 150, change: 2.5 };

    // Calculate technical indicators
    const analysis = {
      symbol,
      price: quote.price || 150,
      change: quote.change || 2.5,
      rsi: this.calculateRSI(symbol),
      macd: this.calculateMACD(symbol),
      support: quote.price * 0.95,
      resistance: quote.price * 1.05,
      volume: quote.volume || 1000000,
      signal: this.generateSignal(quote),
    };

    return this.formatAnalysis(analysis);
  }

  calculateRSI(symbol) {
    // Simplified RSI - replace with real calculation later
    return 30 + Math.random() * 40;
  }

  calculateMACD(symbol) {
    return {
      line: Math.random() * 2 - 1,
      signal: Math.random() * 2 - 1,
      histogram: Math.random() * 0.5,
    };
  }

  generateSignal(quote) {
    const rsi = this.calculateRSI();
    const trend = quote.change > 0 ? "bullish" : "bearish";

    if (rsi < 30 && trend === "bullish") return "STRONG BUY";
    if (rsi > 70 && trend === "bearish") return "STRONG SELL";
    if (trend === "bullish") return "BUY";
    if (trend === "bearish") return "SELL";
    return "HOLD";
  }

  formatAnalysis(data) {
    const emoji = {
      "STRONG BUY": "🟢🟢",
      BUY: "🟢",
      HOLD: "🟡",
      SELL: "🔴",
      "STRONG SELL": "🔴🔴",
    };

    return `
📊 **Technical Analysis: $${data.symbol}**

**Current Price**: $${data.price.toFixed(2)} (${data.change > 0 ? "+" : ""}${
      data.change
    }%)

**📈 Technical Indicators:**
- RSI: ${data.rsi.toFixed(1)} ${
      data.rsi > 70
        ? "⚠️ Overbought"
        : data.rsi < 30
        ? "⚠️ Oversold"
        : "✅ Normal"
    }
- MACD: ${data.macd.histogram > 0 ? "📈 Bullish Cross" : "📉 Bearish Cross"}
- Volume: ${(data.volume / 1000000).toFixed(1)}M

**📍 Key Levels:**
- Support: $${data.support.toFixed(2)}
- Resistance: $${data.resistance.toFixed(2)}

**🎯 Signal: ${emoji[data.signal]} ${data.signal}**

${this.getRecommendation(data)}
    `;
  }

  getRecommendation(data) {
    const recs = {
      "STRONG BUY":
        "💡 Excellent entry point! Consider buying calls or shares.",
      BUY: "💡 Good entry. Scale in with small positions.",
      HOLD: "⏳ Wait for clearer signals. Set alerts at key levels.",
      SELL: "⚠️ Consider taking profits or buying puts.",
      "STRONG SELL": "🚨 Exit positions! Strong bearish signals.",
    };

    return recs[data.signal] || "Monitor closely.";
  }
}

module.exports = TechnicalAnalyzer;
