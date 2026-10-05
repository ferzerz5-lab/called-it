// Server-side proxy: keeps your Panta key secret and only allows the calls the trade page needs.
const BASE = (process.env.PANTA_API_BASE_URL || "https://live-api.panta.market/api/v1").replace(/\/+$/, "");
const KEY = (process.env.PANTA_API_KEY || "").trim().replace(/^PANTA_API_KEY=/, "").trim();
const ROUTES = [
  ["GET", /^markets$/],
  ["GET", /^markets\/[A-Za-z0-9]{20,64}$/],
  ["GET", /^positions$/],
  ["POST", /^markets\/create\/(image-upload|quote|build)$/],
  ["POST", /^markets\/register$/],
  ["POST", /^primaryorderquote$/],
  ["POST", /^primaryorderbuild$/],
  ["POST", /^primaryordersubmit$/],
  ["POST", /^primaryorderverify$/],
  ["POST", /^trades$/],
];
const hits = new Map(); // tiny per-instance rate limit: 60 requests/minute per IP

export default async function handler(req, res) {
  if (!KEY) return res.status(500).json({ code: "SERVER_NOT_CONFIGURED" });
  const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now > h.reset) hits.set(ip, { n: 1, reset: now + 60000 });
  else if (++h.n > 60) return res.status(429).json({ code: "RATE_LIMITED" });

  const path = [].concat(req.query.path || []).join("/").replace(/^\/+|\/+$/g, "");
  if (!ROUTES.some(([m, re]) => m === req.method && re.test(path))) {
    return res.status(404).json({ code: "NOT_ALLOWED" });
  }
  const url = new URL(`${BASE}/${path}/`);
  for (const [k, v] of Object.entries(req.query)) if (["limit", "status", "category", "phase"].includes(k)) url.searchParams.set(k, String(v));
  const headers = { "X-Api-Key": KEY, Accept: "application/json" };
  const uid = req.headers["x-user-id"];
  if (uid && /^[\w:.-]{1,64}$/.test(uid)) headers["X-User-Id"] = uid;
  const init = { method: req.method, headers };
  if (req.method === "POST") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(req.body ?? {});
  }
  try {
    const up = await fetch(url, init);
    const text = await up.text();
    res.status(up.status);
    res.setHeader("Content-Type", up.headers.get("content-type") || "application/json");
    return res.send(text);
  } catch {
    return res.status(502).json({ code: "UPSTREAM_UNREACHABLE" });
  }
}
