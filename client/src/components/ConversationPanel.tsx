import { Fragment, useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { lastLine } from "../lib/format";
import { Avatar } from "./Avatar";

export function ConversationPanel() {
  const id = useStore((s) => s.activeContactId);
  const contact = useStore((s) => s.contacts.find((x) => x.id === id));
  const openContact = useStore((s) => s.openContact);
  const loadThread = useStore((s) => s.loadThread);
  const sendMessage = useStore((s) => s.sendMessage);
  const close = () => openContact(null);

  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  // Load the real thread on open, then poll for new messages while it's open.
  useEffect(() => {
    if (!id) return;
    setDraft("");
    loadThread(id);
    const iv = setInterval(() => loadThread(id), 5000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    if (id) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const msgs = contact?.thread ?? [];
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [id, msgs.length]);

  if (!id || !contact) return null;
  const c = contact;
  const ll = lastLine(c);

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    sendMessage(c.id, t);
    setDraft("");
  };

  return (
    <>
      <div className="scrim" onClick={close} />
      <aside className="panel" role="dialog" aria-label={`Conversation with ${c.name}`}>
        <div className="phead">
          <Avatar contact={c} />
          <div>
            <div className="pname">{c.name}</div>
            <div className="psub">
              {ll.arrow} {ll.text} · {ll.t}
            </div>
          </div>
          <div className="pheadbtns">
            <button className="closex" onClick={close} aria-label="Close">
              ✕
            </button>
          </div>
        </div>
        <div className="thread" ref={threadRef}>
          {c.age > 14 && <div className="daydiv">last message {ll.t} ago</div>}
          {msgs.map((m, i) => {
            const showDiv = i === 0 || msgs[i - 1].time !== m.time;
            return (
              <Fragment key={i}>
                {showDiv && m.time && <div className="daydiv">{m.time}</div>}
                <div className={"bub " + (m.from === "me" ? "me" : "them")}>{m.text}</div>
              </Fragment>
            );
          })}
        </div>
        <div className="composer">
          <div className="inputrow">
            <textarea
              className="editor"
              style={{ resize: "none", fontFamily: "inherit" }}
              placeholder="Message…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button className="send" onClick={send} aria-label="Send">
              ↑
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
