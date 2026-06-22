const dotenv = require("dotenv");

dotenv.config();

const config = {
  port: process.env.PORT,
  db: {
    port: process.env.DB_PORT,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  },
  testdb: {
    host: process.env.TEST_DB_HOST || "localhost",
    port: process.env.TEST_DB_PORT || 5432,
    username: process.env.TEST_DB_USERNAME || "postgres",
    password: process.env.TEST_DB_PASSWORD || "123123",
    database: process.env.TEST_DB_DATABASE || "trp",
  },
  backendUrl: process.env.BACKEND_URL || "http://localhost:5000",
  localBackendPath: process.env.LOCAL_BACKEND_PATH || "c:\\Users\\SHE'ROZBEK\\Desktop\\new-test-app\\backend",
  jwt: {
    secret: process.env.JWT_SECRET,
    expirec_in: process.env.JWT_EXPIRES_IN,
  },
  telegram: {
    token: process.env.BOT_TOKEN,
    adminChatId: process.env.ADMIN_CHAT_ID,
    botUsername: process.env.BOT_USERNAME || "qulaypravabot",
  },
  rewards: {
    referrer: Number(process.env.REWARD_REFERRER) || 500,
    correctAnswer: Number(process.env.REWARD_CORRECT_ANSWER) || 30,
    invitee: Number(process.env.REWARD_NEW_USER_REF) || 400,
    dailyBonus: Number(process.env.DAILY_BONUS) || 100,
  },
  minWithdrawLimit: Number(process.env.MIN_WITHDRAW_LIMIT) || 5000,
};

module.exports = config;
