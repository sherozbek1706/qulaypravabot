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
  jwt: {
    secret: process.env.JWT_SECRET,
    expirec_in: process.env.JWT_EXPIRES_IN,
  },
  telegram: {
    token: process.env.BOT_TOKEN,
  },
};

module.exports = config;
