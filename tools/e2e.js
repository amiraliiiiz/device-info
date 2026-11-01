/* End-to-end smoke test: runs the real index.html inside jsdom with a
   compressed clock, plays a whole match and reports how it ends.
   Usage: node tools/e2e.js [maxSeconds]
*/
const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");

const src = process.env.HTML || (__dirname + "/../play.html");
const html = fs.readFileSync(src, "utf8");
const LIMIT = Number(process.argv[2] || 240) * 1000;

const vc = new VirtualConsole();
const errors = [];
vc.on("jsdomError", e => errors.push("jsdomError: " + (e && e.message)));
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "https://example.com/game",
  virtualConsole: vc,
  beforeParse(w){
    if (process.env.LANG_CODE) w.localStorage.setItem("lns.lang", process.env.LANG_CODE);
    if (process.env.DICE) w.localStorage.setItem("lns.dice", process.env.DICE);
  }
});
const win = dom.window;

/* ---- compressed clock: every animation finishes ~50x faster ---- */
const K = Number(process.argv[3] || 200), t0 = Date.now();
const now = () => (Date.now() - t0) * K;
win.performance.now = now;
/* collapse every waiting time: the game still plays out in full, just fast */
const rawSetTimeout = win.setTimeout.bind(win);
win.setTimeout = (fn, d, ...rest) => rawSetTimeout(fn, Math.min(Number(d) || 0, 1), ...rest);
const raf = cb => win.setTimeout(() => cb(now()), 0);
win.requestAnimationFrame = raf;
win.cancelAnimationFrame = id => win.clearTimeout(id);
win.addEventListener("error", e => errors.push("error: " + e.message));

setTimeout(() => {
  const $ = id => win.document.getElementById(id);
  $("play").click();

  let last = -1, lastRound = 0, log = [];
  const timer = setInterval(() => {
    const left = Number($("leftNum").textContent) || 0;
    const won = $("winveil").className.includes("on");
    if (left !== last){
      last = left;
      log.push(left);
    }
    if (won){
      clearInterval(timer);
      const sub = $("winSub").textContent, name = $("winName").textContent;
      console.log("FINISHED after ~" + ((Date.now() - t0) / 1000).toFixed(0) + "s real");
      console.log("left counter sequence (every change):", log.join(" → "));
      console.log("winner:", name, "|", sub);
      console.log("errors:", errors.length ? errors.slice(0, 10) : "none");
      console.log("VERDICT:", left === 1 ? "OK — one nation left" : "FAIL — ended with " + left + " left");
      dom.window.close();
      process.exit(0);
    }
    if (Date.now() - t0 > LIMIT){
      clearInterval(timer);
      console.log("TIMEOUT. last left counter:", left, "sequence tail:", log.slice(-12).join(" → "));
      console.log("errors:", errors.length ? errors.slice(0, 10) : "none");
      process.exit(2);
    }
  }, 120);
}, 300);
