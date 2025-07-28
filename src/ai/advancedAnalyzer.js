const AIAnalyzer = require('./analyzer');
const EventEmitter = require('events');

class AdvancedAIAnalyzer extends AIAnalyzer {
  constructor(marketData, optionsFlow) {
    super();
    this.emitter = new EventEmitter();
    this.marketData = marketData;
    this.optionsFlow = optionsFlow;
    this.setupMarketDataListeners();
  }

  on(...args) {
    this.emitter.on(...args);
  }

  once(...args) {
    this.emitter.once(...args);
  }

  off(...args) {
    this.emitter.off(...args);
  }

  emit(...args) {
    this.emitter.emit(...args);
  }

  setupMarketDataListeners() {
    // Listen for real-time market events
    this.marketData.on("alert", (alert) => {
      this.handleMarketAlert(alert);
    });

    this.marketData.on("signal", (signal) => {
      this.handleTechnicalSignal(signal);
    });

    this.optionsFlow.on("optionsSignal", (signal) => {
      this.handleOptionsSignal(signal);
    });
  }

  async analyzeSignalWithMarketData(signalText, targetSymbol = null) {
    try {
      // Extract symbol if not provided
      if (!targetSymbol) {
        const symbolMatch = signalText.match(/\b[A-Z]{1,5}\b/);
        targetSymbol = symbolMatch ? symbolMatch[0] : null;
      }

      // Get comprehensive market data
      const marketContext = await this.getComprehensiveMarketContext(
        targetSymbol
      );

      // Perform enhanced analysis
      const analysis = await this.performEnhancedAnalysis(
        signalText,
        marketContext
      );
      const decision = await this.makeEnhancedDecision(analysis, marketContext);
      // Add this BEFORE the return statement in analyzeSignalWithMarketData method
      if (decision && decision.shouldTrade) {
        console.log("🎯 Emitting trading decision...");
        this.emit("tradingDecision", decision);
      }

      return {
        analysis,
        decision,
        marketContext,
        timestamp: new Date().toISOString(),
        symbol: targetSymbol,
      };
    } catch (error) {
      console.error("Enhanced analysis error:", error);
      return await super.analyzeSignal(signalText);
    }
  }

  async getComprehensiveMarketContext(symbol) {
    const context = {
      overall: (await this.marketData.getMarketContext?.()) || {},
      specific: null,
      technicals: null,
      options: null,
      alerts: [],
    };

    if (symbol) {
      // Subscribe to symbol if not already
      this.marketData.subscribe(symbol);
      this.optionsFlow.addSymbol(symbol);

      // Get specific data
      context.specific = {
        quote: this.marketData.getQuote(symbol),
        technicals: this.marketData.getTechnicals(symbol),
        historical: this.marketData.getHistoricalBars(symbol, 20),
      };

      context.options = this.optionsFlow.getOptionsData(symbol);

      // Get recent alerts for this symbol
      context.alerts = this.getRecentAlerts(symbol);
    }

    return context;
  }

  async performEnhancedAnalysis(signalText, marketContext) {
    const prompt = this.buildEnhancedAnalysisPrompt(signalText, marketContext);

    if (!this.anthropic) {
      return this.createEnhancedMockAnalysis(signalText, marketContext);
    }

    const response = await this.anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    try {
      const responseText = response.content[0].text;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error("No JSON found in enhanced AI response");
      }

      return JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Failed to parse enhanced analysis:", parseError);
      return this.createEnhancedMockAnalysis(signalText, marketContext);
    }
  }

  buildEnhancedAnalysisPrompt(signalText, marketContext) {
    return `
You are an elite quantitative trader with access to real-time market data. Analyze this signal with ALL available market information.

SIGNAL TO ANALYZE:
"${signalText}"

REAL-TIME MARKET DATA:
${JSON.stringify(marketContext, null, 2)}

ADVANCED ANALYSIS REQUIREMENTS:
1. Integrate signal with real-time market conditions
2. Analyze technical indicators and price action
3. Consider options flow and gamma exposure
4. Assess market regime and volatility environment
5. Factor in recent alerts and unusual activity
6. Provide probabilistic assessment with confidence intervals

RESPOND IN THIS ENHANCED JSON FORMAT:
{
  "ticker": "extracted_symbol",
  "signalQuality": 1-10,
  "confidence": 1-10,
  "marketRegime": "bull|bear|choppy|trending",
  "technicalAnalysis": {
    "trend": "bullish|bearish|neutral",
    "momentum": "strong|weak|neutral",
    "support": "price_level",
    "resistance": "price_level",
    "rsi": "overbought|oversold|neutral",
    "maSignal": "bullish|bearish|neutral",
    "bollingerPosition": "upper|middle|lower",
    "volumeProfile": "high|normal|low"
  },
  "optionsAnalysis": {
    "ivPercentile": "percentage",
    "putCallRatio": "ratio_value",
    "gammaExposure": "low|medium|high",
    "maxPainLevel": "price_level",
    "unusualActivity": "detected|normal"
  },
  "riskFactors": [
    "list of specific risks based on current market data"
  ],
  "catalysts": [
    "upcoming events or factors that could drive price"
  ],
  "probabilityAssessment": {
    "bullishProbability": "percentage",
    "bearishProbability": "percentage",
   "neutralProbability": "percentage",
   "expectedMove": "percentage_range",
   "timeHorizon": "hours|days|weeks"
 },
 "correlationAnalysis": {
   "sectorCorrelation": "high|medium|low",
   "marketCorrelation": "high|medium|low",
   "relatedSymbols": ["list of correlated stocks"]
 },
 "volatilityAnalysis": {
   "realizedVol": "percentage",
   "impliedVol": "percentage",
   "volSkew": "positive|negative|flat",
   "volEnvironment": "low|normal|high|extreme"
 },
 "flowAnalysis": {
   "smartMoneyFlow": "buying|selling|neutral",
   "retailSentiment": "bullish|bearish|neutral",
   "institutionalActivity": "accumulating|distributing|neutral"
 },
 "overallAssessment": "comprehensive market-aware recommendation"
}

CRITICAL INSTRUCTIONS:
- Weight real-time data heavily in your analysis
- Consider market microstructure and liquidity
- Factor in options gamma and dealer positioning
- Account for current volatility regime
- Be more conservative in uncertain market conditions
- Highlight any conflicting signals between different data sources
`;
  }

  createEnhancedMockAnalysis(signalText, marketContext) {
    const basic = this.createMockAnalysis(signalText);

    return {
      ...basic,
      signalQuality: Math.floor(Math.random() * 3) + 7, // 7-9
      marketRegime: ["bull", "bear", "choppy", "trending"][
        Math.floor(Math.random() * 4)
      ],
      technicalAnalysis: {
        trend: basic.sentiment,
        momentum: "strong",
        support: "180.00",
        resistance: "190.00",
        rsi: basic.confidence > 7 ? "neutral" : "oversold",
        maSignal: basic.sentiment,
        bollingerPosition: "middle",
        volumeProfile: "high",
      },
      optionsAnalysis: {
        ivPercentile: "65%",
        putCallRatio: "0.8",
        gammaExposure: "medium",
        maxPainLevel: "185.00",
        unusualActivity: Math.random() > 0.7 ? "detected" : "normal",
      },
      probabilityAssessment: {
        bullishProbability: basic.sentiment === "bullish" ? "65%" : "35%",
        bearishProbability: basic.sentiment === "bearish" ? "65%" : "35%",
        neutralProbability: "20%",
        expectedMove: "3-5%",
        timeHorizon: "days",
      },
      enhanced: true,
      marketDataIntegrated: true,
    };
  }

  createMockAnalysis(signalText) {
    // Example mock implementation
    return {
      ticker: 'MOCK',
      confidence: 7,
      sentiment: 'neutral',
      keyPoints: ['This is a mock analysis'],
      optionsStrategy: { recommended: 'none', reasoning: 'mock' },
      riskAssessment: { riskLevel: 'medium' },
      mock: true,
    };
  }

  async makeEnhancedDecision(analysis, marketContext) {
    if (!analysis || analysis.confidence < this.confidenceThreshold) {
      return {
        shouldTrade: false,
        reason: `Enhanced analysis - confidence too low: ${
          analysis?.confidence || 0
        }/${this.confidenceThreshold}`,
        action: "monitor",
      };
    }

    const decisionPrompt = `
Make an enhanced trading decision using comprehensive market analysis:

ENHANCED ANALYSIS:
${JSON.stringify(analysis, null, 2)}

MARKET CONTEXT:
${JSON.stringify(marketContext, null, 2)}

TRADING PARAMETERS:
- Account size: $50,000
- Max risk per trade: ${process.env.DEFAULT_RISK_PERCENTAGE}%
- Paper trading: ${process.env.PAPER_TRADING}
- Current market regime: ${analysis.marketRegime}
- Volatility environment: ${analysis.volatilityAnalysis?.volEnvironment}

ENHANCED DECISION REQUIREMENTS:
Consider ALL market data including technicals, options flow, and real-time conditions.

RESPOND IN THIS ENHANCED JSON FORMAT:
{
 "shouldTrade": true|false,
 "action": "buy_call|buy_put|sell_premium|spread|monitor",
 "strategy": "long_call|long_put|credit_spread|iron_condor|straddle",
 "reasoning": "detailed multi-factor reasoning",
 "confidence": 1-10,
 "riskLevel": "low|medium|high",
 "tradeParameters": {
   "ticker": "symbol",
   "contracts": "number_of_contracts",
   "strikePrice": "optimal_strike",
   "expiration": "optimal_expiration",
   "entryPrice": "target_entry",
   "maxRisk": "dollar_amount",
   "targetProfit": "profit_target",
   "stopLoss": "stop_level",
   "breakeven": "breakeven_price",
   "positionSize": "percentage_of_account",
   "leverage": "effective_leverage"
 },
 "marketTiming": {
   "entryWindow": "immediate|wait_for_dip|wait_for_breakout",
   "optimalEntry": "specific_price_or_condition",
   "holdPeriod": "minutes|hours|days|weeks",
   "exitStrategy": "profit_target|time_decay|technical_level"
 },
 "riskManagement": {
   "stopLossLevel": "price_level",
   "profitTarget": "price_level",
   "adjustmentPlan": "how_to_adjust_if_needed",
   "maxLoss": "maximum_acceptable_loss",
   "positionSizing": "risk-adjusted_size"
 },
 "scenarioAnalysis": {
   "bullishScenario": "what_happens_if_stock_goes_up",
   "bearishScenario": "what_happens_if_stock_goes_down",
   "sidewaysScenario": "what_happens_if_stock_stays_flat",
   "volatilityExpansion": "effect_of_vol_increase",
   "volatilityContraction": "effect_of_vol_decrease"
 },
 "monitoringPlan": {
   "keyLevels": ["important_price_levels_to_watch"],
   "timeDecayImpact": "how_theta_affects_position",
   "gammaRisk": "gamma_exposure_management",
   "alertLevels": ["prices_that_trigger_action"]
 }
}
`;

    if (!this.anthropic) {
      return this.createEnhancedMockDecision(analysis, marketContext);
    }

    const response = await this.anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      temperature: 0.2,
      messages: [{ role: "user", content: decisionPrompt }],
    });

    try {
      const responseText = response.content[0].text;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        return this.createEnhancedMockDecision(analysis, marketContext);
      }

      return JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Failed to parse enhanced decision:", parseError);
      return this.createEnhancedMockDecision(analysis, marketContext);
    }
  }

  createEnhancedMockDecision(analysis, marketContext) {
    const shouldTrade =
      analysis.confidence >= this.confidenceThreshold &&
      analysis.signalQuality >= 7;

    return {
      shouldTrade,
      action: shouldTrade ? "buy_call" : "monitor",
      strategy: shouldTrade ? "long_call" : "monitor",
      reasoning: `Enhanced decision based on signal quality ${analysis.signalQuality}/10, confidence ${analysis.confidence}/10, market regime: ${analysis.marketRegime}`,
      confidence: analysis.confidence,
      riskLevel: shouldTrade ? "medium" : "low",
      tradeParameters: shouldTrade
        ? {
            ticker: analysis.ticker,
            contracts: 3,
            strikePrice: "185.00",
            expiration: "2024-02-16",
            entryPrice: "2.50",
            maxRisk: "$750",
            targetProfit: "$1500",
            stopLoss: "$1.25",
            breakeven: "187.50",
            positionSize: "1.5%",
            leverage: "6.7x",
          }
        : null,
      marketTiming: {
        entryWindow: "immediate",
        holdPeriod: "days",
        exitStrategy: "profit_target",
      },
      enhanced: true,
    };
  }

  handleMarketAlert(alert) {
    console.log(`🚨 Market Alert: ${alert.type} - ${alert.message}`);

    // Store alert for context
    this.storeAlert(alert);

    // Emit for bot to handle
    this.emit("marketAlert", alert);
  }

  handleTechnicalSignal(signal) {
    console.log(`📊 Technical Signal: ${signal.type} - ${signal.message}`);

    this.emit("technicalSignal", signal);
  }

  handleOptionsSignal(signal) {
    console.log(`📋 Options Signal: ${signal.type} - ${signal.message}`);

    this.emit("optionsSignal", signal);
  }

  storeAlert(alert) {
    if (!this.recentAlerts) {
      this.recentAlerts = new Map();
    }

    const symbol = alert.symbol;
    if (!this.recentAlerts.has(symbol)) {
      this.recentAlerts.set(symbol, []);
    }

    const alerts = this.recentAlerts.get(symbol);
    alerts.push({
      ...alert,
      timestamp: Date.now(),
    });

    // Keep only last 10 alerts per symbol
    if (alerts.length > 10) {
      alerts.shift();
    }
  }

  getRecentAlerts(symbol, hours = 2) {
    if (!this.recentAlerts || !this.recentAlerts.has(symbol)) {
      return [];
    }

    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return this.recentAlerts
      .get(symbol)
      .filter((alert) => alert.timestamp > cutoff);
  }

  getEnhancedStats() {
    const basicStats = this.getAnalysisStats();

    return {
      ...basicStats,
      marketDataIntegration: true,
      realTimeAlerts: this.recentAlerts?.size || 0,
      optionsMonitoring:
        this.optionsFlow?.getMonitoringStatus().monitoring || false,
      marketDataStatus: this.marketData?.getStatus() || {},
      enhancedAnalyses: this.analysisHistory.filter((a) => a.analysis?.enhanced)
        .length,
    };
  }
}

module.exports = AdvancedAIAnalyzer;
