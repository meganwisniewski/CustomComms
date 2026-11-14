"""Transform BlueBubbles read data into clean, client-facing shapes.

The client shouldn't have to know BlueBubbles' wire format. These helpers turn
raw chat/message/contact objects into small, stable dicts, and resolve handle
addresses to contact names via a short-lived in-memory cache.
"""
from __future__ import annotations

import time
from typing import Any

# handle(normalized) -> display name, refreshed from BlueBubbles periodically.
_CONTACTS_TTL = 600.0  # seconds
_contacts: dict[str, Any] = {"map": {}, "at": 0.0}


def _norm(addr: str | None) -> str:
    """Loose key for matching handles to contacts.

    Emails: lowercased. Phone numbers: last 10 digits, so "+13035551234",
    "3035551234", and "(303) 555-1234" all match.
    """
    a = (addr or "").strip().lower()
    if not a:
        return ""
    if "@" in a:
        return a
    digits = "".join(ch for ch in a if ch.isdigit())
    return digits[-10:] if len(digits) >= 10 else digits


async def contacts_map(channel) -> dict[str, str]:
    """Return a cached {normalized handle -> name} map, refreshing on TTL.

    On a fetch error the last good map is served (stale is better than nameless).
    """
    now = time.time()
    if _contacts["map"] and now - _contacts["at"] <= _CONTACTS_TTL:
        return _contacts["map"]
    try:
        raw = await channel.list_contacts()
    except Exception:
        return _contacts["map"]
    m: dict[str, str] = {}
    for c in raw or []:
        name = _contact_name(c)
        if not name:
            continue
        for pn in c.get("phoneNumbers") or []:
            if pn.get("address"):
                m[_norm(pn["address"])] = name
        for em in c.get("emails") or []:
            if em.get("address"):
                m[_norm(em["address"])] = name
    _contacts.update(map=m, at=now)
    return m


def _contact_name(c: dict) -> str:
    return (
        c.get("displayName")
        or " ".join(x for x in [c.get("firstName"), c.get("lastName")] if x).strip()
        or c.get("nickname")
        or ""
    )


def _resolve_name(identifier: str | None, participants: list | None,
                  display_name: str | None, cmap: dict[str, str]) -> str:
    if display_name:
        return display_name
    names: list[str] = []
    for p in participants or []:
        addr = p.get("address") if isinstance(p, dict) else p
        names.append(cmap.get(_norm(addr)) or addr or "")
    names = [n for n in names if n]
    if names:
        return ", ".join(names)
    return cmap.get(_norm(identifier)) or identifier or "(unknown)"


def clean_message(m: dict) -> dict:
    handle = m.get("handle")
    return {
        "guid": m.get("guid"),
        "text": m.get("text") or "",
        "from_me": bool(m.get("isFromMe")),
        "date": m.get("dateCreated"),              # ms epoch
        "delivered": bool(m.get("isDelivered")),
        "read": m.get("dateRead") is not None,
        "handle": handle.get("address") if isinstance(handle, dict) else None,
        "reply_to": m.get("threadOriginatorGuid"),  # inline-reply target
        "effect": m.get("expressiveSendStyleId"),
        "reaction_to": m.get("associatedMessageGuid"),   # set when this is a tapback
        "reaction_type": m.get("associatedMessageType"),
        "has_attachments": bool(m.get("attachments")),
    }


def clean_conversation(chat: dict, cmap: dict[str, str]) -> dict:
    participants = [p.get("address") for p in (chat.get("participants") or []) if p.get("address")]
    last = chat.get("lastMessage")
    last_clean = None
    if last:
        lc = clean_message(last)
        last_clean = {
            "text": lc["text"],
            "from_me": lc["from_me"],
            "date": lc["date"],
            "is_reaction": lc["reaction_type"] is not None,
        }
    return {
        "guid": chat.get("guid"),
        "name": _resolve_name(chat.get("chatIdentifier"), chat.get("participants"),
                              chat.get("displayName"), cmap),
        "identifier": chat.get("chatIdentifier"),
        "is_group": chat.get("style") == 43 or len(participants) > 1,
        "participants": participants,
        "archived": bool(chat.get("isArchived")),
        "filtered": bool(chat.get("isFiltered")),   # SMS spam / filtered
        "last_message": last_clean,
        "last_date": last.get("dateCreated") if last else None,
        "unread": bool(last) and not last.get("isFromMe") and last.get("dateRead") is None,
    }


def clean_contact(c: dict) -> dict:
    handles = [pn["address"] for pn in (c.get("phoneNumbers") or []) if pn.get("address")]
    handles += [em["address"] for em in (c.get("emails") or []) if em.get("address")]
    return {
        "id": c.get("id"),
        "name": _contact_name(c),
        "handles": handles,
        "avatar": c.get("avatar") or None,
    }
