// Lists the Gemini models your key can use. Run: npm run models
const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
  headers: { "x-goog-api-key": process.env.GEMINI_API_KEY || "" },
});
if (!r.ok) { console.error("Error", r.status, (await r.text()).slice(0, 300)); process.exit(1); }
const j = await r.json();
for (const m of j.models ?? [])
  if (m.supportedGenerationMethods?.includes("generateContent")) console.log(m.name.replace("models/", ""));
