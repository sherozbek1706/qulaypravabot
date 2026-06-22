const { Keyboard } = require("grammy");

// Asosiy menyu tugmasini yasab olamiz
const mainMenu = new Keyboard()
  .text("🚀 Testni boshlash")
  .text("📂 Test papkalari")
  .row()
  .text("📊 Mening natijalarim")
  .row()
  .text("👥 Do'stlarni taklif qilish")
  .row()
  .text("💸 Pulni yechish")
  .resized();

// Test ishlayotganda ko'rsatiladigan klaviatura
const quizMenu = new Keyboard().text("❌ Testni yakunlash").resized();

module.exports = { mainMenu, quizMenu };
