# The runner image the TEE runs. Its digest is pinned in docker-compose.yml; the compose hash is in the quote.
# First stage: bundle the wallet connector for the cabinet page from npm (npm run ui).
FROM node:22-slim AS ui
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
RUN npm run -s ui

FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY node/src node/src
COPY node/ui node/ui
COPY --from=ui /app/node/ui/vendor node/ui/vendor
COPY policies policies
RUN mkdir /data && chown node /data
USER node
ENV STORE_DIR=/data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:8080/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "node/src/main.ts"]
