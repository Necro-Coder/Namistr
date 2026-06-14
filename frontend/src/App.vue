<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";
import Hls from "hls.js";

const HLS_URL = import.meta.env.VITE_HLS_URL || "/stream/index.m3u8";
const API_URL = import.meta.env.VITE_API_URL || "";
const TWITCH_CHANNEL = import.meta.env.VITE_TWITCH_CHANNEL || "";

const video = ref(null);
const live = ref(false);
let hls = null;

async function checkStatus() {
  try {
    const r = await fetch(`${API_URL}/api/stream/status`);
    const data = await r.json();
    live.value = Boolean(data.live);
  } catch {
    live.value = false;
  }
}

onMounted(() => {
  checkStatus();
  setInterval(checkStatus, 10000);

  const el = video.value;
  if (Hls.isSupported()) {
    hls = new Hls({ lowLatencyMode: true });
    hls.loadSource(HLS_URL);
    hls.attachMedia(el);
  } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
    // Safari / iOS reproducen HLS de forma nativa
    el.src = HLS_URL;
  }
});

onBeforeUnmount(() => {
  if (hls) hls.destroy();
});
</script>

<template>
  <main>
    <header>
      <h1>Anime Stream</h1>
      <span :class="['badge', live ? 'on' : 'off']">
        {{ live ? "EN VIVO" : "OFFLINE" }}
      </span>
    </header>

    <video ref="video" controls autoplay muted playsinline></video>

    <p v-if="TWITCH_CHANNEL" class="twitch">
      También en
      <a :href="`https://twitch.tv/${TWITCH_CHANNEL}`" target="_blank" rel="noopener">
        twitch.tv/{{ TWITCH_CHANNEL }}
      </a>
    </p>
  </main>
</template>

<style>
body { margin: 0; background: #0e0e10; color: #efeff1; font-family: system-ui, sans-serif; }
main { max-width: 960px; margin: 0 auto; padding: 1.5rem; }
header { display: flex; align-items: center; gap: 1rem; }
.badge { font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 999px; }
.badge.on { background: #e91916; }
.badge.off { background: #3a3a3d; }
video { width: 100%; aspect-ratio: 16 / 9; background: #000; border-radius: 8px; }
.twitch a { color: #a970ff; }
</style>
