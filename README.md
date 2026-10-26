# jcrec-settings-form

The settings form for a private Telegram bot that sends families a daily list of Jersey City Recreation programs. It opens inside Telegram as a Mini App from the bot's Settings button.

This repo holds only the blank form. No family data is stored or sent here:

- Saving uses Telegram's `WebApp.sendData`, which hands the answers to the bot as a Telegram message. The page makes no network requests of its own, and its Content-Security-Policy allows scripts only from this site and `telegram.org`.
- The form remembers the last saved answers in Telegram's per-user CloudStorage, which only this bot can read, so it opens prefilled.
- The bot checks every answer again before saving it, and accepts answers only from families it has invited.

Opened in a regular browser, the form shows a note and can't save.

Tests run on every push and weekly: `tests/telegram_emulation_test.js` opens the form in headless Chromium with Telegram's real `telegram-web-app.js`, while the test plays the Telegram app's part through the same documented messages a phone uses. It covers a chat-button launch (which carries no user data), prefilling, Telegram's Save button, storage that never answers, an old Telegram app, a plain browser, and that the page makes no other network requests. Run it with `npm ci --ignore-scripts && npx playwright install chromium && npm test`.
