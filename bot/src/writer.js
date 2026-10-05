// AI market-writer: turns a casual claim into a Panta-ready market draft.
const KEY = process.env.GEMINI_API_KEY;
const H = 3600 * 1000;
const CATEGORIES = ["crypto", "politics", "sports", "entertainment"];
let modelCache = null;
let goodModel = null;

const SYSTEM = `You turn a casual claim into a prediction market for Panta, a Solana prediction-market platform.
You may use search to verify fixtures, kickoff times, dates and current prices, and you should whenever the claim depends on them.
Return ONLY one JSON object, with no other text.
Rules:
- question: a specific YES/NO question with a clear deadline, under 140 characters.
- resolutionRule: one or two sentences. It must use EXACTLY the same threshold and wording as the question (same "above" or "at or above"). Say precisely when the answer is YES and when it is NO, and what happens if the event is postponed or cancelled.
- For price markets, name ONE primary source and the exact measurement (for example "the daily close, 00:00 UTC candle, on CoinGecko"). Never say "at any point" without saying which data counts.
- For sports, name the competition and the real fixture date, and use the real kickoff time (UTC) as endAt. If you cannot verify the fixture exists, set clear=false and say so in "issue".
- sourcesOfTruth: 1 to 3 public, official websites (full https URLs) that will show the result.
- category: one of crypto, politics, sports, entertainment.
- endAt: ISO 8601 UTC when betting closes. resolveAt: ISO 8601 UTC after the result is public, at least 1 hour after endAt.
- If the claim cannot be checked on a public website (private matters, opinions, jokes), or involves harm or death of a person, set clear=false, explain in "issue", and give a better "suggestion".
JSON shape: {"clear":true,"issue":"","suggestion":"","question":"","resolutionRule":"","sourcesOfTruth":[""],"category":"","endAt":"","resolveAt":""}`;

async function candidateModels() {
  if (modelCache) return modelCache;
  const first = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : [];
  let found = [];
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": KEY },
    });
    const j = await r.json();
    found = (j.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace("models/", ""))
      .filter((n) => /flash/.test(n) && !/image|tts|live|audio|embed|robotics|computer|native/.test(n))
      .sort((a, b) => /preview|exp/.test(a) - /preview|exp/.test(b));
  } catch {}
  modelCache = [...new Set([...first, ...found])].slice(0, 6);
  return modelCache;
}

export async function draftMarket(text) {
  if (!KEY) throw new Error("GEMINI_API_KEY is missing in .env");
  const now = Date.now();
  const makeBody = (search) =>
    JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: `Now: ${new Date(now).toISOString()}\nClaim: ${text}` }] }],
      ...(search ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: { temperature: 0.3, ...(search ? {} : { responseMimeType: "application/json" }) },
    });

  const models = [...(await candidateModels())];
  if (goodModel) models.unshift(goodModel);
  let res;
  let lastErr = "no models found for this key";
  outer: for (const model of [...new Set(models)]) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    for (const search of [true, false]) {
      for (let attempt = 0; attempt < 2; attempt++) {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
          body: makeBody(search),
        });
        if (res.ok) {
          if (goodModel !== model) console.log(`Using model: ${model}`);
          goodModel = model;
          break outer;
        }
        lastErr = `${model}${search ? "+search" : ""} -> ${res.status}: ${(await res.text()).slice(0, 160).replace(/\s+/g, " ")}`;
        if (![429, 500, 503].includes(res.status)) break; // not a busy error: try the next variant
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (res.status === 404) break; // model is gone: skip to the next model
    }
  }
  if (!res?.ok) throw new Error(`Gemini failed. Last error: ${lastErr}`);

  const data = await res.json();
  const raw = (data.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought).map((p) => p.text || "").join("");
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Model did not return JSON");
  const d = JSON.parse(match[0]);
  if (d.clear === false) return d;

  // Safety checks so the draft always fits Panta's rules.
  let end = new Date(d.endAt).getTime();
  if (!(end >= now + 2 * H)) end = now + 24 * H;
  let resolve = new Date(d.resolveAt).getTime();
  if (!(resolve >= end + H)) resolve = end + 2 * H;
  if (!CATEGORIES.includes(d.category)) d.category = "entertainment";
  d.startAt = new Date(now + 70 * 60 * 1000).toISOString();
  d.endAt = new Date(end).toISOString();
  d.resolveAt = new Date(resolve).toISOString();
  d.sourcesOfTruth = (d.sourcesOfTruth || []).slice(0, 3);
  return d;
}
