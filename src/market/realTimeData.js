const WebSocket = require("ws");
const axios = require("axios");
const EventEmitter = require("events");
const { SMA, RSI, BollingerBands, MACD } = require("technicalindicators");
const TwelveDataProvider = require('./twelveDataProvider'); // Added import

class RealTimeMarketData extends EventEmitter {
  constructor() {
    super();
    this.provider = process.env.MARKET_DATA_PROVIDER || "polygon";
    this.isConnected = false;
    this.subscriptions = new Set();
    this.cache = new Map();
    this.historicalData = new Map();
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;

    this.setupProvider();
  }

  setupProvider() {
    switch (this.provider) {
      case "polygon":
        this.setupPolygonWebSocket();
        break;
      case "twelvedata":
        this.setupTwelveDataProvider();
        break;
      case "yahoo":
        this.setupYahooData();
        break;
      default:
        this.setupMockData();
    }
  }

  setupTwelveDataProvider() {
    console.log('🔌 Setting up Twelve Data provider');
    this.twelveData = new TwelveDataProvider();
    this.isConnected = true;
    // Set up polling for subscribed symbols
    this.startTwelveDataPolling();
    this.emit('connected');
  }

  startTwelveDataPolling() {
    // Poll every 30 seconds for real-time-ish data
    setInterval(async () => {
      if (this.subscriptions.size === 0) return;
      
      for (const symbol of this.subscriptions) {
        try {
          // Get real-time quote
          const quote = await this.twelveData.getQuote(symbol);
          this.updateCache(symbol, quote);
          this.emit('quote', quote);
          // Check for unusual activity
          this.checkUnusualActivity(symbol, quote);
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.warn(`Error polling ${symbol}:`, error.message);
        }
      }
    }, 30000); // 30 seconds
    
    console.log('📊 Twelve Data polling started');
  }

  async setupPolygonWebSocket() {
    if (!process.env.POLYGON_API_KEY) {
      console.warn("⚠️ No Polygon API key - using mock data");
      this.setupMockData();
      return;
    }

    try {
      const wsUrl = `wss://socket.polygon.io/stocks`;
      this.ws = new WebSocket(wsUrl);

      this.ws.on("open", () => {
        console.log("🔌 Polygon WebSocket connected");

        // Authenticate
        this.ws.send(
          JSON.stringify({
            action: "auth",
            params: process.env.POLYGON_API_KEY,
          })
        );

        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit("connected");
      });

      this.ws.on("message", (data) => {
        try {
          const messages = JSON.parse(data);
          if (Array.isArray(messages)) {
            messages.forEach((msg) => this.handlePolygonMessage(msg));
          } else {
            this.handlePolygonMessage(messages);
          }
        } catch (error) {
          console.error("Error parsing Polygon message:", error);
        }
      });

      this.ws.on("close", () => {
        console.log("❌ Polygon WebSocket disconnected");
        this.isConnected = false;
        this.emit("disconnected");
        this.handleReconnect();
      });

      this.ws.on("error", (error) => {
        console.error("Polygon WebSocket error:", error);
        this.emit("error", error);
      });
    } catch (error) {
      console.error("Failed to setup Polygon WebSocket:", error);
      this.setupMockData();
    }
  }

  handlePolygonMessage(message) {
    switch (message.ev) {
      case "status":
        if (message.status === "auth_success") {
          console.log("✅ Polygon authentication successful");
        }
        break;

      case "T": // Trade
        this.handleTradeUpdate(message);
        break;

      case "Q": // Quote
        this.handleQuoteUpdate(message);
        break;

      case "A": // Aggregate (minute bars)
        this.handleAggregateUpdate(message);
        break;
    }
  }

  handleTradeUpdate(trade) {
    const symbol = trade.sym;
    const price = trade.p;
    const volume = trade.s;
    const timestamp = trade.t;

    const update = {
      symbol,
      price,
      volume,
      timestamp,
      type: "trade",
    };

    this.updateCache(symbol, update);
    this.emit("trade", update);

    // Check for unusual activity
    this.checkUnusualActivity(symbol, update);
  }

  handleQuoteUpdate(quote) {
    const symbol = quote.sym;
    const bid = quote.bp;
    const ask = quote.ap;
    const bidSize = quote.bs;
    const askSize = quote.as;

    const update = {
      symbol,
      bid,
      ask,
      bidSize,
      askSize,
      spread: ask - bid,
      timestamp: quote.t,
      type: "quote",
    };

    this.updateCache(symbol, update);
    this.emit("quote", update);
  }

  handleAggregateUpdate(agg) {
    const symbol = agg.sym;
    const data = {
      open: agg.o,
      high: agg.h,
      low: agg.l,
      close: agg.c,
      volume: agg.v,
      timestamp: agg.t,
    };

    this.addHistoricalData(symbol, data);
    this.emit("aggregate", { symbol, data });

    // Calculate technical indicators
    this.calculateTechnicals(symbol);
  }

  setupMockData() {
    console.log("🎭 Setting up mock market data");
    this.isConnected = true;

    // Simulate real-time data
    setInterval(() => {
      if (this.subscriptions.size === 0) return;

      this.subscriptions.forEach((symbol) => {
        this.generateMockData(symbol);
      });
    }, parseInt(process.env.UPDATE_INTERVAL) || 5000);

    this.emit("connected");
  }

  generateMockData(symbol) {
    const lastPrice = this.getLastPrice(symbol) || 100;
    const volatility = 0.02; // 2% volatility
    const change = (Math.random() - 0.5) * volatility * lastPrice;
    const newPrice = Math.max(0.01, lastPrice + change);

    const volume = Math.floor(Math.random() * 100000) + 10000;

    const update = {
      symbol,
      price: parseFloat(newPrice.toFixed(2)),
      volume,
      timestamp: Date.now(),
      type: "trade",
      mock: true,
    };

    this.updateCache(symbol, update);
    this.emit("trade", update);

    // Generate aggregate data
    const aggData = {
      open: newPrice * 0.995,
      high: newPrice * 1.005,
      low: newPrice * 0.99,
      close: newPrice,
      volume,
      timestamp: Date.now(),
    };

    this.addHistoricalData(symbol, aggData);
    this.calculateTechnicals(symbol);
  }

  subscribe(symbol) {
    if (this.subscriptions.has(symbol)) return;

    this.subscriptions.add(symbol);
    console.log(`📡 Subscribing to ${symbol}`);

    if (this.ws && this.isConnected && this.provider === "polygon") {
      this.ws.send(
        JSON.stringify({
          action: "subscribe",
          params: `T.${symbol},Q.${symbol},A.${symbol}`,
        })
      );
    }

    // Get initial historical data
    this.getHistoricalData(symbol);
  }

  unsubscribe(symbol) {
    if (!this.subscriptions.has(symbol)) return;

    this.subscriptions.delete(symbol);
    console.log(`📡 Unsubscribing from ${symbol}`);

    if (this.ws && this.isConnected && this.provider === "polygon") {
      this.ws.send(
        JSON.stringify({
          action: "unsubscribe",
          params: `T.${symbol},Q.${symbol},A.${symbol}`,
        })
      );
    }
  }

  async getHistoricalData(symbol, days = 30) {
    try {
      if (this.provider === "polygon" && process.env.POLYGON_API_KEY) {
        await this.getPolygonHistoricalData(symbol, days);
      } else {
        await this.generateMockHistoricalData(symbol, days);
      }
    } catch (error) {
      console.error(`Error getting historical data for ${symbol}:`, error);
      await this.generateMockHistoricalData(symbol, days);
    }
  }

  async getPolygonHistoricalData(symbol, days) {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${
      startDate.toISOString().split("T")[0]
    }/${endDate.toISOString().split("T")[0]}?apikey=${
      process.env.POLYGON_API_KEY
    }`;

    const response = await axios.get(url);
    const data = response.data.results || [];

    const historicalBars = data.map((bar) => ({
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
      timestamp: bar.t,
    }));

    this.historicalData.set(symbol, historicalBars);
    console.log(
      `📊 Loaded ${historicalBars.length} historical bars for ${symbol}`
    );
  }

  async generateMockHistoricalData(symbol, days) {
    const bars = [];
    let price = 100 + (symbol.charCodeAt(0) % 50);

    for (let i = days; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const change = (Math.random() - 0.5) * 0.04 * price; // 4% daily volatility

      const open = price;
      const close = price + change;
      const high = Math.max(open, close) * (1 + Math.random() * 0.02);
      const low = Math.min(open, close) * (1 - Math.random() * 0.02);
      const volume = Math.floor(Math.random() * 1000000) + 100000;

      bars.push({
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume,
        timestamp: date.getTime(),
      });

      price = close;
    }

    this.historicalData.set(symbol, bars);
    console.log(
      `📊 Generated ${bars.length} mock historical bars for ${symbol}`
    );
  }

  calculateTechnicals(symbol) {
    const historical = this.historicalData.get(symbol);
    if (!historical || historical.length < 20) return;

    const closes = historical.map((bar) => bar.close);
    const highs = historical.map((bar) => bar.high);
    const lows = historical.map((bar) => bar.low);
    const volumes = historical.map((bar) => bar.volume);

    try {
      // Calculate indicators
      const sma20 = SMA.calculate({ period: 20, values: closes });
      const sma50 = SMA.calculate({ period: 50, values: closes });
      const rsi = RSI.calculate({ period: 14, values: closes });
      const bb = BollingerBands.calculate({
        period: 20,
        stdDev: 2,
        values: closes,
      });
      const macd = MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
      });

      const technicals = {
        sma20: sma20[sma20.length - 1],
        sma50: sma50[sma50.length - 1],
        rsi: rsi[rsi.length - 1],
        bb: bb[bb.length - 1],
        macd: macd[macd.length - 1],
        avgVolume: volumes.slice(-20).reduce((a, b) => a + b, 0) / 20,
        timestamp: Date.now(),
      };

      this.cache.set(`${symbol}_technicals`, technicals);
      this.emit("technicals", { symbol, technicals });

      // Check for signals
      this.checkTechnicalSignals(symbol, technicals);
    } catch (error) {
      console.error(`Error calculating technicals for ${symbol}:`, error);
    }
  }

  checkTechnicalSignals(symbol, technicals) {
    const signals = [];
    const currentPrice = this.getLastPrice(symbol);

    if (!currentPrice) return;

    // RSI signals
    if (technicals.rsi > 70) {
      signals.push({
        type: "RSI_OVERBOUGHT",
        message: `${symbol} RSI overbought at ${technicals.rsi.toFixed(1)}`,
        priority: "medium",
      });
    } else if (technicals.rsi < 30) {
      signals.push({
        type: "RSI_OVERSOLD",
        message: `${symbol} RSI oversold at ${technicals.rsi.toFixed(1)}`,
        priority: "medium",
      });
    }

    // Moving average signals
    if (
      currentPrice > technicals.sma20 &&
      technicals.sma20 > technicals.sma50
    ) {
      signals.push({
        type: "MA_BULLISH",
        message: `${symbol} bullish MA alignment - price above SMA20 above SMA50`,
        priority: "low",
      });
    }

    // Bollinger Band signals
    if (technicals.bb && currentPrice > technicals.bb.upper) {
      signals.push({
        type: "BB_UPPER_BREACH",
        message: `${symbol} price above upper Bollinger Band`,
        priority: "medium",
      });
    } else if (technicals.bb && currentPrice < technicals.bb.lower) {
      signals.push({
        type: "BB_LOWER_BREACH",
        message: `${symbol} price below lower Bollinger Band`,
        priority: "medium",
      });
    }

    // MACD signals
    if (technicals.macd && technicals.macd.MACD > technicals.macd.signal) {
      signals.push({
        type: "MACD_BULLISH",
        message: `${symbol} MACD bullish crossover`,
        priority: "high",
      });
    }

    // Emit signals
    signals.forEach((signal) => {
      this.emit("signal", { symbol, ...signal });
    });
  }

  checkUnusualActivity(symbol, update) {
    const cached = this.cache.get(symbol);
    const technicals = this.cache.get(`${symbol}_technicals`);

    if (!cached || !technicals) return;

    // Volume spike check
    if (
      update.volume >
      technicals.avgVolume * parseFloat(process.env.VOLUME_ALERT_THRESHOLD || 3)
    ) {
      this.emit("alert", {
        type: "VOLUME_SPIKE",
        symbol,
        message: `${symbol} unusual volume: ${update.volume.toLocaleString()} vs avg ${technicals.avgVolume.toLocaleString()}`,
        priority: "high",
        data: update,
      });
    }

    // Price movement check
    const priceChange = Math.abs(
      ((update.price - cached.price) / cached.price) * 100
    );
    if (priceChange > parseFloat(process.env.PRICE_ALERT_THRESHOLD || 2)) {
      this.emit("alert", {
        type: "PRICE_MOVE",
        symbol,
        message: `${symbol} significant price move: ${priceChange.toFixed(2)}%`,
        priority: "high",
        data: update,
      });
    }
  }

  updateCache(symbol, data) {
    const existing = this.cache.get(symbol) || {};
    this.cache.set(symbol, { ...existing, ...data });
  }

  addHistoricalData(symbol, bar) {
    const historical = this.historicalData.get(symbol) || [];
    historical.push(bar);

    // Keep only last 200 bars
    if (historical.length > 200) {
      historical.shift();
    }

    this.historicalData.set(symbol, historical);
  }

  getLastPrice(symbol) {
    const cached = this.cache.get(symbol);
    return cached?.price || null;
  }

  getQuote(symbol) {
    return this.cache.get(symbol) || null;
  }

  getTechnicals(symbol) {
    return this.cache.get(`${symbol}_technicals`) || null;
  }

  getHistoricalBars(symbol, count = 50) {
    const historical = this.historicalData.get(symbol) || [];
    return historical.slice(-count);
  }

  handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("❌ Max reconnection attempts reached");
      this.setupMockData();
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(
      `🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    setTimeout(() => {
      this.setupPolygonWebSocket();
    }, delay);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
    this.isConnected = false;
    this.subscriptions.clear();
    console.log("📤 Market data disconnected");
  }

  getStatus() {
    return {
      connected: this.isConnected,
      provider: this.provider,
      subscriptions: Array.from(this.subscriptions),
      cacheSize: this.cache.size,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

module.exports = RealTimeMarketData;
