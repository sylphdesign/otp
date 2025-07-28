const { Telegraf } = require('telegraf');
const fs = require('fs').promises;
const path = require('path');
const AdvancedAIAnalyzer = require('./ai/advancedAnalyzer');
const RealTimeMarketData = require('./market/realTimeData');
const OptionsFlowMonitor = require('./market/optionsFlow');
const { setupTradePlanScheduler } = require('./scheduler/tradePlanScheduler');

class TradingBot {
  constructor() {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    this.isActive = false;
    this.signalCount = 0;
    this.realTimeAlerts = [];
    this.watchlist = new Set(['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA']);
    
    // Initialize advanced components
    this.marketData = new RealTimeMarketData();
    this.optionsFlow = new OptionsFlowMonitor();
    console.log('[DEBUG] optionsFlow instance:', this.optionsFlow.constructor.name, 'emit:', typeof this.optionsFlow.emit);
    this.aiAnalyzer = new AdvancedAIAnalyzer(this.marketData, this.optionsFlow);
    this.publicAiAnalyzer = this.aiAnalyzer;  // Make it accessible
    
    this.setupAdvancedFeatures();
    this.setupMiddleware();
    this.setupCommands();
    this.setupMessageHandlers();
    
    // Setup trade plan scheduler
    setupTradePlanScheduler(this);
  }

  setupAdvancedFeatures() {
    // Market data event listeners
    this.marketData.on('connected', () => {
      this.log('🔌 Market data connected', 'info');
      
      // Subscribe to watchlist
      this.watchlist.forEach(symbol => {
        this.marketData.subscribe(symbol);
      });
    });

    this.marketData.on('alert', (alert) => {
      this.handleRealTimeAlert(alert);
    });

    this.marketData.on('signal', (signal) => {
      this.handleTechnicalSignal(signal);
    });

    // AI analyzer event listeners
    // this.aiAnalyzer.on('marketAlert', (alert) => {
    //   this.broadcastAlert(alert);
    // });

    // Options flow listeners
    this.optionsFlow.on('optionsSignal', (signal) => {
      this.handleOptionsSignal(signal);
    });

    // Start monitoring
    if (process.env.ENABLE_REAL_TIME === 'true') {
      this.startRealTimeMonitoring();
    }
  }

  async startRealTimeMonitoring() {
    try {
      // Start options monitoring for watchlist
      await this.optionsFlow.startMonitoring(Array.from(this.watchlist));
      
      this.log('📊 Real-time monitoring started', 'info');
    } catch (error) {
      this.log(`Failed to start real-time monitoring: ${error.message}`, 'error');
    }
  }

  async handleRealTimeAlert(alert) {
    this.realTimeAlerts.unshift(alert);
    
    // Keep only last 50 alerts
    if (this.realTimeAlerts.length > 50) {
      this.realTimeAlerts = this.realTimeAlerts.slice(0, 50);
    }
    
    // Broadcast high priority alerts
    if (alert.priority === 'high' && this.isActive) {
      await this.broadcastAlert(alert);
    }
  }

  async handleTechnicalSignal(signal) {
    if (!this.isActive) return;
    
    const message = `\n📊 **TECHNICAL SIGNAL**\n\n🎯 **${signal.symbol}** - ${signal.type}\n${signal.message}\n\n⚡ **Priority:** ${signal.priority.toUpperCase()}\n⏰ **Time:** ${new Date().toLocaleString()}\n    `;
    
    await this.broadcastMessage(message);
  }

  async handleOptionsSignal(signal) {
    if (!this.isActive) return;
    
    const message = `\n📋 **OPTIONS FLOW ALERT**\n\n💎 **${signal.symbol}** - ${signal.type}\n${signal.message}\n\n⚡ **Priority:** ${signal.priority.toUpperCase()}\n⏰ **Time:** ${new Date().toLocaleString()}\n    `;
    
    await this.broadcastMessage(message);
  }

  async broadcastAlert(alert) {
    const message = `\n🚨 **REAL-TIME ALERT**\n\n⚡ **${alert.symbol}** - ${alert.type}\n${alert.message}\n\n📊 **Priority:** ${alert.priority.toUpperCase()}\n⏰ **Time:** ${new Date().toLocaleString()}\n    `;
    
    await this.broadcastMessage(message);
  }

  async broadcastMessage(message) {
    try {
      // In a real implementation, you'd broadcast to subscribed users
      // For now, we'll just log it
      this.log(`Broadcasting: ${message.substring(0, 100)}...`, 'info');
    } catch (error) {
      this.log(`Broadcast error: ${error.message}`, 'error');
    }
  }

  setupMiddleware() {
    // Logging middleware
    this.bot.use(async (ctx, next) => {
      const start = Date.now();
      await next();
      const responseTime = Date.now() - start;
      this.log(`Response time: ${responseTime}ms`, "info");
    });

    // Error handling middleware
    this.bot.catch((err, ctx) => {
      this.log(`Bot error: ${err.message}`, "error");
      ctx.reply("❌ Something went wrong. Please try again.");
    });
  }

  setupCommands() {

    // Add this in setupCommands() method in bot.js
this.bot.command('quickalert', async (ctx) => {
  const alertMessage = `
🚨 QUICK TEST ALERT 🚨

Symbol: AAPL
Action: BUY 1 CALL
Strike: $185
Expiry: This Friday

This is a test of the alert system.
  `;
  await ctx.reply(alertMessage);
  console.log('Quick alert sent to:', ctx.from.username);
});

    // Start command
    this.bot.command("start", async (ctx) => {
      const welcomeMessage = `🤖 AI Trading Bot v1.0

Welcome! I'm your AI-powered trading assistant.

Commands:
/start - Show this welcome message
/status - Check bot status
/activate - Start monitoring signals
/deactivate - Stop monitoring
/stats - Show trading statistics
/help - Show detailed help

Current Status: ${this.isActive ? "✅ Active" : "❌ Inactive"}

Ready to start your AI trading journey?`;

      await ctx.reply(escapeMarkdownV2(welcomeMessage), { parse_mode: 'MarkdownV2' });
      this.log(`User ${ctx.from.username} started the bot`, "info");
    });

    // Status command
    this.bot.command("status", async (ctx) => {
      const uptime = process.uptime();
      const status = `📊 Bot Status

🔄 State: ${this.isActive ? "✅ Active" : "❌ Inactive"}
⏱️ Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor(
        (uptime % 3600) / 60
      )}m
📡 Signals Processed: ${this.signalCount}
🕐 Last Check: ${new Date().toLocaleString()}

${
  this.isActive
    ? "🎯 Monitoring for trading signals..."
    : "⏸️ Not monitoring signals"
}`;

      await ctx.reply(escapeMarkdownV2(status), { parse_mode: 'MarkdownV2' });
    });

    // Activate monitoring
    this.bot.command("activate", async (ctx) => {
      this.isActive = true;
      await ctx.reply(
        escapeMarkdownV2("✅ Bot Activated! Now monitoring for trading signals..."), { parse_mode: 'MarkdownV2' }
      );
      this.log("Bot activated by user", "info");
    });

    // Deactivate monitoring
    this.bot.command("deactivate", async (ctx) => {
      this.isActive = false;
      await ctx.reply(escapeMarkdownV2("⏸️ Bot Deactivated. Signal monitoring stopped."), { parse_mode: 'MarkdownV2' });
      this.log("Bot deactivated by user", "info");
    });

    // Help command
    this.bot.command("help", async (ctx) => {
      const helpMessage = `📚 AI Trading Bot Help

What I do:
• Monitor specified Telegram channels for trading signals
• Analyze signals using AI
• Make trading decisions based on market data
• Send you real-time alerts

Commands:
/start - Initialize the bot
/status - Check current status and statistics
/activate - Start monitoring for signals
/deactivate - Stop signal monitoring
/stats - View detailed trading statistics
/test - Send a test signal for processing

Setup Required:
1. Configure your signal sources
2. Connect your trading account
3. Set risk management parameters

Current Configuration:
Signal Channel: ${process.env.TELEGRAM_SIGNAL_CHANNEL || "Not configured"}
Trading Mode: ${this.isActive ? "Active" : "Inactive"}`;

      await ctx.reply(escapeMarkdownV2(helpMessage), { parse_mode: 'MarkdownV2' });
    });

    // Test command for development
    this.bot.command("test", async (ctx) => {
      const testSignal =
        "🚀 AAPL bullish breakout above $185 resistance. Volume surge detected. Target $190, stop $182.";
      await this.processSignal(testSignal, ctx);
    });
    // Add this to setupCommands() method
    this.bot.command('stats', async (ctx) => {
      const stats = this.aiAnalyzer.getEnhancedStats();
      const statsMessage = `
📊 **AI Trading Statistics**

🧠 Analysis Performance:
• Total Signals: ${stats.totalAnalyses}
• Enhanced: ${stats.enhancedAnalyses}
• Success Rate: ${stats.tradeablePercentage}%
• Avg Confidence: ${stats.averageConfidence}/10

⏰ Last Analysis: ${stats.lastAnalysis}

🎯 Settings:
• Min Confidence: ${this.aiAnalyzer.confidenceThreshold}/10
• Risk Per Trade: ${process.env.DEFAULT_RISK_PERCENTAGE}%
• Paper Trading: ${process.env.PAPER_TRADING === "true" ? "✅" : "❌"}

🤖 AI Status: ${this.isActive ? "✅ Active" : "❌ Inactive"}`;
      await ctx.reply(escapeMarkdownV2(statsMessage), { parse_mode: 'MarkdownV2' });
    });

    // Real-time status
    this.bot.command('realtime', async (ctx) => {
      const marketStatus = this.marketData.getStatus();
      const optionsStatus = this.optionsFlow.getMonitoringStatus();
      
      const statusMessage = `
📡 **REAL-TIME STATUS**

🔌 **Market Data:**
- Connected: ${marketStatus.connected ? '✅' : '❌'}
- Provider: ${marketStatus.provider}
- Subscriptions: ${marketStatus.subscriptions.length}
- Cache Size: ${marketStatus.cacheSize}

📊 **Options Flow:**
- Monitoring: ${optionsStatus.monitoring ? '✅' : '❌'}
- Symbols: ${optionsStatus.symbols.length}
- Update Interval: ${optionsStatus.updateInterval / 1000}s

🎯 **Watchlist:**
${Array.from(this.watchlist).map(s => `• ${s}`).join('\n')}

⚡ **Recent Alerts:** ${this.realTimeAlerts.length}
      `;
      
      await ctx.reply(escapeMarkdownV2(statusMessage), { parse_mode: 'MarkdownV2' });
    });

    // Enhanced stats
    this.bot.command('enhanced', async (ctx) => {
      const stats = this.aiAnalyzer.getEnhancedStats();
      
      const enhancedMessage = `
🧠 **ENHANCED AI STATISTICS**

📊 **Analysis Performance:**
- Total: ${stats.totalAnalyses}
- Enhanced: ${stats.enhancedAnalyses}
- Success Rate: ${stats.tradeablePercentage}%
- Avg Confidence: ${stats.averageConfidence}/10

📡 **Real-Time Integration:**
- Market Data: ${stats.marketDataStatus.connected ? '✅' : '❌'}
- Options Monitoring: ${stats.optionsMonitoring ? '✅' : '❌'}
- Live Alerts: ${stats.realTimeAlerts}

🎯 **Market Awareness:**
- Technical Signals: Active
- Options Flow: Active
- Volume Alerts: Active
- Price Alerts: Active
      `;
      
      await ctx.reply(escapeMarkdownV2(enhancedMessage), { parse_mode: 'MarkdownV2' });
    });

    // Watchlist management
    this.bot.command('watchlist', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      
      if (args.length === 0) {
        // Show current watchlist
        const message = `
📋 **CURRENT WATCHLIST**

${Array.from(this.watchlist).map(symbol => {
  const quote = this.marketData.getQuote(symbol);
  const technicals = this.marketData.getTechnicals(symbol);
  
  return `• **${symbol}**: $${quote?.price?.toFixed(2) || 'N/A'} ${
    quote?.changePercent ? 
    `(${quote.changePercent > 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%)` : 
    ''
  } ${technicals?.rsi ? `RSI: ${technicals.rsi.toFixed(1)}` : ''}`;
}).join('\n')}

**Commands:**
/watchlist add SYMBOL - Add symbol
/watchlist remove SYMBOL - Remove symbol
        `;
        
        await ctx.reply(escapeMarkdownV2(message), { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const action = args[0].toLowerCase();
      const symbol = args[1]?.toUpperCase();
      
      if (action === 'add' && symbol) {
        this.watchlist.add(symbol);
        this.marketData.subscribe(symbol);
        this.optionsFlow.addSymbol(symbol);
        await ctx.reply(escapeMarkdownV2(`✅ Added ${symbol} to watchlist`), { parse_mode: 'MarkdownV2' });
      } else if (action === 'remove' && symbol) {
        this.watchlist.delete(symbol);
        this.marketData.unsubscribe(symbol);
        this.optionsFlow.removeSymbol(symbol);
        await ctx.reply(escapeMarkdownV2(`❌ Removed ${symbol} from watchlist`), { parse_mode: 'MarkdownV2' });
      } else {
        await ctx.reply('Usage: /watchlist [add|remove] SYMBOL', { parse_mode: 'Markdown' });
      }
    });

    // Market snapshot
    this.bot.command('snapshot', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      const symbol = args[0]?.toUpperCase() || 'SPY';
      
      // Subscribe if not already
      this.marketData.subscribe(symbol);
      
      // Wait a moment for data
      setTimeout(async () => {
        const quote = this.marketData.getQuote(symbol);
        const technicals = this.marketData.getTechnicals(symbol);
        const options = this.optionsFlow.getOptionsData(symbol);
        
        const message = `
📊 **MARKET SNAPSHOT: ${symbol}**

💰 **Price Action:**
- Price: $${quote?.price?.toFixed(2) || 'Loading...'}
- Change: ${quote?.changePercent?.toFixed(2) || 'N/A'}%
- Volume: ${quote?.volume?.toLocaleString() || 'N/A'}
- Spread: $${quote?.spread?.toFixed(3) || 'N/A'}

📈 **Technical Indicators:**
- RSI: ${technicals?.rsi?.toFixed(1) || 'N/A'}
- SMA20: $${technicals?.sma20?.toFixed(2) || 'N/A'}
- SMA50: $${technicals?.sma50?.toFixed(2) || 'N/A'}
- BB Upper: $${technicals?.bb?.upper?.toFixed(2) || 'N/A'}
- BB Lower: $${technicals?.bb?.lower?.toFixed(2) || 'N/A'}

📋 **Options Flow:**
- Put/Call Ratio: ${options?.putCallRatio?.toFixed(2) || 'N/A'}
- IV: ${options?.avgIV ? (options.avgIV * 100).toFixed(1) + '%' : 'N/A'}
- Total Volume: ${options?.totalVolume?.toLocaleString() || 'N/A'}
- Gamma Exposure: ${options?.gexLevel ? (options.gexLevel * 100).toFixed(1) + '%' : 'N/A'}

⏰ **Updated:** ${new Date().toLocaleString()}
        `;
        
        await ctx.reply(escapeMarkdownV2(message), { parse_mode: 'MarkdownV2' });
      }, 2000);
      
      await ctx.reply(escapeMarkdownV2(`📡 Loading snapshot for ${symbol}...`), { parse_mode: 'MarkdownV2' });
    });

    // Twelve Data specific commands
    this.bot.command('market', async (ctx) => {
      if (this.marketData.provider !== 'twelvedata') {
        await ctx.reply('❌ This command requires Twelve Data provider');
        return;
      }
      
      await ctx.reply('📊 Loading market movers...', { parse_mode: 'Markdown' });
      
      try {
        const movers = await this.marketData.twelveData.getMarketMovers();
        
        const message = `
📈 **MARKET MOVERS**

${movers.slice(0, 8).map(stock => 
  `**${stock.symbol}**: $${stock.price} (${stock.changePercent > 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%)`
).join('\n')}

📊 **Market Summary:**
- SPY: ${movers.find(s => s.symbol === 'SPY')?.changePercent?.toFixed(2) || 'N/A'}%
- QQQ: ${movers.find(s => s.symbol === 'QQQ')?.changePercent?.toFixed(2) || 'N/A'}%

⏰ Updated: ${new Date().toLocaleString()}
        `;
        
        await ctx.reply(escapeMarkdownV2(message), { parse_mode: 'MarkdownV2' });
        
      } catch (error) {
        await ctx.reply('❌ Error loading market data');
      }
    });

    this.bot.command('earnings', async (ctx) => {
      if (this.marketData.provider !== 'twelvedata') {
        await ctx.reply('❌ This command requires Twelve Data provider');
        return;
      }
      
      try {
        const earnings = await this.marketData.twelveData.getEarningsCalendar();
        
        if (earnings.length === 0) {
          await ctx.reply('📊 No earnings scheduled for today', { parse_mode: 'Markdown' });
          return;
        }
        
        const message = `
📊 **TODAY'S EARNINGS**

${earnings.slice(0, 10).map(earning => 
  `**${earning.symbol}**: ${earning.time} ${earning.eps_estimate ? `(Est: $${earning.eps_estimate})` : ''}`
).join('\n')}

⏰ Updated: ${new Date().toLocaleString()}
        `;
        
        await ctx.reply(escapeMarkdownV2(message), { parse_mode: 'MarkdownV2' });
        
      } catch (error) {
        await ctx.reply('❌ Error loading earnings calendar');
      }
    });

    this.bot.command('technical', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      const symbol = args[0]?.toUpperCase() || 'AAPL';
      const indicator = args[1]?.toLowerCase() || 'rsi';
      
      if (this.marketData.provider !== 'twelvedata') {
        await ctx.reply('❌ This command requires Twelve Data provider');
        return;
      }
      
      await ctx.reply(escapeMarkdownV2(`📊 Loading ${indicator.toUpperCase()} for ${symbol}...`), { parse_mode: 'MarkdownV2' });
      
      try {
        const data = await this.marketData.twelveData.getTechnicalIndicators(symbol, indicator);
        const latest = data[data.length - 1];
        
        const message = `
📊 **TECHNICAL ANALYSIS: ${symbol}**

📈 **${indicator.toUpperCase()}:**
- Current Value: ${latest.value.toFixed(2)}
- Timestamp: ${new Date(latest.timestamp).toLocaleString()}

📋 **Available Indicators:**
- RSI, SMA, EMA, MACD, BB, STOCH
- Usage: /technical SYMBOL INDICATOR

⏰ Updated: ${new Date().toLocaleString()}
        `;
        
        await ctx.reply(escapeMarkdownV2(message), { parse_mode: 'MarkdownV2' });
        
      } catch (error) {
        await ctx.reply(escapeMarkdownV2(`❌ Error loading ${indicator} for ${symbol}`), { parse_mode: 'MarkdownV2' });
      }
    });

    this.bot.command('apiusage', async (ctx) => {
      if (this.marketData.provider !== 'twelvedata') {
        await ctx.reply('❌ This command requires Twelve Data provider');
        return;
      }
      
      const usage = this.marketData.twelveData.getApiUsage();
      const status = this.marketData.getStatus();
      
      const message = `
📊 **TWELVE DATA API STATUS**

🔑 **API Usage:**
- Requests in Queue: ${usage.queueLength || status.queueLength}
- Rate Limit Delay: ${usage.rateLimitDelay / 1000}s
- Cache Size: ${status.cacheSize}

⚡ **Performance:**
- Provider: ${status.provider}
- Connected: ${status.connected ? '✅' : '❌'}

💡 **Free Tier Limits:**
- 800 requests/day
- 8 requests/minute
- Real-time delayed ~30 seconds

⏰ Updated: ${new Date().toLocaleString()}
      `;
      
      await ctx.reply(escapeMarkdownV2(message), { parse_mode: 'MarkdownV2' });
    });
  }

  setupMessageHandlers() {
    // Handle channel posts (signals from trading channels)
    this.bot.on("channel_post", async (ctx) => {
      if (!this.isActive) return;

      const channelUsername = ctx.chat.username;
      const targetChannel = process.env.TELEGRAM_SIGNAL_CHANNEL;

      if (channelUsername === targetChannel) {
        const signal = ctx.message.text;
        if (signal) {
          await this.processSignal(signal, ctx);
        }
      }
    });

    // Handle forwarded messages (manual signal input)
    this.bot.on("text", async (ctx) => {
      if (!this.isActive) return;

      const text = ctx.message.text;

      // Check if it looks like a trading signal
      if (this.isTradeSignal(text)) {
        await ctx.reply("📡 Signal detected! Processing...");
        await this.processSignal(text, ctx);
      }
    });
  }

  isTradeSignal(text) {
    // Simple heuristics to detect if text is a trading signal
    const signalKeywords = [
      "buy",
      "sell",
      "call",
      "put",
      "bullish",
      "bearish",
      "target",
      "stop",
      "resistance",
      "support",
      "breakout",
      "$",
      "price",
      "volume",
    ];

    const lowerText = text.toLowerCase();
    return signalKeywords.some((keyword) => lowerText.includes(keyword));
  }

  escapeForTelegram(text) {
    // Escape special characters for Telegram Markdown
    return text
      .replace(/_/g, '\\_')
      .replace(/\*/g, '\\*')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/~/g, '\\~')
      .replace(/`/g, '\\`')
      .replace(/>/g, '\\>')
      .replace(/#/g, '\\#')
      .replace(/\+/g, '\\+')
      .replace(/-/g, '\\-')
      .replace(/=/g, '\\=')
      .replace(/\|/g, '\\|')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\./g, '\\.')
      .replace(/!/g, '\\!');
  }

  formatAnalysisResponse(signal, result, marketContext) {
    const { analysis, decision } = result;

    if (!analysis) {
      return "❌ Analysis Failed\n\nUnable to process signal.";
    }

    // Escape key points to prevent parsing errors
    const escapedKeyPoints = analysis.keyPoints?.map(point => 
      this.escapeForTelegram(point)
    ).join("\n") || "• No key points identified";

    let response = `🧠 AI ANALYSIS COMPLETE

📊 Signal Analysis:
• Ticker: ${analysis.ticker || "Unknown"}
• Sentiment: ${analysis.sentiment || "Unknown"}
• Confidence: ${analysis.confidence || 0}/10
• Risk Level: ${analysis.riskAssessment?.riskLevel || "Unknown"}

🎯 Key Points:
${escapedKeyPoints}

📈 Technical Analysis:
• Support: ${analysis.technicalAnalysis?.support || "N/A"}
• Resistance: ${analysis.technicalAnalysis?.resistance || "N/A"}
• Target: ${analysis.technicalAnalysis?.targetPrice || "N/A"}
• Stop Loss: ${analysis.technicalAnalysis?.stopLoss || "N/A"}

🎲 Options Strategy:
• Recommended: ${analysis.optionsStrategy?.recommended || "None"}
• Timeframe: ${analysis.optionsStrategy?.timeframe || "N/A"}
• Reasoning: ${this.escapeForTelegram(analysis.optionsStrategy?.reasoning || "N/A")}

${this.formatDecisionSection(decision)}

📊 Market Context:
• Condition: ${marketContext.marketCondition || "Unknown"}
• SPY: ${marketContext.spy?.changePercent?.toFixed(2) || "N/A"}%
• QQQ: ${marketContext.qqq?.changePercent?.toFixed(2) || "N/A"}%
• Volatility: ${marketContext.volatility || "Unknown"}

⏰ Analysis Time: ${new Date().toLocaleString()}
📊 Signal #${this.signalCount}`;

    return response;
  }

  formatEnhancedAnalysisResponse(signal, result) {
    const { analysis, decision } = result;

    if (!analysis) {
      return "❌ Enhanced Analysis Failed\n\nUnable to process signal.";
    }

    // Escape key points to prevent parsing errors
    const escapedKeyPoints = analysis.keyPoints?.map(point => 
      this.escapeForTelegram(point)
    ).join("\n") || "• No key points identified";

    let response = `🧠 **ENHANCED AI ANALYSIS COMPLETE**

📊 **Signal Analysis:**
• Ticker: ${analysis.ticker || "Unknown"}
• Sentiment: ${analysis.sentiment || "Unknown"}
• Confidence: ${analysis.confidence || 0}/10
• Risk Level: ${analysis.riskAssessment?.riskLevel || "Unknown"}

🎯 **Key Points:**
${escapedKeyPoints}

📈 **Technical Analysis:**
• Support: ${analysis.technicalAnalysis?.support || "N/A"}
• Resistance: ${analysis.technicalAnalysis?.resistance || "N/A"}
• Target: ${analysis.technicalAnalysis?.targetPrice || "N/A"}
• Stop Loss: ${analysis.technicalAnalysis?.stopLoss || "N/A"}

🎲 **Options Strategy:**
• Recommended: ${analysis.optionsStrategy?.recommended || "None"}
• Timeframe: ${analysis.optionsStrategy?.timeframe || "N/A"}
• Reasoning: ${this.escapeForTelegram(analysis.optionsStrategy?.reasoning || "N/A")}

📊 **Market Context:**
• Condition: ${analysis.marketContext?.marketCondition || "Unknown"}
• SPY: ${analysis.marketContext?.spy?.changePercent?.toFixed(2) || "N/A"}%
• QQQ: ${analysis.marketContext?.qqq?.changePercent?.toFixed(2) || "N/A"}%
• Volatility: ${analysis.marketContext?.volatility || "Unknown"}

⏰ **Analysis Time:** ${new Date().toLocaleString()}
📊 **Signal #${this.signalCount}`;

    return response;
  }

  formatDecisionSection(decision) {
    if (!decision.shouldTrade) {
      return `
❌ TRADING DECISION: NO TRADE
• Reason: ${this.escapeForTelegram(decision.reason)}
• Action: ${decision.action}`;
    }

    const params = decision.tradeParameters || {};

    return `
✅ TRADING DECISION: ${decision.action?.toUpperCase()}

📋 Trade Parameters:
• Ticker: ${params.ticker || "N/A"}
• Option Type: ${params.optionType || "N/A"}
• Strike: ${params.strikePrice || "N/A"}
• Expiration: ${params.expiration || "N/A"}
• Max Risk: ${params.maxRisk || "N/A"}
• Target Profit: ${params.targetProfit || "N/A"}
• R/R Ratio: ${params.riskRewardRatio || "N/A"}

🕐 Timeline:
• Entry: ${decision.timeline?.entryWindow || "N/A"}
• Hold Period: ${decision.timeline?.holdPeriod || "N/A"}

💡 Reasoning: ${this.escapeForTelegram(decision.reasoning)}

${
  process.env.PAPER_TRADING === "true"
    ? "📝 Mode: Paper Trading"
    : "💰 Mode: Live Trading"
}`;
  }

  async logSignalWithAnalysis(signal, result) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      signal: signal,
      analysis: result.analysis,
      decision: result.decision,
      signalNumber: this.signalCount,
    };

    const logFile = path.join(__dirname, "../logs/analyzed_signals.json");

    try {
      let logs = [];
      try {
        const existingLogs = await fs.readFile(logFile, "utf8");
        logs = JSON.parse(existingLogs);
      } catch (err) {
        // File doesn't exist yet
      }

      logs.push(logEntry);

      // Keep only last 50 analyzed signals
      if (logs.length > 50) {
        logs = logs.slice(-50);
      }

      await fs.writeFile(logFile, JSON.stringify(logs, null, 2));
    } catch (error) {
      this.log(`Error logging analyzed signal: ${error.message}`, "error");
    }
  }

  async logEnhancedSignal(signal, result) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      signal: signal,
      analysis: result.analysis,
      decision: result.decision,
      signalNumber: this.signalCount,
    };

    const logFile = path.join(__dirname, "../logs/enhanced_analyzed_signals.json");

    try {
      let logs = [];
      try {
        const existingLogs = await fs.readFile(logFile, "utf8");
        logs = JSON.parse(existingLogs);
      } catch (err) {
        // File doesn't exist yet
      }

      logs.push(logEntry);

      // Keep only last 50 enhanced analyzed signals
      if (logs.length > 50) {
        logs = logs.slice(-50);
      }

      await fs.writeFile(logFile, JSON.stringify(logs, null, 2));
    } catch (error) {
      this.log(`Error logging enhanced analyzed signal: ${error.message}`, "error");
    }
  }

  async processSignal(signal, ctx) {
    try {
      this.signalCount++;
      this.log(`Processing enhanced signal: ${signal.substring(0, 50)}...`, 'info');

      // Show processing message
      const processingMsg = await ctx.reply('🧠 **Enhanced AI Analysis in Progress...**\n📊 Integrating real-time market data...', 
        { parse_mode: 'Markdown' });

      // Extract symbol for targeted analysis
      const symbolMatch = signal.match(/\b[A-Z]{1,5}\b/);
      const targetSymbol = symbolMatch ? symbolMatch[0] : null;
      
      // Enhanced AI Analysis with real-time data
      const result = await this.aiAnalyzer.analyzeSignalWithMarketData(signal, targetSymbol);
      
      if (result.error) {
        await ctx.editMessageText(escapeMarkdownV2('❌ **Enhanced Analysis Failed**\n\nFalling back to basic analysis...'), 
          { message_id: processingMsg.message_id, parse_mode: 'MarkdownV2' });
        return;
      }

      // Format and send enhanced results
      const response = this.formatEnhancedAnalysisResponse(signal, result);
      
      // Edit the processing message with results
      await ctx.editMessageText(escapeMarkdownV2(response), 
        { message_id: processingMsg.message_id, parse_mode: 'MarkdownV2' });
      
      // Log enhanced signal
      await this.logEnhancedSignal(signal, result);

    } catch (error) {
      this.log(`Error processing enhanced signal: ${error.message}`, 'error');
      await ctx.reply('❌ Error processing signal. Please try again.');
    }
  }

  async logSignal(signal) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      signal: signal,
      processed: true,
    };

    const logFile = path.join(__dirname, "../logs/signals.json");

    try {
      let logs = [];
      try {
        const existingLogs = await fs.readFile(logFile, "utf8");
        logs = JSON.parse(existingLogs);
      } catch (err) {
        // File doesn't exist yet, start with empty array
      }

      logs.push(logEntry);

      // Keep only last 100 signals
      if (logs.length > 100) {
        logs = logs.slice(-100);
      }

      await fs.writeFile(logFile, JSON.stringify(logs, null, 2));
    } catch (error) {
      this.log(`Error logging signal: ${error.message}`, "error");
    }
  }

  log(message, level = "info") {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    console.log(logMessage);

    // Also log to file
    const logFile = path.join(__dirname, "../logs/bot.log");
    fs.appendFile(logFile, logMessage + "\n").catch(console.error);
  }

  async start() {
    try {
      await this.bot.launch();
      this.log("🤖 Trading bot started successfully!", "info");

      // Graceful stop
      process.once("SIGINT", () => this.bot.stop("SIGINT"));
      process.once("SIGTERM", () => this.bot.stop("SIGTERM"));
    } catch (error) {
      this.log(`Failed to start bot: ${error.message}`, "error");
      throw error;
    }
  }
}

// Utility function to escape MarkdownV2 special characters for Telegram
function escapeMarkdownV2(text) {
  return text
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!');
}

module.exports = TradingBot;
