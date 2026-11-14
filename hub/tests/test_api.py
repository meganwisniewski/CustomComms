"""API-level tests: exercise the hub routes against a faked BlueBubbles channel.

Fixtures are shaped like real BlueBubbles v1.9.11 responses. Runs standalone
(no pytest needed):  python tests/test_api.py
"""
from __future__ import annotations

import os
import sys
import tempfile

os.environ.setdefault("HUB_DATABASE_PATH", os.path.join(tempfile.mkdtemp(), "api.db"))
os.environ.setdefault("CHANNELS_ENABLED", "imessage")
os.environ.setdefault("BLUEBUBBLES_URL", "http://fake.local:1234")
os.environ.setdefault("BLUEBUBBLES_PASSWORD", "pw")
os.environ.setdefault("HUB_API_TOKEN", "secret")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from urllib.parse import quote  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from app import db, main  # noqa: E402
from app.channels.base import SendResult  # noqa: E402
from app.channels.registry import registry  # noqa: E402

db.init(os.environ["HUB_DATABASE_PATH"])


def _chat(guid, handle, last_ms, *, filtered=False, archived=False, group=False):
    return {
        "guid": guid,
        "style": 43 if group else 45,
        "chatIdentifier": handle,
        "isArchived": archived,
        "isFiltered": filtered,
        "displayName": "",
        "participants": [{"address": handle}],
        "lastMessage": {
            "text": "hi", "isFromMe": False, "dateCreated": last_ms, "isDelivered": True,
            "dateRead": None, "associatedMessageType": None, "associatedMessageGuid": None,
            "threadOriginatorGuid": None, "expressiveSendStyleId": None, "handle": None,
            "attachments": [],
        },
    }


def _msg(guid, ms):
    return {
        "guid": guid, "text": f"m{ms}", "isFromMe": False, "dateCreated": ms, "isDelivered": True,
        "dateRead": None, "associatedMessageType": None, "associatedMessageGuid": None,
        "threadOriginatorGuid": None, "expressiveSendStyleId": None, "handle": None, "attachments": [],
    }


CHATS = [
    _chat("iMessage;-;+15550000001", "+15550000001", 300),               # newest real
    _chat("iMessage;-;+15550000002", "+15550000002", 100),               # oldest real
    _chat("SMS;-;68805", "68805", 400, filtered=True),                   # spam (newest, excluded)
    _chat("iMessage;-;+15550000003", "+15550000003", 200, archived=True),  # archived (excluded)
]
# Intentionally out of date order (mimics iCloud sync insertion order).
THREAD = [_msg("b", 200), _msg("d", 400), _msg("a", 100), _msg("c", 300)]
CONTACTS = [{
    "phoneNumbers": [{"address": "+15550000001"}], "emails": [],
    "firstName": "Alex", "lastName": "Doe", "displayName": "Alex Doe", "nickname": "",
    "avatar": "", "id": "X:ABPerson",
}]

sent: list = []
reacted: list = []
_ch = registry.get("imessage")


async def _list_chats(limit=100, offset=0):
    return CHATS


async def _get_chat_messages(guid, limit=50, offset=0):
    return THREAD


async def _list_contacts():
    return CONTACTS


async def _send(to, body, **kw):
    sent.append((to, body, kw))
    return SendResult(ok=True, provider_id="p")


async def _react(to, selected_guid, reaction, **kw):
    reacted.append((to, selected_guid, reaction))
    return SendResult(ok=True, provider_id="p")


async def _health():
    return "ok"


_ch.list_chats = _list_chats
_ch.get_chat_messages = _get_chat_messages
_ch.list_contacts = _list_contacts
_ch.send = _send
_ch.react = _react
_ch.health = _health

client = TestClient(main.app)


def test_conversations_filter_and_sort():
    data = client.get("/conversations?limit=10").json()
    ids = [c["identifier"] for c in data]
    # spam + archived excluded; the rest sorted newest-first by last_date
    assert ids == ["+15550000001", "+15550000002"], ids
    assert data[0]["name"] == "Alex Doe", "name should resolve from contacts"


def test_conversations_include_filtered_flag():
    data = client.get("/conversations?limit=10&include_filtered=true&include_archived=true").json()
    assert any(c["filtered"] for c in data), "filtered chats appear when asked"


def test_thread_sorted_newest_first():
    guid = quote("iMessage;-;+15550000001", safe="")
    dates = [m["date"] for m in client.get(f"/conversations/{guid}/messages?limit=10").json()]
    assert dates == [400, 300, 200, 100], dates


def test_contacts_shape():
    c = client.get("/contacts").json()[0]
    assert c["name"] == "Alex Doe" and c["handles"] == ["+15550000001"]


def test_send_requires_token():
    body = {"channel": "imessage", "to": "iMessage;-;+1", "body": "hi"}
    assert client.post("/messages/send", json=body).status_code == 401
    assert client.post("/messages/send", json=body, headers={"X-Hub-Token": "secret"}).status_code == 202


def test_react_queues():
    r = client.post(
        "/messages/react",
        json={"channel": "imessage", "to": "iMessage;-;+1", "target": "G1", "reaction": "love"},
        headers={"X-Hub-Token": "secret"},
    )
    assert r.status_code == 202


if __name__ == "__main__":
    failures = 0
    for _name in sorted(n for n in dict(globals()) if n.startswith("test_")):
        try:
            globals()[_name]()
            print("ok:", _name)
        except AssertionError as exc:
            failures += 1
            print("FAIL:", _name, "->", exc)
    print("ALL API TESTS PASSED" if not failures else f"{failures} FAILURE(S)")
    sys.exit(1 if failures else 0)
