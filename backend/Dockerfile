FROM node:22-alpine

WORKDIR /app

# Instala dependencias primero (mejor cacheo de capas)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "src/index.js"]
