const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs").promises;
const path = require("path");

class AIAnalyzer {
  constructor() {
    this.anthropic = null;
    this.confidenceThreshold =
      parseInt(process.env.MIN_CONFIDENCE_THRESHOLD) || 7;
    this.analysisHistory = [];

    // Initialize API if key exists
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      console.log("✅ Anthropic API initialized");
    } else {
      console.warn("⚠️ No Anthropic API key found - using mock analysis");
    }
  }

  async analyzeSignal(signalText, marketContext = {}) {
    console.log("🔍 Analyzing signal:", signalText.substring(0, 50) + "...");

    try {
      let analysis, decision;

      if (this.anthropic) {
        // Try real AI analysis
        analysis = await this.performRealAnalysis(signalText, marketContext);
        decision = await this.makeRealDecision(analysis);
      } else {
        // Use mock analysis for testing
        analysis = this.createMockAnalysis(signalText);
        decision = this.createMockDecision(analysis);
      }

      // Store analysis
      await this.storeAnalysis(signalText, analysis, decision);

      return {
        analysis,
        decision,
        timestamp: new Date().toISOString(),
        mock: !this.anthropic,
      };
    } catch (error) {
      console.error("💥 Analysis error:", error.message);

      // Fallback to mock analysis
      const analysis = this.createMockAnalysis(signalText);
      const decision = this.createMockDecision(analysis);

      return {
        analysis,
        decision,
        timestamp: new Date().toISOString(),
        error: error.message,
        mock: true,
      };
    }
  }

  async performRealAnalysis(signalText, marketContext) {
    const prompt = `Analyze this trading signal briefly:
    
Signal: "${signalText}"

Respond in this exact JSON format:
{
  "ticker": "SYMBOL or null",
  "confidence": 5,
  "sentiment": "bullish",
  "keyPoints": ["key point 1", "key point 2"],
  "optionsStrategy": {"recommended": "call", "reasoning": "why"},
  "riskAssessment": {"riskLevel": "medium"}
}`;

    const response = await this.anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });

    const responseText = response.content[0].text;
    console.log("🤖 AI Response:", responseText.substring(0, 100) + "...");

    // Try to extract JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in AI response");
    }

    return JSON.parse(jsonMatch[0]);
  }

  async makeRealDecision(analysis) {
    const shouldTrade = analysis.confidence >= this.confidenceThreshold;

    return {
      shouldTrade,
      action: shouldTrade ? "buy_call" : "monitor",
      reasoning: shouldTrade
        ? `High confidence (${analysis.confidence}/10) trade`
        : `Low confidence (${analysis.confidence}/10) - monitoring`,
      tradeParameters: shouldTrade
        ? {
            ticker: analysis.ticker,
            optionType: "call",
            maxRisk: "$500",
            targetProfit: "$1000",
          }
        : null,
    };
  }

  createMockAnalysis(signalText) {
    // Extract ticker if possible
    const tickerMatch = signalText.match(/\b[A-Z]{1,5}\b/);
    const ticker = tickerMatch ? tickerMatch[0] : null;

    // Determine sentiment
    const bullishWords = ["bullish", "buy", "call", "up", "breakout", "target"];
    const bearishWords = [
      "bearish",
      "sell",
      "put",
      "down",
      "breakdown",
      "short",
    ];

    const lowerSignal = signalText.toLowerCase();
    const bullishCount = bullishWords.filter((word) =>
      lowerSignal.includes(word)
    ).length;
    const bearishCount = bearishWords.filter((word) =>
      lowerSignal.includes(word)
    ).length;

    let sentiment = "neutral";
    if (bullishCount > bearishCount) sentiment = "bullish";
    if (bearishCount > bullishCount) sentiment = "bearish";

    const confidence = Math.floor(Math.random() * 4) + 6; // 6-9

    return {
      ticker,
      confidence,
      sentiment,
      keyPoints: [
        `Signal detected for ${ticker || "unknown symbol"}`,
        `${sentiment} sentiment identified`,
        "Mock analysis - API not connected",
      ],
      optionsStrategy: {
        recommended:
          sentiment === "bullish"
            ? "call"
            : sentiment === "bearish"
            ? "put"
            : "none",
        reasoning: `${sentiment} signal suggests ${
          sentiment === "bullish" ? "call" : "put"
        } options`,
      },
      riskAssessment: {
        riskLevel: "medium",
      },
      mock: true,
    };
  }

  createMockDecision(analysis) {
    const shouldTrade = analysis.confidence >= this.confidenceThreshold;

    return {
      shouldTrade,
      action: shouldTrade
        ? analysis.sentiment === "bullish"
          ? "buy_call"
          : "buy_put"
        : "monitor",
      reasoning: shouldTrade
        ? `Mock decision: ${analysis.sentiment} signal with confidence ${analysis.confidence}/10`
        : `Confidence too low: ${analysis.confidence}/${this.confidenceThreshold}`,
      tradeParameters: shouldTrade
        ? {
            ticker: analysis.ticker,
            optionType: analysis.sentiment === "bullish" ? "call" : "put",
            maxRisk: "$500",
            targetProfit: "$1000",
            riskRewardRatio: "1:2",
          }
        : null,
      mock: true,
    };
  }

  async storeAnalysis(signal, analysis, decision) {
    const record = {
      timestamp: new Date().toISOString(),
      signal: signal.substring(0, 200),
      analysis: analysis,
      decision: decision,
      id: Date.now() + Math.random(),
    };

    this.analysisHistory.push(record);

    if (this.analysisHistory.length > 50) {
      this.analysisHistory = this.analysisHistory.slice(-50);
    }

    try {
      // Ensure logs directory exists
      const logsDir = path.join(__dirname, "../../logs");
      await fs.mkdir(logsDir, { recursive: true });

      const analysisFile = path.join(logsDir, "ai_analysis.json");
      await fs.writeFile(
        analysisFile,
        JSON.stringify(this.analysisHistory, null, 2)
      );
    } catch (error) {
      console.error("Failed to save analysis:", error.message);
    }
  }

  getAnalysisStats() {
    const total = this.analysisHistory.length;
    const tradeable = this.analysisHistory.filter(
      (a) => a.decision.shouldTrade
    ).length;
    const avgConfidence =
      this.analysisHistory.reduce(
        (sum, a) => sum + (a.analysis?.confidence || 0),
        0
      ) / Math.max(total, 1);

    return {
      totalAnalyses: total,
      tradeableSignals: tradeable,
      tradeablePercentage:
        total > 0 ? ((tradeable / total) * 100).toFixed(1) : 0,
      averageConfidence: avgConfidence.toFixed(1),
      lastAnalysis:
        this.analysisHistory[this.analysisHistory.length - 1]?.timestamp ||
        "None",
      apiConnected: !!this.anthropic,
    };
  }
}

module.exports = AIAnalyzer;