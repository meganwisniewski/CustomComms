"""Transform tests for the client-facing read shapes (no network).

Shapes mirror real BlueBubbles v1.9.11 chat/query, chat message, and /contact
responses.

    python tests/test_convo.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import convo  # noqa: E402

CHAT = {
    "guid": "iMessage;-;+15551234567",
    "style": 45,
    "chatIdentifier": "+15551234567",
    "isArchived": False,
    "isFiltered": False,
    "displayName": "",
    "participants": [{"address": "+15551234567", "service": "iMessage", "country": "us"}],
    "lastMessage": {
        "guid": "G1", "text": "hey!", "isFromMe": False, "dateCreated": 1794532231512,
        "isDelivered": True, "dateRead": None, "associatedMessageType": None,
        "associatedMessageGuid": None, "threadOriginatorGuid": None,
        "expressiveSendStyleId": None, "handle": None, "attachments": [],
    },
}

SPAM_CHAT = {**CHAT, "guid": "SMS;-;+18444409237", "chatIdentifier": "+18444409237",
             "isFiltered": True, "participants": [{"address": "+18444409237"}],
             "lastMessage": {**CHAT["lastMessage"], "dateCreated": 1794000000000}}

CONTACT = {
    "phoneNumbers": [{"address": "+15551234567", "id": None}], "emails": [],
    "firstName": "Alex", "lastName": "Doe", "displayName": "Alex Doe", "nickname": "",
    "avatar": "", "id": "ABC:ABPerson",
}


def test():
    cmap = {convo._norm("+15551234567"): "Alex Doe"}

    conv = convo.clean_conversation(CHAT, cmap)
    assert conv["name"] == "Alex Doe", conv["name"]
    assert conv["identifier"] == "+15551234567"
    assert conv["is_group"] is False
    assert conv["last_message"]["text"] == "hey!"
    assert conv["last_message"]["is_reaction"] is False
    assert conv["unread"] is True              # inbound + unread
    assert conv["last_date"] == 1794532231512
    assert conv["filtered"] is False

    # Unknown handle falls back to the raw identifier, not a crash.
    conv2 = convo.clean_conversation({**CHAT, "participants": [{"address": "+19998887777"}]}, cmap)
    assert conv2["name"] == "+19998887777", conv2["name"]

    # Phone normalization matches across +1 / country code.
    cmap2 = {convo._norm("3035551234"): "Local Friend"}
    conv3 = convo.clean_conversation(
        {**CHAT, "chatIdentifier": "+13035551234", "participants": [{"address": "+13035551234"}]},
        cmap2)
    assert conv3["name"] == "Local Friend", conv3["name"]

    c = convo.clean_contact(CONTACT)
    assert c["name"] == "Alex Doe" and c["handles"] == ["+15551234567"], c

    m = convo.clean_message(CHAT["lastMessage"])
    assert m["from_me"] is False and m["read"] is False and m["text"] == "hey!"
    assert m["has_attachments"] is False

    # Tapback message is flagged via reaction fields.
    rm = convo.clean_message({**CHAT["lastMessage"], "associatedMessageType": 2000,
                              "associatedMessageGuid": "p:0/G1"})
    assert rm["reaction_type"] == 2000 and rm["reaction_to"] == "p:0/G1"

    print("ALL CONVO TRANSFORM TESTS PASSED")


if __name__ == "__main__":
    test()
