FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY . .
RUN npm ci && npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/apps/dashboard/dist ./apps/dashboard/dist
USER node
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", "dist/apps/server/src/main.js"]
