const cron = require("node-cron");
const { db } = require("./db");
const { InlineKeyboard } = require("grammy");
const config = require("./shared/config");

function setupCronJobs(bot) {
  const broadcastBonus = async () => {
    try {
      const students = await db("students").select("telegram_id");
      
      const keyboard = new InlineKeyboard().text("🎁 Bonusni olish", "claim_daily_bonus");
      const messageText = `🎁 <b>Yangi bonus soati keldi!</b>\n\nSizga ${config.rewards.dailyBonus || 100} so'm miqdorida maxsus bonus taqdim etiladi.\nVaqt tugamasidan oldin quyidagi tugmani bosing va balansingizni oshiring! 🏃‍♂️💨`;

      let successCount = 0;

      for (const student of students) {
        try {
          await bot.api.sendMessage(student.telegram_id, messageText, {
            reply_markup: keyboard,
            parse_mode: "HTML",
          });
          successCount++;
        } catch (error) {
          // Ignore users who blocked the bot
        }
        await new Promise(res => setTimeout(res, 50));
      }
      console.log(`Bonus broadcast yakunlandi. Yetkazib berildi: ${successCount} ta`);
    } catch (err) {
      console.error("Cron broadcast xatosi:", err);
    }
  };

  // 10:30 da (Tashkent vaqti)
  cron.schedule("30 10 * * *", () => {
    console.log("10:30 Bonus broadcast boshlandi...");
    broadcastBonus();
  }, {
    scheduled: true,
    timezone: "Asia/Tashkent"
  });

  // 18:50 da (Tashkent vaqti)
  cron.schedule("50 18 * * *", () => {
    console.log("18:50 Bonus broadcast boshlandi...");
    broadcastBonus();
  }, {
    scheduled: true,
    timezone: "Asia/Tashkent"
  });
}

module.exports = setupCronJobs;
