import crypto from "node:crypto";
import { Bot, InlineKeyboard } from "grammy";
import { draftMarket } from "./writer.js";
import { loadMarkets, normalize, pct } from "./panta.js";
import { kv } from "./kv.js";

const NOPREVIEW = { link_preview_options: { is_disabled: true } };
const VOTES_NEEDED = Math.max(1, Number(process.env.VOTE_THRESHOLD) || 3);
const needFor = (chatType) => (chatType === "private" ? 1 : VOTES_NEEDED);
const voterKey = (uid) => crypto.createHash("sha256").update(String(uid)).digest("hex").slice(0, 12);

const IDEAS = [
  { label: "Bitcoin above $100k by year end", claim: "Bitcoin above $100k by end of the year" },
  { label: "Ethereum above $5,000 by year end", claim: "Ethereum above $5,000 by end of the year" },
  { label: "Solana above $300 by year end", claim: "Solana above $300 by end of the year" },
  { label: "Man City win their next match", claim: "Manchester City win their next Premier League match" },
  { label: "Real Madrid win their next match", claim: "Real Madrid win their next La Liga match" },
];

export function createBot({ siteBase }) {
  const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
  const TRADE_BASE = process.env.TRADE_PAGE_URL || `${siteBase}/trade`;
  const SITE = (() => { try { return new URL(TRADE_BASE).origin; } catch { return siteBase; } })();

  const mainMenu = () => new InlineKeyboard().text("🔎 Live markets", "odds").text("💡 Ideas to try", "ideas").row().url("🌐 Open the website", SITE);
  const ideasKb = () => {
    const kb = new InlineKeyboard();
    IDEAS.forEach((x, i) => kb.text(x.label, `ex:${i}`).row());
    return kb.text("🔎 Live markets", "odds");
  };
  const sendIdeas = (ctx) => ctx.reply("Tap an idea to draft a market from it.\nOr type your own: /call <your claim>", { reply_markup: ideasKb() });

  function createLink(d) {
    const payload = Buffer.from(
      JSON.stringify({ q: d.question, r: d.resolutionRule, s: d.sourcesOfTruth, c: d.category, a: d.startAt, b: d.endAt, x: d.resolveAt })
    ).toString("base64url");
    return payload.length < 1800 ? `${SITE}/create?d=${payload}` : null;
  }
  async function draftKb(id) {
    const d = await kv.getJson(`draft:${id}`);
    const n = await kv.countVoters(id);
    const kb = new InlineKeyboard().text(`👍 I'd trade this (${n}/${d.need})`, `v:${id}`).row();
    const link = n >= d.need ? createLink(d) : null;
    if (link) kb.url("🚀 Create this market", link).row();
    return kb.text("💡 More ideas", "ideas").text("🔎 Live markets", "odds");
  }

  async function doOdds(ctx, words) {
    const wait = await ctx.reply("Searching Panta markets...");
    const show = (msg, extra = {}) => ctx.api.editMessageText(ctx.chat.id, wait.message_id, msg, { ...NOPREVIEW, ...extra });
    try {
      const raw = await loadMarkets();
      const all = raw.map(normalize);
      const stillOpen = all.filter((m) => m.phase !== "closed");
      const items = stillOpen.length ? stillOpen : all;
      const sandbox = /sandbox|fixture/i.test(JSON.stringify(raw[0] || {}).slice(0, 3000));
      const hay = (m) => `${m.title} ${m.raw.description || ""} ${m.category}`.toLowerCase();
      let hits = words.length ? items.filter((m) => words.every((w) => hay(m).includes(w))) : items;
      hits = hits.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 5);
      const noneOpen = !stillOpen.length;
      const head = noneOpen
        ? "No markets are open on Panta right now. Showing recent closed ones"
        : `${sandbox ? "Sandbox markets (test key, not real)" : "Live Panta markets"} - searched ${items.length}`;
      if (!hits.length) {
        return show(`${head}\n\nNo markets matched that. Draft your own with /call, or tap an idea.\n\nPowered by Panta`, {
          reply_markup: new InlineKeyboard().text("💡 Ideas to try", "ideas"),
        });
      }
      const lines = hits.map((m, i) => {
        const y = pct(m.prices.yes), n = pct(m.prices.no);
        const price = y != null || n != null ? `YES ${y ?? "?"}% / NO ${n ?? "?"}%` : "price: not shown yet";
        const phase = m.phase === "secondary" ? "secondary market" : m.phase || "?";
        return `${i + 1}. ${m.title}\n   ${price} - ${phase}${m.endTime ? ` - closes ${m.endTime.slice(0, 10)}` : ""}${m.volume != null ? ` - vol $${m.volume.toFixed(2)}` : ""}`;
      });
      const kb = new InlineKeyboard();
      const hasSecondary = hits.some((m) => m.phase === "secondary");
      if (!noneOpen) {
        let any = false;
        hits.forEach((m, i) => {
          if (m.phase !== "primary") return;
          kb.url(`Trade #${i + 1}`, `${TRADE_BASE}?market=${encodeURIComponent(m.id)}`);
          any = true;
          if (i % 3 === 2) kb.row();
        });
        if (any) kb.row();
        if (hasSecondary) kb.url("Trade secondary markets on panta.market", "https://www.panta.market/").row();
      }
      kb.text("💡 Ideas to try", "ideas");
      const tip = noneOpen
        ? "\n\nNothing to trade at the moment. Draft your own with /call, and your group can vote to create it."
        : hasSecondary
          ? "\n\nSecondary-phase markets can't be bought through the Panta API yet, so trade those on panta.market."
          : "";
      await show(`${head}:\n\n${lines.join("\n\n")}${tip}\n\nPowered by Panta`, { reply_markup: kb });
    } catch (e) {
      console.error("odds:", e.message);
      await show("Sorry, I couldn't load markets right now. Try again in a moment." + (process.env.BOT_DEBUG ? `\n\n[debug] ${String(e.message).slice(0, 300)}` : ""));
    }
  }

  async function doCall(ctx, text) {
    const wait = await ctx.reply("Drafting your market...");
    const show = (msg, extra = {}) => ctx.api.editMessageText(ctx.chat.id, wait.message_id, msg, { ...NOPREVIEW, ...extra });
    const nav = new InlineKeyboard().text("💡 More ideas", "ideas").text("🔎 Live markets", "odds");
    try {
      const d = await draftMarket(text);
      if (d.clear === false) return show(`I can't make that one a market.\nWhy: ${d.issue}\nTry: ${d.suggestion}`, { reply_markup: nav });
      const id = crypto.randomBytes(4).toString("hex");
      const need = needFor(ctx.chat && ctx.chat.type);
      await kv.setJson(`draft:${id}`, { ...d, need });
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
        { reply_markup: await draftKb(id) }
      );
    } catch (e) {
      console.error("call:", e.message);
      await show("Sorry, I couldn't draft that. Try again in a moment." + (process.env.BOT_DEBUG ? `\n\n[debug] ${String(e.message).slice(0, 300)}` : ""), { reply_markup: nav });
    }
  }

  bot.command("start", (ctx) =>
    ctx.reply(
      "Hi! I turn group-chat arguments into live prediction odds.\n\n🔎 /odds bitcoin - find live markets\n✍️ /call <claim> - draft a new market\n💡 /ideas - tap an example to try\n\nNot sure where to start? Tap a button below.\n\nPowered by Panta",
      { reply_markup: mainMenu() }
    )
  );
  bot.command("help", (ctx) =>
    ctx.reply(
      "How to use I-Called-It:\n\n/odds - the busiest open markets\n/odds bitcoin - search markets by word\n/call Bitcoin above 100k by end of the year - draft a market\n/ideas - tap an example\n\nMarkets are settled from public websites, so opinions and private bets can't be markets.\n\nPowered by Panta",
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
    const d = await kv.getJson(`draft:${id}`);
    if (!d) return ctx.answerCallbackQuery({ text: "This draft expired. Draft it again with /call.", show_alert: true });
    const { count, added } = await kv.toggleVoter(id, voterKey(ctx.from.id));
    await ctx.answerCallbackQuery({
      text: count >= d.need ? "Unlocked! Anyone can now create this market." : added ? `Vote counted (${count}/${d.need}).` : "Vote removed.",
    });
    await ctx.editMessageReplyMarkup({ reply_markup: await draftKb(id) }).catch(() => {});
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
  return bot;
}
