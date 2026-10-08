FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

FROM node:22-alpine

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY --from=builder /app/node_modules/ws ./node_modules/ws
COPY public/assets/studio/organic-scene.json ./public/assets/studio/organic-scene.json
RUN mkdir -p /app/data

ENV PORT=80
ENV PUSHOVER_STATE_PATH=/app/data/pushover-state.json
VOLUME /app/data

EXPOSE 80
CMD ["node", "server/index.mjs"]
