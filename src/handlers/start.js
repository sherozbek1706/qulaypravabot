const { db } = require("../db");
const { Keyboard, InlineKeyboard } = require("grammy");
const config = require("../shared/config");
const { escapeHtml } = require("../utils");

const { mainMenu } = require("../keyboards");
function setupStartHandler(bot) {
  bot.command("start", async (ctx) => {
    const telegramId = ctx.from.id;

    try {
      const isAdmin = config.telegram.adminChatId && String(telegramId) === String(config.telegram.adminChatId);

      if (isAdmin) {
        ctx.session.step = "idle";

        const adminMenu = new InlineKeyboard()
          .text("📊 Statistika", "admin_stats")
          .text("📥 Foydalanuvchilar (Excel)", "admin_get_users")
          .row()
          .text("📢 Xabar yuborish (Broadcast)", "admin_broadcast")
          .text("⏳ Kutilayotgan to'lovlar", "admin_pending_withdraws")
          .row();

        await ctx.reply(
          `Salom, Admin! Tizimga xush kelibsiz!\n\nBoshqaruv paneli:`,
          { reply_markup: adminMenu }
        );

        return ctx.reply("Asosiy menyu:", { reply_markup: mainMenu });
      }

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

      // Referral payloadni tekshiramiz
      const payload = ctx.match;
      if (payload) {
        const match = payload.match(/^(?:ref_)?(\d+)$/);
        if (match) {
          const referrerId = Number(match[1]);
          if (String(referrerId) !== String(telegramId)) {
            const referrerExists = await db("students").where({ telegram_id: referrerId }).first();
            if (referrerExists) {
              ctx.session.referredBy = referrerId;
            }
          }
        }
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
        const referredBy = ctx.session.referredBy || null;
        const initialBalance = referredBy ? config.rewards.invitee : 0;

        await db("students").insert({
          telegram_id: telegramId,
          first_name: ctx.session.tempName,
          phone_number: contact.phone_number,
          referred_by: referredBy,
          balance: initialBalance,
        });

        const registeredName = ctx.session.tempName;

        ctx.session.step = "idle";
        ctx.session.tempName = null;
        ctx.session.referredBy = null;

        let welcomeText = "Tabriklaymiz, ro'yxatdan muvaffaqiyatli o'tdingiz! 🎉";
        if (referredBy) {
          welcomeText += `\n\n💰 Do'stingiz taklifi bilan qo'shilganingiz uchun hisobingizga <b>${config.rewards.invitee} so'm</b> start bonusi qo'shildi!`;
        }

        await ctx.reply(
          welcomeText,
          {
            reply_markup: mainMenu, // Ekranning pastidagi tugmani olib tashlash
            parse_mode: "HTML",
          },
        );

        // Referrerga bildirishnoma yuborish
        if (referredBy) {
          try {
            await db("students")
              .where({ telegram_id: referredBy })
              .increment("balance", config.rewards.referrer);
          } catch (incError) {
            console.error("Referrer balansini oshirishda xatolik:", incError);
          }

          await ctx.api.sendMessage(
            referredBy,
            `🎉 <b>Tabriklaymiz!</b>\n\nDo'stingiz <b>${escapeHtml(registeredName)}</b> sizning taklif havolangiz orqali ro'yxatdan o'tdi!\n💰 Sizga <b>${config.rewards.referrer} so'm</b> taklif bonusi taqdim etildi!`,
            { parse_mode: "HTML" }
          ).catch((err) => {
            console.error("Referrerga xabar yuborishda xatolik:", err);
          });
        }

        // Adminga bildirishnoma yuborish
        if (config.telegram.adminChatId) {
          const username = ctx.from.username ? `@${escapeHtml(ctx.from.username)}` : "Mavjud emas";
          const adminMsg = `👤 <b>Yangi foydalanuvchi ro'yxatdan o'tdi!</b>\n\n` +
            `• <b>Ism:</b> ${escapeHtml(registeredName)}\n` +
            `• <b>Telefon:</b> ${escapeHtml(contact.phone_number)}\n` +
            `• <b>Telegram ID:</b> ${telegramId}\n` +
            `• <b>Username:</b> ${username}`;

          await ctx.api.sendMessage(config.telegram.adminChatId, adminMsg, {
            parse_mode: "HTML",
          }).catch((err) => {
            console.error("Adminga bildirishnoma yuborishda xatolik:", err);
          });
        }
      } catch (error) {
        console.log("Bazaga saqlashda xatolik: ", error);
        ctx.reply(
          "Ro'yxatdan o'tishda xatolik yuz berdi. Iltimos /start buyrug'ini qayta bering!",
        );
      }
    }
  });

  bot.hears("👥 Do'stlarni taklif qilish", async (ctx) => {
    const telegramId = ctx.from.id;

    try {
      const student = await db("students").where({ telegram_id: telegramId }).first();
      const balance = student ? (student.balance || 0) : 0;

      const result = await db("students")
        .where({ referred_by: telegramId })
        .count("id as count")
        .first();

      const count = result ? Number(result.count) : 0;
      const botUsername = escapeHtml(config.telegram.botUsername || "qulaypravabot");
      const refLink = `https://t.me/${botUsername}?start=ref_${telegramId}`;

      const messageText = `💰 <b>Sizning balansingiz:</b> ${balance} so'm\n\n` +
        `🔗 <b>Sizning taklif havolangiz:</b>\n` +
        `<code>${refLink}</code>\n\n` +
        `👥 <b>Siz taklif qilgan do'stlar soni:</b> ${count} ta\n\n` +
        `Havolani nusxalab olib, do'stlaringizga yoki guruhlarga ulashing. Har safar yangi do'stingiz ro'yxatdan o'tganda sizga xabar beriladi! 🎉`;

      const shareKeyboard = new InlineKeyboard().url(
        "🚀 Do'stlarga ulashish",
        `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent("Assalomu alaykum! Ushbu bot orqali siz haydovchilik guvohnomasi (prava) uchun haqiqiy imtihon testlariga bepul tayyorlanishingiz va buning ustiga pul ham ishlab topishingiz mumkin! Kiring va sinab ko'ring: 🚗💰")}`
      );

      await ctx.reply(messageText, {
        reply_markup: shareKeyboard,
        parse_mode: "HTML",
      });
    } catch (error) {
      console.error("Referral ma'lumotlarini olishda xatolik:", error);
      await ctx.reply("Ma'lumotlarni yuklashda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring.");
    }
  });
}

module.exports = setupStartHandler;
