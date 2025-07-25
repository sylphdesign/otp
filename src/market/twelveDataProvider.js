const axios = require("axios");
const EventEmitter = require("events");

class TwelveDataProvider extends EventEmitter {
  constructor() {
    super();
    this.apiKey = process.env.TWELVE_DATA_API_KEY;
    this.baseUrl = "https://api.twelvedata.com";
    this.cache = new Map();
    this.rateLimitDelay = 8000; // 8 seconds between calls (free tier: 8 calls/minute)
    this.lastRequestTime = 0;
    this.requestQueue = [];
    this.isProcessingQueue = false;

    if (!this.apiKey) {
      console.warn("⚠️ No Twelve Data API key found");
    } else {
      console.log("✅ Twelve Data provider initialized");
      this.startQueueProcessor();
    }
  }

  startQueueProcessor() {
    setInterval(() => {
      this.processRequestQueue();
    }, this.rateLimitDelay);
  }

  async processRequestQueue() {
    if (this.requestQueue.length === 0 || this.isProcessingQueue) return;

    this.isProcessingQueue = true;
    const request = this.requestQueue.shift();

    try {
      const result = await this.makeApiCall(request.url, request.params);
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    }

    this.isProcessingQueue = false;
  }

  async queueRequest(endpoint, params = {}) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        url: endpoint,
        params,
        resolve,
        reject,
      });
    });
  }

  async makeApiCall(endpoint, params = {}) {
    const url = `${this.baseUrl}/${endpoint}`;
    const config = {
      params: {
        ...params,
        apikey: this.apiKey,
      },
    };

    console.log(`📡 Twelve Data API call: ${endpoint}`);
    const response = await axios.get(url, config);

    if (response.data.status === "error") {
      throw new Error(response.data.message || "API Error");
    }

    return response.data;
  }

  async getRealTimePrice(symbol) {
    try {
      const cached = this.cache.get(`${symbol}_realtime`);
      if (cached && Date.now() - cached.timestamp < 30000) {
        // 30 second cache
        return cached.data;
      }

      const data = await this.queueRequest("price", { symbol });

      const priceData = {
        symbol: symbol,
        price: parseFloat(data.price),
        timestamp: Date.now(),
        source: "twelvedata",
      };

      this.cache.set(`${symbol}_realtime`, {
        data: priceData,
        timestamp: Date.now(),
      });
      return priceData;
    } catch (error) {
      console.error(
        `Error getting real-time price for ${symbol}:`,
        error.message
      );
      return this.getMockPrice(symbol);
    }
  }

  async getQuote(symbol) {
    try {
      const cached = this.cache.get(`${symbol}_quote`);
      if (cached && Date.now() - cached.timestamp < 60000) {
        // 1 minute cache
        return cached.data;
      }

      const data = await this.queueRequest("quote", { symbol });

      const quote = {
        symbol: data.symbol,
        name: data.name,
        price: parseFloat(data.close),
        open: parseFloat(data.open),
        high: parseFloat(data.high),
        low: parseFloat(data.low),
        volume: parseInt(data.volume),
        previousClose: parseFloat(data.previous_close),
        change: parseFloat(data.close) - parseFloat(data.previous_close),
        changePercent:
          ((parseFloat(data.close) - parseFloat(data.previous_close)) /
            parseFloat(data.previous_close)) *
          100,
        timestamp: Date.now(),
        source: "twelvedata",
      };

      this.cache.set(`${symbol}_quote`, { data: quote, timestamp: Date.now() });
      this.emit("quote", quote);

      return quote;
    } catch (error) {
      console.error(`Error getting quote for ${symbol}:`, error.message);
      return this.getMockQuote(symbol);
    }
  }

  async getHistoricalData(symbol, interval = "1day", outputsize = 30) {
    try {
      const cacheKey = `${symbol}_${interval}_${outputsize}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 300000) {
        // 5 minute cache
        return cached.data;
      }

      const data = await this.queueRequest("time_series", {
        symbol,
        interval,
        outputsize,
      });

      if (!data.values || !Array.isArray(data.values)) {
        throw new Error("Invalid historical data format");
      }

      const historicalData = data.values
        .map((item) => ({
          timestamp: new Date(item.datetime).getTime(),
          open: parseFloat(item.open),
          high: parseFloat(item.high),
          low: parseFloat(item.low),
          close: parseFloat(item.close),
          volume: parseInt(item.volume),
        }))
        .reverse(); // Twelve Data returns newest first, we want oldest first

      this.cache.set(cacheKey, { data: historicalData, timestamp: Date.now() });
      this.emit("historicalData", { symbol, data: historicalData });

      return historicalData;
    } catch (error) {
      console.error(
        `Error getting historical data for ${symbol}:`,
        error.message
      );
      return this.generateMockHistoricalData(symbol, outputsize);
    }
  }

  async getTechnicalIndicators(symbol, indicator = "rsi", interval = "1day") {
    try {
      const cacheKey = `${symbol}_${indicator}_${interval}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 300000) {
        // 5 minute cache
        return cached.data;
      }

      const data = await this.queueRequest(indicator, {
        symbol,
        interval,
        time_period: 14,
        series_type: "close",
      });

      if (!data.values || !Array.isArray(data.values)) {
        throw new Error("Invalid technical indicator data");
      }

      const indicatorData = data.values
        .map((item) => ({
          timestamp: new Date(item.datetime).getTime(),
          value: parseFloat(item[indicator]),
        }))
        .reverse();

      this.cache.set(cacheKey, { data: indicatorData, timestamp: Date.now() });

      return indicatorData;
    } catch (error) {
      console.error(`Error getting ${indicator} for ${symbol}:`, error.message);
      return this.generateMockIndicator(symbol, indicator);
    }
  }

  async getMarketMovers() {
    try {
      const cached = this.cache.get("market_movers");
      if (cached && Date.now() - cached.timestamp < 300000) {
        // 5 minute cache
        return cached.data;
      }

      // Get quotes for major indices and popular stocks
      const symbols = [
        "SPY",
        "QQQ",
        "AAPL",
        "TSLA",
        "NVDA",
        "MSFT",
        "GOOGL",
        "AMZN",
      ];
      const movers = [];

      for (const symbol of symbols) {
        try {
          const quote = await this.getQuote(symbol);
          movers.push(quote);

          // Small delay to respect rate limits
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.warn(`Failed to get quote for ${symbol}:`, error.message);
        }
      }

      // Sort by absolute percentage change
      movers.sort(
        (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)
      );

      this.cache.set("market_movers", { data: movers, timestamp: Date.now() });

      return movers;
    } catch (error) {
      console.error("Error getting market movers:", error.message);
      return this.generateMockMovers();
    }
  }

  async getEarningsCalendar(date = null) {
    try {
      const targetDate = date || new Date().toISOString().split("T")[0];
      const cached = this.cache.get(`earnings_${targetDate}`);
      if (cached && Date.now() - cached.timestamp < 3600000) {
        // 1 hour cache
        return cached.data;
      }

      const data = await this.queueRequest("earnings", {
        start_date: targetDate,
        end_date: targetDate,
      });

      const earnings = data.earnings || [];

      this.cache.set(`earnings_${targetDate}`, {
        data: earnings,
        timestamp: Date.now(),
      });

      return earnings;
    } catch (error) {
      console.error("Error getting earnings calendar:", error.message);
      return [];
    }
  }

  // Mock data methods for fallback
  getMockPrice(symbol) {
    const basePrice = 100 + (symbol.charCodeAt(0) % 50);
    const change = (Math.random() - 0.5) * 0.04 * basePrice;

    return {
      symbol,
      price: parseFloat((basePrice + change).toFixed(2)),
      timestamp: Date.now(),
      source: "mock",
    };
  }

  getMockQuote(symbol) {
    const basePrice = 100 + (symbol.charCodeAt(0) % 50);
    const changePercent = (Math.random() - 0.5) * 4; // -2% to +2%
    const price = basePrice + (basePrice * changePercent) / 100;

    return {
      symbol,
      name: `${symbol} Inc.`,
      price: parseFloat(price.toFixed(2)),
      open: parseFloat((price * 0.99).toFixed(2)),
      high: parseFloat((price * 1.02).toFixed(2)),
      low: parseFloat((price * 0.98).toFixed(2)),
      volume: Math.floor(Math.random() * 1000000) + 100000,
      previousClose: parseFloat(
        (price - (basePrice * changePercent) / 100).toFixed(2)
      ),
      change: parseFloat(((basePrice * changePercent) / 100).toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      timestamp: Date.now(),
      source: "mock",
    };
  }

  generateMockHistoricalData(symbol, count) {
    const data = [];
    let price = 100 + (symbol.charCodeAt(0) % 50);

    for (let i = count; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const change = (Math.random() - 0.5) * 0.04 * price;

      const open = price;
      const close = price + change;
      const high = Math.max(open, close) * (1 + Math.random() * 0.02);
      const low = Math.min(open, close) * (1 - Math.random() * 0.02);

      data.push({
        timestamp: date.getTime(),
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: Math.floor(Math.random() * 1000000) + 100000,
      });

      price = close;
    }

    return data;
  }

  generateMockIndicator(symbol, indicator) {
    const data = [];
    for (let i = 14; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      let value;

      switch (indicator) {
        case "rsi":
          value = 30 + Math.random() * 40; // 30-70 range
          break;
        case "sma":
          value = 100 + Math.random() * 20;
          break;
        default:
          value = Math.random() * 100;
      }

      data.push({
        timestamp: date.getTime(),
        value: parseFloat(value.toFixed(2)),
      });
    }

    return data;
  }

  generateMockMovers() {
    const symbols = ["SPY", "QQQ", "AAPL", "TSLA", "NVDA", "MSFT"];
    return symbols.map((symbol) => this.getMockQuote(symbol));
  }

  // Subscription methods for compatibility
  subscribe(symbol) {
    console.log(`📡 Subscribed to ${symbol} (Twelve Data)`);
    // For Twelve Data, we'll poll on demand rather than stream
    return true;
  }

  unsubscribe(symbol) {
    console.log(`📡 Unsubscribed from ${symbol} (Twelve Data)`);
    return true;
  }

  getStatus() {
    return {
      connected: !!this.apiKey,
      provider: "twelvedata",
      cacheSize: this.cache.size,
      queueLength: this.requestQueue.length,
      rateLimitDelay: this.rateLimitDelay,
    };
  }

  // API usage stats
  getApiUsage() {
    return {
      requestsToday: this.requestQueue.length, // Approximate
      rateLimitDelay: this.rateLimitDelay,
      cacheHitRate: "N/A", // Could implement if needed
      lastRequest: this.lastRequestTime,
    };
  }
}

module.exports = TwelveDataProvider;
