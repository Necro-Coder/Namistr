<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";
import Hls from "hls.js";
import Chat from "./components/Chat.vue";

const HLS_URL = import.meta.env.VITE_HLS_URL || "/hls/web/index.m3u8";
const TWITCH_CHANNEL = import.meta.env.VITE_TWITCH_CHANNEL || "";

const video = ref(null);
const live = ref(false);
const viewers = ref(null);
let hls = null;
let statusTimer = null;

async function checkStatus() {
  // ¿hay anime en directo? (MediaMTX)
  try {
    const r = await fetch("/api/stream/status");
    live.value = Boolean((await r.json()).live);
  } catch {
    live.value = false;
  }
  // viewers en Twitch
  try {
    const r = await fetch("/api/twitch/stream");
    const d = await r.json();
    viewers.value = d.live ? d.viewers : null;
  } catch {
    viewers.value = null;
  }
}

onMounted(() => {
  checkStatus();
  statusTimer = setInterval(checkStatus, 15000);

  const el = video.value;
  if (Hls.isSupported()) {
    hls = new Hls({
      lowLatencyMode: false,
      // MediaMTX hace un "cookieCheck": pone una cookie y espera que se
      // reenvíe. Sin esto hls.js no manda la cookie y obtiene un 404.
      xhrSetup: (xhr) => {
        xhr.withCredentials = true;
      },
    });
    hls.loadSource(HLS_URL);
    hls.attachMedia(el);
  } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
    el.src = HLS_URL;
  }
});

onBeforeUnmount(() => {
  if (hls) hls.destroy();
  if (statusTimer) clearInterval(statusTimer);
});
</script>

<template>
  <main>
    <header>
      <h1>Anime Stream</h1>
      <span :class="['badge', live ? 'on' : 'off']">
        {{ live ? "EN VIVO" : "OFFLINE" }}
      </span>
      <span v-if="viewers !== null" class="viewers">👁 {{ viewers }}</span>
    </header>

    <div class="layout">
      <div class="player">
        <video ref="video" controls autoplay muted playsinline></video>
        <p v-if="TWITCH_CHANNEL" class="twitch">
          También en
          <a :href="`https://twitch.tv/${TWITCH_CHANNEL}`" target="_blank" rel="noopener">
            twitch.tv/{{ TWITCH_CHANNEL }}
          </a>
        </p>
      </div>
      <aside class="sidebar">
        <Chat />
      </aside>
    </div>
  </main>
</template>

<style>
body { margin: 0; background: #0e0e10; color: #efeff1; font-family: system-ui, sans-serif; }
main { max-width: 1280px; margin: 0 auto; padding: 1.5rem; }
header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
.badge { font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 999px; }
.badge.on { background: #e91916; }
.badge.off { background: #3a3a3d; }
.viewers { font-size: 0.85rem; color: #adadb8; }

.layout { display: grid; grid-template-columns: 1fr 340px; gap: 1rem; align-items: start; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }

video { width: 100%; aspect-ratio: 16 / 9; background: #000; border-radius: 8px; }
.twitch a { color: #a970ff; }
.sidebar { height: 70vh; min-height: 360px; }
</style>
