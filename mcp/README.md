# Note Taker local worker (MCP server)

The server (VPS) stores recordings and shows recaps. This MCP server runs on **your machine** and does the
processing, so no STT or Anthropic API keys are needed on the VPS:

```
Claude (Pro login) ──MCP──> this server ──HTTPS (outbound only)──> Note Taker server
                               │ downloads audio, ffmpeg, local Whisper
                               └ saves the transcript; Claude writes the recap and set_recap saves it
```

Claude cannot hear audio, so Whisper does the transcription on your machine; Claude only reads text.

## 1. Server

In the server's `.env`: `PROCESSING_MODE=remote`, then `docker compose up -d`.
Create an API token on the web app's Account page (the same kind the Chrome extension uses).

## 2. This machine

Needs Node 22+, `ffmpeg`/`ffprobe`, and an OpenAI-compatible Whisper endpoint, e.g. speaches:

```bash
docker run -d --name whisper -p 127.0.0.1:8000:8000 -v whisper_models:/home/ubuntu/.cache/huggingface/hub \
  ghcr.io/speaches-ai/speaches:latest-cpu
curl -X POST http://localhost:8000/v1/models/Systran/faster-whisper-small   # download a model once
```

Build the server:

```bash
cd mcp && npm install && npm run build
```

## 3. Register it with Claude Code

```bash
claude mcp add note-taker \
  -e NOTE_TAKER_URL=https://your-notes-domain \
  -e NOTE_TAKER_TOKEN=nt_xxx \
  -e WHISPER_MODEL=Systran/faster-whisper-small \
  -e MCP_TOOL_TIMEOUT=3600000 \
  -- node "$(pwd)/dist/index.js"
```

`MCP_TOOL_TIMEOUT` (ms) lets a long transcription finish; the default would cut it off.

| Variable | Default | |
|---|---|---|
| `NOTE_TAKER_URL` | required | your server, no trailing slash |
| `NOTE_TAKER_TOKEN` | required | API token from the Account page |
| `WHISPER_URL` | `http://localhost:8000/v1` | any OpenAI-compatible `/audio/transcriptions` |
| `WHISPER_MODEL` | `Systran/faster-whisper-small` | |
| `WHISPER_API_KEY` | none | only if your endpoint wants one |
| `WORK_DIR` | `/tmp/note-taker-mcp` | scratch space, emptied after every run |

## 4. Tools

Four things, each with create / read / update / delete. There are no separate queue tools: the queue moves as a
side effect of these actions.

| | Create / replace | Read | Update | Delete |
|---|---|---|---|---|
| **Meeting** | `create_meeting` | `list_meetings`, `get_meeting` | `update_meeting` | `delete_meeting` |
| **Recording** | `upload_audio` (from a file on this machine) | `download_audio` | `upload_audio` again | `delete_audio` |
| **Transcript** | `set_transcript` (by hand), `generate_transcript` (from the recording, local Whisper) | `get_transcript` | `set_transcript` | `delete_transcript` |
| **Recap** | `set_recap` | `get_recap` | `set_recap` | `delete_recap` |
| **Email** | `email_recap` (uses the SMTP mailbox from Account → Settings) | | | |

How work moves through them:

- `upload_audio` queues a transcription (status **UPLOADED**). `generate_transcript` runs it: download, Whisper,
  save. Progress and failures show in the web app, and Cancel there stops it within one chunk. It returns the
  transcript plus your recap instructions.
- Saving a transcript queues the recap (status **SUMMARIZING**). `set_recap` finishes it and the meeting is **READY**.
- The web app's Re-transcribe and Re-recap queue the same steps. Find them with `list_meetings` and a `status`
  filter (UPLOADED = needs a transcript, SUMMARIZING = needs a recap; for those, `get_transcript` with `forRecap`
  also returns the recap instructions).
- `set_transcript` / `set_recap` on a meeting that is waiting for exactly that finish the step, so Whisper can be skipped.
- Otherwise a meeting that is being recorded or processed refuses edits (cancel it in the web app first).
  The `delete_*` tools remove only their own part; `delete_meeting` removes everything.

The `process-pending-meetings` prompt runs the whole backlog. Or just ask: "create a meeting called Sprint review
and upload ~/Downloads/sprint.m4a to it", "transcribe and recap what's waiting", "replace the recap of meeting X".

## 5. Use it

Manually, in Claude Code, as above. A job the worker stops reporting on for 30 minutes (`REMOTE_STALE_MIN`) is
failed automatically, so a closed laptop can't leave a recording spinning.
## Running on its own

Run Claude Code non-interactively on a schedule (the machine must be awake and logged in):

```bash
claude -p "Process the Note Taker meetings that are waiting for a transcript or a recap" --allowedTools "mcp__note-taker"
```

Put that in `cron`/`launchd` (every 10 minutes is plenty); with nothing queued it exits straight away.
