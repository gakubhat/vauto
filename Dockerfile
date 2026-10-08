# syntax=docker/dockerfile:1
#
# One image, one process, one origin: the API, the 60s scheduler, the WhatsApp
# webhook and the built admin dashboard all run together.
#
#   docker build -t vauto .
#   docker run --env-file .env -p 3000:3000 vauto
#
# Configuration is entirely environment variables (see .env.example and
# docs/deploy.md). Nothing secret is baked into a layer.

# ── 1. Admin dashboard ─────────────────────────────────────────────────
FROM node:22-bookworm-slim AS admin
WORKDIR /admin
COPY admin/package.json admin/package-lock.json ./
RUN npm ci
COPY admin/ ./
RUN npm run build

# ── 2. Server build ────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS server
WORKDIR /server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# ── 3. Runtime ─────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Production dependencies only.
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# dist, plus the dashboard. src/index.ts serves the UI from ../public, which
# resolves to /app/public here (__dirname is /app/dist).
COPY --from=server /server/dist ./dist
COPY --from=admin /admin/dist ./public

# config.ts loads ../.env relative to the working directory (the repo root in
# development). In the image the working directory is /app, so no .env exists
# and all configuration arrives through the environment.

RUN groupadd --system app \
  && useradd --system --gid app --create-home app \
  && chown -R app:app /app
USER app

ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
