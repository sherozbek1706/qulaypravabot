const { Bot } = require("grammy");
const { setupStartHandler, setupQuizHandler, setupFoldersHandler } = require("./src/handlers");
const sessionMiddleware = require("./src/middlewares/session");
const config = require("./src/shared/config");
const bot = new Bot(config.telegram.token);

bot.use(sessionMiddleware);

setupStartHandler(bot);
setupQuizHandler(bot);
setupFoldersHandler(bot);

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  console.error(e);
});

bot.start();
console.log("Qulay Prava boti muvaffaqiyatli ishga tushdi...");
