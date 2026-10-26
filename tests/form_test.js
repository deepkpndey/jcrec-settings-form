// Behavior tests for the form in a simulated browser. Run from the repo root: npm ci --ignore-scripts && node tests/form_test.js
const path = require("path");
const { JSDOM } = require("jsdom");
const fs = require("fs");
const formDir = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(formDir, "index.html"), "utf8")
  .replace(/<script src="https:\/\/telegram.org[^>]*><\/script>/, "").replace(/<script src="app.js[^"]*" defer><\/script>/, "");
const appJs = fs.readFileSync(path.join(formDir, "app.js"), "utf8");
function run(tgStub) {
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  if (tgStub) dom.window.Telegram = { WebApp: tgStub };
  dom.window.TextEncoder = TextEncoder;
  dom.window.eval(appJs);
  return dom.window;
}
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? "  " + extra : ""}`);

// Inside Telegram, opened from the keyboard button: platform set, initData empty, a stored copy exists.
let sent = null, onSave = null;
const stored = JSON.stringify({ v: 1, kids: [{ name: "Kid", age: 8, weekday_earliest: "18:00", weekends: true,
  swim_level: 2, exclude_categories: ["Adaptive Recreation"] }] });
const tg = { platform: "ios", initData: "", ready() {}, expand() {}, isVersionAtLeast: () => true,
  MainButton: { setText() {}, show() {}, onClick(f) { onSave = f; } },
  CloudStorage: { getItem(k, cb) { cb(null, stored); }, setItem(k, v, cb) { cb(null, true); } },
  sendData(d) { sent = JSON.parse(d); } };
let w = run(tg);
const d = w.document;
check("no 'open from the bot' warning inside Telegram", d.getElementById("outside").hidden);
check("no standalone swim dropdown label", ![...d.querySelectorAll("label")].some((l) => /Swim classes/.test(l.textContent)));
const summary = d.querySelector(".activities summary").textContent;
check("summary shows 15 of 16 activities", summary.startsWith("Activities: 15 of 16"), JSON.stringify(summary));
const swimBox = [...d.querySelectorAll(".activities input[type=checkbox]")].find((b) => b.value === "Swim");
const levelRow = d.getElementById("swim1").closest(".nested");
check("swim level shown under Swim, LTS 2 selected", !levelRow.hidden && d.getElementById("swim1").value === "2");
onSave();
check("save sends prefilled kid unchanged", sent && sent.kids[0].swim_level === 2 &&
  JSON.stringify(sent.kids[0].exclude_categories) === '["Adaptive Recreation"]', JSON.stringify(sent));
swimBox.checked = false; swimBox.dispatchEvent(new w.Event("change"));
check("unticking Swim hides the level", levelRow.hidden);
check("summary updates to 14 of 16", d.querySelector(".activities summary").textContent.startsWith("Activities: 14 of 16"));
sent = null; onSave();
check("Swim unticked: swim_level null, Swim skipped", sent && sent.kids[0].swim_level === null &&
  sent.kids[0].exclude_categories.includes("Swim"), JSON.stringify(sent && sent.kids[0]));
[...d.querySelectorAll(".activities input[type=checkbox]")].forEach((b) => { b.checked = false; });
sent = null; onSave();
check("all activities unticked: refused with a message", sent === null && /at least one activity/.test(d.getElementById("error").textContent));

// Plain browser: Telegram's script reports platform "unknown".
w = run({ platform: "unknown", initData: "" });
check("plain browser shows the warning", !w.document.getElementById("outside").hidden);
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
