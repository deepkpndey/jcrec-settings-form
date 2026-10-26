// Runs the form in headless Chromium with Telegram's real telegram-web-app.js, while this test
// plays the Telegram app's part. On phones the script talks to Telegram only through
// window.TelegramWebviewProxy.postEvent, and Telegram answers through
// Telegram.WebView.receiveEvent, using the messages documented at core.telegram.org/api/web-events.
// The launch details below are what a chat keyboard-button launch carries: a version, a platform
// and a theme, but no user data (messages.requestSimpleWebView sends none).
//
// Telegram's script is fetched live, because that is what parents' phones load. The form's files
// are served to the browser from this process, so nothing listens on the network, and every other
// request is blocked and counted, which also checks that the form sends nothing anywhere.
//
// Run from the repo root: npm ci --ignore-scripts && npx playwright install chromium && npm test
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const ORIGIN = "https://form.test";
const TELEGRAM_JS = "https://telegram.org/js/telegram-web-app.js";
const THEME = { bg_color: "#ffffff", text_color: "#000000", hint_color: "#999999", button_color: "#2481cc",
  button_text_color: "#ffffff", secondary_bg_color: "#f0f0f0" };
const launch = (version) => `#tgWebAppVersion=${version}&tgWebAppPlatform=ios&tgWebAppThemeParams=${encodeURIComponent(JSON.stringify(THEME))}`;
const STORED = { v: 1, kids: [{ name: "Kid", age: 8, weekday_earliest: "18:00", weekends: true, swim_level: 2,
  exclude_categories: ["Adaptive Recreation"] }] };

async function fetchTelegramScript() {
  const res = await fetch(TELEGRAM_JS);
  if (!res.ok) throw new Error(`couldn't fetch ${TELEGRAM_JS}: HTTP ${res.status}`);
  return res.text();
}

// Installed before any page script runs: a stand-in for the Telegram app.
function telegramHost({ storage, answerStorage }) {
  window.__tg = { events: [], storage: { ...storage } };
  window.TelegramWebviewProxy = {
    postEvent(type, data) {
      const payload = data ? JSON.parse(data) : null;
      window.__tg.events.push({ type, payload });
      if (type !== "web_app_invoke_custom_method" || !answerStorage) return;
      const { req_id, method, params } = payload;
      let result;
      if (method === "getStorageValues") {
        result = {};
        params.keys.forEach((k) => { result[k] = window.__tg.storage[k] || ""; });
      } else if (method === "saveStorageValue") {
        window.__tg.storage[params.key] = params.value;
        result = true;
      }
      setTimeout(() => window.Telegram.WebView.receiveEvent("custom_method_invoked", { req_id, result }), 10);
    },
  };
}

async function open(browser, script, { hash = launch("9.1"), host = true, storage = {}, answerStorage = true } = {}) {
  const page = await browser.newPage();
  const blocked = [];
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(TELEGRAM_JS)) return route.fulfill({ body: script, contentType: "application/javascript" });
    if (url.startsWith(ORIGIN + "/")) {
      const file = new URL(url).pathname.replace(/^\/$/, "/index.html");
      const full = path.join(ROOT, file);
      if (!full.startsWith(ROOT) || !fs.existsSync(full)) return route.fulfill({ status: 404, body: "" });
      const type = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css" }[path.extname(full)] || "text/plain";
      return route.fulfill({ body: fs.readFileSync(full), contentType: type });
    }
    blocked.push(url);
    return route.abort();
  });
  if (host) await page.addInitScript(telegramHost, { storage, answerStorage });
  await page.goto(`${ORIGIN}/?v=test${hash}`);
  await page.waitForSelector(".kid", { timeout: 5000 });
  return { page, blocked };
}

const events = (page, type) => page.evaluate((t) => window.__tg.events.filter((e) => e.type === t).map((e) => e.payload), type);
const pressSave = (page) => page.evaluate(() => window.Telegram.WebView.receiveEvent("main_button_pressed"));
async function sentData(page) {
  await page.waitForTimeout(100);
  const sent = await events(page, "web_app_data_send");
  return sent.length ? JSON.parse(sent[sent.length - 1].data) : null;
}

// Same content regardless of key order.
const canonical = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));

const results = [];
function check(name, ok, detail) {
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail !== undefined ? "  got: " + JSON.stringify(detail) : ""}`);
}

(async () => {
  const script = await fetchTelegramScript();
  const browser = await chromium.launch();
  try {
    // 1. A parent with saved settings opens the form from the chat's Settings button.
    let { page, blocked } = await open(browser, script, { storage: { settings_v1: JSON.stringify(STORED) } });
    check("keyboard launch: Telegram's script reports no user data, as on a real chat-button launch",
      (await page.evaluate(() => window.Telegram.WebApp.initData)) === "");
    check("keyboard launch: no 'open from the bot' warning", await page.locator("#outside").isHidden());
    const button = (await events(page, "web_app_setup_main_button")).pop();
    check("Telegram's Save button is set up and shown", button && button.is_visible && button.text === "Save", button);
    check("form is prefilled from Telegram storage", (await page.inputValue("#name1")) === "Kid");
    await pressSave(page);
    check("Save sends the saved settings unchanged", canonical(await sentData(page)) === canonical(STORED),
      await sentData(page));
    check("the form made no other network requests", blocked.length === 0, blocked);
    await page.close();

    // 2. A new parent fills the form in.
    ({ page } = await open(browser, script));
    await pressSave(page);
    check("an empty name is refused before anything is sent",
      (await sentData(page)) === null && /needs a name/.test(await page.textContent("#error")));
    await page.fill("#name1", "Maya");
    await page.fill("#age1", "7");
    await page.locator(".activities summary").click();
    await page.locator("#act1_" + (await page.$$eval(".activities input[type=checkbox]", (bs) => bs.findIndex((b) => b.value === "Swim")))).uncheck();
    check("unticking Swim hides the swim level", await page.locator("#swim1").isHidden());
    await pressSave(page);
    const sent = await sentData(page);
    check("Save sends the new kid", sent && sent.kids[0].name === "Maya" && sent.kids[0].age === 7 &&
      sent.kids[0].swim_level === null && sent.kids[0].exclude_categories.includes("Swim"), sent);
    check("Save also keeps a copy in Telegram storage for next time",
      (await page.evaluate(() => window.__tg.storage.settings_v1 || "")).includes("Maya"));
    await page.close();

    // 3. Telegram never answers the storage requests.
    ({ page } = await open(browser, script, { answerStorage: false }));
    check("the form still opens when storage doesn't answer", (await page.locator(".kid").count()) === 1);
    await page.fill("#name1", "Sam");
    await page.fill("#age1", "9");
    await pressSave(page);
    await page.waitForTimeout(1700);
    check("Save still sends when storage doesn't answer", ((await sentData(page)) || { kids: [{}] }).kids[0].name === "Sam");
    await page.close();

    // 4. An old Telegram app without storage support.
    ({ page } = await open(browser, script, { hash: launch("6.0") }));
    check("old Telegram: no storage requests", (await events(page, "web_app_invoke_custom_method")).length === 0);
    await page.fill("#name1", "Ana");
    await page.fill("#age1", "6");
    await pressSave(page);
    check("old Telegram: Save still sends", ((await sentData(page)) || { kids: [{}] }).kids[0].name === "Ana");
    await page.close();

    // 5. Someone opens the page in a plain browser.
    ({ page } = await open(browser, script, { hash: "", host: false }));
    check("plain browser: shows the 'open from the bot' note", await page.locator("#outside").isVisible());
    await page.close();
  } finally {
    await browser.close();
  }
  console.log(results.join("\n"));
  process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
