const { db } = require("../db");
const { Keyboard } = require("grammy");

const { mainMenu } = require("../keyboards");
function setupStartHandler(bot) {
  bot.command("start", async (ctx) => {
    const telegramId = ctx.from.id;

    try {
      const student = await db("students")
        .where({ telegram_id: telegramId })
        .first();

      if (student) {
        ctx.session.step = "idle";
        return ctx.reply(
          `Salom, ${student.first_name}! Qaytaningizdan xursandmiz!`,
          { reply_markup: mainMenu },
        );
      }
      ctx.session.step = "awaiting_name";
      await ctx.reply(
        "Assalomu Alayykum! Qulay Prava botiga xush kelibsiz! Iltimos, ismingizni kiriting.",
      );
    } catch (error) {
      console.log("Xatolik yuz berdi:", error);
      ctx.reply(
        "Kechirasiz, xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring.",
      );
    }
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.session && ctx.session.step === "awaiting_name") {
      ctx.session.tempName = ctx.message.text;
      ctx.session.step = "awaiting_phone";

      const keyboard = new Keyboard()
        .requestContact("📱 Telefon raqamni yuborish")
        .resized()
        .oneTime();

      return ctx.reply(
        `Yaxshi, ${ctx.session.tempName}! Endi telefon raqamingizni yuboring.`,
        { reply_markup: keyboard },
      );
    }
    await next();
  });

  bot.on("message:contact", async (ctx) => {
    if (ctx.session && ctx.session.step === "awaiting_phone") {
      const contact = ctx.message.contact;
      const telegramId = ctx.from.id;

      if (contact.user_id !== telegramId) {
        return ctx.reply(
          "Iltimos, pastdagi tugmadan foydalanib faqat o'zingizning shaxsiy raqamingizni yuboring.",
        );
      }

      try {
        await db("students").insert({
          telegram_id: telegramId,
          first_name: ctx.session.tempName,
          phone_number: contact.phone_number,
        });

        ctx.session.step = "idle";
        ctx.session.tempName = null;

        await ctx.reply(
          "Tabriklaymiz, ro'yxatdan muvaffaqiyatli o'tdingiz! 🎉",
          {
            reply_markup: mainMenu, // Ekranning pastidagi tugmani olib tashlash
          },
        );
      } catch (error) {
        console.log("Bazaga saqlashda xatolik: ", error);
        ctx.reply(
          "Ro'yxatdan o'tishda xatolik yuz berdi. Iltimos /start buyrug'ini qayta bering!",
        );
      }
    }
  });
}

module.exports = setupStartHandler;
