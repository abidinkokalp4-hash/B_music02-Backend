const REDIRECT_URI =
  "https://b-music02-backend.vercel.app/api/tiktok/callback";

function getCookie(req, name) {
  const cookies = req.headers.cookie || "";
  const match = cookies
    .split(";")
    .map(v => v.trim())
    .find(v => v.startsWith(name + "="));

  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
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

    if (!clientKey || !clientSecret) {
      return res.status(500).json({
        ok: false,
        message: "TikTok sunucu anahtarları bulunamadı."
      });
    }

    const tokenBody = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code: code,
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
        message: "TikTok erişim anahtarı alınamadı.",
        error: tokenData.error || null,
        error_description: tokenData.error_description || null
      });
    }

    const videoResponse = await fetch(
      "https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,create_time,cover_image_url,share_url,embed_link",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          max_count: 20
        })
      }
    );

    const videoData = await videoResponse.json();

    res.setHeader(
      "Set-Cookie",
      "tiktok_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
    );

    return res.status(200).json({
      ok: true,
      message: "B_music02 TikTok bağlantısı başarılı.",
      video_count: videoData.data?.videos?.length || 0,
      videos: videoData.data?.videos || [],
      has_more: videoData.data?.has_more || false
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Sunucu hatası oluştu."
    });
  }
};
