# CustomComms — Communication Hub

The messaging hub for a personal comms stack (PMO-00179). A small, self-hosted
service that runs on the Docker Pi and gives everything else **one place to send
a message**. You `POST` a message, the hub routes it to the right channel, and
logs it. iMessage is the first channel; the interface is channel-agnostic so
email replies, SMS, and push drop in behind the same API later.

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

| Method | Path                 | Purpose                                            |
|--------|----------------------|----------------------------------------------------|
| GET    | `/health`            | Hub + per-channel health                           |
| GET    | `/channels`          | List enabled channels                              |
| POST   | `/messages/send`     | Send a message through a channel                   |
| GET    | `/messages`          | Recent message log (newest first)                  |
| POST   | `/webhooks/{channel}`| Inbound events from a bridge (e.g. BlueBubbles)    |

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
    main.py            FastAPI app + routes
    config.py          env-driven settings
    db.py              SQLite message log
    schemas.py         request/response models
    channels/
      base.py          Channel interface (send / health / parse_inbound)
      imessage.py      BlueBubbles adapter
      ntfy.py          ntfy push adapter (Pi-native)
      registry.py      builds enabled channels from config
```
