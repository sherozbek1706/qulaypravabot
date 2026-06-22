const { db } = require("../db");
const config = require("../shared/config");

function getCurrentBonusSession() {
  const now = new Date();
  const options = { timeZone: "Asia/Tashkent", hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
  const formatter = new Intl.DateTimeFormat('en-US', options);
  
  const parts = formatter.formatToParts(now);
  const partMap = {};
  parts.forEach(p => partMap[p.type] = p.value);
  
  const yyyy = partMap.year;
  const mm = partMap.month;
  const dd = partMap.day;
  
  // Parse hour handling 24-hour edge cases (e.g., 24 instead of 00)
  let hStr = partMap.hour;
  if (hStr === '24') hStr = '00';
  
  const h = parseInt(hStr, 10);
  const m = parseInt(partMap.minute, 10);

  const timeValue = h * 60 + m; // minutes since midnight
  const t1030 = 10 * 60 + 30; // 630
  const t1850 = 18 * 60 + 50; // 1130

  if (timeValue < t1030) {
    // Before 10:30 today => belongs to yesterday's 18:50 session
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yParts = formatter.formatToParts(yesterday);
    const yMap = {};
    yParts.forEach(p => yMap[p.type] = p.value);
    return `${yMap.year}-${yMap.month}-${yMap.day}-18:50`;
  } else if (timeValue < t1850) {
    // Between 10:30 and 18:49 => belongs to today's 10:30 session
    return `${yyyy}-${mm}-${dd}-10:30`;
  } else {
    // After 18:50 => belongs to today's 18:50 session
    return `${yyyy}-${mm}-${dd}-18:50`;
  }
}

function setupBonusHandler(bot) {
  bot.callbackQuery("claim_daily_bonus", async (ctx) => {
    try {
      const telegramId = ctx.from.id;
      const student = await db("students").where({ telegram_id: telegramId }).first();

      if (!student) {
        return ctx.answerCallbackQuery({ text: "Siz ro'yxatdan o'tmagansiz!", show_alert: true });
      }

      const activeSession = getCurrentBonusSession();

      if (student.last_bonus_session === activeSession) {
        return ctx.answerCallbackQuery({
          text: "Siz ushbu vaqtdagi bonusni allaqachon olgansiz! Keyingi bonus vaqtini kuting.",
          show_alert: true
        });
      }

      const bonusAmount = config.rewards.dailyBonus || 100;

      await db("students")
        .where({ id: student.id })
        .update({
          balance: student.balance + bonusAmount,
          last_bonus_session: activeSession
        });

      await ctx.answerCallbackQuery({
        text: `Tabriklaymiz! Sizga ${bonusAmount} so'm bonus berildi!`,
        show_alert: true
      });

      // Original xabarni o'zgartirib tugmani olib tashlaymiz
      const currentText = ctx.callbackQuery.message.text || "";
      await ctx.editMessageText(
        currentText + `\n\n✅ <b>Siz bu bonusni muvaffaqiyatli oldingiz!</b>`,
        { parse_mode: "HTML" }
      ).catch(() => {});

    } catch (error) {
      console.error("Bonus olishda xatolik:", error);
      ctx.answerCallbackQuery({ text: "Xatolik yuz berdi. Keyinroq urinib ko'ring.", show_alert: true });
    }
  });
}

module.exports = setupBonusHandler;
