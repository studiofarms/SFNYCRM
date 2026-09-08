// POST /.netlify/functions/gcal-refresh
// Body: { refresh_token }
// Env:  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (same ones you gave Supabase)
// Google access tokens die after an hour; this trades the refresh token for a fresh one.

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "POST only" };
  const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return { statusCode: 500, body: "Google client env vars not set." };

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "Bad JSON" }; }
  if (!body.refresh_token) return { statusCode: 400, body: "refresh_token required" };

  const params = new URLSearchParams({
    client_id: id, client_secret: secret,
    refresh_token: body.refresh_token, grant_type: "refresh_token"
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) return { statusCode: 401, body: JSON.stringify(data) };
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ access_token: data.access_token, expires_in: data.expires_in })
  };
};
