const TOKEN_KEY = "b_music02:tiktok_tokens";

async function redis(command) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error("Redis bağlantısı bulunamadı.");
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

async function saveTokens(tokens) {
  await redis(["SET", TOKEN_KEY, JSON.stringify(tokens)]);
}

async function refreshAccessToken(tokens) {
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token
  });

  const response = await fetch(
    "https://open.tiktokapis.com/v2/oauth/token/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }
  );

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error("TikTok erişim anahtarı yenilenemedi.");
  }

  const now = Date.now();

  const newTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    open_id: data.open_id || tokens.open_id,
    scope: data.scope || tokens.scope,
    access_expires_at:
      now + Number(data.expires_in || 0) * 1000,
    refresh_expires_at:
      now + Number(data.refresh_expires_in || 0) * 1000
  };

  await saveTokens(newTokens);

  return newTokens;
}

module.exports = async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const stored = await redis(["GET", TOKEN_KEY]);

    if (!stored) {
      return res.status(401).json({
        ok: false,
        message: "TikTok hesabı henüz bağlanmamış."
      });
    }

    let tokens = JSON.parse(stored);

    // Tokenın bitmesine 5 dakikadan az kaldıysa otomatik yenile.
    if (
      !tokens.access_expires_at ||
      Date.now() >= tokens.access_expires_at - 5 * 60 * 1000
    ) {
      tokens = await refreshAccessToken(tokens);
    }

    const body = {
      max_count: 20
    };

    if (req.query.cursor) {
      body.cursor = Number(req.query.cursor);
    }

    const response = await fetch(
      "https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,create_time,duration,cover_image_url,share_url,embed_link",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    const data = await response.json();

    if (
      !response.ok ||
      (data.error && data.error.code && data.error.code !== "ok")
    ) {
      return res.status(502).json({
        ok: false,
        message: "TikTok videoları alınamadı.",
        error: data.error || null
      });
    }

    return res.status(200).json({
      ok: true,
      video_count: data.data?.videos?.length || 0,
      videos: data.data?.videos || [],
      cursor: data.data?.cursor || null,
      has_more: data.data?.has_more || false
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error.message || "Sunucu hatası oluştu."
    });
  }
};
