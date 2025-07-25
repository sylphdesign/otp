const Tesseract = require("tesseract.js");
const sharp = require("sharp");
const fs = require("fs");

class TextExtractor {
  async extract(imagePath) {
    try {
      console.log("🔍 Starting text extraction from:", imagePath);

      // Try multiple preprocessing approaches
      const methods = [
        { name: "inverted", func: this.preprocessInverted },
        { name: "enhanced", func: this.preprocessEnhanced },
        { name: "original", func: this.preprocessOriginal },
      ];

      let bestResult = { text: "", confidence: 0 };

      for (const method of methods) {
        console.log(`🔄 Trying ${method.name} preprocessing...`);
        const processedPath = await method.func.call(this, imagePath);

        const result = await Tesseract.recognize(processedPath, "eng", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
            }
          },
        });

        // Clean up processed image
        if (processedPath !== imagePath) {
          fs.unlinkSync(processedPath);
        }

        console.log(
          `✅ ${method.name} - Confidence: ${result.data.confidence}%`
        );
        console.log(
          `📄 Text preview: ${result.data.text.substring(0, 100)}...`
        );

        if (result.data.confidence > bestResult.confidence) {
          bestResult = result.data;
        }
      }

      console.log(`🎯 Best result confidence: ${bestResult.confidence}%`);
      return bestResult.text;
    } catch (error) {
      console.error("OCR error:", error);
      return null;
    }
  }

  async preprocessInverted(imagePath) {
    const outputPath = imagePath.replace(".jpg", "_inverted.jpg");

    await sharp(imagePath)
      .negate() // Invert colors (white background, black text)
      .greyscale()
      .normalize()
      .threshold(180) // Adjust threshold for better contrast
      .resize(2000, null, {
        withoutEnlargement: false, // Allow enlargement for small images
        fit: "inside",
      })
      .sharpen()
      .toFile(outputPath);

    return outputPath;
  }

  async preprocessEnhanced(imagePath) {
    const outputPath = imagePath.replace(".jpg", "_enhanced.jpg");

    await sharp(imagePath)
      .greyscale()
      .normalize()
      .linear(1.5, -(128 * 1.5) + 128) // Increase contrast
      .resize(3000, null, {
        withoutEnlargement: false,
        fit: "inside",
      })
      .sharpen({ sigma: 2 })
      .toFile(outputPath);

    return outputPath;
  }

  async preprocessOriginal(imagePath) {
    // Try with minimal preprocessing
    const outputPath = imagePath.replace(".jpg", "_original.jpg");

    await sharp(imagePath)
      .resize(2500, null, {
        withoutEnlargement: false,
        fit: "inside",
      })
      .toFile(outputPath);

    return outputPath;
  }

  parseBasicInfo(text) {
    console.log("\n📋 Parsing portfolio data...");
    console.log("Raw text length:", text.length);

    const data = {
      totalValue: null,
      dayChange: null,
      dayChangePercent: null,
      buyingPower: null,
      positions: [],
      options: [],
      stocks: [],
      crypto: [],
      cash: null,
      rawText: text, // Store for debugging
    };

    // Clean and normalize text
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const fullText = text.replace(/\s+/g, " ").trim();

    console.log("📝 Lines found:", lines.length);
    console.log("First 5 lines:", lines.slice(0, 5));

    // Parse total portfolio value - Robinhood specific patterns
    const totalPatterns = [
      /\$?([\d,]+\.?\d*)\s*(?:Investing|Total)/i,
      /Investing\s*\$?([\d,]+\.?\d*)/i,
      /^\$?([\d,]+\.?\d*)$/m, // Just a dollar amount on its own line
      /Portfolio\s*Value\s*\$?([\d,]+\.?\d*)/i,
    ];

    for (const pattern of totalPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.totalValue = match[1];
        console.log("💰 Found total value:", data.totalValue);
        break;
      }
    }

    // Parse day change - look for patterns like "+$53.14 (0.13%) Today"
    const dayChangePatterns = [
      /([+-]?\$?[\d,]+\.?\d*)\s*\(([+-]?[\d.]+%)\)\s*(?:Today|today)/i,
      /([+-]?\$?[\d,]+\.?\d*)\s*\(([+-]?[\d.]+%)\)/,
      /Today\s*([+-]?\$?[\d,]+\.?\d*)\s*\(([+-]?[\d.]+%)\)/i,
    ];

    for (const pattern of dayChangePatterns) {
      const match = text.match(pattern);
      if (match) {
        data.dayChange = match[1];
        data.dayChangePercent = match[2];
        console.log(
          "📈 Found day change:",
          data.dayChange,
          data.dayChangePercent
        );
        break;
      }
    }

    // Parse buying power
    const buyingPatterns = [
      /Buying\s*power\s*\$?([\d,]+\.?\d*)/i,
      /Cash\s*\$?([\d,]+\.?\d*)/i,
      /Available\s*\$?([\d,]+\.?\d*)/i,
    ];

    for (const pattern of buyingPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.buyingPower = match[1];
        console.log("💵 Found buying power:", data.buyingPower);
        break;
      }
    }

    // Parse Options Section - Robinhood format
    console.log("\n🔍 Looking for options...");

    // Method 1: Look for "Options" section and parse below it
    const optionsIndex = lines.findIndex((line) => /^Options/i.test(line));
    if (optionsIndex !== -1) {
      console.log("📍 Found Options section at line:", optionsIndex);

      // Parse lines after "Options" until we hit another section
      for (let i = optionsIndex + 1; i < lines.length; i++) {
        const line = lines[i];

        // Stop if we hit another section
        if (/^(Cash|Stocks|Crypto|Interest)/i.test(line)) break;

        // Parse option lines - multiple patterns for Robinhood format
        const optionPatterns = [
          // SOFI $25 Call
          /([A-Z]{2,5})\s*\$?([\d.]+)\s*(Call|Put)/i,
          // NVDA $180 Call
          /([A-Z]{2,5})\s*\$?([\d.]+)\s*(C|P)(?:all|ut)?/i,
          // With dates: SOFI $24 Call 7/25
          /([A-Z]{2,5})\s*\$?([\d.]+)\s*(Call|Put)\s*(\d{1,2}\/\d{1,2})/i,
          // With value: SOFI $25 Call $0.07
          /([A-Z]{2,5})\s*\$?([\d.]+)\s*(Call|Put).*?\$?([\d.]+)$/i,
        ];

        for (const pattern of optionPatterns) {
          const match = line.match(pattern);
          if (match) {
            const option = {
              symbol: match[1].toUpperCase(),
              strike: match[2],
              type: match[3].toLowerCase().startsWith("c") ? "call" : "put",
              expiry: match[4] || null,
              value: match[5] || null,
              line: line, // Store original line for debugging
            };

            // Check if not duplicate
            const exists = data.options.some(
              (opt) =>
                opt.symbol === option.symbol &&
                opt.strike === option.strike &&
                opt.type === option.type
            );

            if (!exists) {
              data.options.push(option);
              console.log("✅ Found option:", option);
            }
            break;
          }
        }
      }
    }

    // Method 2: Search entire text for option patterns
    if (data.options.length === 0) {
      console.log("🔄 Searching entire text for options...");

      const globalOptionPatterns = [
        /([A-Z]{2,5})\s*\$?([\d.]+)\s*(Call|Put)/gi,
        /([A-Z]{2,5})\s*\$?([\d.]+)\s*([CP])\s/gi,
      ];

      for (const pattern of globalOptionPatterns) {
        const matches = [...text.matchAll(pattern)];
        matches.forEach((match) => {
          const option = {
            symbol: match[1].toUpperCase(),
            strike: match[2],
            type: match[3].toLowerCase().startsWith("c") ? "call" : "put",
          };

          // Filter out false positives
          if (
            option.symbol.length >= 2 &&
            option.symbol.length <= 5 &&
            !["THE", "AND", "FOR", "USD"].includes(option.symbol) &&
            parseFloat(option.strike) > 0
          ) {
            const exists = data.options.some(
              (opt) =>
                opt.symbol === option.symbol && opt.strike === option.strike
            );

            if (!exists) {
              data.options.push(option);
              console.log("✅ Found option (global):", option);
            }
          }
        });
      }
    }

    // Parse Stocks Section
    console.log("\n🔍 Looking for stocks...");
    const stocksIndex = lines.findIndex((line) => /^Stocks/i.test(line));
    if (stocksIndex !== -1) {
      console.log("📍 Found Stocks section at line:", stocksIndex);

      for (let i = stocksIndex + 1; i < lines.length; i++) {
        const line = lines[i];

        // Stop at next section
        if (/^(Cash|Crypto|Interest|Options)/i.test(line)) break;

        // Extract stock symbols
        const stockMatch = line.match(
          /([A-Z]{2,5})\s*(?:\d+\.?\d*\s*shares?)?/i
        );
        if (stockMatch && !data.stocks.includes(stockMatch[1])) {
          data.stocks.push(stockMatch[1]);
          console.log("✅ Found stock:", stockMatch[1]);
        }
      }
    }

    // Parse Crypto Section
    const cryptoIndex = lines.findIndex((line) => /^Crypto/i.test(line));
    if (cryptoIndex !== -1) {
      for (
        let i = cryptoIndex + 1;
        i < lines.length && i < cryptoIndex + 5;
        i++
      ) {
        const line = lines[i];
        const cryptoMatch = line.match(/([A-Z]{3,5})/);
        if (cryptoMatch) {
          data.crypto.push(cryptoMatch[1]);
          console.log("🪙 Found crypto:", cryptoMatch[1]);
        }
      }
    }

    // Summary
    console.log("\n📊 Parsing complete:");
    console.log(`- Total Value: ${data.totalValue || "Not found"}`);
    console.log(`- Options: ${data.options.length}`);
    console.log(`- Stocks: ${data.stocks.length}`);
    console.log(`- Crypto: ${data.crypto.length}`);

    // If no positions found, try to extract any symbols as fallback
    if (data.options.length === 0 && data.stocks.length === 0) {
      console.log("\n⚠️ No positions found, attempting fallback parsing...");

      // Find all potential symbols
      const symbolPattern = /\b([A-Z]{2,5})\b/g;
      const symbols = [...text.matchAll(symbolPattern)]
        .map((match) => match[1])
        .filter(
          (symbol) =>
            ![
              "USD",
              "USA",
              "THE",
              "AND",
              "FOR",
              "APY",
              "CALL",
              "PUT",
              "BUY",
              "SELL",
              "TOTAL",
              "TODAY",
              "CASH",
              "STOCKS",
              "OPTIONS",
              "CRYPTO",
            ].includes(symbol)
        );

      const uniqueSymbols = [...new Set(symbols)];
      console.log("🔍 Potential symbols found:", uniqueSymbols);

      data.positions = uniqueSymbols;
    }

    return data;
  }
}

module.exports = TextExtractor;
