# AI Email Copilot — Windows Desktop Setup Guide

This guide walks you through running the full AI Email Copilot stack on a Windows
desktop with an NVIDIA GPU. The stack runs inside Docker containers, so the
actual services are Linux-based — Windows provides the host environment.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Enable WSL 2](#2-enable-wsl-2)
3. [Install Docker Desktop](#3-install-docker-desktop)
4. [Install NVIDIA Drivers & Container Toolkit](#4-install-nvidia-drivers--container-toolkit)
5. [Install Git for Windows](#5-install-git-for-windows)
6. [Get the Project](#6-get-the-project)
7. [Configure the Environment File](#7-configure-the-environment-file)
8. [Run the Stack](#8-run-the-stack)
9. [Verify Everything Is Working](#9-verify-everything-is-working)
10. [Stopping the Stack](#10-stopping-the-stack)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Prerequisites

| Requirement | Minimum | Notes |
|---|---|---|
| Windows | Windows 10 (21H2) or Windows 11 | Home or Pro |
| NVIDIA GPU | RTX 2060 or newer (Turing+) | 8 GB+ VRAM recommended |
| NVIDIA Driver | 535.x or newer | Download from nvidia.com |
| RAM | 16 GB | 32 GB recommended |
| Disk space | 50 GB free | Models + Docker images |
| Internet | Required at first boot | Models are downloaded automatically |

> **AMD / Intel Arc GPUs are not supported.** The stack uses CUDA for GPU
> acceleration. You can still run in CPU-only mode (see [Step 8](#8-run-the-stack)).

---

## 2. Enable WSL 2

WSL 2 (Windows Subsystem for Linux 2) is required by Docker Desktop and is
also the easiest way to run the deployment helper scripts.

Open **PowerShell as Administrator** and run:

```powershell
wsl --install
```

This installs WSL 2 and Ubuntu by default. Restart your computer when prompted.

After restarting, Ubuntu will open and ask you to create a Linux username and
password. Choose anything you like — this account is only used inside WSL 2.

Verify WSL 2 is the default version:

```powershell
wsl --set-default-version 2
wsl --list --verbose
```

The `VERSION` column should show `2` for your Ubuntu distro.

---

## 3. Install Docker Desktop

1. Download Docker Desktop from <https://www.docker.com/products/docker-desktop/>
2. Run the installer. When asked, make sure **"Use WSL 2 instead of Hyper-V"**
   is checked.
3. After installation, open Docker Desktop and go to:
   **Settings → Resources → WSL Integration**
   Enable integration for your Ubuntu distro.
4. Click **Apply & Restart**.

Verify Docker is working by opening a PowerShell window and running:

```powershell
docker --version
docker compose version
```

Both commands should print version numbers without errors.

---

## 4. Install NVIDIA Drivers & Container Toolkit

### 4a. Install NVIDIA Drivers on Windows

If you have not already done so, download and install the latest Game Ready or
Studio drivers for your GPU from:

<https://www.nvidia.com/Download/index.aspx>

After installing, verify with:

```powershell
nvidia-smi
```

You should see your GPU listed with its driver version and CUDA version.

### 4b. Install NVIDIA Container Toolkit inside WSL 2

The NVIDIA Container Toolkit lets Docker containers access your GPU. It must be
installed **inside WSL 2**, not on Windows itself.

Open your **Ubuntu (WSL 2)** terminal and run the following commands one at a time:

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit

sudo nvidia-ctk runtime configure --runtime=docker

sudo systemctl restart docker
```

> **Note:** The `systemctl restart docker` command restarts the Docker daemon
> inside WSL 2. Docker Desktop on Windows manages its own daemon separately,
> so you may need to also **Quit and reopen Docker Desktop** to pick up the
> changes.

Verify the toolkit is working:

```bash
docker run --rm --gpus all nvidia/cuda:12.0-base-ubuntu22.04 nvidia-smi
```

You should see the same `nvidia-smi` output as on Windows. If this command
works, your GPU is accessible from Docker containers.

---

## 5. Install Git for Windows

Download Git for Windows from <https://git-scm.com/download/win> and run the
installer.

During installation, on the **"Configuring the line ending conversions"** page,
select:

> **"Checkout as-is, commit Unix-style line endings"** (option 3 — `core.autocrlf = input`)

This prevents Windows from adding `\r` (carriage return) characters to shell
scripts, which would cause them to fail inside Linux containers.

If you have already installed Git and need to set this retroactively:

```powershell
git config --global core.autocrlf input
```

---

## 6. Get the Project

You can either clone the repository with Git or download a ZIP archive.

### Option A — Clone with Git (recommended)

Open your **Ubuntu (WSL 2)** terminal:

```bash
git clone https://github.com/your-org/ai-email-copilot.git
cd ai-email-copilot
```

> Clone into your WSL 2 home directory (`~/`) rather than a Windows path like
> `/mnt/c/Users/...`. File I/O through the WSL–Windows bridge is significantly
> slower and can cause issues with Docker volume mounts.

### Option B — Download ZIP

1. Download the ZIP from GitHub and extract it.
2. Move the extracted folder into your WSL 2 home directory:

```powershell
# In PowerShell, copy to WSL 2 home
Copy-Item -Recurse "C:\Users\YourName\Downloads\ai-email-copilot" "\\wsl$\Ubuntu\home\your-wsl-username\"
```

Then open your Ubuntu terminal and `cd` into the folder.

---

## 7. Configure the Environment File

All secrets and settings live in a `.env` file at the project root. Start from
the provided template:

```bash
cp .env.docker .env
```

Open `.env` in your preferred editor (e.g. `nano .env` or `code .env` if VS
Code with the WSL extension is installed) and fill in the values below.

### Required secrets

| Variable | What to put here |
|---|---|
| `SESSION_SECRET` | A random string of at least 32 characters. Generate one with: `openssl rand -hex 32` |
| `GOOGLE_CLIENT_SECRET` | Your Google OAuth client secret (from Google Cloud Console) |

### Optional but recommended

| Variable | What to put here |
|---|---|
| `OPENAI_API_KEY` | Your OpenAI API key — enables cloud fallback when the local model is busy. Leave blank to run fully locally. |
| `HF_TOKEN` | HuggingFace access token — required only if you want to run gated models such as Llama 3. Get one at <https://huggingface.co/settings/tokens> |
| `VLLM_MODEL` | The model vLLM will serve. Default: `mistralai/Mistral-7B-Instruct-v0.3` (open, no token needed). |
| `OLLAMA_MODELS` | Space-separated list of models Ollama will pull on startup. Default: `llama3:8b mistral:7b` |

### Google OAuth setup (if you do not have credentials yet)

1. Go to <https://console.cloud.google.com/> and create a project.
2. Navigate to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
3. Set the application type to **Web application**.
4. Add `http://localhost:8080/api/auth/callback` as an Authorized Redirect URI.
5. Copy the **Client ID** into `GOOGLE_CLIENT_ID` and the **Client Secret** into
   `GOOGLE_CLIENT_SECRET` in your `.env` file.

---

## 8. Run the Stack

All commands below should be run from the project root inside your **Ubuntu
(WSL 2) terminal**.

### GPU mode (recommended — uses your NVIDIA GPU)

```bash
./docker/deploy.sh --gpu
```

### CPU-only mode (works on any machine, slower inference)

```bash
./docker/deploy.sh
```

> **First boot takes 10–20 minutes.** Docker builds the API, worker, and frontend
> images, and Ollama downloads the language models. Subsequent starts are fast
> because Docker caches the images and Ollama caches the models in a volume.

### Windows-native PowerShell alternative

If you prefer to stay in PowerShell instead of WSL 2, use the included helper:

```powershell
# From the project root in PowerShell
.\deploy.ps1 -gpu
```

> **PowerShell flag style:** The script accepts both `-flag` (PowerShell-native)
> and `--flag` (bash-style) for all switches, so `-gpu` and `--gpu` both work.

See [deploy.ps1 reference](#deploypls1-reference) at the bottom of this guide for
all available flags.

---

## 9. Verify Everything Is Working

Once the stack has started, open a browser and navigate to:

| URL | What you should see |
|---|---|
| <http://localhost> | AI Email Copilot login page |
| <http://localhost:3000> | Same app (direct frontend port) |
| <http://localhost:8080/api/health> | `{"status":"ok"}` JSON response |
| <http://localhost:8080/api/ai/status> | AI routing status — shows GPU, models, queue depths |

If the login page loads and the AI status endpoint shows `"gpu": true` (GPU
mode) or `"gpu": false` (CPU mode), everything is working correctly.

You can also check container health:

```bash
./docker/deploy.sh --status
```

All containers should show as **Up** or **healthy**.

---

## 10. Stopping the Stack

```bash
./docker/deploy.sh --down
```

Or from PowerShell:

```powershell
.\deploy.ps1 --down
```

This stops all containers but preserves your data (Postgres, Redis, Ollama
models). Running `deploy.sh` again will resume from where you left off.

---

## 11. Troubleshooting

### WSL 2 is not enabled / `wsl --install` fails

- Make sure **Virtualization** is enabled in your BIOS/UEFI. Look for "Intel VT-x",
  "AMD-V", or "SVM Mode" and enable it, then save and reboot.
- On Windows 10, run `dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart`
  and reboot, then retry `wsl --install`.
- Check the Microsoft WSL troubleshooting docs:
  <https://learn.microsoft.com/en-us/windows/wsl/troubleshooting>

### NVIDIA Container Toolkit is not detected

The deploy script warns: `NVIDIA Container Toolkit not detected` and falls back
to CPU mode.

Checklist:
1. Run `nvidia-smi` inside WSL 2 — if it fails, the Windows driver is not
   passing through. Ensure you are on driver 535+ and that Docker Desktop WSL
   integration is enabled for your Ubuntu distro.
2. Run `docker info | grep -i nvidia` inside WSL 2 — if nothing appears, the
   toolkit installation did not configure the Docker runtime correctly. Re-run:
   ```bash
   sudo nvidia-ctk runtime configure --runtime=docker
   sudo systemctl restart docker
   ```
   Then quit and restart Docker Desktop.
3. Run the test container:
   ```bash
   docker run --rm --gpus all nvidia/cuda:12.0-base-ubuntu22.04 nvidia-smi
   ```
   If this works but `deploy.sh` still falls back, check that Docker Desktop is
   fully restarted after toolkit installation.

### Port conflicts (address already in use)

If another application is already using port 80, 3000, 8080, 5432, or 6379:

- Find the conflicting process in PowerShell:
  ```powershell
  netstat -ano | findstr ":80 "
  ```
  The last column is the PID. You can stop it in Task Manager or with:
  ```powershell
  Stop-Process -Id <PID>
  ```
- Or change the port mapping in `docker-compose.yml`. For example, to expose
  the frontend on port 3001 instead of 3000, change:
  ```yaml
  ports:
    - "3001:80"
  ```

### Windows line endings break shell scripts (`\r: command not found`)

If you see errors like `/bin/bash^M: bad interpreter` or `\r: command not found`
when running `docker/deploy.sh`:

```bash
# Fix line endings on the deploy script
sed -i 's/\r//' docker/deploy.sh
sed -i 's/\r//' docker/ollama/entrypoint.sh
```

To prevent this from happening again, configure Git as described in [Step 5](#5-install-git-for-windows).

### Docker Desktop does not start / crashes

- Ensure Hyper-V and WSL 2 components are installed:
  ```powershell
  dism.exe /online /enable-feature /featurename:Microsoft-Hyper-V /all /norestart
  dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
  ```
- Try resetting Docker Desktop to factory defaults: Docker Desktop tray icon →
  Troubleshoot → Reset to factory defaults.
  **Warning:** This deletes all Docker containers, images, and volumes — including
  your Postgres data, Ollama model cache, and any other Docker data on this machine.
  Back up anything important first, or prefer **Restart** (same menu) which restarts
  the Docker daemon without destroying data.

### Ollama models are not downloading

- Check Ollama container logs:
  ```bash
  docker logs copilot-ollama -f
  ```
- Ensure the container has internet access. Some corporate VPNs or firewalls
  block model downloads. Try disconnecting the VPN and restarting the stack.

### `docker compose` command not found

Older versions of Docker used a separate `docker-compose` binary (with a
hyphen). The project requires Docker Compose V2 (`docker compose` — no hyphen).
Update Docker Desktop to the latest version to get Compose V2.

---

<a name="deploypls1-reference"></a>
## deploy.ps1 Reference

The `deploy.ps1` script at the project root provides the same functionality as
`docker/deploy.sh` for users who prefer PowerShell.

Flags use PowerShell's `-name` style. The `--name` (double-dash) form also
works because PowerShell accepts either when binding switch parameters.

```powershell
.\deploy.ps1            # Start in CPU mode
.\deploy.ps1 -gpu       # Start in GPU mode (vLLM + Ollama + CUDA)
.\deploy.ps1 -build     # Rebuild images then start
.\deploy.ps1 -logs      # Tail all container logs
.\deploy.ps1 -status    # Show container health
.\deploy.ps1 -down      # Stop all containers
```

---

*For general Docker architecture and environment variable reference, see
[docker/README.md](docker/README.md).*
