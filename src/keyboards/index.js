const { Keyboard } = require("grammy");

// Asosiy menyu tugmasini yasab olamiz
const mainMenu = new Keyboard()
  .text("🚀 Testni boshlash")
  .row()
  .text("📂 Test papkalari")
  .row()
  .text("📊 Mening natijalarim")
  .resized();

module.exports = { mainMenu };
