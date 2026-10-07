// Private check: /api/diag?key=YOUR_SETUP_KEY runs the same market loading the bot uses and reports what happened.
import { loadMarkets, normalize } from "../lib/panta.js";
import { hasKv } from "../lib/kv.js";

export default async function handler(req, res) {
  if (!process.env.SETUP_KEY || req.query.key !== process.env.SETUP_KEY) return res.status(404).json({ code: "NOT_FOUND" });
  const out = { pantaKeyPrefix: (process.env.PANTA_API_KEY || "").trim().slice(0, 8), host: req.headers.host, redis: hasKv };
  const t = Date.now();
  try {
    const raw = await loadMarkets();
    out.ok = true;
    out.markets = raw.length;
    out.open = raw.filter((m) => String(m.phase || m.status || "").toLowerCase() === "primary").length;
    out.sample = raw.slice(0, 3).map((m) => normalize(m).title.slice(0, 70));
  } catch (e) {
    out.ok = false;
    out.error = String(e.message).slice(0, 400);
  }
  out.ms = Date.now() - t;
  return res.status(200).json(out);
}
