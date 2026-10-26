// The Telegram app's side of a Mini App, for tests and tools. On phones, telegram-web-app.js talks to
// Telegram only through window.TelegramWebviewProxy.postEvent, and Telegram answers through
// Telegram.WebView.receiveEvent (messages documented at core.telegram.org/api/web-events). This
// stand-in records what the form sends and answers CloudStorage the way Telegram does.
// telegramHost runs inside the page (pass it to page.addInitScript), so it can't use anything
// from this file's scope.

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


const events = (page, type) => page.evaluate((t) => window.__tg.events.filter((e) => e.type === t).map((e) => e.payload), type);
const pressSave = (page) => page.evaluate(() => window.Telegram.WebView.receiveEvent("main_button_pressed"));

module.exports = { telegramHost, events, pressSave };
