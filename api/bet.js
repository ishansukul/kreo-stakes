export default async function handler(req, res) {
  // Set CORS headers for all origins
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const spreadsheetId = process.env.SPREADSHEET_ID || "1tOdnzNytmAxahKhH4lgJzKrtGeQcMzwi52MGS-6jWBE";

  if (!clientId || !clientSecret || !refreshToken) {
    return res.status(500).json({ error: "Missing Google OAuth credentials" });
  }

  // Helper to get access token from refresh token
  async function getAccessToken() {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error("Failed to refresh Google token: " + JSON.stringify(tokenData));
    }
    return tokenData.access_token;
  }

  // GET: Fetch all bets from Google Sheet
  if (req.method === "GET") {
    try {
      const accessToken = await getAccessToken();
      const sheetRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Bets!A2:F`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );
      const data = await sheetRes.json();
      const rows = data.values || [];

      const bets = rows.map((r) => ({
        timestamp: r[0] || "",
        bettor: r[1] || "",
        market: r[2] || "",
        pick: r[3] || "",
        amount: parseFloat(r[4]) || 0,
        status: r[5] || "Confirmed"
      }));

      return res.status(200).json({ success: true, bets });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST: Append a new bet to Google Sheet
  if (req.method === "POST") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { bettor, market, pick, amount } = body;

      if (!bettor || !market || !pick || !amount) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount < 50 || numAmount > 200) {
        return res.status(400).json({ error: "Bet must be between ₹50 and ₹200" });
      }

      const accessToken = await getAccessToken();
      const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

      const appendRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Bets!A:F:append?valueInputOption=USER_ENTERED`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            values: [[timestamp, bettor, market, pick, numAmount, "Confirmed"]]
          })
        }
      );

      const appendData = await appendRes.json();
      return res.status(200).json({
        success: true,
        bet: { timestamp, bettor, market, pick, amount: numAmount },
        updates: appendData.updates
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
