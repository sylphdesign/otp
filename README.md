# AI Trading Bot

This project contains an AI‑powered Telegram bot that analyzes trading signals and streams real‑time market data. It combines market monitoring with natural language analysis to deliver alerts and trading statistics directly in Telegram chats.

## Features

- Connects to Telegram using the [Telegraf](https://telegraf.js.org/) library
- Streams quotes and technical indicators from Polygon or Twelve Data
- Detects options flow and unusual market activity
- Uses AI models (Anthropic or mock logic) to evaluate trading signals
- Provides commands such as `/start`, `/status`, `/market`, `/watchlist` and more
- Optional integration with a paper trading engine for automated alerts

## Environment Variables

Create a `.env` file in the project root and define the following variables:

| Variable | Description |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | **Required.** Token for your Telegram bot |
| `TELEGRAM_SIGNAL_CHANNEL` | Channel username to pull trading signals from |
| `POLYGON_API_KEY` | API key for Polygon streaming data |
| `TWELVE_DATA_API_KEY` | API key for Twelve Data provider |
| `ANTHROPIC_API_KEY` | API key for advanced AI analysis |
| `ALPHA_VANTAGE_API_KEY` | API key for Alpha Vantage (optional) |
| `MARKET_DATA_PROVIDER` | `polygon`, `twelvedata` or `yahoo` (default: `polygon`) |
| `ENABLE_REAL_TIME` | `true` to start real‑time monitoring |
| `DEFAULT_RISK_PERCENTAGE` | Risk per trade used in analysis |
| `PAPER_TRADING` | `true` to use the paper trading mode |

The bot falls back to mock data when no Polygon or Twelve Data keys are supplied so you can test basic features without live APIs.

## Installation

```bash
npm install
```

## Running the Bot

During development use nodemon so changes reload automatically:

```bash
npm run dev
```

For a production run execute:

```bash
npm start
```

## Tests

Run the basic test script with:

```bash
npm test
```

