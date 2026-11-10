# Working on jcrec-settings-form (for agents and future sessions)

This is only the Settings form for the jcrec-alerts Telegram bot. The project's memory lives in the private bot repo (`~/code/jcrec-alerts`): read its `AGENTS.md`, `README.md` and `docs/DECISIONS.md` first, and record any decision about the form there, in the same change.

## How the form works

- It opens inside Telegram from the bot's Settings keyboard button, as a Mini App. Such a launch carries **no user data** (`initData` is empty), so the form detects Telegram with `WebApp.platform !== "unknown"`. Checking `initData` broke it once (2026-10-25).
- Save is Telegram's own button (`MainButton`). It hands the answers to the bot with `WebApp.sendData` (at most 4096 bytes). The page makes no network requests of its own; its Content-Security-Policy allows scripts only from this site and `telegram.org`.
- The last saved answers are kept in Telegram's per-user `CloudStorage` (only this bot can read them) so the form opens prefilled. Every storage call has a timeout, so the form never hangs on it.
- What it sends must match what the bot accepts in `clean_kid` (`jcrec/inbox.py` in the bot repo): name, `birth_month` or `age`, `days` (a time per day, `"00:00"` any time, `null` not that day), `grade` with `grade_year`, `swim_level`, `exclude_categories`. Change both repos together.
- The grade starts as an estimate from age or birth month and follows them until the parent picks one; a saved grade moves up after each September 1.

## Rules

1. **Run the tests before pushing**: `npm ci --ignore-scripts`, then `PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers npx playwright install chromium-headless-shell` and `PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers npm test`. Delete `/tmp/pw-browsers` afterwards; the owner cleared the shared browser cache to save space. The test loads Telegram's live `telegram-web-app.js` and plays the Telegram app's part; it also runs weekly on GitHub to catch changes on Telegram's side.
2. **Look at a screenshot** after layout changes (`SCREENSHOT_DIR=/tmp/shots npm test`); assertions miss wording and layout problems.
3. **After publishing a change**, bump the `?v=` on the asset links in `index.html` and on `FORM_URL` in the bot repo, then send families a fresh Settings button (bot repo `docs/RUNBOOK.md`). Phones cache GitHub Pages for up to 10 minutes.
4. **This repo is public.** Nothing personal goes in it: no names, chat IDs or tokens. The bot checks every answer again before saving, and accepts answers only from invited families.
