FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && npm ci --omit=dev --build-from-source \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

FROM node:24-bookworm-slim

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY --chown=node:node . .
RUN mkdir -p /app/storage /run/vault-tokens/gateway /run/vault-tokens/auth \
    /run/vault-tokens/clients /run/vault-tokens/inventory /run/vault-tokens/orders \
    /run/vault-tokens/payments /run/vault-tokens/reservations /run/vault-tokens/graphql \
    && chown -R node:node /app/storage /run/vault-tokens

ENV NODE_ENV=production
ENV SERVICE_NAME=gateway
ENV PORT=4100
EXPOSE 4100

USER node

CMD ["node", "src/microservices/server.js"]
