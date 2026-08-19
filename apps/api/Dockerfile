FROM mcr.microsoft.com/playwright:v1.62.1-jammy

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN pnpm install --filter @flowguard/api... --frozen-lockfile || pnpm install --filter @flowguard/api...

COPY packages/shared packages/shared
COPY apps/api apps/api

WORKDIR /app/apps/api
RUN npx prisma generate || true

ENV PORT=3001
ENV USE_DATABASE=false
ENV USE_LOCAL_EXECUTION=true
ENV AUTH_DISABLED=true

EXPOSE 3001
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
