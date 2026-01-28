export default function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      error: "id missing"
    });
  }

  res.status(200).json({
    id,
    status: "ok"
  });
}
