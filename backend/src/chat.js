// Lee el chat de Twitch de forma ANÓNIMA por IRC-over-WebSocket y
// reparte los mensajes a los navegadores conectados. Una sola conexión
// a Twitch para todos los espectadores.

import { WebSocket } from "ws";
import { CHANNEL } from "./twitch.js";

const TWITCH_IRC = "wss://irc-ws.chat.twitch.tv:443";
const BUFFER_SIZE = 100; // mensajes recientes que se mandan al conectar

const recent = []; // ring buffer de mensajes
const listeners = new Set(); // callbacks que reciben cada mensaje nuevo

let irc = null;

export function onMessage(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function recentMessages() {
  return recent.slice();
}

function emit(msg) {
  recent.push(msg);
  if (recent.length > BUFFER_SIZE) recent.shift();
  for (const cb of listeners) {
    try {
      cb(msg);
    } catch {
      /* ignore */
    }
  }
}

// Parser mínimo de una línea IRC con tags (@key=val;... :nick!... PRIVMSG #ch :texto)
function parsePrivmsg(line) {
  if (!line.includes("PRIVMSG")) return null;
  let tags = {};
  let rest = line;
  if (line.startsWith("@")) {
    const sp = line.indexOf(" ");
    for (const kv of line.slice(1, sp).split(";")) {
      const [k, v = ""] = kv.split("=");
      tags[k] = v;
    }
    rest = line.slice(sp + 1);
  }
  const nick = rest.match(/^:([^!]+)!/)?.[1];
  const text = rest.match(/PRIVMSG #[^ ]+ :(.*)$/)?.[1];
  if (!nick || text == null) return null;
  return {
    id: tags["id"] || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    user: tags["display-name"] || nick,
    color: tags["color"] || null,
    text: text.replace(/[\r\n]+$/, ""),
    ts: Date.now(),
  };
}

export function startChat() {
  if (!CHANNEL) {
    console.warn("chat: TWITCH_CHANNEL vacío, no se conecta al IRC");
    return;
  }
  connect();
}

function connect() {
  irc = new WebSocket(TWITCH_IRC);

  irc.on("open", () => {
    // Login anónimo: cualquier nick "justinfanNNNN" sin contraseña
    irc.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
    irc.send(`NICK justinfan${Math.floor(Math.random() * 100000)}`);
    irc.send(`JOIN #${CHANNEL}`);
    console.log(`chat: conectado al IRC, canal #${CHANNEL}`);
  });

  irc.on("message", (data) => {
    for (const line of data.toString().split("\r\n")) {
      if (!line) continue;
      if (line.startsWith("PING")) {
        irc.send("PONG :tmi.twitch.tv");
        continue;
      }
      const msg = parsePrivmsg(line);
      if (msg) emit(msg);
    }
  });

  const reconnect = () => {
    if (irc) irc.removeAllListeners();
    setTimeout(connect, 3000);
  };
  irc.on("close", reconnect);
  irc.on("error", (e) => {
    console.warn("chat: error IRC", e.message);
  });
}
