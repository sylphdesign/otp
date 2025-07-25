require("dotenv").config();
const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Simple test command
bot.command('test123', (ctx) => {
  console.log('Test123 command received from:', ctx.from.username);
  ctx.reply('Test123 works!');
});

// Alert test
bot.command('alerttest', async (ctx) => {
  console.log('Alert test command received');
  const message = `
🚨 TEST ALERT 🚨

This is a test alert message.
If you see this, alerts are working!

Reply "Got it" to confirm.
  `;
  await ctx.reply(message);
});

bot.launch();
console.log('Simple alert bot started.');
console.log('Available commands: /test123, /alerttest');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));