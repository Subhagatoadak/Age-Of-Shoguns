# syntax=docker/dockerfile:1

# ---- build: compile the Vite/Three.js game into static files
# Debian (glibc) rather than Alpine: Rollup's native parser overflows musl's small thread stack
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- dev: Vite dev server with hot reload (source is bind-mounted by docker compose)
FROM node:20-bookworm-slim AS dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--port", "5173"]

# ---- prod: tiny nginx image serving the built game
FROM nginx:1.27-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
