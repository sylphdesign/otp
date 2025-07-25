const { Markup } = require("telegraf");

class MenuBuilder {
  constructor() {
    this.menus = this.createMenus();
  }

  createMenus() {
    return {
      // Main Menu
      main: Markup.keyboard([
        ["🧠 ALADDIN AI", "📊 Portfolio"],
        ["🚨 Alerts", "📈 Analysis"],
        ["💰 P&L Report", "🎯 Daily Plan"],
        ["⚙️ Settings", "❓ Help"],
      ]).resize(),

      // ALADDIN Menu
      aladdin: Markup.keyboard([
        ["📋 Daily Plan", "📅 Weekly Strategy"],
        ["🔍 Market Scan", "💡 Ask ALADDIN"],
        ["🎯 My Positions", "⬅️ Back"],
      ]).resize(),

      // Portfolio Menu
      portfolio: Markup.keyboard([
        ["📸 Upload Screenshot", "📊 View Positions"],
        ["🚨 Exit Alerts", "📈 Performance"],
        ["💹 Compare Today", "⬅️ Back"],
      ]).resize(),

      // Alerts Menu
      alerts: Markup.keyboard([
        ["🔔 Active Alerts", "✅ Executed Trades"],
        ["⚡ Test Alert", "🎯 Alert Settings"],
        ["📱 Notification Test", "⬅️ Back"],
      ]).resize(),

      // Analysis Menu
      analysis: Markup.keyboard([
        ["🔍 Analyze Stock", "📊 Top Movers"],
        ["🎲 Options Flow", "📈 Market Trends"],
        ["💎 Hidden Gems", "⬅️ Back"],
      ]).resize(),

      // Quick Actions (Inline Keyboard)
      quickActions: Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Execute", "execute"),
          Markup.button.callback("❌ Skip", "skip"),
        ],
        [
          Markup.button.callback("📊 More Info", "moreinfo"),
          Markup.button.callback("⏰ Snooze", "snooze"),
        ],
      ]),

      // Position Actions
      positionActions: (symbol) =>
        Markup.inlineKeyboard([
          [
            Markup.button.callback("📈 Buy More", `buy_${symbol}`),
            Markup.button.callback("📉 Sell", `sell_${symbol}`),
          ],
          [
            Markup.button.callback("🎯 Set Alert", `alert_${symbol}`),
            Markup.button.callback("📊 Analysis", `analyze_${symbol}`),
          ],
        ]),

      // Confirmation
      confirm: Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Yes", "confirm_yes"),
          Markup.button.callback("❌ No", "confirm_no"),
        ],
      ]),

      // Remove keyboard
      remove: Markup.removeKeyboard(),
    };
  }

  // Get specific menu
  getMenu(menuName) {
    return this.menus[menuName] || this.menus.main;
  }

  // Create custom inline keyboard
  createInlineKeyboard(buttons) {
    return Markup.inlineKeyboard(buttons);
  }

  // Create option chain menu
  createOptionChainMenu(options) {
    const buttons = options.map((opt) => [
      Markup.button.callback(
        `${opt.symbol} $${opt.strike}${opt.type[0].toUpperCase()} - ${
          opt.daysLeft
        }d`,
        `option_${opt.symbol}_${opt.strike}_${opt.type}`
      ),
    ]);

    return Markup.inlineKeyboard(buttons);
  }

  // Create time-based alerts menu
  createAlertTimesMenu() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback("⏰ 9:30 AM", "alert_time_0930"),
        Markup.button.callback("⏰ 10:00 AM", "alert_time_1000"),
      ],
      [
        Markup.button.callback("⏰ 2:00 PM", "alert_time_1400"),
        Markup.button.callback("⏰ 3:30 PM", "alert_time_1530"),
      ],
      [
        Markup.button.callback("🔄 Every Hour", "alert_time_hourly"),
        Markup.button.callback("❌ Cancel", "alert_time_cancel"),
      ],
    ]);
  }
}

module.exports = MenuBuilder;
