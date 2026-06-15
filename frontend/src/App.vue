<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";
import Player from "./components/Player.vue";
import Chat from "./components/Chat.vue";
import TwitchEmbed from "./components/TwitchEmbed.vue";

const HLS_URL = import.meta.env.VITE_HLS_URL || "/hls/web/index.m3u8";
const TWITCH_CHANNEL = import.meta.env.VITE_TWITCH_CHANNEL || "";

const live = ref(false);
const webViewers = ref(0);
const twitchViewers = ref(null);
const me = ref({ loggedIn: false, follows: false });
const rechecking = ref(false);
const recheckError = ref("");
let timer = null;

async function loadMe() {
  try {
    const r = await fetch("/api/me", { credentials: "include" });
    me.value = await r.json();
  } catch {
    me.value = { loggedIn: false, follows: false };
  }
}

function login() {
  window.location.href = "/auth/twitch/login";
}

// manual = pulsado por el usuario (muestra mensajes). Sin manual = sondeo
// automático en segundo plano (solo actualiza el estado, en silencio).
async function recheck(manual = false) {
  if (manual) {
    rechecking.value = true;
    recheckError.value = "";
  }
  try {
    const r = await fetch("/api/auth/recheck", {
      method: "POST",
      credentials: "include",
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "error al comprobar");
    me.value = { ...me.value, follows: Boolean(d.follows) };
    if (manual && !d.follows) {
      recheckError.value =
        "Aún no consta que sigas el canal. Si acabas de seguir, espera unos segundos. Si no funciona, vuelve a iniciar sesión (abajo).";
    }
  } catch (e) {
    // un error de red en el sondeo NO debe echar al usuario
    if (manual) {
      recheckError.value = `${e.message}. Prueba a volver a iniciar sesión (abajo).`;
    }
  } finally {
    if (manual) rechecking.value = false;
  }
}

// Cierra sesión y entra de nuevo (concede el permiso de follows si falta)
async function reLogin() {
  try {
    await fetch("/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    /* ignore */
  }
  window.location.href = "/auth/twitch/login";
}

async function poll() {
  try {
    const r = await fetch("/api/stream/status");
    live.value = Boolean((await r.json()).live);
  } catch {
    live.value = false;
  }
  try {
    const r = await fetch("/api/viewers");
    const d = await r.json();
    webViewers.value = d.web ?? 0;
    twitchViewers.value = d.twitch;
  } catch {
    /* ignore */
  }
}

let recheckTimer = null;

onMounted(() => {
  loadMe();
  poll();
  timer = setInterval(poll, 10000);
  // Re-verifica el follow cada 45s: si dejan de seguir, se les corta.
  recheckTimer = setInterval(() => {
    if (me.value.loggedIn) recheck(false);
  }, 45000);
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  if (recheckTimer) clearInterval(recheckTimer);
});
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">NAMISTR</div>
      <div class="status">
        <span class="badge" :class="{ on: live }">{{ live ? "EN DIRECTO" : "OFFLINE" }}</span>
        <span class="count">WEB · {{ webViewers }}</span>
        <span v-if="twitchViewers !== null" class="count tw">TWITCH · {{ twitchViewers }}</span>
        <span class="count total">TOTAL · {{ webViewers + (twitchViewers || 0) }}</span>
      </div>
    </header>

    <main class="grid">
      <section class="stage">
        <Player v-if="me.loggedIn && me.follows" :src="HLS_URL" />

        <!-- Gate: solo seguidores logueados pueden ver -->
        <div v-else class="gate">
          <div class="gatebox">
            <h2>// CONTENIDO PARA SEGUIDORES</h2>
            <template v-if="!me.loggedIn">
              <p>Inicia sesión con Twitch para acceder al directo.</p>
              <button class="cta" @click="login">INICIAR SESIÓN CON TWITCH</button>
            </template>
            <template v-else>
              <p>
                Sigue a <strong>{{ TWITCH_CHANNEL }}</strong> en Twitch para ver el directo.
              </p>
              <a
                class="cta"
                :href="`https://twitch.tv/${TWITCH_CHANNEL}`"
                target="_blank" rel="noopener"
              >SEGUIR EN TWITCH ↗</a>
              <button class="ghost" :disabled="rechecking" @click="recheck(true)">
                {{ rechecking ? "COMPROBANDO…" : "YA TE SIGO → COMPROBAR" }}
              </button>
              <p v-if="recheckError" class="gateerr">{{ recheckError }}</p>
              <button class="ghost relogin" @click="reLogin">
                ↻ VOLVER A INICIAR SESIÓN
              </button>
            </template>
          </div>
        </div>

        <div class="meta">
          <h1>// EMISIÓN EN DIRECTO</h1>
          <a
            v-if="TWITCH_CHANNEL"
            class="twlink"
            :href="`https://twitch.tv/${TWITCH_CHANNEL}`"
            target="_blank" rel="noopener"
          >TAMBIÉN EN TWITCH.TV/{{ TWITCH_CHANNEL.toUpperCase() }} ↗</a>
        </div>
      </section>

      <aside class="side">
        <TwitchEmbed />
        <Chat />
      </aside>
    </main>
  </div>
</template>

<style>
:root {
  --bg: #000;
  --panel: #0a0a0a;
  --line: #2a2a2a;
  --fg: #f2f2f2;
  --dim: #888;
  --mono: "JetBrains Mono", "Courier New", ui-monospace, monospace;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font-family: var(--mono);
}

.app { min-height: 100vh; }

/* ── Topbar ───────────────────────────────────────────── */
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 1rem; padding: 0.9rem 1.25rem;
  border-bottom: 2px solid var(--line);
  position: sticky; top: 0; background: var(--bg); z-index: 5;
}
.brand { font-weight: 800; font-size: 1.4rem; letter-spacing: 0.18em; }
.status { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.badge {
  border: 2px solid var(--line); color: var(--dim);
  padding: 0.25rem 0.6rem; font-weight: 800; letter-spacing: 0.05em;
  text-transform: uppercase; font-size: 0.8rem;
}
.badge.on { background: #e1112c; border-color: #e1112c; color: #fff; }
.count {
  border: 2px solid var(--line); padding: 0.25rem 0.6rem;
  font-size: 0.8rem; font-weight: 700; color: var(--dim);
}
.count.tw { color: #b69cff; border-color: #3a2e5c; }
.count.total { color: #000; background: var(--fg); border-color: var(--fg); }

/* ── Layout ───────────────────────────────────────────── */
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(300px, 26vw, 400px);
  gap: 1rem;
  width: 100%;
  max-width: 1800px; margin: 0 auto; padding: 1rem;
  /* el chat (columna derecha) iguala su alto al del vídeo + meta */
  align-items: stretch;
}
.stage { min-width: 0; display: flex; flex-direction: column; }
.stage > .player { flex: 0 0 auto; }

/* ── Gate (no seguidores) ─────────────────────────────── */
.gate {
  aspect-ratio: 16 / 9; border: 2px solid var(--line);
  display: flex; align-items: center; justify-content: center;
  background:
    repeating-linear-gradient(45deg, #0a0a0a 0 12px, #000 12px 24px);
}
.gatebox { text-align: center; padding: 1.5rem; max-width: 460px; }
.gatebox h2 { margin: 0 0 1rem; letter-spacing: 0.06em; }
.gatebox p { color: var(--dim); margin: 0 0 1.2rem; line-height: 1.5; }
.gatebox strong { color: var(--fg); }
.cta {
  display: inline-block; width: 100%; box-sizing: border-box;
  padding: 0.8rem 1rem; border: 2px solid #9147ff; background: #9147ff;
  color: #fff; font-weight: 800; font-family: var(--mono); letter-spacing: 0.04em;
  text-decoration: none; cursor: pointer; text-align: center;
}
.cta:hover { background: #000; color: #9147ff; }
.ghost {
  display: block; width: 100%; margin-top: 0.6rem;
  padding: 0.6rem 1rem; border: 2px solid var(--line); background: #000;
  color: var(--fg); font-weight: 700; font-family: var(--mono); cursor: pointer;
}
.ghost:hover { border-color: #fff; }
.ghost.relogin { color: var(--dim); }
.gateerr {
  margin: 0.7rem 0 0 !important; color: #ffb454 !important;
  font-size: 0.78rem !important; line-height: 1.4;
}
.meta {
  border: 2px solid var(--line); border-top: 0;
  padding: 0.8rem 1rem; background: var(--panel);
}
.meta h1 { margin: 0 0 0.4rem; font-size: 1rem; letter-spacing: 0.06em; }
.twlink { color: #b69cff; text-decoration: none; font-size: 0.85rem; font-weight: 700; }
.twlink:hover { text-decoration: underline; }

.side {
  min-width: 0; min-height: 0;
  display: flex; flex-direction: column; gap: 1rem;
}
.side > * { width: 100%; }
.side .chat { flex: 1; min-height: 0; }

/* ── Tablet: el chat baja debajo ───────────────────────── */
@media (max-width: 1000px) {
  .grid {
    grid-template-columns: 1fr;
    height: auto;
    grid-auto-rows: min-content;
  }
  /* al apilar, el chat lleva alto propio (no se aplasta por el embed) */
  .side { height: auto; }
  .side .chat { height: 55vh; flex: none; }
}

/* ── Móvil ─────────────────────────────────────────────── */
@media (max-width: 560px) {
  .topbar { flex-direction: column; align-items: flex-start; gap: 0.5rem; padding: 0.7rem 0.9rem; }
  .grid { padding: 0.6rem; gap: 0.7rem; }
  .side { height: auto; }
  .side .chat { height: 60vh; flex: none; }
}

/* ── Móvil estrecho (≤430px) ───────────────────────────── */
@media (max-width: 440px) {
  .topbar { padding: 0.6rem 0.7rem; }
  .brand { font-size: 1.1rem; letter-spacing: 0.1em; }
  .status { gap: 0.35rem; }
  .badge, .count { font-size: 0.66rem; padding: 0.2rem 0.4rem; }
  .grid { padding: 0.5rem; gap: 0.6rem; }
  .meta { padding: 0.6rem 0.7rem; }
  .meta h1 { font-size: 0.82rem; }
  .twlink { font-size: 0.75rem; }
  .gatebox { padding: 1rem; }
  .gatebox h2 { font-size: 0.9rem; }
  .gatebox p { font-size: 0.85rem; }
  .cta { padding: 0.7rem; font-size: 0.8rem; }
  .side .chat { height: 56vh; }
}
</style>
