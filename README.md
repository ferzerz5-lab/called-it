# I-Called-It

Turn group-chat arguments into live prediction odds. A Telegram bot and a website that bring **Panta** prediction markets into the chats people already use.

> Built for the Colosseum Crypto World's Fair hackathon (Panta API sidetrack). **Powered by Panta.**

- Website: https://called-it-brown.vercel.app
- Telegram bot: https://t.me/ICalledItBot (always on, runs on Vercel)

## What it does
- **Find markets:** `/odds bitcoin` searches live Panta markets and shows odds, close time and volume. Markets in the buyable (primary) phase get a Trade button; secondary-phase markets are labelled and linked to panta.market, because the Panta API only supports buying in the primary phase.
- **Draft markets with AI:** `/call <claim>` turns a casual claim into a clear YES/NO question with a deadline, a precise resolution rule and public sources. Claims no public website can settle (opinions, private bets) are politely refused.
- **Decide as a group before paying:** creating a market costs about $50 USDC on Panta ($40 platform fee + $10 starting liquidity), so each draft has an **"I'd trade this"** vote. The Create button unlocks only after enough people in the chat opt in (solo chats unlock with one tap).
- **Create:** the Create page pre-fills the draft, draws the market image, asks Panta for the exact fee, builds the transaction, and registers the market after the wallet signs.
- **Trade:** the Trade page asks Panta for a quote, builds the transaction, and the user's own wallet signs it; the trade is then submitted, verified and reported to Panta.
- **Website:** Home, live Markets, Create, Trade, How it works.

Non-custodial: the app never holds funds or keys. Every payment is signed in the user's wallet.

## Architecture (all in `web/`, deployed on Vercel)
| Piece | File |
| --- | --- |
| Site pages | `index.html`, `markets.html`, `create.html`, `trade.html`, `how.html` |
| Panta proxy (keeps the API key secret, allows only the routes below) | `api/panta.js` |
| Telegram webhook (always-on bot) | `api/telegram.js`, `lib/botCore.js` |
| One-time webhook setup, private diagnostics | `api/setup.js`, `api/diag.js` |
| Panta client, AI market writer (Gemini), vote store (Upstash Redis, memory fallback) | `lib/panta.js`, `lib/writer.js`, `lib/kv.js` |

## How the Panta API is used
| Purpose | Panta endpoint |
| --- | --- |
| Market discovery (bot + site) | `GET /markets/`, `GET /markets/{id}/` |
| Create a market | `POST /markets/create/image-upload/`, `/markets/create/quote/`, `/markets/create/build/`, `/markets/register/` |
| Buy YES/NO | `POST /primaryorderquote/`, `/primaryorderbuild/`, `/primaryordersubmit/`, `/primaryorderverify/` |
| Attribution | `POST /trades/` |

"Powered by Panta" is shown in the bot replies and on every page.

## Honest status
- **Verified against the live Panta API:** market listing and detail (including phases), real buy quotes and a built buy transaction while a primary market was open, the create-market fee quote ($50.00), market image upload, and a built create-market transaction (a `?dry=1` dry run returned a real 1,041-byte transaction and stopped before signing). The bot runs 24/7 as a Vercel webhook.
- **Not yet verified:** a complete signed trade or market creation on mainnet. Signing needs a funded wallet, and wallets may warn about new, unreviewed domains until the site is reviewed (a review request has been sent to Phantom).
- **Panta's catalog is quiet at times:** there are periods with no primary-phase markets to buy, which is why creation and the group vote matter.
- The group leaderboard is planned but not built; the site labels it "Coming soon".

## Run it yourself
1. `cd web`, then `npx vercel` to create the project.
2. Add environment variables (Production): `PANTA_API_KEY` (use a `pk_live_` key), `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `SETUP_KEY` (any long random word). Connect a free Upstash Redis database in Vercel's Storage tab for votes.
3. `npx vercel --prod`, then open `/api/setup?key=<SETUP_KEY>` once to connect Telegram.
4. Optional: `VOTE_THRESHOLD` (default 3) sets how many people must opt in before Create unlocks in a group.

## Safety notes
- Secrets live only in Vercel environment variables (and a local `.env` for the legacy bot). Never commit them.
- Prediction markets involve risk; only use money you can afford to lose.
