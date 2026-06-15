// Helpers para la API de Twitch: OAuth (login de usuario), token de app
// (client credentials), identidad, envío de mensajes y datos del stream.

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI =
  process.env.TWITCH_REDIRECT_URI ||
  "https://necro-coder.site/auth/twitch/callback";
export const CHANNEL = (process.env.TWITCH_CHANNEL || "").toLowerCase();

// Scopes que pedimos al usuario: solo poder escribir en el chat.
// (la lectura del chat es anónima, no necesita permiso del usuario)
const SCOPES = ["user:write:chat"];

const HELIX = "https://api.twitch.tv/helix";
const OAUTH = "https://id.twitch.tv/oauth2";

// ── App access token (client credentials), cacheado ─────────
let appToken = null;
let appTokenExp = 0;

async function getAppToken() {
  if (appToken && Date.now() < appTokenExp - 60_000) return appToken;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "client_credentials",
  });
  const r = await fetch(`${OAUTH}/token`, { method: "POST", body });
  if (!r.ok) throw new Error(`app token: ${r.status}`);
  const data = await r.json();
  appToken = data.access_token;
  appTokenExp = Date.now() + data.expires_in * 1000;
  return appToken;
}

async function helix(path, { token, params } = {}) {
  const url = new URL(`${HELIX}${path}`);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  const r = await fetch(url, {
    headers: {
      "Client-Id": CLIENT_ID,
      Authorization: `Bearer ${token || (await getAppToken())}`,
    },
  });
  if (!r.ok) throw new Error(`helix ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

// ── Usuarios ────────────────────────────────────────────────
const channelIdCache = { id: null };

export async function getChannelId() {
  if (channelIdCache.id) return channelIdCache.id;
  const data = await helix("/users", { params: { login: CHANNEL } });
  channelIdCache.id = data.data?.[0]?.id ?? null;
  return channelIdCache.id;
}

// Identidad del usuario a partir de SU token
export async function getSelf(userToken) {
  const data = await helix("/users", { token: userToken });
  return data.data?.[0] ?? null;
}

// ── Estado del stream en Twitch (viewers, título...) ────────
export async function getStream() {
  const data = await helix("/streams", { params: { user_login: CHANNEL } });
  const s = data.data?.[0];
  if (!s) return { live: false };
  return {
    live: true,
    viewers: s.viewer_count,
    title: s.title,
    game: s.game_name,
    startedAt: s.started_at,
  };
}

// ── OAuth: construir URL de login ───────────────────────────
export function loginUrl(state) {
  const url = new URL(`${OAUTH}/authorize`);
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

// Intercambiar el code por tokens del usuario
export async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
  });
  const r = await fetch(`${OAUTH}/token`, { method: "POST", body });
  if (!r.ok) throw new Error(`exchange: ${r.status} ${await r.text()}`);
  return r.json(); // { access_token, refresh_token, expires_in, ... }
}

export async function refresh(refreshToken) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const r = await fetch(`${OAUTH}/token`, { method: "POST", body });
  if (!r.ok) throw new Error(`refresh: ${r.status}`);
  return r.json();
}

// ── Enviar un mensaje al chat como el usuario ───────────────
export async function sendMessage({ userToken, senderId, message }) {
  const broadcasterId = await getChannelId();
  const r = await fetch(`${HELIX}/chat/messages`, {
    method: "POST",
    headers: {
      "Client-Id": CLIENT_ID,
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      broadcaster_id: broadcasterId,
      sender_id: senderId,
      message,
    }),
  });
  if (!r.ok) throw new Error(`send: ${r.status} ${await r.text()}`);
  const data = await r.json();
  const result = data.data?.[0];
  if (result && result.is_sent === false) {
    throw new Error(result.drop_reason?.message || "mensaje rechazado");
  }
  return result;
}
