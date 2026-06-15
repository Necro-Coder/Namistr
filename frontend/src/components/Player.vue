<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from "vue";
import Hls from "hls.js";

const props = defineProps({
  src: { type: String, required: true },
});

const container = ref(null);
const video = ref(null);

const playing = ref(false);
const muted = ref(true);
const volume = ref(1);
const atLive = ref(true);
const speed = ref(1);
const showSpeeds = ref(false);
const fullscreen = ref(false);
const hasVideo = ref(false);

const SPEEDS = [1, 1.25, 1.5, 1.75, 2];

let hls = null;
let raf = null;

function liveEdge() {
  if (hls && hls.liveSyncPosition != null) return hls.liveSyncPosition;
  const sk = video.value?.seekable;
  return sk && sk.length ? sk.end(sk.length - 1) : (video.value?.currentTime ?? 0);
}

function tick() {
  const v = video.value;
  if (v) atLive.value = liveEdge() - v.currentTime < 4;
  raf = requestAnimationFrame(tick);
}

function togglePlay() {
  const v = video.value;
  if (!v) return;
  if (v.paused) v.play();
  else v.pause();
}

function goLive() {
  const v = video.value;
  if (v) {
    v.currentTime = liveEdge();
    v.play();
  }
}

function toggleMute() {
  const v = video.value;
  if (!v) return;
  v.muted = !v.muted;
  muted.value = v.muted;
}

function onVolume(e) {
  const v = video.value;
  const val = Number(e.target.value);
  volume.value = val;
  if (v) {
    v.volume = val;
    v.muted = val === 0;
    muted.value = v.muted;
  }
}

function setSpeed(s) {
  speed.value = s;
  if (video.value) video.value.playbackRate = s;
  showSpeeds.value = false;
}

function toggleFullscreen() {
  if (!document.fullscreenElement) container.value?.requestFullscreen?.();
  else document.exitFullscreen?.();
}

onMounted(() => {
  const v = video.value;
  v.muted = true;

  if (Hls.isSupported()) {
    hls = new Hls({
      liveDurationInfinity: true, // se comporta como directo (no VOD)
      liveSyncDurationCount: 3,
      backBufferLength: 90, // permite rebobinar ~90s
      xhrSetup: (xhr) => {
        xhr.withCredentials = true;
      },
    });
    hls.loadSource(props.src);
    hls.attachMedia(v);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      hasVideo.value = true;
      v.play().catch(() => {});
    });
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) {
        // reintento básico
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      }
    });
  } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
    v.src = props.src;
    hasVideo.value = true;
  }

  v.addEventListener("play", () => (playing.value = true));
  v.addEventListener("pause", () => (playing.value = false));
  document.addEventListener("fullscreenchange", () => {
    fullscreen.value = Boolean(document.fullscreenElement);
  });

  tick();
});

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf);
  if (hls) hls.destroy();
});

const speedLabel = computed(() => `${speed.value}×`);
</script>

<template>
  <div ref="container" class="player">
    <video
      ref="video"
      playsinline
      autoplay
      @click="togglePlay"
    ></video>

    <div class="controls">
      <button class="btn" @click="togglePlay" :title="playing ? 'Pausa' : 'Play'">
        {{ playing ? "❚❚" : "►" }}
      </button>

      <button
        class="live"
        :class="{ off: !atLive }"
        @click="goLive"
        title="Ir al directo"
      >
        <span class="dot"></span> EN DIRECTO
      </button>

      <div class="vol">
        <button class="btn" @click="toggleMute">{{ muted ? "🔇" : "🔊" }}</button>
        <input
          type="range" min="0" max="1" step="0.05"
          :value="muted ? 0 : volume" @input="onVolume"
        />
      </div>

      <div class="spacer"></div>

      <div class="speed">
        <button class="btn" @click="showSpeeds = !showSpeeds">{{ speedLabel }}</button>
        <ul v-if="showSpeeds" class="menu">
          <li
            v-for="s in SPEEDS" :key="s"
            :class="{ active: s === speed }"
            @click="setSpeed(s)"
          >{{ s }}×</li>
        </ul>
      </div>

      <button class="btn" @click="toggleFullscreen" title="Pantalla completa">
        {{ fullscreen ? "⤡" : "⤢" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.player {
  position: relative;
  background: #000;
  border: 2px solid #2a2a2a;
  aspect-ratio: 16 / 9;
  width: 100%;
}
video { width: 100%; height: 100%; object-fit: contain; background: #000; cursor: pointer; }

.controls {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.85);
  border-top: 2px solid #2a2a2a;
  font-family: "JetBrains Mono", "Courier New", monospace;
}

.btn {
  background: #111;
  color: #fff;
  border: 2px solid #2a2a2a;
  padding: 0.35rem 0.6rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  line-height: 1;
}
.btn:hover { border-color: #fff; }

.live {
  display: inline-flex; align-items: center; gap: 0.4rem;
  background: #e1112c; color: #fff;
  border: 2px solid #e1112c;
  padding: 0.35rem 0.6rem;
  font: inherit; font-weight: 800; letter-spacing: 0.04em;
  cursor: pointer; text-transform: uppercase;
}
.live .dot { width: 8px; height: 8px; background: #fff; display: inline-block; }
.live.off { background: #111; border-color: #2a2a2a; color: #888; }
.live.off .dot { background: #888; }

.vol { display: flex; align-items: center; gap: 0.3rem; }
.vol input { width: 80px; accent-color: #fff; }

.spacer { flex: 1; }

.speed { position: relative; }
.menu {
  position: absolute; bottom: 110%; right: 0; margin: 0; padding: 0;
  list-style: none; background: #111; border: 2px solid #2a2a2a; min-width: 64px;
}
.menu li { padding: 0.35rem 0.6rem; cursor: pointer; font-weight: 700; }
.menu li:hover, .menu li.active { background: #fff; color: #000; }
</style>
