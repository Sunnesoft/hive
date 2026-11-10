# The runner image the TEE runs. Its digest is pinned in docker-compose.yml; the compose hash is in the quote.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY node/src node/src
COPY node/ui node/ui
COPY policies policies
RUN mkdir /data && chown node /data
USER node
ENV STORE_DIR=/data
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "node/src/main.ts"]
