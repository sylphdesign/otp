require("dotenv").config();
const { Telegraf } = require("telegraf");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Simple test
bot.on("text", async (ctx) => {
  console.log("Got text:", ctx.message.text);
  if (ctx.message.text.toLowerCase().includes("portfolio")) {
    await ctx.reply("Portfolio handler works!");
  }
});

bot.launch();
console.log("Test bot started");
