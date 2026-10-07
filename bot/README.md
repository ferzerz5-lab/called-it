# Local development bot (legacy)

This folder is the original long-polling version of the bot, kept for local testing (`npm install`, copy `.env.example` to `.env`, `npm start`).

**The deployed, always-on bot runs from `../web`** as a Vercel webhook (`web/api/telegram.js` and `web/lib/botCore.js`). Do not run both at once: Telegram allows only one of them to receive messages.
