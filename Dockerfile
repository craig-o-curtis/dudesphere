# Build stage
FROM node:26-alpine AS builder

WORKDIR /app

# Copy package files first: the pnpm version is read from "packageManager"
COPY package.json pnpm-lock.yaml ./

# Node 26 no longer ships corepack, so install pnpm directly.
# The version comes from "packageManager" in package.json, so it lives in one place.
RUN npm i -g "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")"

# Install all deps (skip native build scripts in Docker)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source and build
COPY . .
RUN pnpm run build

# Production stage
FROM node:26-alpine

WORKDIR /app

# Copy built app from builder stage
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]
