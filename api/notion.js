const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://athlete-proxy.vercel.app";
// Only Notion API resources these apps actually need
const ENDPOINT_RE = /^(pages|databases|blocks|search)(\/[A-Za-z0-9_-]+)*$/;
const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH"]);

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

  const { endpoint, method = "PATCH", body: notionBody } = body || {};

  if (!endpoint) {
    return res.status(400).json({ error: "Missing endpoint" });
  }
  if (typeof endpoint !== "string" || !ENDPOINT_RE.test(endpoint)) {
    return res.status(400).json({ error: "Invalid endpoint" });
  }
  if (!ALLOWED_METHODS.has(method)) {
    return res.status(400).json({ error: "Invalid method" });
  }

  const apiRes = await fetch(`https://api.notion.com/v1/${endpoint}`, {
    method,
    headers: {
      "Authorization": `Bearer ${process.env.NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: method !== "GET" ? JSON.stringify(notionBody) : undefined,
  });

  const text = await apiRes.text();
  res.setHeader("Content-Type", "application/json");
  return res.status(apiRes.status).send(text);
}
