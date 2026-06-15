<script setup>
import { computed } from "vue";

const channel = import.meta.env.VITE_TWITCH_CHANNEL || "";

// El embed de Twitch exige el parámetro `parent` = hostname de la página.
// Muteado por defecto para no solapar audio con el reproductor del anime.
// Siempre visible (sin plegar).
const src = computed(() => {
  if (!channel) return "";
  const parent = location.hostname;
  return `https://player.twitch.tv/?channel=${channel}&parent=${parent}&muted=true&autoplay=true`;
});
</script>

<template>
  <section class="twitch" v-if="channel">
    <header class="head">// TWITCH · APÓYAME AQUÍ</header>
    <div class="frame">
      <iframe
        v-if="src"
        :src="src"
        allowfullscreen
        title="Twitch"
        frameborder="0"
        scrolling="no"
      ></iframe>
    </div>
  </section>
</template>

<style scoped>
.twitch {
  border: 2px solid var(--line);
  background: var(--panel);
  font-family: var(--mono);
}
.head {
  padding: 0.5rem 0.7rem; border-bottom: 2px solid var(--line);
  font-weight: 800; letter-spacing: 0.06em; font-size: 0.8rem;
}
.frame { aspect-ratio: 16 / 9; background: #000; }
.frame iframe { width: 100%; height: 100%; display: block; }
</style>
