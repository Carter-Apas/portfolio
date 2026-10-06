FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
RUN npm run build

FROM node:22-alpine

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY server ./server
RUN mkdir -p /app/data

ENV PORT=80
ENV PUSHOVER_STATE_PATH=/app/data/pushover-state.json
VOLUME /app/data

EXPOSE 80
CMD ["node", "server/index.mjs"]
