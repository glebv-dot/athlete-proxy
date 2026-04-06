export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

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
    return res.status(400).json({ error: "Missing endpoint", received: body });
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
