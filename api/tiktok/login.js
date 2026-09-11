const crypto = require("crypto");

const REDIRECT_URI =
  "https://b-music02-backend.vercel.app/api/tiktok/callback";

module.exports = async (req, res) => {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;

  if (!clientKey) {
    return res.status(500).json({
      ok: false,
      message: "TikTok müşteri anahtarı bulunamadı."
    });
  }

  const state = crypto.randomBytes(24).toString("hex");

  res.setHeader(
    "Set-Cookie",
    `tiktok_oauth_state=${encodeURIComponent(state)}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`
  );

  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: "code",
    scope: "user.info.basic,video.list",
    redirect_uri: REDIRECT_URI,
    state
  });

  return res.redirect(
    `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`
  );
};
