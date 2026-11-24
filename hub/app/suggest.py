"""Suggested replies in the user's own voice, via the Claude API.

Optional feature: active only when ANTHROPIC_API_KEY is set on the hub. The hub
sends the conversation plus samples of the user's own past messages to the Claude
API to draft a reply. Nothing is stored by the hub; the draft is returned to the
client for the user to edit and send. Model is configurable via SUGGEST_MODEL.
"""
from __future__ import annotations

import os

import httpx

API_URL = "https://api.anthropic.com/v1/messages"
DEFAULT_MODEL = "claude-haiku-5-5"

SYSTEM = (
    "You draft short text-message replies in the user's own voice.\n"
    "You are given samples of how the user writes, then a conversation.\n"
    "Write replies the user could send as-is.\n"
    "Rules:\n"
    "- Match the user's voice: typical length, punctuation, capitalization, emoji use, warmth.\n"
    "- Keep it to a natural text reply — short; no greetings/sign-offs/names unless the user uses them.\n"
    "- Reply to the OTHER person's most recent message.\n"
    "- If a 'WHAT I WANT THE REPLY TO DO' instruction is given, follow that intent"
    " while still sounding like the user.\n"
    "- No markdown, no surrounding quotes, no explanation or preamble.\n"
    "- Offer 1 to 3 distinct options, each on its own line, and nothing else."
)


def api_key() -> str | None:
    k = os.getenv("ANTHROPIC_API_KEY")
    return k.strip() if k and k.strip() else None


def model() -> str:
    return (os.getenv("SUGGEST_MODEL") or "").strip() or DEFAULT_MODEL


def build_user_prompt(name: str, thread: list[dict], samples: list[str], steer: str = "") -> str:
    who = name or "them"
    lines: list[str] = []
    if samples:
        lines.append("HOW I WRITE (samples of my own past messages):")
        lines += [f"- {s}" for s in samples]
        lines.append("")
    lines.append(f'CONVERSATION with {who} (oldest first; "Me:" is me):')
    for m in thread:
        txt = (m.get("text") or "").strip()
        if txt:
            lines.append(f"{'Me' if m.get('from_me') else who}: {txt}")
    lines.append("")
    if steer.strip():
        lines.append(f"WHAT I WANT THE REPLY TO DO (follow this, in my voice): {steer.strip()}")
        lines.append("")
    lines.append(f"Draft my reply to {who}'s last message.")
    return "\n".join(lines)


def parse_suggestions(text: str) -> list[str]:
    """One suggestion per line; strip bullets/quotes, dedupe, cap at 3."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in (text or "").splitlines():
        s = raw.strip().lstrip("-*•").strip()
        if len(s) >= 2 and s[0] in "\"'" and s[-1] in "\"'":
            s = s[1:-1].strip()
        if s and s.lower() not in seen:
            seen.add(s.lower())
            out.append(s)
    return out[:3]


async def generate(name: str, thread: list[dict], samples: list[str], steer: str = "") -> list[str]:
    key = api_key()
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    body = {
        "model": model(),
        "max_tokens": 400,
        "system": SYSTEM,
        "messages": [{"role": "user", "content": build_user_prompt(name, thread, samples, steer)}],
    }
    headers = {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(API_URL, headers=headers, json=body)
        r.raise_for_status()
        data = r.json()
    # Skip any (empty) thinking blocks; concatenate the text blocks.
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    return parse_suggestions(text)
