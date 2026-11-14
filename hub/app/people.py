"""People service: the hub as the source-of-truth contact record.

A Person is stored as a full JSON document (so new means-of-contact can be added
without migrations), with a few denormalized columns for listing/sorting. This
layer owns id generation, timestamps, and merge-on-update semantics.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from . import db
from .schemas import Person, PersonCreate, PersonUpdate


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _save(person: Person) -> None:
    db.person_upsert(
        id=person.id,
        display_name=person.display_name,
        doc=person.model_dump_json(),
        source=person.source,
        created_at=person.created_at,
        updated_at=person.updated_at,
    )


def create(data: PersonCreate) -> Person:
    now = _now()
    person = Person(
        id=data.id or uuid.uuid4().hex,
        created_at=now,
        updated_at=now,
        **data.model_dump(exclude={"id"}),
    )
    _save(person)
    return person


def get(pid: str) -> Person | None:
    row = db.person_get(pid)
    return Person.model_validate_json(row["doc"]) if row else None


def list_all() -> list[Person]:
    return [Person.model_validate_json(r["doc"]) for r in db.person_list()]


def update(pid: str, patch: PersonUpdate) -> Person | None:
    current = get(pid)
    if current is None:
        return None
    changes = patch.model_dump(exclude_unset=True)
    updated = current.model_copy(update={**changes, "updated_at": _now()})
    _save(updated)
    return updated


def delete(pid: str) -> bool:
    return db.person_delete(pid)
