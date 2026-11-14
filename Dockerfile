# One image for mock-tiktok, api and web (docs/architecture/08-local-dev.md §4).
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_AUTH_MODE=demo
ARG NEXT_PUBLIC_DEMO_MODE=true
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_AUTH_MODE=$NEXT_PUBLIC_AUTH_MODE NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
RUN pnpm build:packages && pnpm --filter @ecomdash/api build && NODE_ENV=production pnpm --filter @ecomdash/web build
