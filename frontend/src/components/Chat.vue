<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from "vue";

const messages = ref([]);
const me = ref({ loggedIn: false });
const draft = ref("");
const sending = ref(false);
const error = ref("");
const listEl = ref(null);

let ws = null;
let reconnectTimer = null;

function scrollToBottom() {
  nextTick(() => {
    const el = listEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function pushMessages(list) {
  messages.value.push(...list);
  // limita el tamaño en memoria
  if (messages.value.length > 200) {
    messages.value.splice(0, messages.value.length - 200);
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
  connectWs();
});

onBeforeUnmount(() => {
  if (ws) ws.close();
  if (reconnectTimer) clearTimeout(reconnectTimer);
});
</script>

<template>
  <section class="chat">
    <h2>Chat</h2>

    <div ref="listEl" class="messages">
      <p v-for="m in messages" :key="m.id" class="msg">
        <span class="name" :style="{ color: m.color || '#a970ff' }">{{ m.user }}</span>
        <span class="text">{{ m.text }}</span>
      </p>
      <p v-if="!messages.length" class="empty">Aún no hay mensajes…</p>
    </div>

    <div class="composer">
      <template v-if="me.loggedIn">
        <form @submit.prevent="send">
          <input
            v-model="draft"
            :disabled="sending"
            placeholder="Escribe un mensaje…"
            maxlength="500"
          />
          <button type="submit" :disabled="sending">Enviar</button>
        </form>
        <small class="who">
          como <strong>{{ me.displayName }}</strong> ·
          <a href="#" @click.prevent="logout">salir</a>
        </small>
        <small v-if="error" class="err">{{ error }}</small>
      </template>
      <button v-else class="login" @click="login">
        Inicia sesión con Twitch para escribir
      </button>
    </div>
  </section>
</template>

<style scoped>
.chat { display: flex; flex-direction: column; height: 100%; }
h2 { margin: 0 0 0.5rem; font-size: 1rem; }
.messages {
  flex: 1; overflow-y: auto; background: #18181b; border-radius: 8px;
  padding: 0.5rem; min-height: 280px;
}
.msg { margin: 0.15rem 0; line-height: 1.35; word-wrap: break-word; }
.name { font-weight: 700; margin-right: 0.35rem; }
.empty { color: #777; }
.composer { margin-top: 0.5rem; }
.composer form { display: flex; gap: 0.4rem; }
.composer input {
  flex: 1; padding: 0.5rem; border-radius: 6px; border: 1px solid #3a3a3d;
  background: #0e0e10; color: #efeff1;
}
.composer button {
  padding: 0.5rem 0.9rem; border: 0; border-radius: 6px;
  background: #9147ff; color: #fff; font-weight: 600; cursor: pointer;
}
.login { width: 100%; }
.who { display: block; margin-top: 0.4rem; color: #adadb8; }
.who a { color: #a970ff; }
.err { display: block; margin-top: 0.3rem; color: #ff6b6b; }
</style>
