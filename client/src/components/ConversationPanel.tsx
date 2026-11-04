import { Fragment, useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { CONTACTS_BY_ID } from "../data/sampleData";
import { lastLine } from "../lib/format";
import { Avatar } from "./Avatar";
import type { Message } from "../types";

export function ConversationPanel() {
  const id = useStore((s) => s.activeContactId);
  const openContact = useStore((s) => s.openContact);
  const close = () => openContact(null);

  const [sent, setSent] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSent([]);
    setDraft("");
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    if (id) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [id, sent]);

  if (!id) return null;
  const c = CONTACTS_BY_ID[id];
  if (!c) return null;

  const ll = lastLine(c);
  const msgs = [...c.thread, ...sent];

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    setSent((s) => [...s, { from: "me", text: t, time: "now" }]);
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
                {showDiv && <div className="daydiv">{m.time}</div>}
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
