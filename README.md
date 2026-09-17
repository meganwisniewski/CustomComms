# CustomComms — Communication Hub

The messaging hub for a personal comms stack (PMO-00179). A small, self-hosted
service that runs on the Docker Pi and gives everything else **one place to send
a message**. You `POST` a message, the hub **queues** it, and a background worker
delivers it to the right channel with retries. iMessage is the first channel; the
interface is channel-agnostic so email replies, SMS, and push drop in behind the
same API later.

**Store-and-forward:** a send is accepted immediately (`202`) and delivered
asynchronously. If the target is temporarily unreachable — the iMessage Mac
asleep or rebooting for a macOS update — the message stays `queued` and retries
until it lands; nothing is lost. Permanent errors (bad recipient) fail after a
capped number of attempts.

➡️ **Setting up the Mac mini as the iMessage bridge? See
[`docs/mac-bluebubbles-setup.md`](docs/mac-bluebubbles-setup.md).**

```
                                   ┌────────────────────────────┐
  Email Triage DB ───┐             │        Communication Hub    │
  Task Deconstructor ─┼── POST ───▶│  (this repo, runs on the Pi)│
  Home Assistant ─────┘   /messages│                             │
                                   │   ChannelRegistry            │
                                   │    ├─ imessage ──HTTP──▶ BlueBubbles (Mac)
                                   │    ├─ ntfy    ──HTTP──▶ ntfy/Gotify (Pi)
                                   │    └─ ...                     │
                                   │   SQLite message log         │
                                   └────────────────────────────┘
```

## Why a Mac is in the picture

iMessage can only originate from Apple hardware. The hub itself runs on the Pi,
but to *send an iMessage* it calls a [BlueBubbles](https://bluebubbles.app/)
server running on a Mac (which drives Messages.app and exposes a REST API +
webhooks). If no Mac is available, disable the `imessage` channel and use a
Pi-native channel (`ntfy`) instead — the hub works the same either way.

## Quick start

```bash
cp .env.example .env      # fill in the channels you actually have
docker compose up --build # hub comes up on http://<pi>:8000
```

Send a message:

```bash
curl -X POST http://localhost:8000/messages/send \
  -H 'content-type: application/json' \
  -d '{"channel": "ntfy", "to": "alerts", "body": "hello from the hub"}'
```

Interactive API docs: `http://<pi>:8000/docs`.

## API

| Method | Path                 | Purpose                                                  |
|--------|----------------------|----------------------------------------------------------|
| GET    | `/health`            | Hub + per-channel health, plus current `queued` count    |
| GET    | `/channels`          | List enabled channels                                    |
| POST   | `/messages/send`     | Queue a message for a channel (returns `202` + id)       |
| GET    | `/messages`          | Message log (newest first); filter with `?status=queued` |
| GET    | `/messages/{id}`     | One message's status (`queued`/`sent`/`failed`)          |
| POST   | `/webhooks/{channel}`| Inbound events from a bridge (e.g. BlueBubbles)          |

### Delivery lifecycle

```
POST /messages/send  ->  queued  ──worker──▶  sent
                                   │
                                   ├─ target unreachable ─▶ stays queued, retries (capped cadence)
                                   └─ permanent error ─────▶ failed  (after HUB_MAX_ATTEMPTS)
```

Retry cadence is controlled by `HUB_POLL_INTERVAL_SECONDS`, `HUB_MAX_ATTEMPTS`,
`HUB_BACKOFF_BASE_SECONDS`, and `HUB_BACKOFF_MAX_SECONDS` (see `.env.example`).

## Configuration

All config is via environment variables (see `.env.example`). Channels are
enabled by setting `CHANNELS_ENABLED` (comma-separated) and providing that
channel's connection settings.

## Layout

```
hub/
  Dockerfile
  requirements.txt
  app/
    main.py            FastAPI app + routes + background delivery worker
    config.py          env-driven settings
    db.py              SQLite message store + queue lifecycle
    delivery.py        per-message deliver/retry/fail decision (unit-tested)
    schemas.py         request/response models
    channels/
      base.py          Channel interface (send / health / parse_inbound)
      imessage.py      BlueBubbles adapter
      ntfy.py          ntfy push adapter (Pi-native)
      registry.py      builds enabled channels from config
```
