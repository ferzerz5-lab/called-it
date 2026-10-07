// Run once after deploying: /api/setup?key=YOUR_SETUP_KEY connects Telegram to this site.
import { secretFor, COMMANDS } from "../lib/telegram.js";

export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN, key = process.env.SETUP_KEY;
  if (!token || !key || req.query.key !== key) return res.status(404).json({ code: "NOT_FOUND" });
  const call = (method, body) =>
    fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const hook = await call("setWebhook", {
    url: `https://${req.headers.host}/api/telegram`,
    secret_token: secretFor(token),
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  const commands = await call("setMyCommands", { commands: COMMANDS });
  const info = await call("getWebhookInfo", {});
  return res.status(200).json({
    webhookSet: hook.ok, commandsSet: commands.ok,
    url: info.result && info.result.url, pending: info.result && info.result.pending_update_count,
    lastError: (info.result && info.result.last_error_message) || null,
  });
}
