# Deployment (VPS + Docker)

Same shape as the other Erasight projects: multi-stage `web/Dockerfile` (Next standalone) and one `docker-compose.yml` with `db` (Postgres 16), a one-off `migrate` (`prisma db push`) and `app`. The app container also runs the job worker (transcribe → summarize), so there is no extra service. Audio lives in the `audio_data` volume.

## 1. Google OAuth client
Google Cloud Console → APIs & Services:
1. Enable the **Google Drive API**.
2. OAuth consent screen: type **Internal** (Workspace) so only your org can sign in. Add scope `.../auth/drive.file`.
3. Credentials → OAuth client ID → Web application. Authorized redirect URI:
   `https://notes.example.com/api/auth/callback/google`
4. Copy the client ID/secret into `.env`.

## 2. Configure
```bash
git clone <repo> note-taker && cd note-taker
cp .env.example .env
# fill in: DB_PASSWORD, AUTH_SECRET (openssl rand -base64 32), AUTH_URL (public https URL),
# AUTH_GOOGLE_ID/SECRET, ALLOWED_EMAIL_DOMAINS, ANTHROPIC_API_KEY, OPENAI_API_KEY and/or DEEPGRAM_API_KEY
```
Sign-in is refused unless the email matches `ALLOWED_EMAIL_DOMAINS` / `ALLOWED_EMAILS` / `ADMIN_EMAILS`, or has been invited from the **Admin** page. Set `ADMIN_EMAILS` to your own address (the very first account to sign in is also made admin).

## 3. Run
```bash
docker compose up -d --build
docker compose logs -f app      # expect "[worker] started"
curl http://<vps-ip>:5930/api/health
```
The app is published on host port **5930** (`HOST_PORT`); the DB binds to `127.0.0.1` only. If you only want access through the tunnel, block 5930 in the VPS firewall (e.g. `ufw deny 5930`) or change the mapping to `127.0.0.1:5930:3010`.

## 4. Cloudflare Tunnel
No inbound ports, TLS or reverse proxy needed; `cloudflared` (in compose) dials out to Cloudflare.
1. Zero Trust dashboard → Networks → Tunnels → **Create a tunnel** → Cloudflared → copy the **token** into `CLOUDFLARE_TUNNEL_TOKEN` in `.env`.
2. Add a **public hostname**: `notes.example.com` → service type **HTTP**, URL `app:3010` (the compose service name).
3. Set `AUTH_URL=https://notes.example.com` and use the same host in the Google OAuth redirect URI.
4. `docker compose up -d` — the tunnel shows *Healthy* in the dashboard.

Limits to know: Cloudflare caps request bodies at 100 MB on Free/Pro. The extension uploads 10-second chunks, so recordings of any length are fine, but the web **Upload recording** form is limited to files under 100 MB.
Optional hardening: put a Cloudflare Access policy on the hostname for your domain's emails, but exclude `/api/*` or the extension's Bearer-token requests will be blocked (or use Access service tokens). Google SSO + API tokens already protect the app without it.

## 5. Install the extension
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
