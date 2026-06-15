<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from "vue";

const messages = ref([]);
const me = ref({ loggedIn: false });
const draft = ref("");
const sending = ref(false);
const error = ref("");
const listEl = ref(null);
const emotes = ref({}); // nombre -> url (7TV)

// Trocea el texto en palabras y sustituye las que sean emotes 7TV
function renderParts(text) {
  const parts = [];
  for (const tok of text.split(/(\s+)/)) {
    if (!tok) continue;
    const url = emotes.value[tok];
    if (url) parts.push({ t: "emote", v: url, alt: tok });
    else parts.push({ t: "text", v: tok });
  }
  return parts;
}

async function loadEmotes() {
  try {
    const r = await fetch("/api/twitch/emotes");
    emotes.value = (await r.json()).emotes || {};
  } catch {
    /* ignore */
  }
}

let ws = null;
let reconnectTimer = null;
const seen = new Set(); // ids ya mostrados → evita duplicados al reconectar

function scrollToBottom() {
  nextTick(() => {
    const el = listEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function pushMessages(list) {
  let added = false;
  for (const m of list) {
    if (seen.has(m.id)) continue; // ya lo teníamos (historial reenviado)
    seen.add(m.id);
    messages.value.push(m);
    added = true;
  }
  if (!added) return;
  // limita el tamaño en memoria
  if (messages.value.length > 200) {
    const removed = messages.value.splice(0, messages.value.length - 200);
    for (const m of removed) seen.delete(m.id);
  }
  scrollToBottom();
}

function connectWs() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    if (data.type === "history") pushMessages(data.messages);
    else if (data.type === "message") pushMessages([data.message]);
  };
  ws.onclose = () => {
    reconnectTimer = setTimeout(connectWs, 3000);
  };
}

async function loadMe() {
  try {
    const r = await fetch("/api/me", { credentials: "include" });
    me.value = await r.json();
  } catch {
    me.value = { loggedIn: false };
  }
}

function login() {
  window.location.href = "/auth/twitch/login";
}

async function logout() {
  await fetch("/auth/logout", { method: "POST", credentials: "include" });
  me.value = { loggedIn: false };
}

async function send() {
  const message = draft.value.trim();
  if (!message || sending.value) return;
  sending.value = true;
  error.value = "";
  try {
    const r = await fetch("/api/chat/send", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || "no se pudo enviar");
    }
    draft.value = "";
  } catch (e) {
    error.value = e.message;
  } finally {
    sending.value = false;
  }
}

onMounted(() => {
  loadMe();
  loadEmotes();
  connectWs();
});

onBeforeUnmount(() => {
  if (ws) ws.close();
  if (reconnectTimer) clearTimeout(reconnectTimer);
});
</script>

<template>
  <section class="chat">
    <header class="head">// CHAT</header>

    <div ref="listEl" class="messages">
      <p v-for="m in messages" :key="m.id" class="msg">
        <span class="name" :style="{ color: m.color || '#b69cff' }">{{ m.user }}</span>
        <span class="text"><template v-for="(p, i) in renderParts(m.text)" :key="i"><img
              v-if="p.t === 'emote'" :src="p.v" :alt="p.alt" :title="p.alt" class="emote"
            /><template v-else>{{ p.v }}</template></template></span>
      </p>
      <p v-if="!messages.length" class="empty">SIN MENSAJES TODAVÍA…</p>
    </div>

    <div class="composer">
      <template v-if="me.loggedIn">
        <form @submit.prevent="send">
          <input
            v-model="draft"
            :disabled="sending"
            placeholder="ESCRIBE UN MENSAJE…"
            maxlength="500"
          />
          <button type="submit" :disabled="sending">▶</button>
        </form>
        <small class="who">
          {{ me.displayName }} ·
          <a href="#" @click.prevent="logout">SALIR</a>
        </small>
        <small v-if="error" class="err">{{ error }}</small>
      </template>
      <button v-else class="login" @click="login">
        INICIA SESIÓN CON TWITCH PARA ESCRIBIR
      </button>
    </div>
  </section>
</template>

<style scoped>
.chat {
  display: flex; flex-direction: column; height: 100%;
  border: 2px solid var(--line); background: var(--panel);
  font-family: var(--mono);
}
.head {
  padding: 0.6rem 0.8rem; border-bottom: 2px solid var(--line);
  font-weight: 800; letter-spacing: 0.08em;
}
.messages { flex: 1; min-height: 0; overflow-y: auto; padding: 0.6rem; }
.msg { margin: 0.2rem 0; line-height: 1.4; word-wrap: break-word; font-size: 0.9rem; }
.name { font-weight: 800; margin-right: 0.4rem; }
.empty { color: #555; letter-spacing: 0.05em; }
.emote { height: 1.75em; vertical-align: middle; margin: -0.2em 0.05em; }

.composer { padding: 0.6rem; border-top: 2px solid var(--line); }
.composer form { display: flex; gap: 0; }
.composer input {
  flex: 1; padding: 0.55rem; border: 2px solid var(--line); border-right: 0;
  background: #000; color: var(--fg); font: inherit;
}
.composer input:focus { outline: none; border-color: #fff; }
.composer button {
  padding: 0.55rem 0.9rem; border: 2px solid var(--fg);
  background: var(--fg); color: #000; font-weight: 800; cursor: pointer;
}
.login {
  width: 100%; padding: 0.7rem; border: 2px solid #9147ff;
  background: #9147ff; color: #fff; font-weight: 800; cursor: pointer;
  font-family: var(--mono); letter-spacing: 0.04em;
}
.login:hover { background: #000; color: #9147ff; }
.who { display: block; margin-top: 0.45rem; color: var(--dim); letter-spacing: 0.03em; }
.who a { color: #b69cff; text-decoration: none; }
.err { display: block; margin-top: 0.3rem; color: #ff5c5c; }
</style>
