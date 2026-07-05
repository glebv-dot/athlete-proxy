const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://athlete-proxy.vercel.app";
const MAX_TOKENS_CAP = 4000;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-app-key");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Optional shared-secret auth: enforced once APP_SECRET is set in Vercel env
  if (process.env.APP_SECRET && req.headers["x-app-key"] !== process.env.APP_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let body = req.body;

  if (!body || Object.keys(body).length === 0) {
    body = await new Promise((resolve) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({}); }
      });
    });
  } else if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  if (!body?.messages) {
    return res.status(400).json({ error: "Missing messages" });
  }
  if (typeof body.model !== "string" || !/^claude-[a-z0-9.-]+$/.test(body.model)) {
    return res.status(400).json({ error: "Invalid model" });
  }
  body.max_tokens = Math.min(Number(body.max_tokens) || 300, MAX_TOKENS_CAP);

  const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const text = await apiRes.text();
  res.setHeader("Content-Type", "application/json");
  return res.status(apiRes.status).send(text);
}
