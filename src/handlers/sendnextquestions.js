const { InlineKeyboard, InputFile } = require("grammy");
const { db } = require("../db");
const config = require("../shared/config");
const fs = require("fs");
const path = require("path");
const { mainMenu } = require("../keyboards");
const { escapeHtml } = require("../utils");

async function sendNextQuestion(ctx) {
  // Sessiya yo'q bo'lsa xatolik bermasligi uchun himoya
  if (!ctx.session.quiz) return;

  const quiz = ctx.session.quiz;
  const currentQuestion = quiz.questions[quiz.currentIndex];

  let waitMsgId = null;

  // Agar barcha 15 ta savol tugagan bo'lsa
  if (!currentQuestion) {
    const total = quiz.questions.length;
    const correct = quiz.correctAnswers;

    // Natijani bazaga saqlaymiz
    let rewardAmount = 0;
    try {
      const telegramId = ctx.from.id;
      const student = await db("students")
        .where({ telegram_id: telegramId })
        .first();
      if (student) {
        await db("attempts").insert({
          student_id: student.id,
          correct_answers: correct,
          total_questions: total,
        });

        rewardAmount = correct * (config.rewards.correctAnswer || 30);
        if (rewardAmount > 0) {
          await db("students")
            .where({ id: student.id })
            .increment("balance", rewardAmount);
        }
      }
    } catch (dbError) {
      console.error("Natijani saqlashda xatolik:", dbError);
    }

    await ctx.reply(`🎉`);
    // Yana test ishlash uchun tugma yasaymiz
    const restartKeyboard = new InlineKeyboard().text(
      "🔄 Yana davom ettirish",
      "restart_quiz",
    );

    // Asosiy menyuni qaytaramiz
    let replyMsg = `🎉 <b>Test yakunlandi!</b>\n\nSiz ${total} ta savoldan <b>${correct}</b> tasiga to'g'ri javob berdingiz.\n`;
    if (rewardAmount > 0) {
      replyMsg += `💰 Hisobingizga <b>+${rewardAmount} so'm</b> qo'shildi!\n`;
    }
    replyMsg += `\nYana test ishlashni xohlaysizmi?`;

    // Natijani ko'rsatamiz va tugmani qo'shamiz
    await ctx.reply(replyMsg, {
      reply_markup: restartKeyboard,
      parse_mode: "HTML",
    });

    // Asosiy menyuni qaytaramiz
    await ctx.reply("Menyu:", {
      reply_markup: mainMenu,
    });

    // Sessiyani tozalaymiz
    ctx.session.quiz = null;
    return;
  }

  // Savollar orasida (ikkinchi savoldan boshlab) qumsoat animatsiyasi
  if (quiz.currentIndex > 0 && currentQuestion) {
    try {
      // const waitMsg = await ctx.reply("⏳ <b>Keyingi savol yuklanmoqda...</b>", { parse_mode: "HTML" });
      const waitMsg = await ctx.reply("⏳");
      waitMsgId = waitMsg.message_id;
    } catch (e) {
      console.error("Animatsiya xatosi:", e);
    }
  }

  // Variantlardan tugmalar yasaymiz
  const keyboard = new InlineKeyboard();
  currentQuestion.options.forEach((opt, index) => {
    // Tugmaga variant matnini (content) qo'yamiz.
    // callback_data ga esa variantning ID'sini berib yuboramiz.
    keyboard.text(opt.content, `ans_${opt.id}`).row();
  });

  const questionText = `❓ <b>${quiz.currentIndex + 1}-savol:</b>\n\n${escapeHtml(currentQuestion.content)}`;

  // Rasm bor-yo'qligini tekshirib, shunga qarab jo'natamiz
  if (currentQuestion.image_url) {
    let photoInput;
    const baseUrl = config.backendUrl || "http://localhost:5000";

    // Agar lokal rejimda bo'lsak va backend fayl tizimida rasm bo'lsa, uni fayl sifatida yuboramiz (Telegram localhost linklarni yuklay olmaydi)
    const localBackendPath = config.localBackendPath;
    const localFilePath = path.join(
      localBackendPath,
      currentQuestion.image_url,
    );

    let imageUrl = currentQuestion.image_url;
    if (!imageUrl.startsWith("http")) {
      const cleanedBaseUrl = baseUrl.endsWith("/")
        ? baseUrl.slice(0, -1)
        : baseUrl;
      const cleanedImageUrl = imageUrl.startsWith("/")
        ? imageUrl.slice(1)
        : imageUrl;
      imageUrl = `${cleanedBaseUrl}/${cleanedImageUrl}`;
    }

    if (fs.existsSync(localFilePath)) {
      photoInput = new InputFile(localFilePath);
    } else {
      photoInput = imageUrl;
    }

    try {
      const msg = await ctx.replyWithPhoto(photoInput, {
        caption: questionText,
        reply_markup: keyboard,
        parse_mode: "HTML",
      });
      if (ctx.session.quiz) {
        ctx.session.quiz.lastMessageId = msg.message_id;
      }
    } catch (photoError) {
      console.warn(
        `Rasm yuborishda xatolik (URL: ${imageUrl}), matn ko'rinishida yuborilmoqda:`,
        photoError.message,
      );
      // Fallback to text message
      const msg = await ctx.reply(
        questionText + "\n\n<b>(Eslatma: Rasm yuklanmadi)</b>",
        {
          reply_markup: keyboard,
          parse_mode: "HTML",
        },
      );
      if (ctx.session.quiz) {
        ctx.session.quiz.lastMessageId = msg.message_id;
      }
    }
  } else {
    const msg = await ctx.reply(questionText, {
      reply_markup: keyboard,
      parse_mode: "HTML",
    });
    if (ctx.session.quiz) {
      ctx.session.quiz.lastMessageId = msg.message_id;
    }
  }

  // Keyingi savol to'liq yuborib bo'lingach, qumsoatni o'chiramiz
  if (waitMsgId) {
    await ctx.api.deleteMessage(ctx.chat.id, waitMsgId).catch(() => {});
  }
}

module.exports = sendNextQuestion;
