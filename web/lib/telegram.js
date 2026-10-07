import crypto from "node:crypto";
// The webhook secret is derived from the bot token, so you never have to store a second secret.
export const secretFor = (token) => crypto.createHash("sha256").update("called-it:" + token).digest("hex").slice(0, 32);
export const COMMANDS = [
  { command: "odds", description: "Find live markets (try: /odds bitcoin)" },
  { command: "call", description: "Draft a new market from a claim" },
  { command: "ideas", description: "Tap an example to try" },
  { command: "help", description: "How to use I-Called-It" },
];
