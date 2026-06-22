const { InlineKeyboard } = require("grammy");
const { db } = require("../db");
const config = require("../shared/config");
const { mainMenu } = require("../keyboards");
const { escapeHtml } = require("../utils");

function setupWithdrawHandler(bot) {
  // 1. "💸 Pulni yechish" tugmasi bosilganda
  bot.hears("💸 Pulni yechish", async (ctx) => {
    const telegramId = ctx.from.id;

    try {
      const student = await db("students")
        .where({ telegram_id: telegramId })
        .first();
      if (!student) {
        return ctx.reply(
          "Siz hali ro'yxatdan o'tmagansiz. Iltimos, /start buyrug'ini yuboring.",
        );
      }

      const minLimit = config.minWithdrawLimit || 5000;
      if (student.balance < minLimit) {
        return ctx.reply(
          `🛑 <b>Balansingiz yetarli emas.</b>\n\n` +
          `• Sizning balansingiz: <b>${student.balance} so'm</b>\n` +
          `• Eng kam yechib olish miqdori: <b>${minLimit} so'm</b>\n\n` +
          `Ko'proq do'stlaringizni taklif qiling yoki testlarni to'g'ri yechib balansingizni oshiring! 🚀`,
          { parse_mode: "HTML" },
        );
      }

      // Summani so'raymiz va sessiyani o'zgartiramiz
      ctx.session.step = "awaiting_withdraw_amount";
      await ctx.reply(
        `💰 <b>Balansingiz:</b> ${student.balance} so'm\n` +
        `Eng kam yechib olish miqdori: ${minLimit} so'm\n\n` +
        `Iltimos, yechib olmoqchi bo'lgan miqdoringizni kiriting (masalan: 5000):`,
        {
          reply_markup: { remove_keyboard: true }, // Asosiy menyuni olib tashlaymiz
          parse_mode: "HTML"
        },
      );
    } catch (error) {
      console.error("Yechish so'rovini boshlashda xatolik:", error);
      await ctx.reply(
        "Tizimda xatolik yuz berdi. Iltimos keyinroq qayta urinib ko'ring.",
      );
    }
  });

  // 2. Summani kiritish, karta raqamini kiritish va rad etish sababini kiritish bosqichi
  bot.on("message:text", async (ctx, next) => {
    const step = ctx.session.step;
    const text = ctx.message.text.trim();
    const telegramId = ctx.from.id;

    if (step === "awaiting_withdraw_amount") {
      const amount = Number(text);
      if (isNaN(amount) || amount <= 0 || !Number.isInteger(amount)) {
        return ctx.reply(
          "Iltimos, faqat musbat butun son kiriting (masalan: 5000):",
        );
      }

      try {
        const student = await db("students")
          .where({ telegram_id: telegramId })
          .first();
        const minLimit = config.minWithdrawLimit || 5000;

        if (amount < minLimit) {
          return ctx.reply(
            `Eng kam yechish miqdori: ${minLimit} so'm. Iltimos, qaytadan kiriting:`,
          );
        }

        if (amount > student.balance) {
          return ctx.reply(
            `Sizning balansingizda yetarli mablag' mavjud emas (Maksimal: ${student.balance} so'm). Qaytadan kiriting:`,
          );
        }

        // Summani sessiyaga saqlaymiz va karta so'raymiz
        ctx.session.withdrawAmount = amount;

        if (student.card_number) {
          const savedCardKeyboard = new InlineKeyboard()
            .text(
              `✅ Ha, shu kartaga (${student.card_number})`,
              `withdraw_use_saved_card`,
            )
            .row()
            .text("❌ Yo'q, yangi karta kiritish", "withdraw_enter_new_card");

          return ctx.reply(
            `Sizda saqlangan karta raqami mavjud:\n<code>${escapeHtml(student.card_number)}</code>\n\n` +
            `Ushbu kartaga pulni o'tkazishni xohlaysizmi?`,
            {
              reply_markup: savedCardKeyboard,
              parse_mode: "HTML"
            },
          );
        } else {
          ctx.session.step = "awaiting_card_number";
          return ctx.reply(
            "Yaxshi. Endi 16 xonali Uzcard yoki Humo karta raqamingizni kiriting (masalan: 8600123456789012):",
          );
        }
      } catch (error) {
        console.error("Sessiya summasini tekshirishda xatolik:", error);
        ctx.session.step = "idle";
        return ctx.reply("Xatolik yuz berdi. Bosh menyuga qaytildi.", {
          reply_markup: mainMenu,
        });
      }
    }

    if (step === "awaiting_card_number") {
      const cardNumber = text.replace(/\s+/g, "").replace(/-/g, ""); // Bo'shliqlar va chiziqlarni tozalaymiz
      if (!/^\d{16}$/.test(cardNumber)) {
        return ctx.reply(
          "Karta raqami xato kiritildi. U roppa-rosa 16 ta raqamdan iborat bo'lishi kerak. Qaytadan kiriting:",
        );
      }

      const amount = ctx.session.withdrawAmount;

      try {
        const student = await db("students")
          .where({ telegram_id: telegramId })
          .first();
        if (amount > student.balance) {
          ctx.session.step = "idle";
          return ctx.reply(
            "Xatolik: Balansingiz kutilmaganda yetarli bo'lmay qoldi. Bekor qilindi.",
            { reply_markup: mainMenu },
          );
        }

        // 1. Balansni kamaytiramiz (muzlatamiz)
        await db("students")
          .where({ id: student.id })
          .decrement("balance", amount);

        // Karta raqamini talabaning profiliga saqlab qo'yamiz (yoki yangilaymiz)
        await db("students")
          .where({ id: student.id })
          .update({ card_number: cardNumber });

        // 2. Yechish so'rovini bazaga qo'shamiz
        const [request] = await db("withdrawal_requests")
          .insert({
            student_id: student.id,
            amount: amount,
            card_number: cardNumber,
            status: "pending",
          })
          .returning("*");

        // Sessiyani tozalaymiz
        ctx.session.step = "idle";
        ctx.session.withdrawAmount = null;

        await ctx.reply(
          `✅ <b>Yechib olish so'rovi qabul qilindi!</b>\n\n` +
          `• <b>Summa:</b> ${amount} so'm\n` +
          `• <b>Karta raqami:</b> ${escapeHtml(cardNumber)}\n\n` +
          `Tez orada so'rov ko'rib chiqiladi va kartangizga pul o'tkaziladi. Rahmat!`,
          { reply_markup: mainMenu, parse_mode: "HTML" },
        );

        // 3. Adminga xabar berish
        if (config.telegram.adminChatId) {
          const adminKeyboard = new InlineKeyboard()
            .text(
              "✅ Tasdiqlash (To'landi)",
              `admin_approve_withdraw_${request.id}`,
            )
            .row()
            .text("❌ Rad etish", `admin_reject_withdraw_${request.id}`);

          await ctx.api
            .sendMessage(
              config.telegram.adminChatId,
              `💸 <b>Yangi pul yechish so'rovi!</b>\n\n` +
                `• <b>Talaba:</b> ${escapeHtml(student.first_name)}\n` +
                `• <b>Telegram ID:</b> ${student.telegram_id}\n` +
                `• <b>Telefon:</b> ${escapeHtml(student.phone_number)}\n` +
                `• <b>Summa:</b> ${amount} so'm\n` +
                `• <b>Karta:</b> <code>${escapeHtml(cardNumber)}</code>`,
              {
                reply_markup: adminKeyboard,
                parse_mode: "HTML",
              },
            )
            .catch((err) => {
              console.error(
                "Adminga yechish so'rovini yuborishda xatolik:",
                err,
              );
            });
        }
      } catch (error) {
        console.error("Karta raqamini saqlashda xatolik:", error);
        ctx.session.step = "idle";
        return ctx.reply(
          "Tizimda xatolik yuz berdi. Iltimos keyinroq qayta urinib ko'ring.",
          { reply_markup: mainMenu },
        );
      }
      return;
    }

    // Admin rad etish sababini kiritish bosqichi
    if (step && step.startsWith("awaiting_rejection_reason_")) {
      const requestId = Number(step.split("_").pop());

      try {
        const request = await db("withdrawal_requests")
          .where({ id: requestId })
          .first();
        if (!request || request.status !== "pending") {
          ctx.session.step = "idle";
          return ctx.reply("Bu so'rov allaqachon bajarilgan yoki topilmadi.");
        }

        const student = await db("students")
          .where({ id: request.student_id })
          .first();

        // 1. Statusni rad etilgan qilib o'zgartiramiz va sababini yozamiz
        await db("withdrawal_requests").where({ id: requestId }).update({
          status: "rejected",
          rejection_reason: text,
          updated_at: db.fn.now(),
        });

        // 2. Pulni talaba balansiga qaytaramiz (refund)
        await db("students")
          .where({ id: request.student_id })
          .increment("balance", request.amount);

        ctx.session.step = "idle";

        await ctx.reply(`❌ So'rov rad etildi va sababi saqlandi:\n"${escapeHtml(text)}"`, { parse_mode: "HTML" });

        // 3. Talabaga xabar yuboramiz
        await ctx.api
          .sendMessage(
            student.telegram_id,
            `❌ <b>Sizning pul yechib olish so'rovingiz rad etildi!</b>\n\n` +
          `• <b>Summa:</b> ${request.amount} so'm\n` +
          `• <b>Karta:</b> ${escapeHtml(request.card_number)}\n` +
          `• <b>Rad etish sababi:</b> <i>${escapeHtml(text)}</i>\n\n` +
          `💰 Muzlatilgan summa balansingizga qaytarildi.`,
          { parse_mode: "HTML" },
          )
          .catch((err) => {
            console.error(
              "Talabaga rad etilganlik xabarini yuborishda xatolik:",
              err,
            );
          });
      } catch (error) {
        console.error("Rad etish sababini saqlashda xatolik:", error);
        ctx.session.step = "idle";
        await ctx.reply("Xatolik yuz berdi.");
      }
      return;
    }

    await next();
  });

  // 3. Admin callback query handlerlar (Approve / Reject)
  bot.callbackQuery(/^admin_approve_withdraw_(\d+)$/, async (ctx) => {
    const requestId = Number(ctx.match[1]);
    const adminChatId = config.telegram.adminChatId;

    if (String(ctx.from.id) !== String(adminChatId)) {
      return ctx.answerCallbackQuery({
        text: "Siz admin emassiz!",
        show_alert: true,
      });
    }

    try {
      const request = await db("withdrawal_requests")
        .where({ id: requestId })
        .first();
      if (!request) {
        return ctx.answerCallbackQuery({
          text: "So'rov topilmadi!",
          show_alert: true,
        });
      }

      if (request.status !== "pending") {
        return ctx.answerCallbackQuery({
          text: "Ushbu so'rov allaqachon ko'rib chiqilgan!",
          show_alert: true,
        });
      }

      // Statusni approved qilamiz
      await db("withdrawal_requests").where({ id: requestId }).update({
        status: "approved",
        updated_at: db.fn.now(),
      });

      await ctx.answerCallbackQuery({ text: "Tasdiqlandi!" });

      // Admin xabarini yangilaymiz
      const student = await db("students")
        .where({ id: request.student_id })
        .first();
      await ctx
        .editMessageText(
          `✅ <b>Pul yechish so'rovi tasdiqlandi (To'landi!)</b>\n\n` +
        `• <b>Talaba:</b> ${escapeHtml(student.first_name)}\n` +
        `• <b>Telefon:</b> ${escapeHtml(student.phone_number)}\n` +
        `• <b>Summa:</b> ${request.amount} so'm\n` +
        `• <b>Karta:</b> <code>${escapeHtml(request.card_number)}</code> (To'landi)`,
        { parse_mode: "HTML" },
        )
        .catch(() => {});

      // Talabaga xabar yuboramiz
      await ctx.api
        .sendMessage(
          student.telegram_id,
          `✅ <b>Sizning pul yechib olish so'rovingiz muvaffaqiyatli tasdiqlandi!</b>\n\n` +
        `• <b>Summa:</b> ${request.amount} so'm\n` +
        `• <b>Karta raqami:</b> ${escapeHtml(request.card_number)}\n\n` +
        `Pul kartangizga o'tkazildi! 🎉`,
        { parse_mode: "HTML" },
        )
        .catch((err) => {
          console.error(
            "Talabaga tasdiqlash xabarini yuborishda xatolik:",
            err,
          );
        });
    } catch (error) {
      console.error("Yechish so'rovini tasdiqlashda xatolik:", error);
      await ctx.answerCallbackQuery({
        text: "Tizimda xatolik yuz berdi.",
        show_alert: true,
      });
    }
  });

  bot.callbackQuery(/^admin_reject_withdraw_(\d+)$/, async (ctx) => {
    const requestId = Number(ctx.match[1]);
    const adminChatId = config.telegram.adminChatId;

    if (String(ctx.from.id) !== String(adminChatId)) {
      return ctx.answerCallbackQuery({
        text: "Siz admin emassiz!",
        show_alert: true,
      });
    }

    try {
      const request = await db("withdrawal_requests")
        .where({ id: requestId })
        .first();
      if (!request) {
        return ctx.answerCallbackQuery({
          text: "So'rov topilmadi!",
          show_alert: true,
        });
      }

      if (request.status !== "pending") {
        return ctx.answerCallbackQuery({
          text: "Ushbu so'rov allaqachon ko'rib chiqilgan!",
          show_alert: true,
        });
      }

      await ctx.answerCallbackQuery();

      // Adminni rad etish sababini yozishi uchun kutish holatiga o'tkazamiz
      ctx.session.step = `awaiting_rejection_reason_${requestId}`;

      await ctx.reply(
        `Iltimos, ushbu so'rovni rad etish sababini yozib yuboring (Masalan: <i>Karta raqami noto'g'ri kiritilgan</i>):`,
        { parse_mode: "HTML" }
      );

      // Admin xabarini inline tugmalarsiz yangilaymiz
      const student = await db("students").where({ id: request.student_id }).first();
      await ctx.editMessageText(
        `⏳ <b>Pul yechish so'rovi rad etilmoqda (Sababi kutilmoqda...)</b>\n\n` +
        `• <b>Talaba:</b> ${escapeHtml(student.first_name)}\n` +
        `• <b>Summa:</b> ${request.amount} so'm\n` +
        `• <b>Karta:</b> <code>${escapeHtml(request.card_number)}</code>`,
        { parse_mode: "HTML" },
        )
        .catch(() => {});
    } catch (error) {
      console.error("Rad etish callbackida xatolik:", error);
      await ctx.answerCallbackQuery({
        text: "Xatolik yuz berdi.",
        show_alert: true,
      });
    }
  });

  bot.callbackQuery("withdraw_use_saved_card", async (ctx) => {
    const telegramId = ctx.from.id;
    const amount = ctx.session.withdrawAmount;

    if (!amount) {
      return ctx.answerCallbackQuery({
        text: "Sessiya muddati tugagan. Iltimos qaytadan urinib ko'ring.",
        show_alert: true,
      });
    }

    try {
      const student = await db("students")
        .where({ telegram_id: telegramId })
        .first();
      if (!student || !student.card_number) {
        return ctx.answerCallbackQuery({
          text: "Saqlangan karta topilmadi!",
          show_alert: true,
        });
      }

      if (amount > student.balance) {
        ctx.session.step = "idle";
        ctx.session.withdrawAmount = null;
        await ctx.deleteMessage().catch(() => {});
        return ctx.reply("Xatolik: Balansingiz yetarli emas.", {
          reply_markup: mainMenu,
        });
      }

      await ctx.answerCallbackQuery({ text: "So'rov yuborilmoqda..." });
      await ctx.deleteMessage().catch(() => {});

      const cardNumber = student.card_number;

      // 1. Balansni kamaytiramiz (muzlatamiz)
      await db("students")
        .where({ id: student.id })
        .decrement("balance", amount);

      // 2. Yechish so'rovini bazaga qo'shamiz
      const [request] = await db("withdrawal_requests")
        .insert({
          student_id: student.id,
          amount: amount,
          card_number: cardNumber,
          status: "pending",
        })
        .returning("*");

      // Sessiyani tozalaymiz
      ctx.session.step = "idle";
      ctx.session.withdrawAmount = null;

      await ctx.reply(
          `✅ <b>Yechib olish so'rovi qabul qilindi!</b>\n\n` +
          `• <b>Summa:</b> ${amount} so'm\n` +
          `• <b>Karta raqami:</b> ${escapeHtml(cardNumber)}\n\n` +
          `Tez orada so'rov ko'rib chiqiladi va kartangizga pul o'tkaziladi. Rahmat!`,
          { reply_markup: mainMenu, parse_mode: "HTML" },
      );

      // 3. Adminga xabar berish
      if (config.telegram.adminChatId) {
        const adminKeyboard = new InlineKeyboard()
          .text(
            "✅ Tasdiqlash (To'landi)",
            `admin_approve_withdraw_${request.id}`,
          )
          .row()
          .text("❌ Rad etish", `admin_reject_withdraw_${request.id}`);

        await ctx.api
          .sendMessage(
            config.telegram.adminChatId,
            `💸 <b>Yangi pul yechish so'rovi!</b>\n\n` +
              `• <b>Talaba:</b> ${escapeHtml(student.first_name)}\n` +
              `• <b>Telegram ID:</b> ${student.telegram_id}\n` +
              `• <b>Telefon:</b> ${escapeHtml(student.phone_number)}\n` +
              `• <b>Summa:</b> ${amount} so'm\n` +
              `• <b>Karta:</b> <code>${escapeHtml(cardNumber)}</code>`,
            {
              reply_markup: adminKeyboard,
              parse_mode: "HTML",
            },
          )
          .catch((err) => {
            console.error("Adminga yechish so'rovini yuborishda xatolik:", err);
          });
      }
    } catch (error) {
      console.error("Saqlangan karta bilan yechishda xatolik:", error);
      ctx.session.step = "idle";
      ctx.session.withdrawAmount = null;
      return ctx.reply(
        "Tizimda xatolik yuz berdi. Iltimos keyinroq qayta urinib ko'ring.",
        { reply_markup: mainMenu },
      );
    }
  });

  bot.callbackQuery("withdraw_enter_new_card", async (ctx) => {
    if (!ctx.session.withdrawAmount) {
      return ctx.answerCallbackQuery({
        text: "Sessiya muddati tugagan.",
        show_alert: true,
      });
    }

    await ctx.answerCallbackQuery();
    await ctx.deleteMessage().catch(() => {});

    ctx.session.step = "awaiting_card_number";
    await ctx.reply(
      "Yaxshi. Yangi 16 xonali Uzcard yoki Humo karta raqamingizni kiriting:",
    );
  });
}

module.exports = setupWithdrawHandler;
