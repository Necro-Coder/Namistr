import express from "express";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const app = express();
const PORT = process.env.PORT || 3001;
const RECORDINGS_PATH = process.env.RECORDINGS_PATH || "/recordings";
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

// Listado de grabaciones disponibles
app.get("/api/recordings", async (_req, res) => {
  try {
    const entries = await readdir(join(RECORDINGS_PATH, "stream"), {
      withFileTypes: true,
    }).catch(() => []);
    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith(".mp4"))
      .map((e) => e.name)
      .sort()
      .reverse();
    res.json({ recordings: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`backend escuchando en :${PORT}`);
});
