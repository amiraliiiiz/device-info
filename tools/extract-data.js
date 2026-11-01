/* Pulls the DATA blob (map geometry + flags) out of index.html so the other
   tools can work on it without a browser. Writes tools/data.json (gitignored). */
const fs = require("fs");
const src = process.env.HTML || (__dirname + "/../play.html");
const s = fs.readFileSync(src, "utf8");
const i = s.indexOf("const DATA = ");
const j = s.indexOf("\nconst C = DATA.countries", i);
const raw = s.slice(i + "const DATA = ".length, j).trim().replace(/;$/, "");
const data = JSON.parse(raw);
fs.writeFileSync(__dirname + "/data.json", JSON.stringify(data));
console.log("countries:", data.countries.length, "→ tools/data.json");
