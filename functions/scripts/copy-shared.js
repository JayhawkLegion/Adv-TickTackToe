// Copies the game rules the browser uses (cards-rules.js and the card list
// it loads) into functions/shared/, so the server plays by exactly the same
// code. firebase.json runs this before every deploy; run it yourself
// (npm run copy-shared) before starting the emulators.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const shared = path.resolve(__dirname, "..", "shared");
fs.mkdirSync(shared, { recursive: true });
["cards-rules.js", "cards-pool.js"].forEach((file) => {
  fs.copyFileSync(path.join(root, file), path.join(shared, file));
});
console.log("Copied cards-rules.js and cards-pool.js into functions/shared/");
