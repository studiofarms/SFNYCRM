// POST /.netlify/functions/recap
// Body: { rep, weekLabel, stats, orders, shifts, meetings, samples, deals, popups }
// Env:  ANTHROPIC_API_KEY  (set in Netlify > Site configuration > Environment variables)

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "POST only" };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { statusCode: 500, body: "ANTHROPIC_API_KEY is not set on this site." };

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "Bad JSON" }; }

  const prompt = `You write short weekly field reports for Studio Farms NY, a craft cannabis grower in the Hudson Valley that sells wholesale to dispensaries. The report goes from a sales rep to the owner, Mike.

Write a recap for ${body.rep || "the rep"} covering ${body.weekLabel || "this week"}. Plain prose, 120-200 words, no headers, no bullet lists, no hype. Lead with what actually moved (orders, new accounts, samples placed), then pop-ups and meetings, then what's queued for next week. Mention numbers only when they're meaningful. If a week was quiet, say so plainly.

Data:
Totals: ${JSON.stringify(body.stats || {})}
Orders logged this week (this is the headline): ${JSON.stringify(body.orders || [])}
Shifts (pop-ups worked): ${JSON.stringify(body.shifts || [])}
Meetings: ${JSON.stringify(body.meetings || [])}
Samples dropped: ${JSON.stringify(body.samples || [])}
Pipeline changes: ${JSON.stringify(body.deals || [])}
Pop-ups booked ahead: ${JSON.stringify(body.popups || [])}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) return { statusCode: 502, body: "Anthropic API error: " + (await res.text()) };
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) };
};
