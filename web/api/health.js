// Shows whether the server holds a live or test Panta key (prefix only, never the secret).
export default async function handler(req, res) {
  const KEY = (process.env.PANTA_API_KEY || "").trim().replace(/^PANTA_API_KEY=/, "").trim();
  const BASE = (process.env.PANTA_API_BASE_URL || "https://live-api.panta.market/api/v1").replace(/\/+$/, "");
  let mode = "unknown";
  try {
    const r = await fetch(`${BASE}/categories/`, { headers: { "X-Api-Key": KEY, Accept: "application/json" } });
    const j = await r.json().catch(() => ({}));
    mode = j && j.disclaimer ? "sandbox (test key)" : r.ok ? "live" : `error ${r.status}`;
  } catch {
    mode = "unreachable";
  }
  const out = { keyConfigured: !!KEY, keyPrefix: KEY.slice(0, 8), mode };
  const id = String((req.query && req.query.market) || "");
  if (/^[A-Za-z0-9]{20,64}$/.test(id)) {
    try {
      const r = await fetch(`${BASE}/markets/${id}/`, { headers: { "X-Api-Key": KEY, Accept: "application/json" } });
      out.market = { status: r.status, body: (await r.text()).slice(0, 200) };
    } catch {
      out.market = { status: 0, body: "unreachable" };
    }
  }
  res.status(200).json(out);
}
