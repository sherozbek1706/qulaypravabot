const { InlineKeyboard, InputFile } = require("grammy");
const { db } = require("../db");
const config = require("../shared/config");
const fs = require("fs");
const path = require("path");

async function sendNextQuestion(ctx) {
  // Sessiya yo'q bo'lsa xatolik bermasligi uchun himoya
  if (!ctx.session.quiz) return;

  const quiz = ctx.session.quiz;
  const currentQuestion = quiz.questions[quiz.currentIndex];

  // Agar barcha 15 ta savol tugagan bo'lsa
  if (!currentQuestion) {
    const total = quiz.questions.length;
    const correct = quiz.correctAnswers;

    // Natijani bazaga saqlaymiz
    try {
      const telegramId = ctx.from.id;
      const student = await db("students").where({ telegram_id: telegramId }).first();
      if (student) {
        await db("attempts").insert({
          student_id: student.id,
          correct_answers: correct,
          total_questions: total
        });
      }
    } catch (dbError) {
      console.error("Natijani saqlashda xatolik:", dbError);
    }

    // Yana test ishlash uchun tugma yasaymiz
    const restartKeyboard = new InlineKeyboard().text(
      "🔄 Yana davom ettirish",
      "restart_quiz",
    );

    // Natijani ko'rsatamiz va tugmani qo'shamiz
    await ctx.reply(
      `🎉 **Test yakunlandi!**\n\nSiz ${total} ta savoldan **${correct}** tasiga to'g'ri javob berdingiz.\n\nYana test ishlashni xohlaysizmi?`,
      {
        reply_markup: restartKeyboard,
        parse_mode: "Markdown",
      },
    );
    console.log("Keldik tozalaymiz");

    // Sessiyani tozalaymiz
    ctx.session.quiz = null;
    return;
  }

  // Variantlardan tugmalar yasaymiz
  const keyboard = new InlineKeyboard();
  currentQuestion.options.forEach((opt, index) => {
    // Tugmaga variant matnini (content) qo'yamiz.
    // callback_data ga esa variantning ID'sini berib yuboramiz.
    keyboard.text(opt.content, `ans_${opt.id}`).row();
  });

  const questionText = `❓ **${quiz.currentIndex + 1}-savol:**\n\n${currentQuestion.content}`;

  // Rasm bor-yo'qligini tekshirib, shunga qarab jo'natamiz
  if (currentQuestion.image_url) {
    let photoInput;
    const baseUrl = config.backendUrl || "http://localhost:5000";
    
    // Agar lokal rejimda bo'lsak va backend fayl tizimida rasm bo'lsa, uni fayl sifatida yuboramiz (Telegram localhost linklarni yuklay olmaydi)
    const localBackendPath = "c:\\Users\\SHE'ROZBEK\\Desktop\\new-test-app\\backend";
    const localFilePath = path.join(localBackendPath, currentQuestion.image_url);
    
    if ((baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1")) && fs.existsSync(localFilePath)) {
      photoInput = new InputFile(localFilePath);
    } else {
      let imageUrl = currentQuestion.image_url;
      if (!imageUrl.startsWith("http")) {
        const separator = imageUrl.startsWith("/") ? "" : "/";
        imageUrl = `${baseUrl}${separator}${imageUrl}`;
      }
      photoInput = imageUrl;
    }

    try {
      await ctx.replyWithPhoto(photoInput, {
        caption: questionText,
        reply_markup: keyboard,
        parse_mode: "Markdown",
      });
    } catch (photoError) {
      console.warn("Rasm yuborishda xatolik, matn ko'rinishida yuborilmoqda:", photoError.message);
      // Fallback to text message
      await ctx.reply(questionText + "\n\n*(Eslatma: Rasm yuklanmadi)*", {
        reply_markup: keyboard,
        parse_mode: "Markdown",
      });
    }
  } else {
    await ctx.reply(questionText, {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    });
  }
}

module.exports = sendNextQuestion;
