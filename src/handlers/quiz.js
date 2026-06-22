const { InlineKeyboard } = require("grammy");
const { db, testdb } = require("../db");
const { mainMenu, quizMenu } = require("../keyboards");
const config = require("../shared/config");

const sendNextQuestion = require("./sendnextquestions");
const { escapeHtml } = require("../utils");

async function startNewQuiz(ctx) {
  try {
    // Reply keyboard ni "Testni yakunlash" ga o'zgartiramiz
    await ctx.reply("Test boshlandi. Omad! 🎯", {
      reply_markup: quizMenu,
    });

    // 1. Bazadan 15 ta random savolni tortib olish
    const questions = await testdb("questions")
      .orderByRaw("RANDOM()")
      .limit(15);

    if (!questions || questions.length === 0) {
      return ctx.reply("Bazada savollar topilmadi.");
    }

    // 2. Olingan 15 ta savolning ID'larini bitta array'ga yig'amiz
    const questionIds = questions.map((q) => q.id);

    // 3. Faqatgina shu 15 ta savolga tegishli variantlarni (options) bitta query bilan olamiz
    const options = await testdb("options").whereIn(
      "question_id",
      questionIds,
    );

    // 4. Savollar va variantlarni bitta butun obyekt qilib birlashtiramiz
    const rawQuizData = questions.map((q) => {
      return {
        ...q, // savolning hamma ma'lumotlari
        options: options.filter((opt) => opt.question_id === q.id), // shu savolning variantlari
      };
    });

    // Bazadan kelgan obyektlarni oddiy JavaScript obyektlariga aylantirib (tozalab) olamiz
    const cleanQuizData = JSON.parse(JSON.stringify(rawQuizData));
    
    // 5. Tayyor bo'lgan va tozalangan ma'lumotni sessiyaga saqlaymiz
    ctx.session.quiz = {
      questions: cleanQuizData,
      currentIndex: 0,
      correctAnswers: 0,
    };


    // 6. Birinchi savolni ekranga ko'rsatish
    await sendNextQuestion(ctx);
  } catch (error) {
    console.error("Testlarni yig'ishda xatolik:", error);
    ctx.reply("Tizimda xatolik yuz berdi. Iltimos, qayta urinib ko'ring.");
  }
}

function setupQuizHandler(bot) {
  bot.hears("🚀 Testni boshlash", async (ctx) => {
    await startNewQuiz(ctx);
  });

  bot.callbackQuery(/^ans_(\d+)$/, async (ctx) => {
    const quiz = ctx.session.quiz;

    // Agar foydalanuvchi eski xabardagi tugmani bossa-yu, sessiyada test bo'lmasa
    if (!quiz || !quiz.questions) {
      return ctx.answerCallbackQuery({
        text: "Test allaqachon yakunlangan yoki xatolik yuz berdi.",
        show_alert: true,
      });
    }

    // Bosilgan variant ID sini ajratib olamiz
    const optionId = parseInt(ctx.match[1]);
    const currentQuestion = quiz.questions[quiz.currentIndex];

    // Savolning variantlari ichidan foydalanuvchi bosganini topamiz
    const selectedOption = currentQuestion.options.find(
      (opt) => opt.id == optionId,
    );

    if (!selectedOption) {
      return ctx.answerCallbackQuery("Variant topilmadi.");
    }

    // 1. Javob to'g'ri yoki noto'g'riligini tekshiramiz va fikr bildiramiz
    if (selectedOption.is_correct) {
      quiz.correctAnswers++;
      await ctx.answerCallbackQuery({
        text: "✅ To'g'ri javob!",
        show_alert: false,
      });

      // Chatdagi eski savol va rasmni o'chirib tashlaymiz
      await ctx.deleteMessage().catch(() => {});

      // Keyingi savolga o'tamiz
      quiz.currentIndex++;
      await sendNextQuestion(ctx);
    } else {
      await ctx.answerCallbackQuery({
        text: "❌ Noto'g'ri javob!",
        show_alert: false,
      });

      // To'g'ri javob variantini topamiz
      const correctOption = currentQuestion.options.find((opt) => opt.is_correct);
      const correctContent = correctOption ? correctOption.content : "";
      const explanation = correctOption ? correctOption.explanation : null;

      // Izoh matnini shakllantiramiz (savol matni bilan birga)
      let messageText = `❓ <b>${quiz.currentIndex + 1}-savol:</b>\n\n${escapeHtml(currentQuestion.content)}\n\n`;
      messageText += `❌ <b>Siz tanlagan javob:</b> <s>${escapeHtml(selectedOption.content)}</s>\n`;
      messageText += `✅ <b>To'g'ri javob:</b> <b>${escapeHtml(correctContent)}</b>\n\n`;

      if (explanation && explanation.trim()) {
        messageText += `📖 <b>Izoh:</b>\n${escapeHtml(explanation)}`;
      } else {
        messageText += `📖 <b>Izoh:</b> Ushbu savol uchun izoh kiritilmagan.`;
      }

      const nextKeyboard = new InlineKeyboard()
        .text("➡️ Keyingi savol", "next_question")
        .row()
        .text("❌ Testni yakunlash", "stop_quiz");

      // Keyingi savolga o'tish uchun indexni oshirib qo'yamiz
      quiz.currentIndex++;

      if (currentQuestion.image_url) {
        await ctx.editMessageCaption({
          caption: messageText,
          reply_markup: nextKeyboard,
          parse_mode: "HTML",
        }).catch(async (err) => {
          // Agar rasm yuborishda xatolik yuz berib, savol matn bo'lib ketgan bo'lsa, editMessageText ni sinab ko'ramiz
          await ctx.editMessageText(messageText, {
            reply_markup: nextKeyboard,
            parse_mode: "HTML",
          }).catch(async (err2) => {
            // Agar u ham o'xshamasa, xabarni o'chirib yangisini yuboramiz
            await ctx.deleteMessage().catch(() => {});
            await ctx.reply(messageText, {
              reply_markup: nextKeyboard,
              parse_mode: "HTML",
            });
          });
        });
      } else {
        await ctx.editMessageText(messageText, {
          reply_markup: nextKeyboard,
          parse_mode: "HTML",
        }).catch(async (err) => {
          await ctx.deleteMessage().catch(() => {});
          await ctx.reply(messageText, {
            reply_markup: nextKeyboard,
            parse_mode: "HTML",
          });
        });
      }
    }
  });

  bot.callbackQuery("next_question", async (ctx) => {
    await ctx.answerCallbackQuery();
    
    // Agar sessiyada test ma'lumotlari bo'lmasa, hech narsa qilmaymiz
    if (!ctx.session.quiz) return;

    // Izoh xabarini o'chirib tashlaymiz
    await ctx.deleteMessage().catch(() => {});

    // Keyingi savolni yuboramiz
    await sendNextQuestion(ctx);
  });

  bot.callbackQuery("restart_quiz", async (ctx) => {
    // Tugma bosilgandagi "loading" animatsiyani to'xtatish
    await ctx.answerCallbackQuery();

    // Eski natija xabarini o'chirib tashlaymiz
    await ctx.deleteMessage().catch(() => {});

    // Testni qayta boshlaymiz
    await startNewQuiz(ctx);
  });

  async function stopQuiz(ctx) {
    const quiz = ctx.session.quiz;
    if (!quiz) return;

    const currentIndex = quiz.currentIndex;
    const correct = quiz.correctAnswers;

    // Faol savol xabarini o'chirib tashlaymiz
    if (quiz.lastMessageId) {
      await ctx.api.deleteMessage(ctx.chat.id, quiz.lastMessageId).catch(() => {});
    }

    if (currentIndex > 0) {
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
            total_questions: currentIndex,
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

      const restartKeyboard = new InlineKeyboard().text(
        "🔄 Yangi test boshlash",
        "restart_quiz",
      );

      let replyMsg = `🛑 <b>Test to'xtatildi! (Muddatidan oldin yakunlandi)</b>\n\nSiz jami <b>${currentIndex}</b> ta savolga javob berdingiz va ulardan <b>${correct}</b> tasiga to'g'ri javob berdingiz.\n`;
      if (rewardAmount > 0) {
        replyMsg += `💰 Hisobingizga <b>+${rewardAmount} so'm</b> qo'shildi!\n`;
      }
      replyMsg += `\nYana test ishlashni xohlaysizmi?`;

      await ctx.reply(
        replyMsg,
        {
          reply_markup: restartKeyboard,
          parse_mode: "HTML",
        },
      );
    } else {
      await ctx.reply(
        `🛑 <b>Test bekor qilindi.</b>\n\nHali birorta ham savolga javob bermadingiz.`,
        {
          reply_markup: new InlineKeyboard().text(
            "🚀 Yangi test boshlash",
            "restart_quiz",
          ),
          parse_mode: "HTML",
        }
      );
    }

    // Asosiy menyuni tiklaymiz
    await ctx.reply("Menyu:", {
      reply_markup: mainMenu,
    });

    ctx.session.quiz = null;
  }

  bot.hears("❌ Testni yakunlash", async (ctx) => {
    await ctx.deleteMessage().catch(() => {});
    await stopQuiz(ctx);
  });

  bot.callbackQuery("stop_quiz", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.deleteMessage().catch(() => {});
    await stopQuiz(ctx);
  });

  bot.hears("📊 Mening natijalarim", async (ctx) => {
    const telegramId = ctx.from.id;

    try {
      const student = await db("students").where({ telegram_id: telegramId }).first();
      if (!student) {
        return ctx.reply("Siz hali ro'yxatdan o'tmagansiz. Iltimos, /start buyrug'ini yuboring.");
      }

      // Get attempts history
      const attempts = await db("attempts")
        .where({ student_id: student.id })
        .orderBy("created_at", "desc")
        .limit(10); // Show last 10 attempts

      let messageText = `💰 <b>Sizning balansingiz:</b> ${student.balance || 0} so'm\n\n`;

      if (!attempts || attempts.length === 0) {
        messageText += `📊 Siz hali biror marta test topshirmadingiz. Testni boshlash uchun 🚀 <b>Testni boshlash</b> tugmasini bosing.`;
      } else {
        messageText += `📊 <b>Sizning oxirgi natijalaringiz (maksimum 10 ta):</b>\n\n`;
        attempts.forEach((att, index) => {
          const date = new Date(att.created_at).toLocaleDateString("uz-UZ", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          });
          const percent = Math.round((att.correct_answers / att.total_questions) * 100);
          messageText += `${index + 1}. 📅 ${date}\n   Natija: <b>${att.correct_answers} / ${att.total_questions}</b> (${percent}%)\n\n`;
        });
      }

      await ctx.reply(messageText, { parse_mode: "HTML" });
    } catch (error) {
      console.error("Natijalarni olishda xatolik:", error);
      ctx.reply("Tizimda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring.");
    }
  });
}

module.exports = setupQuizHandler;
