ARG NODE_IMAGE=node:24-slim
FROM ${NODE_IMAGE} AS frontend-build
ENV NG_CLI_ANALYTICS=false
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npx ng build --configuration production

FROM ${NODE_IMAGE} AS backend-deps
WORKDIR /build
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM ${NODE_IMAGE} AS backend-build
WORKDIR /build
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    FRONTEND_DIST=/app/public
WORKDIR /app
COPY --from=backend-deps --chown=node:node /build/node_modules ./node_modules
COPY --from=backend-build --chown=node:node /build/dist ./dist
COPY --chown=node:node backend/package.json ./package.json
COPY --chown=node:node backend/seed ./seed
COPY --from=frontend-build --chown=node:node /build/dist/frontend/browser ./public
USER node
EXPOSE 8080
CMD ["node", "dist/src/main.js"]
