# AI Email Copilot — Native Windows 11 Setup (No WSL, No Docker)

This guide gets the full app running natively on **Windows 11 x64** using only
Windows-native tools. No WSL, no Docker, no Linux required.

---

## Table of Contents

1. [What you'll install](#1-what-youll-install)
2. [Install Node.js](#2-install-nodejs)
3. [Install PostgreSQL](#3-install-postgresql)
4. [Install Git for Windows](#4-install-git-for-windows)
5. [Clone the repo](#5-clone-the-repo)
6. [Create your .env file](#6-create-your-env-file)
7. [Run the app (one click)](#7-run-the-app-one-click)
8. [What the script does](#8-what-the-script-does)
9. [Google OAuth setup](#9-google-oauth-setup)
10. [AI provider keys](#10-ai-provider-keys)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. What you'll install

| Tool | Version | Why |
|---|---|---|
| Node.js | 20 LTS | Runs both the API server and the frontend build |
| pnpm | latest | Package manager (auto-installed by the start script) |
| PostgreSQL | 16 | Database that stores emails, decisions, and tasks |
| Git for Windows | latest | To clone the repository |

No Docker, no WSL, no Python, no CUDA — just Node + Postgres.

---

## 2. Install Node.js

Download the **Windows x64 LTS** installer from:

> https://nodejs.org/

Run the `.msi` installer with all defaults. When asked about **"Tools for
Native Modules"**, you can leave that **unchecked** — this project does not
use native addons.

Verify in a new PowerShell window:

```powershell
node --version   # should print v20.x.x or v18.x.x
npm --version
```

### Alternative — winget (faster)

```powershell
winget install OpenJS.NodeJS.LTS
```

---

## 3. Install PostgreSQL

Download the **Windows x86-64** installer for PostgreSQL 16 from:

> https://www.enterprisedb.com/downloads/postgres-postgresql-downloads

Run the installer. Important settings:
- **Password for postgres superuser** — pick something you will remember, e.g. `postgres` for local dev  
- **Port** — leave as `5432`  
- **Locale** — leave as default  
- **Stack Builder** — you can uncheck/skip this at the end

After install, add PostgreSQL to your PATH so `psql` works in PowerShell:

1. Search for **"Edit the system environment variables"** in Start
2. Click **Environment Variables**
3. Under **System variables**, find `Path` → **Edit**
4. Click **New** and add: `C:\Program Files\PostgreSQL\16\bin`
5. Click **OK** on all dialogs, then open a **new** PowerShell window

Verify:

```powershell
psql --version   # should print psql (PostgreSQL) 16.x
```

### Alternative — winget

```powershell
winget install PostgreSQL.PostgreSQL.16
```

> The start script can also auto-detect common PostgreSQL install paths even
> if you haven't updated PATH yet.

---

## 4. Install Git for Windows

> Skip if Git is already installed.

Download from: https://git-scm.com/download/win

During installation, on the **"Configuring line ending conversions"** screen,
choose option 3:

> **"Checkout as-is, commit Unix-style line endings"** (`core.autocrlf = input`)

This prevents Windows from corrupting shell scripts in the repo.

### Alternative — winget

```powershell
winget install Git.Git
```

---

## 5. Clone the repo

Open **PowerShell** (or Windows Terminal) and run:

```powershell
git clone https://github.com/NishantN8/email-assistant.git
cd email-assistant
```

---

## 6. Create your .env file

The start script will create `.env` from the template automatically and open it
in Notepad for you. You need to fill in four values:

### 6a. DATABASE_URL

```
DATABASE_URL=postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/email_copilot
```

Replace `YOUR_POSTGRES_PASSWORD` with the password you chose during PostgreSQL
installation.

### 6b. SESSION_SECRET

A random 64-character hex string. Generate one right now in PowerShell:

```powershell
[System.BitConverter]::ToString(
    [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
).Replace('-','').ToLower()
```

Copy the output and paste it as the value:

```
SESSION_SECRET=a3f8c2d1e9b04...  (your generated string)
```

### 6c. Google OAuth credentials

See [Step 9](#9-google-oauth-setup) below for a full walkthrough. You need:

```
GOOGLE_CLIENT_ID=315081352824-xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback
```

### 6d. At least one AI key (optional but recommended)

The fastest free option is Groq. Sign up at https://console.groq.com/ and
create an API key, then add:

```
GROQ_API_KEY=gsk_xxxxxxxxxxxx
```

The app works without any AI key (decisions will be skipped), but AI replies
and priority scoring won't function.

---

## 7. Run the app (one click)

Open **PowerShell** in the project folder and run:

```powershell
.\start.ps1
```

If PowerShell blocks the script (execution policy), first run:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Then run `.\start.ps1` again.

**What happens:**
1. Checks Node.js, pnpm, and PostgreSQL
2. Opens `.env` in Notepad if it doesn't exist yet (fill it in, then press ENTER)
3. Runs `pnpm install` (first run takes ~30 seconds, subsequent runs are instant)
4. Creates the `email_copilot` database if it doesn't exist
5. Runs the SQL schema scripts to set up all tables
6. Opens **two new terminal windows** — one for the API, one for the frontend
7. Opens your browser at http://localhost:5173

To **stop** the app: close the two terminal windows that opened.

### Reset / start fresh

```powershell
.\start.ps1 -Reset
```

This drops all tables and rebuilds the schema from scratch.

---

## 8. What the script does

```
[1/6] Node.js check
[2/6] pnpm check (auto-installs if missing)
[3/6] PostgreSQL check
[4/6] .env setup (copies template + opens Notepad if new)
[5/6] pnpm install (all workspace packages)
[6/6] Database init (creates DB + runs SQL scripts from docker/init/)
      -> Start-Process pwsh  (API server on :3001)
      -> Start-Process pwsh  (Frontend on :5173)
      -> Start-Process browser (http://localhost:5173)
```

After the two windows open, you can also access:
- **Web app** → http://localhost:5173
- **API** → http://localhost:3001/api/health
- **AI status** → http://localhost:3001/api/ai/status

---

## 9. Google OAuth setup

Gmail sync requires a Google OAuth credential. Here's how to get one:

1. Go to https://console.cloud.google.com/ and sign in.
2. Create a new project (or select an existing one).
3. In the left menu: **APIs & Services → OAuth consent screen**
   - User type: **External**
   - Fill in app name (e.g. "AI Email Copilot"), your email, and save.
   - Under **Scopes**, add:
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/gmail.modify`
   - Under **Test users**, add your own Gmail address.
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: anything
   - **Authorized redirect URIs** — click **Add URI** and enter:
     ```
     http://localhost:3001/api/auth/google/callback
     ```
5. Click **Create**. Copy the **Client ID** and **Client Secret**.
6. Paste them into `.env`:
   ```
   GOOGLE_CLIENT_ID=315081352824-xxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
   GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback
   ```
7. In the Google Cloud Console, also enable the **Gmail API**:
   **APIs & Services → Library → search "Gmail API" → Enable**

---

## 10. AI provider keys

The AI pipeline tries providers in order — first available one wins. All are
optional; the app falls back gracefully.

| Provider | Speed | Cost | Where to get key |
|---|---|---|---|
| Groq | Fastest | Free tier | https://console.groq.com/ |
| Google Gemini | Fast | Free tier | https://aistudio.google.com/apikey |
| Mistral | Good | Free tier | https://console.mistral.ai/ |
| OpenRouter | Flexible | Pay-per-use | https://openrouter.ai/keys |
| OpenAI | Best quality | Pay-per-use | https://platform.openai.com/api-keys |

Add whichever you want in `.env`:

```
GROQ_API_KEY=gsk_xxx
GOOGLE_AI_API_KEY=AIzaSy_xxx
MISTRAL_API_KEY=xxx
OPENROUTER_API_KEY=sk-or-xxx
OPENAI_API_KEY=sk-xxx
```

---

## 11. Troubleshooting

### PowerShell says "running scripts is disabled"

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Then re-run `.\start.ps1`.

### psql: error: connection refused

PostgreSQL service is not running. Start it:

```powershell
# Open Services (as Administrator)
Start-Process services.msc

# Or start from PowerShell (Admin):
Start-Service postgresql-x64-16
```

### pnpm: command not found

The start script installs pnpm automatically. If it still fails:

```powershell
npm install -g pnpm@latest
# Then close and reopen PowerShell
```

### Port 3001 or 5173 already in use

Find what is using the port and stop it:

```powershell
netstat -ano | findstr ":3001"
# Note the PID in the last column
Stop-Process -Id <PID>
```

Or change the ports in `.env`:

```
# These override the defaults if needed
API_PORT=3002
```

### Database authentication failed (password wrong)

Edit `.env` and correct `DATABASE_URL` — make sure the password after `:` and
before `@` matches what you set during PostgreSQL installation.

### `pnpm install` fails with EACCES or permission errors

Run PowerShell **as Administrator**, then retry `.\start.ps1`.

### The app loads but Gmail sync does nothing

- Make sure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are filled in.
- Make sure `GOOGLE_REDIRECT_URI` is exactly `http://localhost:3001/api/auth/google/callback`.
- Confirm that URI is listed in **Authorized redirect URIs** in Google Cloud Console.
- Click **Connect Gmail** in the app sidebar and complete the OAuth flow.

### AI replies are not generating

Add at least one AI key (Groq is free and fastest). Check:

```
http://localhost:3001/api/ai/status
```

If all providers show as unavailable, no keys are configured.

---

*For Docker / GPU deployment, see [WINDOWS_SETUP.md](WINDOWS_SETUP.md) (requires WSL2).*  
*For Linux / macOS, use [start.sh](start.sh).*
