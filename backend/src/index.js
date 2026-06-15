import express from "express";

const app = express();
const PORT = process.env.PORT || 3001;
const MEDIAMTX_API_URL = process.env.MEDIAMTX_API_URL || "http://127.0.0.1:9997";

app.use(express.json());

// Health check (usado por el smoke test del CI/CD)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Estado del stream en vivo (consulta la API de MediaMTX)
app.get("/api/stream/status", async (_req, res) => {
  try {
    const r = await fetch(`${MEDIAMTX_API_URL}/v3/paths/get/web`);
    if (!r.ok) return res.json({ live: false });
    const data = await r.json();
    res.json({ live: Boolean(data.ready), source: data.source ?? null });
  } catch (err) {
    res.json({ live: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`backend escuchando en :${PORT}`);
});
