import express from "express";
import http from "node:http";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import * as cookie from "cookie";
import { WebSocketServer } from "ws";

import {
  loginUrl,
  exchangeCode,
  refresh,
  getSelf,
  getStream,
  sendMessage,
} from "./twitch.js";
import { startChat, onMessage, recentMessages } from "./chat.js";

const app = express();
const PORT = process.env.PORT || 3001;
const MEDIAMTX_API_URL = process.env.MEDIAMTX_API_URL || "http://127.0.0.1:9997";
const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret";
const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
};

app.use(express.json());

// Sesiones en memoria: sid -> datos del usuario + tokens de Twitch.
// (se pierden al reiniciar el backend; el usuario vuelve a hacer login)
const sessions = new Map();

function readSession(req) {
  const cookies = cookie.parse(req.headers.cookie || "");
  if (!cookies.session) return null;
  try {
    const { sid } = jwt.verify(cookies.session, JWT_SECRET);
    const s = sessions.get(sid);
    return s ? { sid, ...s } : null;
  } catch {
    return null;
  }
}

// Devuelve un token de usuario válido, refrescándolo si hace falta
async function validToken(sid, s) {
  if (Date.now() < s.expiresAt - 60_000) return s.accessToken;
  const t = await refresh(s.refreshToken);
  s.accessToken = t.access_token;
  s.refreshToken = t.refresh_token || s.refreshToken;
  s.expiresAt = Date.now() + t.expires_in * 1000;
  sessions.set(sid, s);
  return s.accessToken;
}

// ── Health ──────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ── Estado del stream (MediaMTX: ¿hay anime en directo?) ────
app.get("/api/stream/status", async (_req, res) => {
  try {
    const r = await fetch(`${MEDIAMTX_API_URL}/v3/paths/get/web`);
    if (!r.ok) return res.json({ live: false });
    const data = await r.json();
    res.json({ live: Boolean(data.ready) });
  } catch (err) {
    res.json({ live: false, error: err.message });
  }
});

// ── Viewers + info del stream en Twitch ─────────────────────
app.get("/api/twitch/stream", async (_req, res) => {
  try {
    res.json(await getStream());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── OAuth: iniciar login ────────────────────────────────────
app.get("/auth/twitch/login", (_req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  res.setHeader(
    "Set-Cookie",
    cookie.serialize("tw_state", state, { ...COOKIE_OPTS, maxAge: 600 }),
  );
  res.redirect(loginUrl(state));
});

// ── OAuth: callback ─────────────────────────────────────────
app.get("/auth/twitch/callback", async (req, res) => {
  try {
    const cookies = cookie.parse(req.headers.cookie || "");
    if (!req.query.code || req.query.state !== cookies.tw_state) {
      return res.status(400).send("estado OAuth inválido");
    }
    const tok = await exchangeCode(req.query.code);
    const me = await getSelf(tok.access_token);
    if (!me) return res.status(500).send("no se pudo obtener el usuario");

    const sid = crypto.randomBytes(16).toString("hex");
    sessions.set(sid, {
      userId: me.id,
      login: me.login,
      displayName: me.display_name,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: Date.now() + tok.expires_in * 1000,
    });
    const token = jwt.sign({ sid }, JWT_SECRET, { expiresIn: "30d" });
    res.setHeader("Set-Cookie", [
      cookie.serialize("session", token, {
        ...COOKIE_OPTS,
        maxAge: 30 * 24 * 3600,
      }),
      cookie.serialize("tw_state", "", { ...COOKIE_OPTS, maxAge: 0 }),
    ]);
    res.redirect("/");
  } catch (err) {
    res.status(500).send(`error en el login: ${err.message}`);
  }
});

// ── Quién soy ───────────────────────────────────────────────
app.get("/api/me", (req, res) => {
  const s = readSession(req);
  if (!s) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, login: s.login, displayName: s.displayName });
});

// ── Logout ──────────────────────────────────────────────────
app.post("/auth/logout", (req, res) => {
  const s = readSession(req);
  if (s) sessions.delete(s.sid);
  res.setHeader(
    "Set-Cookie",
    cookie.serialize("session", "", { ...COOKIE_OPTS, maxAge: 0 }),
  );
  res.json({ ok: true });
});

// ── Enviar mensaje al chat ──────────────────────────────────
app.post("/api/chat/send", async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "no has iniciado sesión" });
  const message = (req.body?.message || "").trim();
  if (!message) return res.status(400).json({ error: "mensaje vacío" });
  try {
    const token = await validToken(s.sid, sessions.get(s.sid));
    await sendMessage({ userToken: token, senderId: s.userId, message });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Servidor HTTP + WebSocket del chat ──────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  // al conectar, manda el historial reciente
  ws.send(JSON.stringify({ type: "history", messages: recentMessages() }));
  const off = onMessage((msg) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "message", message: msg }));
    }
  });
  ws.on("close", off);
});

startChat();

server.listen(PORT, () => {
  console.log(`backend escuchando en :${PORT}`);
});
