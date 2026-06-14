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
git clone https://github.com/TU_USUARIO/anime-stream.git /opt/anime-stream
cd /opt/anime-stream
cp .env.example .env && nano .env

# 4. Registrar el runner self-hosted
# GitHub → Repo Settings → Actions → Runners → New self-hosted runner
# El token va en GITHUB_RUNNER_TOKEN del .env

# 5. Arranque
docker compose up -d
docker compose ps
```

## Cloudflare Tunnel (Zero Trust → Networks → Tunnels)

| Subdominio            | Tipo | URL              |
|-----------------------|------|------------------|
| `stream.tudominio.com`| HTTP | `localhost:8080` |
| `hls.tudominio.com`   | HTTP | `localhost:8080` |
| `api.tudominio.com`   | HTTP | `localhost:8080` |

Activa **"Disable chunked encoding"** en `hls.tudominio.com` para evitar buffering.

## OBS (Settings → Stream)

- **Service:** Custom
- **Server:** `rtmp://100.x.x.x:1935/stream`  ← IP de Tailscale
- **Stream Key:** `obs?user=obs&pass=TU_PASS`

## CI/CD

`push` a `main` → GitHub Actions construye las imágenes `frontend`/`backend` en GHCR
y el job `deploy` (runner `self-hosted, vps`) hace `pull` + `up -d` con zero downtime.

## Notas / pendientes de revisar

- **`server_name` en Nginx:** cambia `tudominio.com` por tu dominio real en
  `nginx/conf.d/default.conf` (3 bloques).
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
