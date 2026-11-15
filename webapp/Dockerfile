# Hipcastle Agency — production image.
# Build from the REPOSITORY ROOT so the agent markdown files are available for seeding:
#   docker build -f webapp/Dockerfile -t hipcastle .
#   docker run -p 4000:4000 -v hipcastle-data:/data --env-file webapp/.env hipcastle

# ---- 1. Build the React client ------------------------------------------------
FROM node:22-alpine AS client
WORKDIR /app/webapp/client
COPY webapp/client/package.json webapp/client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY webapp/client ./
RUN npm run build

# ---- 2. Install server production dependencies --------------------------------
FROM node:22-alpine AS server-deps
WORKDIR /app/webapp/server
COPY webapp/server/package.json webapp/server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---- 3. Runtime ---------------------------------------------------------------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=4000 \
    DATABASE_PATH=/data/hipcastle.db \
    SITE_URL=https://www.hipcastle.agency
WORKDIR /app
# Repository content (agent markdown files are read at boot to seed the specialist roster)
COPY . .
RUN rm -rf webapp/client webapp/server/node_modules && mkdir -p /data
COPY --from=server-deps /app/webapp/server/node_modules webapp/server/node_modules
COPY --from=client /app/webapp/client/dist webapp/client/dist
VOLUME /data
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
# Run node directly (not via npm) so SIGTERM reaches the app for a graceful shutdown
CMD ["node", "--disable-warning=ExperimentalWarning", "webapp/server/src/index.js"]
