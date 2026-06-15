<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";
import Player from "./components/Player.vue";
import Chat from "./components/Chat.vue";

const HLS_URL = import.meta.env.VITE_HLS_URL || "/hls/web/index.m3u8";
const TWITCH_CHANNEL = import.meta.env.VITE_TWITCH_CHANNEL || "";

const live = ref(false);
const webViewers = ref(0);
const twitchViewers = ref(null);
let timer = null;

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

onMounted(() => {
  poll();
  timer = setInterval(poll, 10000);
});
onBeforeUnmount(() => timer && clearInterval(timer));
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
        <Player :src="HLS_URL" />
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
  grid-template-columns: 1fr 360px;
  gap: 1.25rem;
  max-width: 1600px; margin: 0 auto; padding: 1.25rem;
  align-items: start;
}
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }

.stage { min-width: 0; }
.meta {
  border: 2px solid var(--line); border-top: 0;
  padding: 0.8rem 1rem; background: var(--panel);
}
.meta h1 { margin: 0 0 0.4rem; font-size: 1rem; letter-spacing: 0.06em; }
.twlink { color: #b69cff; text-decoration: none; font-size: 0.85rem; font-weight: 700; }
.twlink:hover { text-decoration: underline; }

.side { height: 78vh; min-height: 420px; position: sticky; top: 5rem; }
@media (max-width: 1000px) { .side { height: 60vh; position: static; } }
</style>
