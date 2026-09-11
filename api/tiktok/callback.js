const REDIRECT_URI =
  "https://b-music02-backend.vercel.app/api/tiktok/callback";

const TOKEN_KEY = "b_music02:tiktok_tokens";

function getCookie(req, name) {
  const cookies = req.headers.cookie || "";
  const match = cookies
    .split(";")
    .map(v => v.trim())
    .find(v => v.startsWith(name + "="));

  return match
    ? decodeURIComponent(match.split("=").slice(1).join("="))
    : null;
}

async function redis(command) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error("Redis bağlantı bilgileri bulunamadı.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || "Redis işlemi başarısız.");
  }

  return data.result;
}

module.exports = async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error_description || error
      });
    }

    const savedState = getCookie(req, "tiktok_oauth_state");

    if (!code) {
      return res.status(400).json({
        ok: false,
        message: "TikTok yetkilendirme kodu bulunamadı."
      });
    }

    if (!state || !savedState || state !== savedState) {
      return res.status(400).json({
        ok: false,
        message: "Güvenlik doğrulaması başarısız."
      });
    }

    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

    const tokenBody = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI
    });

    const tokenResponse = await fetch(
      "https://open.tiktokapis.com/v2/oauth/token/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: tokenBody
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      return res.status(500).json({
        ok: false,
        message: "TikTok erişim anahtarı alınamadı."
      });
    }

    const now = Date.now();

    const storedTokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      open_id: tokenData.open_id,
      scope: tokenData.scope,
      access_expires_at:
        now + Number(tokenData.expires_in || 0) * 1000,
      refresh_expires_at:
        now + Number(tokenData.refresh_expires_in || 0) * 1000
    };

    await redis([
      "SET",
      TOKEN_KEY,
      JSON.stringify(storedTokens)
    ]);

    res.setHeader(
      "Set-Cookie",
      "tiktok_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
    );

    return res.status(200).json({
      ok: true,
      message:
        "B_music02 TikTok hesabı bağlandı ve bilgiler güvenli şekilde kaydedildi."
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: err.message || "Sunucu hatası oluştu."
    });
  }
};
