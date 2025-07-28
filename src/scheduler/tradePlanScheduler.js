const cron = require("node-cron");

/**
 * Schedules daily and weekly trade plan scans.
 * @param {object} bot - Your TradingBot instance.
 */
function setupTradePlanScheduler(bot) {
  // Daily scan at 9:20am Eastern (before market open)
  cron.schedule("20 13 * * 1-5", async () => {
    await postTradePlan(bot, "daily");
  });

  // Weekly scan at Sunday 6pm Eastern
  cron.schedule("0 22 * * 0", async () => {
    await postTradePlan(bot, "weekly");
  });

  // Expose manual trigger
  bot.bot.command("tradeplan", async (ctx) => {
    await postTradePlan(bot, "manual", ctx);
  });
}

/**
 * Generates and posts the trade plan.
 * @param {object} bot - TradingBot instance.
 * @param {string} type - 'daily', 'weekly', or 'manual'
 * @param {object} ctx - (optional) Telegraf context if manual
 */
async function postTradePlan(bot, type, ctx = null) {
  // 1. Gather top setups (stub logic; replace with real scanning)
  const setups = await scanTopSetups(bot);

  // 2. Format the trade plan
  const planMsg = formatTradePlanMessage(setups, type);

  // 3. Post to Telegram (and Discord in the future)
  if (ctx) {
    await ctx.reply(planMsg, { parse_mode: "MarkdownV2" });
  } else {
    // Replace with the actual channel/user ID if needed
    await bot.bot.telegram.sendMessage(process.env.TELEGRAM_CHAT_ID, planMsg, {
      parse_mode: "MarkdownV2",
    });
  }
}

/**
 * Dummy scanner: Replace with actual order flow, gamma, AI logic.
 */
async function scanTopSetups(bot) {
  // TODO: Integrate with optionsFlow, aiAnalyzer, etc.
  return [
    {
      type: "Weekly Option",
      ticker: "AAPL",
      strike: 200,
      direction: "CALL",
      expiry: "2025-08-01",
      entry: 2.5,
      exit: 4.2,
      reason: "Breakout setup, strong order flow",
    },
    {
      type: "Day Trade",
      ticker: "SPY",
      entry: 555.75,
      exit: 557.4,
      stop: 554.9,
      reason: "VWAP reclaim, order flow spike",
    },
    // Add more mock setups or real ones later
  ];
}

function formatTradePlanMessage(setups, type) {
  let header = "";
  if (type === "daily") {
    header = `🟢 **ALADDIN DAILY TRADE PLAN**\n_Date: ${new Date().toLocaleDateString()}_\n\n`;
  } else if (type === "weekly") {
    header = `🟢 **ALADDIN WEEKLY STRATEGY**\n_Week of ${new Date().toLocaleDateString()}_\n\n`;
  } else {
    header = `🟢 **ALADDIN TRADE PLAN (Manual Trigger)**\n\n`;
  }
  let body = setups
    .map((s, i) => {
      if (s.type === "Weekly Option") {
        return `**${i + 1}. ${s.ticker} ${s.expiry} $${s.strike}${
          s.direction[0]
        }**
Entry: $${s.entry}
Exit: $${s.exit}
${s.reason}`;
      } else if (s.type === "Day Trade") {
        return `**${i + 1}. ${s.ticker} Day Trade**
Entry: $${s.entry} | Exit: $${s.exit} | Stop: $${s.stop}
${s.reason}`;
      } else {
        return `**${i + 1}. ${s.ticker}**
${JSON.stringify(s)}`;
      }
    })
    .join("\n\n");
  return header + body;
}

module.exports = { setupTradePlanScheduler };
