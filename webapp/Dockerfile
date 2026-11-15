# Build from the repository root so the agent markdown files are available for seeding:
#   docker build -f webapp/Dockerfile -t hipcastle .
FROM node:22-alpine AS client
WORKDIR /app/webapp/client
COPY webapp/client/package.json ./
RUN npm install
COPY webapp/client ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production PORT=4000 DATABASE_PATH=/data/hipcastle.db
WORKDIR /app
COPY . .
RUN rm -rf webapp/client && npm --prefix webapp/server install --omit=dev
COPY --from=client /app/webapp/client/dist webapp/client/dist
VOLUME /data
EXPOSE 4000
CMD ["npm", "--prefix", "webapp/server", "start"]
