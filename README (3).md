# I-Called-It

Turn group-chat arguments into live prediction odds. A Telegram bot and a small website that bring **Panta** prediction markets into the chats people already use.

> Built for the Colosseum Crypto World's Fair hackathon (Panta API sidetrack). **Powered by Panta.**

## What it does
- **Find markets:** `/odds bitcoin` searches live Panta markets and shows odds, close time and volume, with a Trade button.
- **Draft markets with AI:** `/call <claim>` turns a casual claim into a clear YES/NO question with a deadline, a precise resolution rule and public sources. Claims no public website can settle (opinions, private bets) are politely refused.
- **Decide as a group before paying:** creating a market costs about $50 USDC on Panta, so each draft has a **"I'd trade this"** vote. The Create button unlocks only after enough people in the chat opt in (solo chats unlock with one tap).
- **Create:** the website's Create page pre-fills the draft, draws the market image, asks Panta for the exact fee, builds the transaction and registers the market after the wallet signs.
- **Trade:** the Trade page asks Panta for a quote, builds the transaction, and the user's own wallet signs it. The trade is then submitted, verified and reported to Panta.
- **Website:** Home, live Markets, Create, Trade, How it works.

Non-custodial: the app never holds funds or keys. Every payment is signed in the user's wallet.

## How the Panta API is used
All calls go through a small server-side proxy (`web/api/panta.js`) that keeps the API key secret and allows only the routes below.

| Purpose | Panta endpoint |
| --- | --- |
| Market discovery (bot + site) | `GET /markets/`, `GET /markets/{id}/` |
| Create a market | `POST /markets/create/image-upload/`, `/markets/create/quote/`, `/markets/create/build/`, `/markets/register/` |
| Buy YES/NO | `POST /primaryorderquote/`, `/primaryorderbuild/`, `/primaryordersubmit/`, `/primaryorderverify/` |
| Attribution | `POST /trades/` |

The required "Powered by Panta" credit is shown in the bot replies and on every page.

## Honest status
- Verified against the live Panta API: market listing and detail, real buy quotes, building the buy transaction (the wallet's signing prompt opened), the create-market fee quote ($50.00 = $40 platform fee + $10 starting liquidity), market image upload, and **building the create-market transaction** (a `?dry=1` dry run returned a real 1,041-byte transaction and stopped before signing).
- **Not yet verified:** a complete signed trade or market creation on mainnet. Signing needs a funded wallet, and wallets may warn about new, unreviewed domains until the site is reviewed (a review request has been sent to Phantom).
- The group leaderboard is planned but not built; the site labels it "Coming soon".
- Votes are stored in a local JSON file (hashed voter codes only); a database would replace this in production.

## Run it
**Bot** (Node 20+):
```
cd bot
npm install
copy .env.example .env     # then fill in your keys
npm start
```
**Website** (Vercel, free):
```
cd web
npx vercel
npx vercel env add PANTA_API_KEY production    # use a pk_live_ key
npx vercel --prod
```
Set `TRADE_PAGE_URL` in the bot's `.env` to the deployed site address.

## Safety notes
- Secrets live only in `.env` (bot) and Vercel environment variables (site). Never commit them.
- Prediction markets involve risk; only use money you can afford to lose.
