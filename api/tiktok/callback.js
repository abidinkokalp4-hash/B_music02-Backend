module.exports = async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(
      `TikTok bağlantısı başarısız: ${error_description || error}`
    );
  }

  if (!code) {
    return res.status(400).send("TikTok yetkilendirme kodu bulunamadı.");
  }

  return res.status(200).send(
    "B_music02 TikTok bağlantısı başarılı. Bu pencereyi kapatabilirsiniz."
  );
};
