# Build from the repo root, so the workspace files are in the context:
#   docker build -f apps/api/Dockerfile -t dudesphere-api .

# Build stage
FROM node:26-alpine AS builder

WORKDIR /repo

# The workspace manifests first, so the install layer is cached until a
# dependency changes. The pnpm version is read from "packageManager".
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/api-types/package.json packages/api-types/

# Node 26 no longer ships corepack, so install pnpm directly.
# The version comes from "packageManager" in package.json, so it lives in one place.
RUN npm i -g "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")"

# The API and the workspace packages it uses, nothing else. Native build
# scripts are skipped, as before: bcrypt ships ready-built binaries.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "@dudesphere/api..."

# Source, then build the API and every workspace package it depends on.
COPY . .
RUN pnpm --filter "@dudesphere/api..." run build

# A self-contained copy of the API: its dist and production dependencies,
# with workspace packages copied in rather than linked.
RUN pnpm --filter @dudesphere/api deploy --prod /out

# Production stage
FROM node:26-alpine

WORKDIR /app

COPY --from=builder /out ./

EXPOSE 3000

CMD ["node", "dist/main.js"]
