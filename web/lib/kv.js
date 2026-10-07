// Tiny Redis client over Upstash's REST API (free tier). Falls back to memory if no database is connected.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const hasKv = Boolean(URL_ && TOKEN);
if (!hasKv) console.warn("No Redis connected: votes will only live in memory and can be lost.");

async function cmd(...args) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

const memStr = new Map();
const memSet = new Map();
const DAY30 = 60 * 60 * 24 * 30;

export const kv = {
  async setJson(key, obj, ttl = DAY30) {
    if (!hasKv) return void memStr.set(key, JSON.stringify(obj));
    await cmd("SET", key, JSON.stringify(obj), "EX", String(ttl));
  },
  async getJson(key) {
    const v = hasKv ? await cmd("GET", key) : memStr.get(key);
    return v ? JSON.parse(v) : null;
  },
  async countVoters(id) {
    if (!hasKv) return (memSet.get(id) || new Set()).size;
    return Number(await cmd("SCARD", `voters:${id}`)) || 0;
  },
  // Taps once to vote, taps again to remove the vote.
  async toggleVoter(id, who) {
    if (!hasKv) {
      const s = memSet.get(id) || new Set();
      const had = s.delete(who);
      if (!had) s.add(who);
      memSet.set(id, s);
      return { count: s.size, added: !had };
    }
    const key = `voters:${id}`;
    const had = Number(await cmd("SISMEMBER", key, who)) === 1;
    await cmd(had ? "SREM" : "SADD", key, who);
    await cmd("EXPIRE", key, String(DAY30));
    return { count: Number(await cmd("SCARD", key)) || 0, added: !had };
  },
  // Returns true the first time it sees a key (used to ignore repeated Telegram deliveries).
  async firstTime(key, ttl = 600) {
    if (!hasKv) { if (memStr.has(key)) return false; memStr.set(key, "1"); return true; }
    return (await cmd("SET", key, "1", "NX", "EX", String(ttl))) === "OK";
  },
};
