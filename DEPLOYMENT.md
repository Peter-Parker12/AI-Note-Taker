# Deployment (VPS + Docker)

Same shape as the other Erasight projects: multi-stage `web/Dockerfile` (Next standalone) and one `docker-compose.yml` with `db` (Postgres 16), a one-off `migrate` (`prisma db push`) and `app`. It is exposed through the Cloudflare Tunnel already running on the VPS. The app container also runs the job worker (transcribe → summarize), so there is no extra service. Audio lives in the `audio_data` volume.

## 1. Configure
```bash
git clone <repo> note-taker && cd note-taker
cp .env.example .env
# fill in: DB_PASSWORD, AUTH_SECRET (openssl rand -base64 32), AUTH_URL (public https URL),
# ADMIN_USERNAME / ADMIN_PASSWORD (first admin), ANTHROPIC_API_KEY, OPENAI_API_KEY and/or DEEPGRAM_API_KEY
```
Sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD` after the first start. That account is created **only when no users exist**, and a restart never overwrites its password. Create everyone else under **Admin → Add a user** (username + temporary password), and change your own password under **Account**. Lost the admin password? Set `ADMIN_PASSWORD` to a new value and `RESET_ADMIN_PASSWORD=true`, restart, then remove the flag.

Security notes: passwords are bcrypt-hashed; 5 failed logins lock a username for 15 minutes; changing or resetting a password (or disabling a user) signs that user out everywhere. Serve it over HTTPS (the Cloudflare Tunnel does this); credentials travel in plain text otherwise.

## Per-account settings
Each user configures their own account under **Account → Settings**: recap instructions and language, Claude model, transcription provider and language, and optionally their **own** Anthropic/OpenAI/Deepgram API keys. Anything left empty falls back to the server defaults in `.env` (`ANTHROPIC_API_KEY`, `STT_PROVIDER`, `CLAUDE_MODEL`, …), so a single shared server key still works. Saved keys are AES-256-GCM encrypted with `SETTINGS_ENCRYPTION_KEY` (defaults to `AUTH_SECRET`). **Changing that secret makes saved keys unreadable** (users fall back to the server keys until they re-enter theirs), so don't rotate it casually.

## 2. Run
```bash
docker compose up -d --build
docker compose logs -f app      # expect "[worker] started"
curl http://<vps-ip>:5930/api/health
```
The app is published on host port **5930** (`HOST_PORT`); the DB binds to `127.0.0.1` only. If you only want access through your tunnel, block 5930 in the VPS firewall (e.g. `ufw deny 5930`) or change the mapping to `127.0.0.1:5930:3010`.

## 3. Cloudflare Tunnel (already installed on the VPS)
The tunnel isn't part of this compose file. In the Zero Trust dashboard (Networks → Tunnels → your tunnel → Public hostnames), add a hostname such as `notes.example.com` → service **HTTP**, URL `localhost:5930`. If `cloudflared` runs in Docker rather than directly on the host, `localhost` is the container itself; use the VPS's Docker host address (e.g. `host.docker.internal:5930` with `extra_hosts: host-gateway`, or the VPS IP) instead. Then set `AUTH_URL=https://notes.example.com` in `.env`.

Limits to know: Cloudflare caps request bodies at 100 MB on Free/Pro. The extension uploads 10-second chunks, so recordings of any length are fine, but the web **Upload recording** form is limited to files under 100 MB.
Optional hardening: put a Cloudflare Access policy on the hostname, but exclude `/api/*` or the extension's Bearer-token requests will be blocked (or use Access service tokens). Username/password login + API tokens already protect the app without it.

## 4. Install the extension
`chrome://extensions` → Developer mode → **Load unpacked** → select `extension/`. Sign in to the web app → *Extension setup* → create a token → paste server URL + token in the extension options, then click **Grant microphone** once.

## Updating
```bash
git pull && docker compose up -d --build
```
`migrate` re-runs on every `up` and applies additive schema changes. It will refuse destructive changes (no `--accept-data-loss`); review those by hand.

## Backups
```bash
docker compose exec -T db pg_dump -U notetaker notetaker | gzip > notetaker-$(date +%F).sql.gz
docker run --rm -v note-taker_audio_data:/data -v "$PWD":/out alpine tar czf /out/audio-$(date +%F).tgz /data
```
(The volume name is prefixed with the compose project directory name.) Audio is never deleted automatically; delete a meeting in the UI to remove its audio and transcript.

## Notes
- Recording consent: tell attendees you're recording. Some jurisdictions require explicit consent.
- Cost drivers are STT (per audio minute) and Claude (per recap); both are per-meeting, not per-user-session.
