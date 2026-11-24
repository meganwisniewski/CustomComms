"""Tests for the suggested-reply prompt building and parsing (no network)."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.suggest import DEFAULT_MODEL, build_user_prompt, model, parse_suggestions  # noqa: E402


def test_build_prompt_includes_samples_and_convo():
    p = build_user_prompt(
        "Alex",
        [{"from_me": False, "text": "hi"}, {"from_me": True, "text": "hey!"}],
        ["yo", "sounds good"],
    )
    assert "HOW I WRITE" in p
    assert "- yo" in p and "- sounds good" in p
    assert "Alex: hi" in p
    assert "Me: hey!" in p
    assert "Draft my reply to Alex's last message." in p


def test_build_prompt_without_samples_falls_back_to_them():
    p = build_user_prompt("", [{"from_me": False, "text": "hi"}], [])
    assert "HOW I WRITE" not in p
    assert "them: hi" in p


def test_parse_strips_bullets_quotes_dedupes_and_caps():
    text = '- "Sounds good!"\n* Sounds good!\n• On my way\nSee you soon\nSee you soon\nx1\nx2'
    out = parse_suggestions(text)
    assert out[0] == "Sounds good!"
    assert "On my way" in out
    assert out.count("Sounds good!") == 1  # quotes/bullets normalized, then deduped
    assert len(out) <= 3


def test_parse_empty_and_whitespace():
    assert parse_suggestions("") == []
    assert parse_suggestions("   \n  ") == []


def test_model_env_override():
    os.environ.pop("SUGGEST_MODEL", None)
    assert model() == DEFAULT_MODEL
    os.environ["SUGGEST_MODEL"] = "claude-sonnet-5-5"
    assert model() == "claude-sonnet-5-5"
    os.environ.pop("SUGGEST_MODEL", None)


if __name__ == "__main__":
    for _name, _fn in sorted(globals().items()):
        if _name.startswith("test_") and callable(_fn):
            _fn()
            print(f"ok: {_name}")
    print("ALL SUGGEST TESTS PASSED")
