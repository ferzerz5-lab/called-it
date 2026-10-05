// Minimal Panta API client. Paths must end with "/" (Panta requires it).
const BASE = (process.env.PANTA_API_BASE_URL || "https://live-api.panta.market/api/v1").replace(/\/+$/, "");
const KEY = process.env.PANTA_API_KEY;

export async function pantaGet(path, params = {}) {
  if (!KEY) throw new Error("PANTA_API_KEY is missing in .env");
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
  ).toString();
  const res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ""}`, { headers: { "X-Api-Key": KEY } });
  if (!res.ok) throw new Error(`Panta ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export const listMarkets = (params) => pantaGet("/markets/", params);
export const getMarket = (id) => pantaGet(`/markets/${encodeURIComponent(id)}/`);

// PROVISIONAL: looks for YES/NO price fields anywhere in the response.
// Run `npm run probe` to see the real field names, then we tighten this.
function pickPrices(m) {
  const found = {};
  const walk = (o, parent = "", depth = 0) => {
    if (!o || typeof o !== "object" || depth > 3) return;
    for (const [k, v] of Object.entries(o)) {
      if (v !== null && typeof v === "object") { walk(v, k, depth + 1); continue; }
      const n = Number(v);
      if (v === "" || v === null || !Number.isFinite(n)) continue;
      if (!/price|prob|odds|spot/i.test(`${parent} ${k}`)) continue;
      if (k.toLowerCase().includes("yes")) found.yes ??= n;
      else if (k.toLowerCase() === "no" || /^no[A-Z_-]/.test(k) || /[a-z_-]No$/.test(k)) found.no ??= n;
    }
  };
  walk(m);
  return found;
}

const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// Panta sends times as unix seconds on-chain and ISO strings elsewhere.
const iso = (v) => {
  if (!v) return "";
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return new Date(n < 1e12 ? n * 1000 : n).toISOString();
  return String(v);
};

export function normalize(m) {
  let yes = num(m.yesPrice ?? m.primaryYesPrice);
  let no = num(m.noPrice ?? m.primaryNoPrice);
  if (yes == null && no == null) ({ yes = null, no = null } = pickPrices(m)); // fallback guess
  // Live markets keep the question inside onChain; title is often empty.
  const title =
    (m.onChain && m.onChain.question) || (m.title || "").trim() || (m.description || "").trim() || "(untitled market)";
  const endTime = iso((m.onChain && m.onChain.endTime) || m.endTime);
  const ended = m.resolved === true || (endTime && new Date(endTime).getTime() < Date.now());
  return {
    id: m.marketId || m.id,
    title,
    phase: ended ? "closed" : m.phase || m.status || "",
    category: m.category || "",
    endTime,
    volume: num(m.volumeUsdc),
    resolved: m.resolved === true,
    prices: { yes, no },
    raw: m,
  };
}

// Fetches the market list, then each market's detail (the question lives there).
// Cached for 10 minutes so searches stay fast and we don't hammer the API.
let cache = { at: 0, items: [] };
export async function loadMarkets() {
  if (cache.items.length && Date.now() - cache.at < 10 * 60 * 1000) return cache.items;
  // Panta's list pages rotate, so query each category and merge the results.
  const seen = new Map();
  let lastErr;
  for (const category of [undefined, "crypto", "politics", "sports", "entertainment"]) {
    for (const params of [{ limit: 100, status: "primary", category }, { limit: 50, category }]) {
      try {
        const data = await listMarkets(params);
        for (const b of data.items || data.results || []) seen.set(b.marketId || b.id, b);
        break;
      } catch (e) {
        lastErr = e;
      }
    }
  }
  if (!seen.size) throw lastErr || new Error("No markets returned");
  const all = [...seen.values()];
  const open = all.filter((b) => String(b.phase || b.status || "").toLowerCase() === "primary");
  const base = open.length ? open : all;
  const out = [];
  let i = 0;
  const worker = async () => {
    while (i < base.length) {
      const b = base[i++];
      const id = b.marketId || b.id;
      let detail = null;
      for (let attempt = 0; attempt < 2 && !detail; attempt++) {
        try {
          detail = await getMarket(id);
        } catch (e) {
          if (attempt === 1) console.error(`detail failed for ${id}: ${e.message}`);
          else await new Promise((r) => setTimeout(r, 600));
        }
      }
      out.push(detail ? { ...b, ...detail } : b);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  cache = { at: Date.now(), items: out };
  return out;
}

export function pct(n) {
  if (n == null) return null;
  return Math.round(n <= 1 ? n * 100 : n);
}
