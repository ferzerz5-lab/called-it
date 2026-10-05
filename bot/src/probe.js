// Prints real Panta response shapes so we can match them exactly. Run: npm run probe
import { listMarkets, getMarket } from "./panta.js";
const list = await listMarkets({ limit: 3 });
console.log("--- /markets/ ---\n" + JSON.stringify(list, null, 2).slice(0, 3500));
const { items: _i, ...rest } = list;
console.log("\n--- list extras (paging etc.) ---\n" + JSON.stringify(rest));
console.log("--- first item keys ---\n" + Object.keys((list.items || [])[0] || {}).join(", "));
const first = (list.items || [])[0];
if (first) {
  const d = await getMarket(first.marketId || first.id);
  console.log("\n--- /markets/{id}/ ---\n" + JSON.stringify(d, null, 2).slice(0, 3500));
}
