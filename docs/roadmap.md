# CustomComms — Roadmap & Status

_Last updated: 2026-11-14_

A self-hosted, neurodivergent-friendly iMessage client. The hub runs on an
always-on Raspberry Pi; a Mac mini bridges iMessage via BlueBubbles; the two
talk over a private Tailscale network.

## Architecture

```
Custom client ──▶ Hub (FastAPI, Docker on the Pi) ──Tailscale──▶ BlueBubbles (Mac mini) ──▶ iMessage
```

- **Hub** (`hub/`): channel-agnostic send/receive with a store-and-forward
  retry queue. Runs in Docker on the Pi, on host networking, protected by an
  API token. See [`hub/README` section of the main README](../README.md).
- **BlueBubbles**: iMessage bridge on the Mac mini, with the Private API
  enabled (SIP disabled) for rich features.
- **Tailscale**: private mesh linking Pi ↔ mini. Key expiry is **disabled** on
  both server nodes.

## Status

### ✅ Done
- **M0 — Backend live.** Outbound iMessage proven end-to-end.
- **M1 — Two-way messaging.** Inbound captured via a BlueBubbles webhook →
  hub `/webhooks/imessage`; API token enforced on write endpoints.
- **Infrastructure hardening — reboot-proof.** The system self-recovers from a
  reboot or power loss with no manual intervention:
  - **Mini:** auto-login ON · Tailscale launches at login · BlueBubbles Launch
    Agent installed (`~/Library/LaunchAgents/com.bluebubbles.server.plist`).
  - **Pi:** hub on `network_mode: host` (survives `tailscaled` restarts) ·
    `restart: unless-stopped` · `init: true` (tini reaps zombies).
  - **Tailscale:** key expiry disabled on Pi + mini (root cause of the
    Nov 2026 outage).
- **M2 — Rich sending.** Tapbacks, inline (threaded) replies, and screen/bubble
  effects via the BlueBubbles Private API — all through the store-and-forward
  queue. Verified live on-device and against the official v1.9.11 docs.
  (Edit/unsend needs macOS Ventura+; the mini runs Monterey, so it's out of scope.)
- **M3 — Client-facing read API.** `GET /conversations`,
  `/conversations/{guid}/messages`, `/contacts` — proxy and clean BlueBubbles'
  own read data: contact names resolved, SMS spam filtered, recency-sorted,
  reactions/replies captured with full fidelity. Verified against real data.

- **M4 — Client MVP.** React client wired to real hub data (conversations,
  threads, contacts; send + react), deployed from the Pi and served same-origin.
  Per-person dedupe, spam filtering, chronological threads. _First daily-driver
  build — live._

### 🔜 Next
- **Contacts — source of truth.** Make the hub the canonical record for every
  means of contact (phones, emails, addresses, birthdays, socials, websites,
  tags, notes). **Backend done** — `/people` CRUD + `/people/import`, flexible
  JSON person records; the management UI is the remaining piece.
- **M5 — Full client features.** Board drag-to-arrange, person detail + tags,
  memoji-style avatars, settings, composer depth, calm "whose turn" nudges,
  hub status, empty states.
- **M6 — Go-live + hypercare.**

### 🧪 Testing
`scripts/test.sh` is the pre-push gate: a gitignored-source guard, hub unit +
API tests (FastAPI TestClient + a faked BlueBubbles), the client build, and
client unit tests (Vitest). Run `PYBIN=<venv python> scripts/test.sh` before
every deploy.

## Operations

- **Health (on the Pi):** `curl -s http://localhost:8000/health` → expect
  `"imessage":"ok"`.
- **Hub config:** `~/customcomms/.env` on the Pi (enabled channels, BlueBubbles
  URL + password, API token). Git-ignored — never committed.
- **Redeploy the hub:**
  `cd ~/customcomms && git pull && docker compose up -d --force-recreate`
- **Inbound webhook:** registered in BlueBubbles (API & Webhooks) pointing at
  the hub over Tailscale. The server setting **"Allow API webhooks to reach
  local network addresses"** must stay ON (the target is a private tailnet IP).

## Lessons / gotchas (so we don't relearn them)
- Tailscale key expiry (~180 days by default) silently drops devices off the
  tailnet — **disabled** on the server nodes.
- BlueBubbles' "Launch Agent" auto-start fails **silently** if
  `~/Library/LaunchAgents/` does not exist — create the folder first.
- The Docker bridge → Tailscale path breaks when `tailscaled` restarts
  (iptables reshuffle) — the hub uses **host networking** to avoid it.
- BlueBubbles refuses to register webhooks targeting private/CGNAT addresses
  unless the local-address setting is enabled.
- A Docker `HEALTHCHECK` under a non-init PID 1 leaks zombie processes —
  `init: true` (tini) reaps them.
