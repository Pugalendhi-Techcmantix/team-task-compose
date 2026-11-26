# syntax=docker/dockerfile:1

# ---------- Stage 1: build the React app ----------
FROM node:24-alpine AS build
WORKDIR /app

# Install deps first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Vite bakes VITE_* vars into the bundle at build time → pass them as build args
ARG VITE_APP_NAME=TaskFlow
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_SOCKET_URL=
ARG VITE_SOCKET_PATH=/socket.io
ARG VITE_AUTH_MODE=cookie
ENV VITE_APP_NAME=$VITE_APP_NAME \
    VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_SOCKET_URL=$VITE_SOCKET_URL \
    VITE_SOCKET_PATH=$VITE_SOCKET_PATH \
    VITE_AUTH_MODE=$VITE_AUTH_MODE

RUN npm run build

# ---------- Stage 2: serve with Nginx ----------
FROM nginx:1.27-alpine AS runtime

# nginx.conf is a template: the image's entrypoint renders it to conf.d/default.conf at start,
# filling in the upstreams below (override them with -e / compose `environment:`).
ENV LARAVEL_UPSTREAM=http://laravel:8000 \
    SOCKET_UPSTREAM=http://node-service:3000 \
    NGINX_ENVSUBST_FILTER=_UPSTREAM

RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
