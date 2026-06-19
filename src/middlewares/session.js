const { session } = require("grammy");
const { FileAdapter } = require("@grammyjs/storage-file");

function initial() {
  return {
    step: "idle",
    tempName: null,
  };
}

module.exports = session({
  initial,
  storage: new FileAdapter({
    dirName: "session",
  }),
});

