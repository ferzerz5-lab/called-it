import fs from "node:fs";
import crypto from "node:crypto";
import { Bot, InlineKeyboard } from "grammy";
import { draftMarket } from "./writer.js";
import { loadMarkets, normalize, pct } from "./panta.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN. Check your .env file.");
  process.exit(1);
}
const bot = new Bot(token);
const NOPREVIEW = { link_preview_options: { is_disabled: true } };
const TRADE_BASE = process.env.TRADE_PAGE_URL || "";
const SITE = (() => { try { return TRADE_BASE ? new URL(TRADE_BASE).origin : ""; } catch { return ""; } })();

// Example claims people can tap. Keep them checkable on a public website.
const IDEAS = [
  { label: "Bitcoin above $100k by year end", claim: "Bitcoin above $100k by end of the year" },
  { label: "Ethereum above $5,000 by year end", claim: "Ethereum above $5,000 by end of the year" },
  { label: "Solana above $300 by year end", claim: "Solana above $300 by end of the year" },
  { label: "Man City win their next match", claim: "Manchester City win their next Premier League match" },
  { label: "Real Madrid win their next match", claim: "Real Madrid win their next La Liga match" },
];

const mainMenu = () => {
  const kb = new InlineKeyboard().text("🔎 Live markets", "odds").text("💡 Ideas to try", "ideas");
  if (SITE) kb.row().url("🌐 Open the website", SITE);
  return kb;
};
const ideasKb = () => {
  const kb = new InlineKeyboard();
  IDEAS.forEach((x, i) => kb.text(x.label, `ex:${i}`).row());
  return kb.text("🔎 Live markets", "odds");
};
const sendIdeas = (ctx) =>
  ctx.reply("Tap an idea to draft a market from it.\nOr type your own: /call <your claim>", { reply_markup: ideasKb() });


// ---- "Would you trade this?" votes: a group decides before anyone pays the creation fee ----
const STORE = new URL("../data/drafts.json", import.meta.url);
let DRAFTS = {};
try { DRAFTS = JSON.parse(fs.readFileSync(STORE, "utf8")); } catch {}
const persist = () => {
  try {
    fs.mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
    const ids = Object.keys(DRAFTS);
    if (ids.length > 200) ids.slice(0, ids.length - 200).forEach((k) => delete DRAFTS[k]);
    fs.writeFileSync(STORE, JSON.stringify(DRAFTS));
  } catch (e) { console.error("persist:", e.message); }
};
const VOTES_NEEDED = Math.max(1, Number(process.env.VOTE_THRESHOLD) || 3);
const needFor = (chatType) => (chatType === "private" ? 1 : VOTES_NEEDED); // solo chats unlock with one tap
const voterKey = (uid) => crypto.createHash("sha256").update(String(uid)).digest("hex").slice(0, 12); // no raw ids stored

function createLink(d) {
  if (!SITE) return null;
  const payload = Buffer.from(
    JSON.stringify({ q: d.question, r: d.resolutionRule, s: d.sourcesOfTruth, c: d.category, a: d.startAt, b: d.endAt, x: d.resolveAt })
  ).toString("base64url");
  return payload.length < 1800 ? `${SITE}/create?d=${payload}` : null;
}
function draftKb(id) {
  const d = DRAFTS[id];
  const n = d.voters.length;
  const kb = new InlineKeyboard().text(`👍 I'd trade this (${n}/${d.need})`, `v:${id}`).row();
  const link = n >= d.need ? createLink(d) : null;
  if (link) kb.url("🚀 Create this market", link).row();
  return kb.text("💡 More ideas", "ideas").text("🔎 Live markets", "odds");
}
function saveDraft(ctx, d) {
  const id = Math.random().toString(36).slice(2, 8);
  DRAFTS[id] = { ...d, voters: [], need: needFor(ctx.chat && ctx.chat.type) };
  persist();
  return id;
}

async function doOdds(ctx, words) {
  const wait = await ctx.reply("Searching Panta markets...");
  const show = (msg, extra = {}) =>
    ctx.api.editMessageText(ctx.chat.id, wait.message_id, msg, { ...NOPREVIEW, ...extra });
  try {
    const raw = await loadMarkets();
    const all = raw.map(normalize);
    const stillOpen = all.filter((m) => m.phase !== "closed");
    const items = stillOpen.length ? stillOpen : all;
    const sandbox = /sandbox|fixture/i.test(JSON.stringify(raw[0] || {}).slice(0, 3000));
    const hay = (m) => `${m.title} ${m.raw.description || ""} ${m.category}`.toLowerCase();
    let hits = words.length ? items.filter((m) => words.every((w) => hay(m).includes(w))) : items;
    hits = hits.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 5);
    const head = `${sandbox ? "Sandbox markets (test key, not real)" : "Live Panta markets"} - searched ${items.length}`;
    if (!hits.length) {
      return show(`${head}\n\nNo markets matched that. Draft your own with /call, or tap an idea.\n\nPowered by Panta`, {
        reply_markup: new InlineKeyboard().text("💡 Ideas to try", "ideas"),
      });
    }
    const lines = hits.map((m, i) => {
      const y = pct(m.prices.yes), n = pct(m.prices.no);
      const price = y != null || n != null ? `YES ${y ?? "?"}% / NO ${n ?? "?"}%` : "price: not shown yet";
      return `${i + 1}. ${m.title}\n   ${price} - ${m.phase || "?"}${m.endTime ? ` - closes ${m.endTime.slice(0, 10)}` : ""}${m.volume != null ? ` - vol $${m.volume.toFixed(2)}` : ""}`;
    });
    const kb = new InlineKeyboard();
    if (TRADE_BASE.startsWith("https://")) {
      hits.forEach((m, i) => {
        kb.url(`Trade #${i + 1}`, `${TRADE_BASE}?market=${encodeURIComponent(m.id)}`);
        if (i % 3 === 2) kb.row();
      });
      kb.row();
    }
    kb.text("💡 Ideas to try", "ideas");
    await show(`${head}:\n\n${lines.join("\n\n")}\n\nPowered by Panta`, { reply_markup: kb });
  } catch (e) {
    console.error(e.message);
    await show("Sorry, I couldn't load markets right now. Try again in a moment.");
  }
}

async function doCall(ctx, text) {
  const wait = await ctx.reply("Drafting your market...");
  const show = (msg, extra = {}) =>
    ctx.api.editMessageText(ctx.chat.id, wait.message_id, msg, { ...NOPREVIEW, ...extra });
  const nav = new InlineKeyboard().text("💡 More ideas", "ideas").text("🔎 Live markets", "odds");
  try {
    const d = await draftMarket(text);
    if (d.clear === false) {
      return show(`I can't make that one a market.\nWhy: ${d.issue}\nTry: ${d.suggestion}`, { reply_markup: nav });
    }
    const id = saveDraft(ctx, d);
    const need = DRAFTS[id].need;
    await show(
      [
        "Draft market (not created yet):",
        `Question: ${d.question}`,
        `Rule: ${d.resolutionRule}`,
        `Sources: ${d.sourcesOfTruth.join(", ")}`,
        `Category: ${d.category}`,
        `Betting closes: ${d.endAt}`,
        `Resolves: ${d.resolveAt}`,
        "",
        need === 1
          ? "Tap 👍 below to unlock the Create button. Creating a real market costs about $50 in USDC, and you'll see the exact amount before you sign."
          : `Creating a real market costs about $50 in USDC, so it needs ${need} people to tap 👍 before anyone pays. The Create button appears once enough people say they'd trade it.`,
        "Powered by Panta",
      ].join("\n"),
      { reply_markup: draftKb(id) }
    );
  } catch (e) {
    console.error(e.message);
    await show("Sorry, I couldn't draft that. Try again in a moment.", { reply_markup: nav });
  }
}

bot.command("start", (ctx) =>
  ctx.reply(
    "Hi! I turn group-chat arguments into live prediction odds.\n\n" +
      "🔎 /odds bitcoin - find live markets\n" +
      "✍️ /call <claim> - draft a new market\n" +
      "💡 /ideas - tap an example to try\n\nNot sure where to start? Tap a button below.\n\nPowered by Panta",
    { reply_markup: mainMenu() }
  )
);
bot.command("help", (ctx) =>
  ctx.reply(
    "How to use I-Called-It:\n\n" +
      "/odds - the busiest open markets\n/odds bitcoin - search markets by word\n" +
      "/call Bitcoin above 100k by end of the year - draft a market\n/ideas - tap an example\n\n" +
      "Markets are settled from public websites, so opinions and private bets can't be markets.\n\nPowered by Panta",
    { reply_markup: mainMenu() }
  )
);
bot.command("ideas", (ctx) => sendIdeas(ctx));
bot.command("odds", (ctx) => doOdds(ctx, (ctx.match || "").toLowerCase().split(/\s+/).filter(Boolean)));
bot.command("call", (ctx) => {
  const text = (ctx.match || "").trim();
  return text ? doCall(ctx, text) : sendIdeas(ctx);
});

bot.callbackQuery(/^v:(\w+)$/, async (ctx) => {
  const id = ctx.match[1];
  const d = DRAFTS[id];
  if (!d) return ctx.answerCallbackQuery({ text: "This draft expired. Draft it again with /call.", show_alert: true });
  const key = voterKey(ctx.from.id);
  const i = d.voters.indexOf(key);
  if (i >= 0) d.voters.splice(i, 1);
  else d.voters.push(key);
  persist();
  const done = d.voters.length >= d.need;
  await ctx.answerCallbackQuery({
    text: done ? "Unlocked! Anyone can now create this market." : i >= 0 ? "Vote removed." : `Vote counted (${d.voters.length}/${d.need}).`,
  });
  await ctx.editMessageReplyMarkup({ reply_markup: draftKb(id) }).catch(() => {});
});

bot.callbackQuery("odds", async (ctx) => { await ctx.answerCallbackQuery(); return doOdds(ctx, []); });
bot.callbackQuery("ideas", async (ctx) => { await ctx.answerCallbackQuery(); return sendIdeas(ctx); });
bot.callbackQuery(/^ex:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const idea = IDEAS[Number(ctx.match[1])];
  if (!idea) return;
  await ctx.reply(`Drafting: ${idea.claim}`);
  return doCall(ctx, idea.claim);
});

bot.catch((err) => console.error("Bot error:", err.message));
await bot.api
  .setMyCommands([
    { command: "odds", description: "Find live markets (try: /odds bitcoin)" },
    { command: "call", description: "Draft a new market from a claim" },
    { command: "ideas", description: "Tap an example to try" },
    { command: "help", description: "How to use I-Called-It" },
  ])
  .catch((e) => console.error("setMyCommands:", e.message));
bot.start();
console.log("Bot is running. Press Ctrl+C to stop.");
