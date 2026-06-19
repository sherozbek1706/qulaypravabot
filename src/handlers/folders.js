const { InlineKeyboard } = require("grammy");
const { testdb } = require("../db");
const sendNextQuestion = require("./sendnextquestions");

function setupFoldersHandler(bot) {
  // 1. "📂 Test papkalari" tugmasi bosilganda — papkalar ro'yxatini ko'rsatamiz
  bot.hears("📂 Test papkalari", async (ctx) => {
    try {
      const folders = await testdb("test_folders")
        .select("id", "name", "description")
        .orderBy("created_at", "desc");

      if (!folders || folders.length === 0) {
        return ctx.reply("Hozircha test papkalari mavjud emas.");
      }

      const keyboard = new InlineKeyboard();
      folders.forEach((folder) => {
        keyboard.text(`📁 ${folder.name}`, `folder_${folder.id}`).row();
      });

      await ctx.reply("📂 **Test papkalarini tanlang:**", {
        reply_markup: keyboard,
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error("Papkalarni olishda xatolik:", error);
      ctx.reply("Tizimda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring.");
    }
  });

  // 2. Papka tanlanganda — shu papka ichidagi testlarni ko'rsatamiz
  bot.callbackQuery(/^folder_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();

    try {
      const folderId = parseInt(ctx.match[1]);

      const folder = await testdb("test_folders").where({ id: folderId }).first();
      if (!folder) {
        return ctx.reply("Papka topilmadi.");
      }

      const tests = await testdb("tests")
        .where({ folder_id: folderId, is_published: true })
        .select("id", "title", "description", "question_limit", "randomize_questions")
        .orderBy("created_at", "desc");

      if (!tests || tests.length === 0) {
        return ctx.reply(`📁 "${folder.name}" papkasida hozircha testlar mavjud emas.`);
      }

      const keyboard = new InlineKeyboard();
      tests.forEach((test) => {
        keyboard.text(`📝 ${test.title}`, `starttest_${test.id}`).row();
      });
      keyboard.text("⬅️ Ortga", "back_to_folders").row();

      // Eski xabarni yangilaymiz
      await ctx.editMessageText(
        `📁 **${folder.name}**\n${folder.description ? folder.description + "\n" : ""}\n📝 Testni tanlang:`,
        {
          reply_markup: keyboard,
          parse_mode: "Markdown",
        }
      );
    } catch (error) {
      console.error("Testlarni olishda xatolik:", error);
      ctx.reply("Tizimda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring.");
    }
  });

  // 3. "Ortga" tugmasi — papkalar ro'yxatiga qaytish
  bot.callbackQuery("back_to_folders", async (ctx) => {
    await ctx.answerCallbackQuery();

    try {
      const folders = await testdb("test_folders")
        .select("id", "name", "description")
        .orderBy("created_at", "desc");

      if (!folders || folders.length === 0) {
        return ctx.editMessageText("Hozircha test papkalari mavjud emas.");
      }

      const keyboard = new InlineKeyboard();
      folders.forEach((folder) => {
        keyboard.text(`📁 ${folder.name}`, `folder_${folder.id}`).row();
      });

      await ctx.editMessageText("📂 **Test papkalarini tanlang:**", {
        reply_markup: keyboard,
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error("Papkalarni olishda xatolik:", error);
      ctx.reply("Tizimda xatolik yuz berdi.");
    }
  });

  // 4. Test tanlanganda — savollarni sessiyaga yozib, testni boshlaymiz
  bot.callbackQuery(/^starttest_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();

    try {
      const testId = parseInt(ctx.match[1]);

      // Test ma'lumotlarini olamiz
      const test = await testdb("tests").where({ id: testId }).first();
      if (!test) {
        return ctx.reply("Test topilmadi.");
      }

      // Eski xabarni o'chiramiz
      await ctx.deleteMessage().catch(() => {});

      // test_questions orqali shu testga biriktirilgan savollarni olamiz
      let questionsQuery = testdb("questions")
        .join("test_questions", "questions.id", "test_questions.question_id")
        .where("test_questions.test_id", testId)
        .select("questions.*");

      // Agar randomize_questions bo'lsa aralashtirmiz, bo'lmasa order bo'yicha tartiblaymiz
      if (test.randomize_questions) {
        questionsQuery = questionsQuery.orderByRaw("RANDOM()");
      } else {
        questionsQuery = questionsQuery.orderBy("test_questions.order", "asc");
      }

      // Agar question_limit bo'lsa, shuncha savol olamiz
      if (test.question_limit) {
        questionsQuery = questionsQuery.limit(test.question_limit);
      }

      const questions = await questionsQuery;

      if (!questions || questions.length === 0) {
        return ctx.reply(`"${test.title}" testida savollar topilmadi.`);
      }

      // Savollarning variantlarini olamiz
      const questionIds = questions.map((q) => q.id);
      const options = await testdb("options").whereIn("question_id", questionIds);

      // Savollar va variantlarni birlashtiramiz
      const rawQuizData = questions.map((q) => {
        return {
          ...q,
          options: options.filter((opt) => opt.question_id === q.id),
        };
      });

      const cleanQuizData = JSON.parse(JSON.stringify(rawQuizData));

      // Sessiyaga saqlaymiz
      ctx.session.quiz = {
        questions: cleanQuizData,
        currentIndex: 0,
        correctAnswers: 0,
        testTitle: test.title,
      };

      await ctx.reply(`📝 **${test.title}** testi boshlandi!\n\n📊 Savollar soni: ${cleanQuizData.length}`, {
        parse_mode: "Markdown",
      });

      // Birinchi savolni yuboramiz
      await sendNextQuestion(ctx);
    } catch (error) {
      console.error("Testni boshlashda xatolik:", error);
      ctx.reply("Tizimda xatolik yuz berdi. Iltimos, qayta urinib ko'ring.");
    }
  });
}

module.exports = setupFoldersHandler;
