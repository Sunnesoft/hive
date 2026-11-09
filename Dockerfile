# The runner image the TEE runs. Its digest goes into docker-compose.yml, the compose hash into the quote.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY node/src node/src
COPY policies policies
USER node
CMD ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "node/src/main.ts"]
