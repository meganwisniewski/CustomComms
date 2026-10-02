# Mac mini → BlueBubbles → Hub setup

One-time setup to turn the 2014 Mac mini into an always-on iMessage bridge that
the hub (on the Pi) sends through. Work top to bottom; the whole thing is ~1–2
hours, most of it unattended installs.

Target: **macOS Sequoia via OpenCore Legacy Patcher (OCLP)**. Running the stock
Big Sur it shipped with *works today* but Apple's iMessage certificate for Big
Sur/Catalina is only guaranteed through **January 2027** — OCLP → Sequoia makes
the mini a first-class modern Mac and removes that cliff.

> Want iMessage working tonight and OCLP later? You can. Do **Phase 0**, skip to
> **Phase 3** on the stock OS, and come back to Phase 1–2 whenever. Everything
> from Phase 3 on is identical regardless of macOS version.

---

## Phase 0 — Sanity check the hardware (10 min)

1. Plug in, boot, and hold nothing. If it demands a **firmware password** you
   can't clear, stop — that unit can't be re-imaged; use the eBay return window.
2.  → About This Mac → confirm it boots and note the macOS version.
3. Verify it can reach your network (Wi-Fi or, better for a server, **Ethernet**).
4. If it's on a spinning HDD and feels glacial, it'll still work — an SSD swap is
   optional and can wait.

## Phase 1 — Back up a Sequoia installer + OCLP (30 min, mostly download)

On the mini (or any Mac):

1. Grab a 16GB+ USB stick.
2. Download **OpenCore Legacy Patcher** (latest 2.x) from
   <https://dortania.github.io/OpenCore-Legacy-Patcher/>.
3. In OCLP: **Create macOS Installer → Sequoia**, write it to the USB stick.
4. OCLP → **Build and Install OpenCore → install to the USB stick's EFI**.

## Phase 2 — Install Sequoia via OCLP (45 min, unattended)

1. Reboot holding **Option**, pick the OpenCore USB volume.
2. From the OpenCore boot menu, choose **Install macOS Sequoia**. Install to the
   internal drive (erase it — nothing on this mini matters).
3. After install, boot back through the USB's OpenCore menu into the new system.
4. OCLP → **Build and Install OpenCore → install to the internal disk's EFI**, so
   it boots on its own without the USB. Then **Post-Install Root Patches** if OCLP
   prompts (graphics/networking).
5. Reboot with the USB removed; confirm it boots to Sequoia unaided.

## Phase 3 — Make it a proper always-on headless server (15 min)

System Settings (or Terminal):

1. **Auto-login:** Settings → Users & Groups → set the mini to log in
   automatically, so a reboot returns to a logged-in session (Messages must run
   under a logged-in user).
2. **Never sleep** (Terminal):
   ```bash
   sudo pmset -a sleep 0 displaysleep 0 disksleep 0
   sudo pmset -a autorestart 1 womp 1     # auto-restart after power loss; wake on network
   ```
3. **Remote access:** Settings → General → Sharing → enable **Screen Sharing**
   and **Remote Login (SSH)**. Now you can run it lidless with no monitor/keyboard
   from your Mac's Finder → Go → Connect (`vnc://mac-mini.local`).
4. Give it a stable name (Settings → General → About → Name = e.g. `mac-mini`) and
   ideally a **DHCP reservation** on your router so its IP never changes.

## Phase 4 — Sign into iMessage (10 min)

1. Open **Messages**, sign in with the Apple ID you want to send from.
   - A dedicated Apple ID for the hub is cleaner, but your personal one is fine.
2. Send/receive one real iMessage from Messages to confirm activation works. **If
   iMessage won't activate on this machine, this is the moment to use the return
   window** — everything downstream depends on it.
3. Settings → Notifications → Messages: leave enabled; don't do anything that
   would sign you out.

## Phase 5 — Install the BlueBubbles server (20 min)

1. Download the **BlueBubbles Server** from <https://bluebubbles.app/install/>
   and open it (allow it in Settings → Privacy & Security if Gatekeeper blocks).
2. Follow its wizard:
   - Grant **Full Disk Access** and **Accessibility** when prompted (needed to
     read the Messages database and send).
   - Set a **server password** — you'll put this in the hub's `.env`.
   - Enable the **Private API** if you want tapbacks/typing later (optional; needs
     its helper install — can skip for plain send).
3. In BlueBubbles → Settings, note the **server address**. For LAN use it's
   `http://<mac-mini-ip>:1234`. (Skip the Ngrok/Cloudflare tunnel — the hub talks
   to it over your LAN.)
4. BlueBubbles → **API & Webhooks → add a webhook** pointing at the hub:
   ```
   http://<pi-ip>:8000/webhooks/imessage
   ```
   Subscribe it to "New Messages" so inbound iMessages land in the hub log.
   If you set `HUB_API_TOKEN`, append it to the URL as a query parameter (webhook
   senders can't add custom headers):
   ```
   http://<pi-ip>:8000/webhooks/imessage?token=<your HUB_API_TOKEN>
   ```

## Phase 6 — Point the hub at the mini (5 min)

On the Pi, edit `.env`:

```bash
CHANNELS_ENABLED=ntfy,imessage
BLUEBUBBLES_URL=http://<mac-mini-ip>:1234
BLUEBUBBLES_PASSWORD=<the server password from Phase 5>
# Optional default target so sends can omit "to":
BLUEBUBBLES_DEFAULT_GUID=iMessage;-;+15551234567
```

Restart the hub:

```bash
docker compose up -d --build
curl -s http://localhost:8000/health | jq   # imessage should now read "ok"
```

## Phase 7 — Send a real iMessage through the hub (2 min)

Find a chat GUID (simplest: send yourself a message from the mini's Messages,
then look at BlueBubbles → the chat; the GUID looks like
`iMessage;-;+15551234567` for a 1:1). Then:

```bash
curl -X POST http://localhost:8000/messages/send \
  -H 'content-type: application/json' \
  -H "X-Hub-Token: $HUB_API_TOKEN" \
  -d '{"channel":"imessage","to":"iMessage;-;+15551234567","body":"hello from the hub 🎉"}'
```

You get a `202` with a message id. Watch it flip to `sent`:

```bash
curl -s http://localhost:8000/messages/<id> | jq .status
```

If the mini is asleep or BlueBubbles is down when you send, the message just
**stays `queued` and delivers itself when the mini comes back** — no action
needed, nothing lost.

---

### Notes

- **Webhook auth:** the hub's `/webhooks/*` accepts the token either in the
  `X-Hub-Token` header or as a `?token=` query parameter. Since BlueBubbles can't
  set custom headers, use the query-parameter form in its webhook URL. On a
  trusted LAN you can also just leave `HUB_API_TOKEN` unset.
- **Keep-alive:** BlueBubbles must be running for delivery. Set it to launch at
  login (its settings have a toggle) so a reboot brings it back automatically.
- **macOS updates:** when the mini reboots for an update, queued messages wait
  and flush afterward — that's the whole point of the retry queue.

---

## Troubleshooting

### iMessage / Apple ID won't connect on your home network, but works on a phone hotspot

**Symptom:** Safari and general web browsing work fine, but Apple ID sign-in
fails ("error connecting to the Apple ID server," or a *correct* password is
rejected as wrong), and iMessage sends spin forever. Everything works the moment
you switch the Mac to a phone hotspot.

**Cause: broken IPv6.** Some gateways — notably **T-Mobile Home Internet**
(default admin `192.168.12.1`) — hand LAN devices a non-routable ULA IPv6
address (starts with `fd…`, e.g. `fdfe:…`). Apple's push/auth services prefer
IPv6 and stall on that dead path, while browsers quietly fall back to IPv4 and
seem fine. Changing DNS (e.g. to 1.1.1.1/8.8.8.8) does **nothing**, because it
isn't a DNS problem.

**Fix (per-device, reliable):**
1. System Preferences → Network → your connection → **Advanced → TCP/IP**.
2. **Configure IPv6 → "Link-local only"** → OK → Apply.
3. **Reboot the mini.** The push daemon (`apsd`) caches the broken connection, so
   the change only fully takes effect after a restart — it can look like it
   didn't work until you reboot.

**Network-wide alternative:** disable IPv6 on the gateway itself (in its admin
UI / the carrier's app). Many T-Mobile gateways don't expose an IPv6 toggle, in
which case the per-device setting above is the dependable fix. Since the mini is
on static Ethernet anyway, the per-device fix persists across reboots and is
plenty for a single always-on box.
