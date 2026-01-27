export default function handler(req, res) {
  const { ip, port } = req.query;

  if (!ip || !port) {
    return res.status(400).json({ error: "ip or port missing" });
  }

  res.status(200).json({
    ip,
    port,
    status: "ok"
  });
}
