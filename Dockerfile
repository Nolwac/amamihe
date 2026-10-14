FROM python:3.13-slim-bookworm AS model
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends curl zstd ca-certificates && rm -rf /var/lib/apt/lists/*
COPY scripts/models /tools
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export CURL_CA_BUNDLE=/run/secrets/proxy_ca SSL_CERT_FILE=/run/secrets/proxy_ca; fi; \
    bash /tools/install-ollama.sh /opt/ollama "$TARGETARCH" && python /tools/pull-tev1.py /opt/models

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci
COPY . .
ARG AMAMIHE_COMMIT
RUN node scripts/deploy/stamp-release.mjs "$AMAMIHE_COMMIT"
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng ffmpeg && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node package*.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci --omit=dev
COPY --from=model /opt/ollama /opt/ollama
COPY --from=model /opt/models /opt/models
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/shared ./shared
ENV NODE_ENV=production PORT=3000 OLLAMA_AUTOSTART=1 OLLAMA_BIN=/opt/ollama/bin/ollama OLLAMA_BUNDLED_MODELS=/opt/models OLLAMA_NO_CLOUD=1 OLLAMA_NOPRUNE=1
EXPOSE 3000
USER node
CMD ["npm", "start"]
