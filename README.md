# jcrec-settings-form

The settings form for a private Telegram bot that sends families a daily list of Jersey City Recreation programs. It opens inside Telegram as a Mini App from the bot's Settings button.

This repo holds only the blank form. No family data is stored or sent here:

- Saving uses Telegram's `WebApp.sendData`, which hands the answers to the bot as a Telegram message. The page makes no network requests of its own, and its Content-Security-Policy allows scripts only from this site and `telegram.org`.
- The form remembers the last saved answers in Telegram's per-user CloudStorage, which only this bot can read, so it opens prefilled.
- The bot checks every answer again before saving it, and accepts answers only from families it has invited.

Opened in a regular browser, the form shows a note and can't save.

Tests run on every push: `npm ci --ignore-scripts && npm test` checks the form in a simulated browser (jsdom), including that it works when opened from a chat button.
