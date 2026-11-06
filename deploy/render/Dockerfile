FROM node:22.22.0-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY potala-api-gateway ./potala-api-gateway
COPY potala-identity-service ./potala-identity-service
COPY potala-sellers-service ./potala-sellers-service
COPY potala-catalog-service ./potala-catalog-service
COPY potala-orders-service ./potala-orders-service
# Each application keeps its own node_modules and generated Prisma client.
# Placeholder URLs are for generation only. This build never migrates or seeds a database.
RUN set -eu; \
    for service in identity sellers catalog orders; do \
      cd /app/potala-$service-service; \
      npm ci --no-audit --no-fund; \
      DATABASE_URL=postgresql://build:build@localhost:5432/build \
      DIRECT_URL=postgresql://build:build@localhost:5432/build npm run prisma:generate; \
      npm run build; \
      npm prune --omit=dev --no-audit --no-fund; \
    done; \
    cd /app/potala-api-gateway; \
    npm ci --no-audit --no-fund; \
    npm run build; \
    npm prune --omit=dev --no-audit --no-fund

FROM node:22.22.0-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
COPY --chown=node:node deploy/render/*.mjs ./deploy/render/
COPY --chown=node:node sources.json ./sources.json
USER node
EXPOSE 10000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "deploy/render/start-services.mjs"]
