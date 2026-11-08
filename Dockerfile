#
# One image serves both the Angular app and the API from the same origin (the session cookie is
# SameSite=Lax and the app calls a relative /api, so they must share an origin).
#
#   docker build -t whylint .
#   docker run -p 8080:8080 -e DB_URL=... -e JWT_SECRET=... -e FRONTEND_URL=http://localhost:8080 whylint
#
# The release job (migrations + question pool) uses the same image:
#   docker run --rm -e DB_URL=... whylint node dist/scripts/release.js
#
# See docs/deployment.md for the environment variables and the Cloud Run steps.

ARG NODE_IMAGE=node:24-slim

# ---- Angular build -------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS frontend-build
ENV NG_CLI_ANALYTICS=false
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npx ng build --configuration production

# ---- Backend: production dependencies only -------------------------------------------------
# argon2 ships prebuilt binaries for linux x64/arm64 (glibc), so no compiler is needed here.
FROM ${NODE_IMAGE} AS backend-deps
WORKDIR /build
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# ---- Backend: compile ----------------------------------------------------------------------
# `nest build` (not bare tsc) rewrites the `src/...` import paths in the emitted JavaScript.
FROM ${NODE_IMAGE} AS backend-build
WORKDIR /build
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# ---- Runtime -------------------------------------------------------------------------------
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
