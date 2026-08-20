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
ENV USE_DATABASE=mongo
ENV USE_LOCAL_EXECUTION=true
ENV ARTIFACTS_DIR=/tmp/flowguard-artifacts
# Override in host: AUTH_DISABLED=false JWT_SECRET=... ADMIN_KEY=... MONGODB_URL=...

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "exec", "tsx", "src/index.ts"]
