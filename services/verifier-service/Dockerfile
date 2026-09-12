FROM node:22-bookworm AS cert-verifier-build
ARG CERT_VERIFIER_COMMIT=28654cae37944d5f89cfd0034a7aa033fa84204b
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN git clone https://github.com/blockchain-certificates/cert-verifier-js.git cert-verifier-js \
 && cd cert-verifier-js \
 && git checkout "$CERT_VERIFIER_COMMIT" \
 && test "$(git rev-parse HEAD)" = "$CERT_VERIFIER_COMMIT"
WORKDIR /build/cert-verifier-js
RUN npm ci && npm run build:node

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    CERT_VERIFIER_JS_PATH=/opt/cert-verifier-js/verifier-node/index.js \
    REGTEST_ANCHOR_ADAPTER_PATH=/app/adapter/src/verify-anchor.mjs
WORKDIR /app/adapter
COPY adapters/regtest-anchor-adapter/package.json \
     adapters/regtest-anchor-adapter/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY adapters/regtest-anchor-adapter/src ./src
COPY apps/verifier-service/src /app/verifier-service/src
COPY --from=cert-verifier-build \
     /build/cert-verifier-js/dist/verifier-node \
     /opt/cert-verifier-js/verifier-node
USER node
WORKDIR /workspace
ENTRYPOINT ["node", "/app/verifier-service/src/verify-certificate.cjs"]
