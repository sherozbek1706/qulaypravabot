const { InputFile, InlineKeyboard } = require("grammy");
const { db } = require("../db");
const config = require("../shared/config");
const XLSX = require("xlsx");
const { escapeHtml } = require("../utils");

function setupAdminHandler(bot) {
  // Admin ekanligini tekshirish uchun yordamchi funksiya
  function isAdmin(telegramId) {
    return (
      config.telegram.adminChatId &&
      String(telegramId) === String(config.telegram.adminChatId)
    );
  }

  // Admin inline menyusi
  const adminMenu = new InlineKeyboard()
    .text("📊 Statistika", "admin_stats")
    .text("📥 Foydalanuvchilar (Excel)", "admin_get_users")
    .row()
    .text("📢 Xabar yuborish (Broadcast)", "admin_broadcast")
    .text("⏳ Kutilayotgan to'lovlar", "admin_pending_withdraws")
    .row();

  // Statistika handler
  bot.callbackQuery("admin_stats", async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.answerCallbackQuery({ text: "Siz admin emassiz!", show_alert: true });
    }
    
    await ctx.answerCallbackQuery({ text: "Hisoblanmoqda..." });

    try {
      const totalUsersReq = db("students").count("id as count").first();
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split("T")[0]; // YYYY-MM-DD
      const todayUsersReq = db("students").where("created_at", ">=", todayStr).count("id as count").first();
      
      const totalBalanceReq = db("students").sum("balance as total").first();
      
      const paidOutReq = db("withdrawal_requests").where("status", "approved").sum("amount as total").first();

      const [totalUsers, todayUsers, totalBalance, paidOut] = await Promise.all([
        totalUsersReq, 
        todayUsersReq, 
        totalBalanceReq, 
        paidOutReq
      ]);

      const text = `📊 <b>Tizim qisqacha statistikasi:</b>\n\n` +
        `👥 <b>Jami ro'yxatdan o'tganlar:</b> ${totalUsers.count || 0} ta\n` +
        `🆕 <b>Bugun qo'shilganlar:</b> ${todayUsers.count || 0} ta\n\n` +
        `💰 <b>Foydalanuvchilar balansidagi jami pul:</b> ${totalBalance.total || 0} so'm\n` +
        `💸 <b>Hozirgacha to'lab berilgan pul:</b> ${paidOut.total || 0} so'm`;

      await ctx.reply(text, { parse_mode: "HTML" });
    } catch (error) {
      console.error("Statistika xatosi:", error);
      await ctx.reply("Statistikani hisoblashda xatolik yuz berdi.");
    }
  });

  // Kutilayotgan to'lovlar handler
  bot.callbackQuery("admin_pending_withdraws", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery({ text: "Siz admin emassiz!", show_alert: true });

    await ctx.answerCallbackQuery({ text: "Ma'lumotlar olinmoqda..." });

    try {
      const pendingCountReq = await db("withdrawal_requests").where("status", "pending").count("id as count").first();
      const count = pendingCountReq ? pendingCountReq.count : 0;

      if (count === 0) {
        return ctx.reply("✅ Kutilayotgan to'lovlar yo'q! Barchasi to'lab berilgan yoki rad etilgan.");
      }

      const pendingList = await db("withdrawal_requests")
        .join("students", "withdrawal_requests.student_id", "students.id")
        .select(
          "withdrawal_requests.id", 
          "withdrawal_requests.amount", 
          "withdrawal_requests.card_number", 
          "withdrawal_requests.created_at", 
          "students.first_name", 
          "students.phone_number"
        )
        .where("withdrawal_requests.status", "pending")
        .orderBy("withdrawal_requests.created_at", "asc")
        .limit(5);

      await ctx.reply(`⏳ <b>Jami kutilayotgan to'lovlar: ${count} ta.</b>\n<i>Quyida shulardan eng eski 5 tasi keltirilgan. Ularni to'g'ridan-to'g'ri shu yerdan tasdiqlashingiz yoki rad etishingiz mumkin:</i>`, { parse_mode: "HTML" });

      for (const req of pendingList) {
        const date = new Date(req.created_at).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" });
        
        const text = `💸 <b>To'lov so'rovi!</b>\n\n` +
          `• <b>Talaba:</b> ${escapeHtml(req.first_name)}\n` +
          `• <b>Telefon:</b> ${escapeHtml(req.phone_number)}\n` +
          `• <b>Summa:</b> ${req.amount} so'm\n` +
          `• <b>Karta:</b> <code>${escapeHtml(req.card_number)}</code>\n` +
          `• <b>Sana:</b> ${date}`;

        const adminKeyboard = new InlineKeyboard()
          .text("✅ Tasdiqlash (To'landi)", `admin_approve_withdraw_${req.id}`)
          .row()
          .text("❌ Rad etish", `admin_reject_withdraw_${req.id}`);

        await ctx.reply(text, {
          reply_markup: adminKeyboard,
          parse_mode: "HTML"
        });
        
        await new Promise(res => setTimeout(res, 50));
      }

    } catch (error) {
      console.error("Pending withdraws xatosi:", error);
      ctx.reply("Ma'lumotlarni olishda xatolik yuz berdi.");
    }
  });

  // Excel faylini yuklab olish callback query handler
  bot.callbackQuery("admin_get_users", async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.answerCallbackQuery({
        text: "Siz admin emassiz!",
        show_alert: true,
      });
    }

    await ctx.answerCallbackQuery({ text: "Fayl tayyorlanmoqda..." });

    try {
      // Barcha talabalarni bazadan olish
      const students = await db("students")
        .select("*")
        .orderBy("id", "asc");

      if (students.length === 0) {
        return ctx.reply("Hozircha ro'yxatdan o'tgan foydalanuvchilar yo'q.");
      }

      // Ma'lumotlarni Excel uchun formatlash
      const data = students.map((s) => ({
        "ID": s.id,
        "Telegram ID": s.telegram_id,
        "Ism": s.first_name,
        "Telefon raqami": s.phone_number,
        "Balans (so'm)": s.balance || 0,
        "Karta raqami": s.card_number || "Kiritilmagan",
        "Taklif qilgan (Referrer ID)": s.referred_by || "Yo'q",
        "Ro'yxatdan o'tgan vaqti": s.created_at
          ? new Date(s.created_at).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })
          : "",
      }));

      // Excel kitobini (Workbook) yaratish
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Foydalanuvchilar");

      // Ustunlar kengligini sozlash
      worksheet["!cols"] = [
        { wch: 8 },  // ID
        { wch: 15 }, // Telegram ID
        { wch: 25 }, // Ism
        { wch: 18 }, // Telefon raqami
        { wch: 15 }, // Balans (so'm)
        { wch: 20 }, // Karta raqami
        { wch: 25 }, // Taklif qilgan (Referrer ID)
        { wch: 22 }, // Ro'yxatdan o'tgan vaqti
      ];

      // Excel faylini bufferga yozish
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      // Admin'ga faylni yuborish
      await ctx.replyWithDocument(
        new InputFile(buffer, `foydalanuvchilar_${Date.now()}.xlsx`),
        {
          caption: `📊 Jami ro'yxatdan o'tgan foydalanuvchilar soni: ${students.length} ta`,
        }
      );
    } catch (error) {
      console.error("Excel fayl yaratishda xatolik:", error);
      await ctx.reply("Fayl yaratishda xatolik yuz berdi. Iltimos keyinroq qayta urinib ko'ring.");
    }
  });
  // Broadcast tugmasi bosilganda
  bot.callbackQuery("admin_broadcast", async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.answerCallbackQuery({
        text: "Siz admin emassiz!",
        show_alert: true,
      });
    }

    ctx.session.step = "awaiting_broadcast_message";
    await ctx.answerCallbackQuery();
    await ctx.reply("📢 Barcha foydalanuvchilarga yubormoqchi bo'lgan xabaringizni yuboring (matn, rasm, video va h.k.):", {
      reply_markup: new InlineKeyboard().text("❌ Bekor qilish", "admin_cancel_broadcast")
    });
  });

  // Broadcastni bekor qilish
  bot.callbackQuery("admin_cancel_broadcast", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    if (ctx.session.step === "awaiting_broadcast_message") {
      ctx.session.step = "idle";
      await ctx.editMessageText("❌ Xabar tarqatish bekor qilindi.");
    }
  });

  // Broadcast xabarini qabul qilish va tarqatish
  bot.on("message", async (ctx, next) => {
    if (ctx.session && ctx.session.step === "awaiting_broadcast_message" && isAdmin(ctx.from.id)) {
      ctx.session.step = "idle"; // Xabarni oldik, endi boshqa narsa kutmaymiz

      await ctx.reply("⏳ Xabar tarqatish boshlandi... Iltimos kuting, bu biroz vaqt olishi mumkin.");

      try {
        const students = await db("students").select("id", "telegram_id", "first_name", "phone_number");
        
        let successCount = 0;
        let failCount = 0;
        let deletedUsers = [];

        for (const student of students) {
          try {
            await ctx.copyMessage(student.telegram_id);
            successCount++;
          } catch (err) {
            failCount++;
            // Agar foydalanuvchi botni bloklagan bo'lsa yoki chat o'chirilgan bo'lsa, uni bazadan o'chirib yuboramiz
            if (err.description && (err.description.includes("bot was blocked by the user") || err.description.includes("user is deactivated") || err.description.includes("chat not found"))) {
              deletedUsers.push(`${student.first_name || "Noma'lum ism"} - ${student.phone_number || "Raqam yo'q"}`);
              await db("students").where({ id: student.id }).del().catch(console.error);
            }
          }
          // Telegram limitlariga tushmaslik uchun kutish (50ms)
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        await ctx.reply(
          `✅ <b>Xabar tarqatish yakunlandi!</b>\n\n` +
          `📊 <b>Natijalar:</b>\n` +
          `• Muvaffaqiyatli yetkazildi: ${successCount} ta\n` +
          `• Xatolik (bloklagan va bazadan o'chirildi): ${failCount} ta`,
          { parse_mode: "HTML" }
        );

        if (deletedUsers.length > 0) {
          const deletedListText = deletedUsers.join("\n");
          const buffer = Buffer.from(deletedListText, "utf-8");
          await ctx.replyWithDocument(
            new InputFile(buffer, `ochirilgan_foydalanuvchilar_${Date.now()}.txt`),
            {
              caption: `🗑 ${deletedUsers.length} ta foydalanuvchi botni bloklagani uchun bazadan o'chirildi. Ularning ro'yxati ushbu faylda keltirilgan.`
            }
          );
        }

      } catch (error) {
        console.error("Broadcast xatosi:", error);
        await ctx.reply("Xabar tarqatish jarayonida kutilmagan xatolik yuz berdi.");
      }
      return; // Xabar broadcast uchun ishlatildi, boshqa handlerlarga o'tmaydi
    }
    await next();
  });
}

module.exports = setupAdminHandler;
