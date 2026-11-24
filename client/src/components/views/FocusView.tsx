import { useEffect, useMemo, useState } from "react";
import { useStore } from "../../store/useStore";
import { lastLine } from "../../lib/format";
import { hub } from "../../lib/hub";
import { Avatar } from "../Avatar";

function suggestError(e: unknown): string {
  const m = String(e instanceof Error ? e.message : e);
  if (m.includes("HTTP 503"))
    return "Suggested replies aren't set up yet — add an Anthropic API key to the hub.";
  if (m.includes("HTTP 502"))
    return "Couldn't reach the draft service — check the hub's API key, then try again.";
  return "Couldn't draft a reply — try again.";
}

export function FocusView() {
  const open = useStore((s) => s.openContact);
  const openWithDraft = useStore((s) => s.openWithDraft);
  const contacts = useStore((s) => s.contacts);
  const list = useMemo(
    () => contacts.filter((c) => c.lane === "people" && c.last === "them"),
    [contacts],
  );
  const [idx, setIdx] = useState(0);
  const current = idx < list.length ? list[idx] : null;

  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [sugErr, setSugErr] = useState<string | null>(null);

  // Reset drafts whenever the focused card changes.
  useEffect(() => {
    setSuggestions([]);
    setSugErr(null);
    setSuggesting(false);
  }, [current?.id]);

  const draftReply = async () => {
    if (!current) return;
    setSuggesting(true);
    setSugErr(null);
    try {
      const r = await hub.suggest(current.id);
      setSuggestions(r.suggestions ?? []);
      if (!r.suggestions?.length) setSugErr("No suggestion came back — try again.");
    } catch (e) {
      setSugErr(suggestError(e));
    } finally {
      setSuggesting(false);
    }
  };

  const sub = (
    <div className="subcap">One at a time — no list, no scrolling. Reply, or set it down for later.</div>
  );

  if (!current) {
    return (
      <>
        {sub}
        <div className="focus">
          <div className="fdone">
            <div className="big">🌿</div>
            <h3>You're all caught up</h3>
            <p style={{ marginTop: 6, fontSize: 13 }}>Nothing waiting. Come back whenever.</p>
          </div>
        </div>
      </>
    );
  }

  const c = current;
  const ll = lastLine(c);
  const lastText = c.thread.length ? c.thread[c.thread.length - 1].text : c.snippet;
  return (
    <>
      {sub}
      <div className="focus">
        <div className="fcnt">
          {idx + 1} OF {list.length}
        </div>
        <div className="fcard">
          <Avatar contact={c} />
          <div className="fn">{c.name}</div>
          <div className="fm">"{lastText}"</div>
          <div className="fl">
            {ll.arrow} {ll.text} · {ll.t}
          </div>
        </div>

        {suggestions.length > 0 ? (
          <div className="sugbox">
            <div className="sughd">In your voice · tap to edit &amp; send</div>
            {suggestions.map((s, i) => (
              <button key={i} className="sugopt" onClick={() => openWithDraft(c.id, s)}>
                {s}
              </button>
            ))}
            <button className="suglink" onClick={draftReply} disabled={suggesting}>
              {suggesting ? "Thinking…" : "↻ Regenerate"}
            </button>
          </div>
        ) : (
          <button className="sugbtn" onClick={draftReply} disabled={suggesting}>
            {suggesting ? "Drafting…" : "✨ Suggest a reply"}
          </button>
        )}
        {sugErr && <div className="sugerr">{sugErr}</div>}

        <div className="facts">
          <button className="pri" onClick={() => open(c.id)}>
            Reply
          </button>
          <button onClick={() => setIdx((i) => i + 1)}>Later</button>
          <button onClick={() => setIdx((i) => i + 1)}>Done</button>
        </div>
        <div className="fhint">one decision, then the next.</div>
      </div>
    </>
  );
}
