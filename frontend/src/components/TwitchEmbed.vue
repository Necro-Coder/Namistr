<script setup>
import { ref, computed } from "vue";

const channel = import.meta.env.VITE_TWITCH_CHANNEL || "";
// Arranca PLEGADO: solo se reproduce (y cuenta como view) si el usuario
// lo abre a propósito → uso 100% legítimo, sin views pasivas/forzadas.
const open = ref(false);

// El embed de Twitch exige el parámetro `parent` = hostname de la página.
// Muteado por defecto para no solapar audio con el reproductor del anime.
const src = computed(() => {
  if (!open.value || !channel) return "";
  const parent = location.hostname;
  return `https://player.twitch.tv/?channel=${channel}&parent=${parent}&muted=true&autoplay=true`;
});
</script>

<template>
  <section class="twitch" v-if="channel">
    <header class="head" @click="open = !open">
      <span>// TWITCH · {{ open ? "APÓYAME AQUÍ" : "ÁBRELO PARA APOYARME ▸" }}</span>
      <button class="toggle">{{ open ? "▾" : "▸" }}</button>
    </header>
    <div v-show="open" class="frame">
      <iframe
        v-if="src"
        :src="src"
        allowfullscreen
        title="Twitch"
        frameborder="0"
        scrolling="no"
      ></iframe>
    </div>
    <small v-show="open" class="hint">
      Reprodúcelo aquí para sumar como viewer real en Twitch.
    </small>
  </section>
</template>

<style scoped>
.twitch {
  border: 2px solid var(--line);
  background: var(--panel);
  font-family: var(--mono);
}
.head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.5rem 0.7rem; border-bottom: 2px solid var(--line);
  font-weight: 800; letter-spacing: 0.06em; font-size: 0.8rem;
  cursor: pointer; user-select: none;
}
.head:hover { background: #111; }
.toggle {
  background: #111; color: var(--fg); border: 2px solid var(--line);
  cursor: pointer; font: inherit; font-weight: 800; padding: 0 0.4rem; line-height: 1.4;
}
.toggle:hover { border-color: #fff; }
.frame { aspect-ratio: 16 / 9; background: #000; }
.frame iframe { width: 100%; height: 100%; display: block; }
.hint {
  display: block; padding: 0.4rem 0.7rem; color: var(--dim);
  border-top: 2px solid var(--line); font-size: 0.7rem; line-height: 1.3;
}
</style>
