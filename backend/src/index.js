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
  getSeventvEmotes,
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

// Sesión STATELESS: los datos del usuario y sus tokens de Twitch van
// firmados dentro de la cookie JWT (httpOnly + Secure). Así la sesión
// sobrevive a reinicios/deploys del backend y no hay que re-loguear.
function readSession(req) {
  const cookies = cookie.parse(req.headers.cookie || "");
  if (!cookies.session) return null;
  try {
    return jwt.verify(cookies.session, JWT_SECRET);
  } catch {
    return null;
  }
}

function sessionCookie(s) {
  const token = jwt.sign(
    {
      userId: s.userId,
      login: s.login,
      displayName: s.displayName,
      accessToken: s.accessToken,
      refreshToken: s.refreshToken,
      expiresAt: s.expiresAt,
    },
    JWT_SECRET,
    { expiresIn: "30d" },
  );
  return cookie.serialize("session", token, {
    ...COOKIE_OPTS,
    maxAge: 30 * 24 * 3600,
  });
}

// Devuelve un token de usuario válido (refrescándolo si caducó) y, si lo
// refresca, una cookie nueva para reescribir la sesión.
async function validToken(s) {
  if (Date.now() < s.expiresAt - 60_000) return { token: s.accessToken };
  const t = await refresh(s.refreshToken);
  s.accessToken = t.access_token;
  s.refreshToken = t.refresh_token || s.refreshToken;
  s.expiresAt = Date.now() + t.expires_in * 1000;
  return { token: s.accessToken, cookie: sessionCookie(s) };
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

// ── Emotes de 7TV (para pintarlos en el chat) ───────────────
app.get("/api/twitch/emotes", async (_req, res) => {
  try {
    res.json({ emotes: await getSeventvEmotes() });
  } catch {
    res.json({ emotes: {} });
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

    const session = {
      userId: me.id,
      login: me.login,
      displayName: me.display_name,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: Date.now() + tok.expires_in * 1000,
    };
    res.setHeader("Set-Cookie", [
      sessionCookie(session),
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
app.post("/auth/logout", (_req, res) => {
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
    const { token, cookie: newCookie } = await validToken(s);
    if (newCookie) res.setHeader("Set-Cookie", newCookie);
    await sendMessage({ userToken: token, senderId: s.userId, message });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Servidor HTTP + WebSocket del chat ──────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

// Viewers: web (conexiones WS abiertas ≈ pestañas viendo) + Twitch.
// NOTA: los viewers web NO se pueden sumar al contador oficial de
// Twitch; aquí los contamos y exponemos por separado + el total.
app.get("/api/viewers", async (_req, res) => {
  let twitch = null;
  try {
    const s = await getStream();
    twitch = s.live ? s.viewers : null;
  } catch {
    /* ignore */
  }
  res.json({ web: wss.clients.size, twitch });
});

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));
  // al conectar, manda el historial reciente
  ws.send(JSON.stringify({ type: "history", messages: recentMessages() }));
  const off = onMessage((msg) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "message", message: msg }));
    }
  });
  ws.on("close", off);
});

// Keepalive: ping cada 30s para que Cloudflare no corte la conexión
// por inactividad (y limpiar las que se quedaron muertas).
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

startChat();

server.listen(PORT, () => {
  console.log(`backend escuchando en :${PORT}`);
});
