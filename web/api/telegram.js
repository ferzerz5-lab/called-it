// Telegram sends every message here (a "webhook"), so the bot works even when your laptop is off.
import { createBot } from "../lib/botCore.js";
import { secretFor } from "../lib/telegram.js";
import { kv } from "../lib/kv.js";

let botPromise;
const getBot = (host) => (botPromise ||= (async () => {
  const bot = createBot({ siteBase: `https://${host}` });
  await bot.init();
  return bot;
})());

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true, service: "I-Called-It bot webhook" });
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ ok: false, error: "TELEGRAM_BOT_TOKEN is not set" });
  if (req.headers["x-telegram-bot-api-secret-token"] !== secretFor(token)) return res.status(401).json({ ok: false });
  const update = req.body || {};
  try {
    if (update.update_id != null && !(await kv.firstTime(`upd:${update.update_id}`))) return res.status(200).json({ ok: true, duplicate: true });
    const bot = await getBot(req.headers.host);
    await bot.handleUpdate(update);
  } catch (e) {
    console.error("update failed:", e.message);
  }
  return res.status(200).json({ ok: true }); // always answer 200 so Telegram doesn't keep retrying
}
