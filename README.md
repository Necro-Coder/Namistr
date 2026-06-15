# Anime Stream

Plataforma de streaming self-hosted: **Tailscale** para la entrada RTMP (OBS → servidor)
y **Cloudflare Tunnel** para la salida web HTTPS (servidor → espectadores).

```
[OBS] ──RTMP──► [IP Tailscale 100.x.x.x:1935] ──► [MediaMTX] ──┬─ relay ─► [Twitch]
                                                               ├─ HLS ──► [Nginx] ─► [CF Tunnel] ─► stream.tudominio.com
                                                               └─ record ─► /recordings
```

**Regla:** Tailscale = entrada del stream. Cloudflare = salida web.

## Estructura

```
.
├── .github/workflows/deploy.yml   # build (GHCR) + deploy (runner del VPS)
├── docker-compose.yml             # mediamtx, nginx, frontend, backend, cloudflared, runner
├── mediamtx/mediamtx.yml          # RTMP + HLS LL + relay Twitch + grabación
├── nginx/conf.d/default.conf      # reverse proxy web / HLS / API
├── frontend/                      # Vue 3 + Vite + hls.js
├── backend/                       # Node + Express (/health, /api/...)
├── recordings/                    # volumen persistente (gitignored)
└── .env.example
```

## Setup en el VPS (una sola vez)

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sh && usermod -aG docker $USER && newgrp docker

# 2. Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up
tailscale ip -4          # anota la IP 100.x.x.x

# 3. Clonar y configurar
#    El deploy del CI espera el proyecto en /srv/homelab/custom_apps/Namistr
git clone https://github.com/Necro-Coder/Namistr.git /srv/homelab/custom_apps/Namistr
cd /srv/homelab/custom_apps/Namistr
cp .env.example .env && nano .env

# 4. Registrar el runner self-hosted
# GitHub → Repo Settings → Actions → Runners → New self-hosted runner
# El token va en GITHUB_RUNNER_TOKEN del .env

# 5. Arranque
docker compose up -d
docker compose ps
```

## Cloudflare Tunnel (Zero Trust → Networks → Tunnels)

Un solo dominio con rutas → **un único Public Hostname** apuntando a Nginx.
Como cloudflared corre en contenedor, el Service va a `http://nginx:80`
(misma red Docker), NO a `localhost:8080`:

| Public Hostname    | Service           |
|--------------------|-------------------|
| `necro-coder.site` | `http://nginx:80` |

Nginx reparte internamente por ruta:

| Ruta                 | Destino           |
|----------------------|-------------------|
| `/`                  | frontend (Vue)    |
| `/api/`, `/auth/`    | backend (Node)    |
| `/hls/`              | MediaMTX (HLS)    |

Activa **"Disable chunked encoding"** en la config del tunnel para evitar buffering en HLS.

## OBS — dos escenas distintas

Dos salidas independientes desde OBS (canvas principal + plugin Aitum Vertical
para un segundo canvas):

| Salida | Escena | Server | Key |
|--------|--------|--------|-----|
| Principal (Settings → Stream) | CON anime | `rtmp://100.x.x.x:1935` (Tailscale) | `web` |
| Aitum Vertical (2º canvas) | SIN anime | `rtmp://live.twitch.tv/app` | tu Twitch stream key |

- El canal **web** no lleva usuario/contraseña: el acceso lo limita Tailscale
  (solo tu tailnet alcanza el 1935). Se sirve como HLS y se graba.
- El canvas de **Twitch** emite **directo** a Twitch, sin pasar por el servidor:
  así controlas Twitch por separado (puedes emitir a Twitch sin web, y viceversa).
- En ambas salidas: **intervalo de fotogramas clave = 2s**, CBR.

## CI/CD

`push` a `master` → GitHub Actions construye las imágenes `frontend`/`backend` en GHCR
y el job `deploy` (runner `self-hosted, vps`) hace `git reset` + `pull` + `up -d` y
recarga nginx.

## Notas / pendientes de revisar

- **Nginx no hornea el dominio:** usa `server_name _` (default server), así que
  responde a cualquier Host que le llegue por el tunnel. No hay que editarlo al
  cambiar de dominio.
- **VITE_\* (resuelto):** se pasan como `build-args` en el workflow, leídos de las
  **Variables de GitHub**. Configúralas en
  *Repo → Settings → Secrets and variables → Actions → Variables*:
  | Variable        | Ejemplo            |
  |-----------------|--------------------|
  | `DOMAIN`        | `tudominio.com`    |
  | `TWITCH_CHANNEL`| `tu_usuario`       |

  El workflow construye `VITE_HLS_URL`/`VITE_API_URL` a partir de `DOMAIN`. Si cambias
  el dominio, basta relanzar el workflow (no hace falta tocar código).
- **Nginx ↔ backend/mediamtx:** el backend y mediamtx usan `network_mode: host`,
  así que Nginx los alcanza vía `host.docker.internal` (`extra_hosts: host-gateway`).
- **`recordPath`/`%path`:** las grabaciones quedan en `recordings/stream/`.
