# BlueBubbles Server API — reference for the hub

Message-endpoint notes the hub relies on, verified against BlueBubbles Server
**v1.9.11** (official Postman docs + server `messageValidator.ts` + the client
app's `effectMap`).

Auth: query param `?password=<server password>` (aliases: `guid`, `token`).
Responses: `{ status, message, data }` or `{ status, message, error: {type, error} }`.

## Send text — `POST /api/v1/message/text`

| Field | Notes |
|-------|-------|
| `chatGuid` | required, e.g. `iMessage;-;+15551234567` |
| `message` | the text; required for `apple-script`; private-api needs `message` **or** `subject` |
| `method` | `apple-script` (default) or `private-api` |
| `tempGuid` | required when `method=apple-script` (dedupe key); optional on private-api |
| `subject` | bold subject line — **forces private-api** |
| `effectId` | screen/bubble effect — **forces private-api** |
| `selectedMessageGuid` | reply target — **forces private-api** |
| `partIndex` | part to reply to; int ≥ 0, default 0 (macOS Big Sur+) |

Rich features (subject / effect / reply) require the Private API (SIP disabled).
`ddScan` and `attributedBody` also force private-api in v1.9.11 (undocumented).

## Reactions / tapbacks — `POST /api/v1/message/react` (Private API only)

| Field | Notes |
|-------|-------|
| `chatGuid` | required |
| `selectedMessageGuid` | required — the message to react to |
| `reaction` | one of the 12 values below |
| `partIndex` | int ≥ 0, default 0 |

Add: `love` · `like` · `dislike` · `laugh` · `emphasize` · `question`
Remove: same prefixed with `-` (e.g. `-love`). No emoji / other tapbacks — the
validator rejects anything outside these 12.

## Effects (`effectId`) — from the client app's `effectMap`

**Bubble:** `slam` → `com.apple.MobileSMS.expressivesend.impact` ·
`loud` → `...expressivesend.loud` · `gentle` → `...expressivesend.gentle` ·
`invisible ink` → `...expressivesend.invisibleink`

**Screen** (all `com.apple.messages.effect.*`): `echo` → `CKEchoEffect` ·
`spotlight` → `CKSpotlightEffect` · `balloons` → `CKHappyBirthdayEffect` ·
`confetti` → `CKConfettiEffect` · `love` → `CKHeartEffect` ·
`lasers` → `CKLasersEffect` · `fireworks` → `CKFireworksEffect` ·
`celebration` → `CKSparklesEffect`

> "Shooting star" has **no confirmed id** in any BlueBubbles source — test on
> the Mac before relying on it.

## Inline (threaded) replies

No separate endpoint — `POST /api/v1/message/text` with `selectedMessageGuid`
(+ optional `partIndex`) threads the reply and auto-switches to `private-api`.
The same fields work on `POST /api/v1/message/attachment`.

## Edit / unsend

Requires macOS **Ventura+** (iOS 16-era message editing). The bridge Mac runs
Monterey, so this is out of scope here.
