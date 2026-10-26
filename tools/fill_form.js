// Opens the form at a launch address, fills in one kid, presses Telegram's Save button, and prints
// what the form hands to Telegram. The launch address is the one Telegram's servers return for the
// Settings button (messages.requestSimpleWebView), so the form sees exactly the launch details a
// phone gets. Only the phone app's side is stood in for, by tests/telegram_host.js.
//
// Usage: node tools/fill_form.js <launch url> '<kid json>' [screenshot path]
//   kid json: {"name": "...", "age": 8, "days": {"Monday": "18:00", ..., "Wednesday": null}}
// Prints one JSON line: {"launch_params": [names in the launch hash], "data": "<sendData payload>"}
const { chromium } = require("playwright");
const { telegramHost, events, pressSave } = require("../tests/telegram_host");

(async () => {
  const [launchUrl, kidJson, shot] = process.argv.slice(2);
  const kid = JSON.parse(kidJson);
  const formOrigin = new URL(launchUrl).origin;
  const launchParams = [...new URLSearchParams(new URL(launchUrl).hash.slice(1)).keys()];
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const blocked = [];
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith(formOrigin + "/") || url.startsWith("https://telegram.org/js/")) return route.continue();
      blocked.push(url);
      return route.abort();
    });
    await page.addInitScript(telegramHost, { storage: {}, answerStorage: true });
    await page.goto(launchUrl);
    await page.waitForSelector(".kid", { timeout: 15000 });
    if (!(await page.locator("#outside").isHidden())) throw new Error("the form thinks it isn't inside Telegram");
    await page.fill("#name1", kid.name);
    await page.fill("#age1", String(kid.age));
    await page.locator(".per-day summary").click();
    for (const [day, value] of Object.entries(kid.days || {})) {
      await page.selectOption(`#day1_${day}`, value === null ? "not" : value);
    }
    if (shot) await page.screenshot({ path: shot, fullPage: true });
    await pressSave(page);
    await page.waitForTimeout(500);
    const sent = await events(page, "web_app_data_send");
    if (!sent.length) throw new Error(`Save sent nothing: ${(await page.textContent("#error")) || "no error shown"}`);
    if (blocked.length) throw new Error(`the form tried to reach ${blocked.join(", ")}`);
    console.log(JSON.stringify({ launch_params: launchParams, data: sent[sent.length - 1].data }));
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
