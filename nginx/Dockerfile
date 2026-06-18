# ── Stage 1: Customer app ─────────────────────────────────────────────────────
FROM node:20-alpine AS build-main
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci --silent
COPY frontend/ .
RUN npm run build

# ── Stage 2: Delivery portal ──────────────────────────────────────────────────
FROM node:20-alpine AS build-delivery
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
WORKDIR /app
COPY delivery-frontend/package*.json ./
RUN npm ci --silent
COPY delivery-frontend/ .
RUN npm run build

# ── Stage 3: Pharmacy portal ──────────────────────────────────────────────────
FROM node:20-alpine AS build-pharmacy
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
WORKDIR /app
COPY pharmacy-frontend/package*.json ./
RUN npm ci --silent
COPY pharmacy-frontend/ .
RUN npm run build

# ── Stage 4: Haircut vendor portal ────────────────────────────────────────────
FROM node:20-alpine AS build-haircut
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
WORKDIR /app
COPY haircut-vendor-frontend/package*.json ./
RUN npm ci --silent
COPY haircut-vendor-frontend/ .
RUN npm run build

# ── Stage 5: Super admin portal ───────────────────────────────────────────────
FROM node:20-alpine AS build-admin
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
WORKDIR /app
COPY super-admin-frontend/package*.json ./
RUN npm ci --silent
COPY super-admin-frontend/ .
RUN npm run build

# ── Final stage: Nginx serves all built apps ──────────────────────────────────
FROM nginx:alpine
COPY --from=build-main     /app/dist /var/www/frontend
COPY --from=build-delivery /app/dist /var/www/delivery-frontend
COPY --from=build-pharmacy /app/dist /var/www/pharmacy-frontend
COPY --from=build-haircut  /app/dist /var/www/haircut-vendor-frontend
COPY --from=build-admin    /app/dist /var/www/super-admin-frontend

# nginx.conf is mounted as a volume so it can be updated without rebuilding
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
