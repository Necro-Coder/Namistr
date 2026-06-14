# ── Build stage ──────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Las VITE_* son variables de BUILD: se hornean en el JS al compilar.
# Llegan como build-args desde el workflow (que las lee de las
# Variables de GitHub). Se exponen como ENV para que vite las recoja.
ARG VITE_HLS_URL
ARG VITE_API_URL
ARG VITE_TWITCH_CHANNEL
ENV VITE_HLS_URL=$VITE_HLS_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_TWITCH_CHANNEL=$VITE_TWITCH_CHANNEL

RUN npm run build

# ── Runtime stage ────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
RUN npm install -g serve@14

COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
