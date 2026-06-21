# NestJS E-Commerce Backend — Complete Deployment Guide

> Follow this README top to bottom. After completing all steps, every push to `main` will automatically deploy to your server.

---

## Table of Contents

1. [Project Files Overview](#1-project-files-overview)
2. [Prerequisites — Install on Your PC](#2-prerequisites--install-on-your-pc)
3. [Local Development Setup](#3-local-development-setup)
4. [Docker Hub Account Setup](#4-docker-hub-account-setup)
5. [VPS Server Setup](#5-vps-server-setup)
6. [GitHub Repository Setup](#6-github-repository-setup)
7. [GitHub Secrets Setup](#7-github-secrets-setup)
8. [First Deployment](#8-first-deployment)
9. [How CI/CD Works After Setup](#9-how-cicd-works-after-setup)
10. [Useful Commands](#10-useful-commands)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Project Files Overview

These are all the important files and what they do:

```
backend/
│
├── .github/
│   └── workflows/
│       └── nestjs-cicd.yml     ← GitHub Actions pipeline (auto deploy)
│
├── prisma/
│   ├── generated/              ← Auto-generated Prisma client (do not edit)
│   ├── migrations/             ← Database migration history
│   └── schema/
│       ├── enum.prisma         ← Enum types
│       ├── schema.prisma       ← Generator + datasource config
│       └── user.prisma         ← User model
│
├── src/                        ← All NestJS source code
│   └── app/
│       ├── config/             ← App config (reads from .env)
│       ├── errors/             ← Custom error handlers
│       ├── module/             ← Feature modules (user, auth, etc.)
│       ├── prisma/             ← PrismaModule + PrismaService
│       └── utils/              ← Utility functions
│
├── .dockerignore               ← Files Docker will NOT copy into image
├── .env                        ← Your secrets (NEVER commit to git)
├── .gitignore                  ← Files git will NOT track
├── docker-compose.yml          ← Runs app + redis together
├── Dockerfile                  ← How to build the Docker image
├── package.json
├── prisma.config.ts            ← Prisma v7 config (schema path)
└── tsconfig.json
```

---

## 2. Prerequisites — Install on Your PC

Install these before anything else:

| Tool | Download | Check if installed |
|---|---|---|
| Node.js 24 | https://nodejs.org | `node -v` |
| Docker Desktop | https://www.docker.com/products/docker-desktop | `docker -v` |
| Git | https://git-scm.com | `git -v` |

---

## 3. Local Development Setup

### Step 1 — Clone the repo

```bash
git clone https://github.com/your-username/backend.git
cd backend
```

### Step 2 — Create `.env` file

Create a file named `.env` in the root folder. Copy this and fill in your values:

```env
DATABASE_URL=postgresql://username:password@host:5432/database?sslmode=no-verify
NODE_ENV=development
PORT=5000
BCRYPT_SALT_ROUNDS=10
ACCESS_TOKEN_SECRET=any_random_long_string
ACCESS_TOKEN_EXPIRES=7d
REFRESH_TOKEN_SECRET=another_random_long_string
REFRESH_TOKEN_EXPIRES=90d
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
EMAIL_EXPIRES=900000
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_ADDRESS=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password
EMAIL_FROM=your_email@gmail.com
EMAIL_TO=
ADMIN_EMAIL=admin@gmail.com
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PLATFORM_ACCOUNT_ID=acct_xxx
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:5000/api/v1
RATE_LIMIT_WINDOW=15m
RATE_LIMIT_MAX=100
RATE_LIMIT_DELAY=50
```

> IMPORTANT: No quotes around values. No comments mixed with values.

### Step 3 — Install dependencies

```bash
npm install
```

### Step 4 — Generate Prisma client

```bash
npx prisma generate
```

### Step 5 — Run migrations

```bash
npx prisma migrate dev
```

### Step 6 — Start dev server

```bash
npm run start:dev
```

App runs at: `http://localhost:5000`

---

## 4. Docker Hub Account Setup

Docker Hub stores your built Docker image. GitHub Actions pushes the image here, then your server pulls it from here.

### Step 1 — Create Docker Hub account

Go to https://hub.docker.com and create a free account.

### Step 2 — Create a repository

1. Click **Create Repository**
2. Name: `nestjs-app`
3. Visibility: **Public**
4. Click **Create**

Your image will be: `your-dockerhub-username/nestjs-app:latest`

### Step 3 — Create an Access Token

1. Go to https://hub.docker.com/settings/security
2. Click **New Access Token**
3. Name: `github-actions`
4. Permission: **Read, Write, Delete**
5. Click **Generate**
6. **COPY THE TOKEN NOW** — you will not see it again

Save these for GitHub Secrets later:
- `DOCKER_USERNAME` = your Docker Hub username
- `DOCKER_PASSWORD` = the access token you just copied

---

## 5. VPS Server Setup

You need a Linux VPS (Ubuntu 22.04 recommended). Do this one time only.

### Step 1 — SSH into your server

```bash
ssh root@YOUR_SERVER_IP
```

### Step 2 — Install Docker

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker
```

### Step 3 — Install Docker Compose plugin

```bash
apt-get update
apt-get install -y docker-compose-plugin
```

Verify it works:

```bash
docker compose version
```

### Step 4 — Create app directory

```bash
mkdir -p /app
cd /app
```

### Step 5 — Create app directory on server

```bash
mkdir -p /app
```

> You do NOT need to create `.env` or `docker-compose.yml` manually.
> The CI/CD pipeline writes both files automatically on every deploy from GitHub Secrets.

### Step 6 — Generate SSH key for GitHub Actions

Run this on your **LOCAL machine** (not server):

```bash
# Linux / macOS
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions

# Windows PowerShell
ssh-keygen -t ed25519 -C "github-actions" -f "$env:USERPROFILE\.ssh\github_actions"
```

Press Enter for all prompts. No passphrase needed.

This creates two files:
- `github_actions` — private key → goes to GitHub Secrets
- `github_actions.pub` — public key → goes to your server

### Step 7 — Add public key to your server

```bash
# Linux / macOS
ssh-copy-id -i ~/.ssh/github_actions.pub root@YOUR_SERVER_IP

# Windows — show the public key then paste it manually
type "$env:USERPROFILE\.ssh\github_actions.pub"
```

If using Windows, copy the output then on your server run:

```bash
echo "PASTE_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
```

### Step 8 — Copy private key content

This goes into GitHub Secrets as `SERVER_SSH_KEY`.

```bash
# Linux / macOS
cat ~/.ssh/github_actions

# Windows PowerShell
Get-Content "$env:USERPROFILE\.ssh\github_actions"
```

Copy EVERYTHING — including `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----`.

---

## 6. GitHub Repository Setup

### Step 1 — Create repository on GitHub

1. Go to https://github.com
2. Click **+** → **New repository**
3. Name: `backend`
4. Visibility: **Private**
5. Do NOT check "Add a README file"
6. Click **Create repository**

### Step 2 — Push your code

Run on your local machine inside the project folder:

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/your-username/backend.git
git push -u origin main
```

### Step 3 — Verify workflow file exists

Go to your GitHub repo and check this file is there:

```
.github/workflows/nestjs-cicd.yml
```

If you see it, GitHub Actions is ready to run.

---

## 7. GitHub Secrets Setup

Secrets are encrypted. The CI/CD pipeline uses them to log into Docker Hub, SSH into your server, and write the `.env` file automatically.

### How to add a secret

1. Go to your GitHub repository
2. Click **Settings** tab
3. Left sidebar: **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Enter the name and value
6. Click **Add secret**
7. Repeat for every secret in the table below

### All required secrets

| Secret Name | What to put |
|---|---|
| `DOCKER_USERNAME` | Your Docker Hub username |
| `DOCKER_PASSWORD` | Docker Hub access token (from step 4-3) |
| `SERVER_HOST` | Your VPS IP address e.g. `123.45.67.89` |
| `SERVER_USER` | `root` |
| `SERVER_SSH_KEY` | Full content of private key file (from step 5-8) |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname?sslmode=no-verify` |
| `PORT` | `5000` |
| `NODE_ENV` | `production` |
| `BCRYPT_SALT_ROUNDS` | `10` |
| `ACCESS_TOKEN_SECRET` | Any long random string |
| `ACCESS_TOKEN_EXPIRES` | `7d` |
| `REFRESH_TOKEN_SECRET` | Any long random string |
| `REFRESH_TOKEN_EXPIRES` | `90d` |
| `CLOUDINARY_CLOUD_NAME` | From Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | From Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | From Cloudinary dashboard |
| `EMAIL_EXPIRES` | `900000` |
| `EMAIL_HOST` | `smtp.gmail.com` |
| `EMAIL_PORT` | `587` |
| `EMAIL_ADDRESS` | Your Gmail |
| `EMAIL_PASS` | Gmail App Password (not your login password) |
| `EMAIL_FROM` | Your Gmail |
| `EMAIL_TO` | leave empty |
| `ADMIN_EMAIL` | Admin email |
| `STRIPE_SECRET_KEY` | From Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | From Stripe dashboard |
| `STRIPE_PLATFORM_ACCOUNT_ID` | From Stripe dashboard |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `FRONTEND_URL` | `https://your-frontend.com` |
| `BACKEND_URL` | `https://your-server-ip:5000/api/v1` |
| `RATE_LIMIT_WINDOW` | `15m` |
| `RATE_LIMIT_MAX` | `100` |
| `RATE_LIMIT_DELAY` | `50` |

After adding all secrets you should see **34 secrets** listed.

---

## 8. First Deployment

Once all secrets are added, push any change to trigger the first deploy:

```bash
git add .
git commit -m "trigger first deploy"
git push origin main
```

### Watch it run

1. Go to your GitHub repo
2. Click **Actions** tab
3. Click on the running workflow
4. Watch each step — takes about 3-5 minutes

When all steps show a green checkmark, your app is live.

### Verify on your server

```bash
ssh root@YOUR_SERVER_IP

# Check containers are running
docker compose -f /app/docker-compose.yml ps

# Check app logs
docker compose -f /app/docker-compose.yml logs app
```

Test the API from your browser or terminal:

```bash
curl http://YOUR_SERVER_IP:5000
```

---

## 9. How CI/CD Works After Setup

Every time you push to `main`, this happens automatically:

```
git push origin main
        ↓
GitHub Actions triggers
        ↓
Login to Docker Hub
        ↓
Build Docker image (production stage)
        ↓
Push image to Docker Hub as :latest
        ↓
SSH into your VPS
        ↓
Write fresh .env from GitHub Secrets
        ↓
docker pull your-username/nestjs-app:latest
        ↓
docker compose down  (stop old containers)
        ↓
docker compose up -d (start new containers)
        ↓
Container starts and runs:
  npx prisma migrate deploy
  node dist/src/main
        ↓
App is live with your new code
```

You only push code. Everything else is automatic.

---

## 10. Useful Commands

### On your server

```bash
# Check container status
docker compose -f /app/docker-compose.yml ps

# Live app logs
docker compose -f /app/docker-compose.yml logs -f app

# Live redis logs
docker compose -f /app/docker-compose.yml logs -f redis

# Restart containers
docker compose -f /app/docker-compose.yml restart

# Stop everything
docker compose -f /app/docker-compose.yml down

# Enter app container shell
docker exec -it nestjs_app sh

# Run prisma command inside container
docker exec -it nestjs_app npx prisma migrate deploy

# Remove old Docker images to free space
docker image prune -f
```

### On your local machine

```bash
# Start dev server with hot reload
npm run start:dev

# Build production bundle
npm run build

# Generate Prisma client after schema change
npx prisma generate

# Create new database migration
npx prisma migrate dev --name add_product_table

# Open Prisma Studio (visual database editor)
npx prisma studio

# Run tests
npm run test

# Test Docker image locally
docker build -t nestjs-app:test .
docker run -p 5000:5000 --env-file .env nestjs-app:test
```

---

## 11. Troubleshooting

### GitHub Actions pipeline fails

Click on the failed step in GitHub Actions to see the exact error.

Common failures:

| Step that failed | Likely cause | Fix |
|---|---|---|
| Login to Docker Hub | Wrong credentials | Check `DOCKER_USERNAME` and `DOCKER_PASSWORD` secrets |
| Build and push image | Dockerfile error | Run `docker build .` locally to see the error |
| Deploy to server | SSH connection failed | Check `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY` |
| Deploy to server | Public key not on server | Repeat step 5-7 |

### Container keeps restarting

```bash
docker compose -f /app/docker-compose.yml logs app
```

| Error code | Meaning | Fix |
|---|---|---|
| `P1013` | DATABASE_URL has invalid format | Remove quotes from DATABASE_URL in GitHub Secret |
| `P1001` | Cannot reach database server | Database is paused or URL is wrong |
| `P1011` | SSL certificate error | Add `?sslmode=no-verify` to DATABASE_URL |
| `EADDRINUSE` | Port already in use | Change PORT or kill the process using it |

### Supabase database not connecting

Supabase free tier pauses database after 7 days of inactivity. Go to https://supabase.com/dashboard, find your project, and click **Restore project**.

### App works locally but not on server

The `.env` on your server is written by GitHub Actions from secrets. Check:
1. All secrets are added correctly in GitHub
2. No quotes in the secret values
3. DATABASE_URL has `?sslmode=no-verify` at the end

### How to check what is in .env on server

```bash
ssh root@YOUR_SERVER_IP
cat /app/.env
```

### Windows line ending issue (.env CRLF)

If you edited `.env` on Windows and it breaks Docker:

```powershell
(Get-Content .env -Raw) -replace "`r`n", "`n" | Set-Content .env -NoNewline
```

### Rotate a leaked secret

```bash
# 1. Change the value in the external service (Supabase, Stripe, etc.)
# 2. Update the secret in GitHub → Settings → Secrets → Actions
# 3. Trigger re-deploy
git commit --allow-empty -m "rotate secrets"
git push origin main
```

---

## Security Checklist

- [ ] `.env` is listed in `.gitignore`
- [ ] `.env` was never committed to git
- [ ] All credentials are in GitHub Secrets only
- [ ] Docker Hub uses an access token, not your password
- [ ] SSH key for GitHub Actions is a separate key from your personal key
- [ ] Database port is not exposed publicly
- [ ] Redis port is not exposed publicly (internal Docker network only)
- [ ] App runs as `USER node` (non-root) inside Docker

---

## Production Go-Live Checklist

- [ ] Node.js 24 installed locally
- [ ] Docker Desktop installed locally
- [ ] Docker Hub account created and repository created
- [ ] Docker Hub access token created and saved
- [ ] VPS server provisioned (Ubuntu 22.04)
- [ ] Docker installed on VPS
- [ ] `/app/docker-compose.yml` created on VPS
- [ ] SSH key pair generated
- [ ] SSH public key added to VPS
- [ ] GitHub repository created
- [ ] All code pushed to GitHub
- [ ] All 34 GitHub Secrets added
- [ ] First pipeline run completed with green checkmarks
- [ ] API responds on `http://YOUR_SERVER_IP:5000`

---

## Author

**Saurav Sarkar**