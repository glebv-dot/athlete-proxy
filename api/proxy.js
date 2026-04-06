export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  let body = req.body;

  // Manual parse if body isn't already an object
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  if (!body || !body.messages) {
    res.status(400).json({ error: "Bad request", body: JSON.stringify(body) });
    return;
  }

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
  res.status(apiRes.status).send(text);
}
