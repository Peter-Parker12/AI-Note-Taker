# AI Note Taker

Chrome extension + web app that records meetings (Google Meet, Zoom web, any tab), transcribes them, and produces a recap with action items, a searchable archive with chat. Recaps and transcripts download as Markdown/text.

- `web/` — Next.js 16 app + API + job worker (Prisma/Postgres, username/password auth, Claude for recaps/chat)
- `extension/` — Chrome MV3 extension (load unpacked). Records tab audio (right channel) + mic (left channel) so "Me" vs "Others" needs no diarization.
- `DEPLOYMENT.md` — VPS + Docker deployment

Local dev: `cd web && cp .env.example .env && npm i && npx prisma db push && npm run dev`.
Compare speech-to-text providers on your own audio first: `cd web && npm run stt:bench -- path/to/sample.m4a`.
