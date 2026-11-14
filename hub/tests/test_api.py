"""API-level tests: exercise the hub routes against a faked BlueBubbles channel.

Fixtures are shaped like real BlueBubbles v1.9.11 responses. Runs standalone
(no pytest needed):  python tests/test_api.py
"""
from __future__ import annotations

import json
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


def test_send_persists_rich_for_future_channels():
    # The composer sends a plain `body` (what iMessage delivers) plus a `rich`
    # Markdown version that rides along in extras for channels that can use it.
    r = client.post(
        "/messages/send",
        headers={"X-Hub-Token": "secret"},
        json={"channel": "imessage", "to": "iMessage;-;+1", "body": "hi there", "rich": "**hi** there"},
    )
    assert r.status_code == 202, r.text
    rec = client.get(f"/messages/{r.json()['id']}", headers={"X-Hub-Token": "secret"}).json()
    assert rec["body"] == "hi there"  # iMessage still gets plain text
    assert json.loads(rec["extras"])["rich"] == "**hi** there"


def test_react_queues():
    r = client.post(
        "/messages/react",
        json={"channel": "imessage", "to": "iMessage;-;+1", "target": "G1", "reaction": "love"},
        headers={"X-Hub-Token": "secret"},
    )
    assert r.status_code == 202


AUTH = {"X-Hub-Token": "secret"}


def test_people_crud_and_merge_update():
    # create with rich fields
    r = client.post("/people", headers=AUTH, json={
        "display_name": "Jane Doe",
        "tags": ["book club"],
        "socials": [{"platform": "instagram", "value": "@jane"}],
        "handles": [{"kind": "email", "value": "jane@example.com", "label": "work"}],
    })
    assert r.status_code == 201, r.text
    p = r.json()
    pid = p["id"]
    assert p["display_name"] == "Jane Doe" and p["source"] == "manual"

    # get + list
    assert client.get(f"/people/{pid}").json()["tags"] == ["book club"]
    assert any(x["id"] == pid for x in client.get("/people").json())

    # patch merges: changed fields update, untouched fields persist
    r2 = client.patch(f"/people/{pid}", headers=AUTH,
                      json={"birthday": "Mar 14", "notes": "loves hiking"})
    body = r2.json()
    assert body["birthday"] == "Mar 14" and body["notes"] == "loves hiking"
    assert body["tags"] == ["book club"], "untouched fields must survive a patch"
    assert body["socials"][0]["value"] == "@jane"
    assert body["updated_at"] >= body["created_at"]

    # writes require the token
    assert client.post("/people", json={"display_name": "x"}).status_code == 401
    assert client.patch(f"/people/{pid}", json={"notes": "x"}).status_code == 401
    assert client.delete(f"/people/{pid}").status_code == 401

    # delete
    assert client.delete(f"/people/{pid}", headers=AUTH).status_code == 204
    assert client.get(f"/people/{pid}").status_code == 404


def test_people_import_from_contacts():
    r = client.post("/people/import", headers=AUTH)
    assert r.status_code == 200, r.text
    assert r.json()["imported"] >= 1
    alex = next((p for p in client.get("/people").json() if p["display_name"] == "Alex Doe"), None)
    assert alex is not None
    assert alex["handles"][0]["value"] == "+15550000001"
    assert alex["source"] == "imported"
    # re-import is idempotent (doesn't duplicate or clobber)
    again = client.post("/people/import", headers=AUTH).json()
    assert again["imported"] == 0


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
