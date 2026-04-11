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

  if (!body?.messages) {
        return res.status(400).json({ error: "Missing messages", received: body });
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
    return res.status(apiRes.status).send(text);
}
