const axios = require("axios");

class MarketDataProvider {
  constructor() {
    this.alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1 minute cache
  }

  async getQuote(symbol) {
    const cacheKey = `quote_${symbol}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      // Free tier Alpha Vantage API
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.alphaVantageKey}`;
      const response = await axios.get(url);

      const quote = response.data["Global Quote"];
      if (!quote) {
        throw new Error("No quote data received");
      }

      const data = {
        symbol: quote["01. symbol"],
        price: parseFloat(quote["05. price"]),
        change: parseFloat(quote["09. change"]),
        changePercent: parseFloat(quote["10. change percent"].replace("%", "")),
        volume: parseInt(quote["06. volume"]),
        timestamp: new Date().toISOString(),
      };

      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      console.error(`Failed to get quote for ${symbol}:`, error.message);

      // Return mock data for development
      return this.getMockQuote(symbol);
    }
  }

  async getMarketContext() {
    try {
      // Get major indices for market context
      const spyQuote = await this.getQuote("SPY");
      const qqqQuote = await this.getQuote("QQQ");

      return {
        marketCondition: this.assessMarketCondition(spyQuote, qqqQuote),
        spy: spyQuote,
        qqq: qqqQuote,
        volatility: this.calculateVolatility([spyQuote, qqqQuote]),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Failed to get market context:", error);
      return {
        marketCondition: "unknown",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  assessMarketCondition(spy, qqq) {
    const avgChange = (spy.changePercent + qqq.changePercent) / 2;

    if (avgChange > 1) return "bullish";
    if (avgChange > 0.5) return "slightly_bullish";
    if (avgChange > -0.5) return "neutral";
    if (avgChange > -1) return "slightly_bearish";
    return "bearish";
  }

  calculateVolatility(quotes) {
    const changes = quotes.map((q) => Math.abs(q.changePercent));
    const avgChange =
      changes.reduce((sum, change) => sum + change, 0) / changes.length;

    if (avgChange > 2) return "high";
    if (avgChange > 1) return "medium";
    return "low";
  }

  getMockQuote(symbol) {
    // Mock data for development/testing
    const basePrice = 100 + (symbol.charCodeAt(0) % 50);
    const changePercent = (Math.random() - 0.5) * 4; // -2% to +2%

    return {
      symbol: symbol,
      price: basePrice + (basePrice * changePercent) / 100,
      change: (basePrice * changePercent) / 100,
      changePercent: changePercent,
      volume: Math.floor(Math.random() * 1000000) + 500000,
      timestamp: new Date().toISOString(),
      mock: true,
    };
  }
}

module.exports = MarketDataProvider;
