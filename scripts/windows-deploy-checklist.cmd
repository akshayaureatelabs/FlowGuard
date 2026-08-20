@echo off
REM FlowGuard P0 deploy checklist (Windows CMD)
REM This script cannot create cloud accounts — it prints exact steps and runs local preflight.

cd /d "%~dp0.."
echo.
echo ===== FlowGuard P0 Deploy Checklist =====
echo.
echo [1] MongoDB Atlas
echo     - https://cloud.mongodb.com  create free M0 cluster
echo     - Database user + Network Access 0.0.0.0/0
echo     - Copy URI: mongodb+srv://USER:PASS@cluster.../flowguard
echo.
echo [2] Railway API
echo     - https://railway.app  New Project from GitHub -^> FlowGuard
echo     - Use Dockerfile apps/api/Dockerfile OR railway.toml
echo     - Variables:
echo         NODE_ENV=production
echo         USE_DATABASE=mongo
echo         MONGODB_URL=^<atlas uri^>
echo         AUTH_DISABLED=false
echo         JWT_SECRET=^<32+ random chars^>
echo         ADMIN_KEY=^<strong random^>
echo         CORS_ORIGINS=https://YOUR-app.vercel.app
echo         PUBLIC_URL=https://YOUR-api.up.railway.app
echo     - Open /health until database=mongo auth=jwt+apiKey
echo.
echo [3] Vercel Web
echo     - https://vercel.com  Import repo, Root Directory = apps/web
echo     - NEXT_PUBLIC_API_URL=https://YOUR-api.up.railway.app
echo     - Update Railway CORS_ORIGINS to the Vercel URL
echo.
echo [4] Smoke after deploy:
echo     set API_URL=https://YOUR-api.up.railway.app
echo     set ADMIN_KEY=your-prod-admin-key
echo     node scripts\post-deploy-smoke.mjs
echo.
echo ===== Local preflight (optional) =====
echo Checking localhost:3001 ...
curl -sf http://localhost:3001/health && echo. && echo Local API OK || echo Local API not running - start with: npx pnpm dev
echo.
pause
