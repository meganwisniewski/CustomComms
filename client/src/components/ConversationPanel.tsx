import { Fragment, useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { lastLine } from "../lib/format";
import { htmlToMarkdown, isBlank } from "../lib/richtext";
import { Avatar } from "./Avatar";

// The six iMessage tapbacks, in the order iOS shows them.
const REACTIONS: { name: string; emoji: string }[] = [
  { name: "love", emoji: "❤️" },
  { name: "like", emoji: "👍" },
  { name: "dislike", emoji: "👎" },
  { name: "laugh", emoji: "😂" },
  { name: "emphasize", emoji: "‼️" },
  { name: "question", emoji: "❓" },
];

export function ConversationPanel() {
  const id = useStore((s) => s.activeContactId);
  const contact = useStore((s) => s.contacts.find((x) => x.id === id));
  const openContact = useStore((s) => s.openContact);
  const loadThread = useStore((s) => s.loadThread);
  const sendMessage = useStore((s) => s.sendMessage);
  const reactTo = useStore((s) => s.reactTo);
  const pendingDraft = useStore((s) => s.pendingDraft);
  const setPendingDraft = useStore((s) => s.setPendingDraft);
  const close = () => openContact(null);

  // Which bubble's tapback/reply menu is open (by message guid).
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // The message we're replying to, if any.
  const [replyTo, setReplyTo] = useState<{ guid: string; text: string } | null>(null);
  // Composer empty? (drives placeholder + send-button enablement)
  const [empty, setEmpty] = useState(true);
  const threadRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const clearEditor = () => {
    if (editorRef.current) editorRef.current.innerHTML = "";
    setEmpty(true);
  };

  // Load the real thread on open, then poll for new messages while it's open.
  useEffect(() => {
    if (!id) return;
    clearEditor();
    setMenuFor(null);
    setReplyTo(null);
    // If opened with a suggested reply, prefill the composer with it (once).
    if (pendingDraft && editorRef.current) {
      editorRef.current.innerText = pendingDraft;
      setEmpty(false);
      setPendingDraft(null);
    }
    loadThread(id);
    const iv = setInterval(() => loadThread(id), 5000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (menuFor) setMenuFor(null);
        else if (replyTo) setReplyTo(null);
        else close();
      }
    };
    if (id) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, menuFor, replyTo]);

  const msgs = contact?.thread ?? [];
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [id, msgs.length]);

  if (!id || !contact) return null;
  const c = contact;
  const ll = lastLine(c);

  const send = () => {
    const el = editorRef.current;
    if (!el || isBlank(el.innerHTML)) return;
    const plain = el.innerText.trim(); // what iMessage delivers
    if (!plain) return;
    const rich = htmlToMarkdown(el.innerHTML); // Markdown, for channels that carry it
    sendMessage(c.id, plain, replyTo?.guid, rich);
    clearEditor();
    setReplyTo(null);
  };

  // Apply an inline format to the current selection. styleWithCSS=false makes
  // execCommand emit tags (<b>, <i>, …) rather than inline styles, which our
  // Markdown serializer expects.
  const fmt = (cmd: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    try {
      document.execCommand("styleWithCSS", false, "false");
    } catch {
      /* not all browsers expose styleWithCSS; tags are still the default */
    }
    document.execCommand(cmd);
    setEmpty(isBlank(el.innerHTML));
  };

  const tapback = (guid: string, reaction: string) => {
    reactTo(c.id, guid, reaction);
    setMenuFor(null);
  };

  const startReply = (guid: string, text: string) => {
    setReplyTo({ guid, text });
    setMenuFor(null);
    editorRef.current?.focus();
  };

  const FORMATS: { cmd: string; label: string; title: string }[] = [
    { cmd: "bold", label: "B", title: "Bold (⌘B)" },
    { cmd: "italic", label: "I", title: "Italic (⌘I)" },
    { cmd: "underline", label: "U", title: "Underline (⌘U)" },
    { cmd: "strikeThrough", label: "S", title: "Strikethrough" },
  ];

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
            const side = m.from === "me" ? "me" : "them";
            const canAct = !!m.guid; // optimistic / un-synced bubbles have no guid yet
            return (
              <Fragment key={i}>
                {showDiv && m.time && <div className="daydiv">{m.time}</div>}
                <div
                  className={"bub " + side + (canAct ? " actionable" : "")}
                  onClick={() => canAct && setMenuFor((g) => (g === m.guid ? null : m.guid!))}
                  title={canAct ? "Tap to react or reply" : undefined}
                >
                  {m.text}
                  {m.reactions?.length ? <span className="tapbacks">{m.reactions.join("")}</span> : null}
                </div>
                {menuFor === m.guid && canAct && (
                  <div className={"msgactions " + side}>
                    {REACTIONS.map((r) => (
                      <button key={r.name} title={r.name} onClick={() => tapback(m.guid!, r.name)}>
                        {r.emoji}
                      </button>
                    ))}
                    <button className="reply" onClick={() => startReply(m.guid!, m.text)}>
                      ↩ Reply
                    </button>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
        <div className="composer">
          {replyTo && (
            <div className="replyctx">
              <span className="rlabel">↩ Replying to</span>
              <span className="rtext">{replyTo.text || "(attachment)"}</span>
              <button onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                ✕
              </button>
            </div>
          )}
          <div className="fmtbar" role="toolbar" aria-label="Text formatting">
            {FORMATS.map((f) => (
              <button
                key={f.cmd}
                type="button"
                className={"fmt f-" + f.cmd}
                title={f.title}
                aria-label={f.title}
                // mousedown would blur the editor and drop the selection; prevent it
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => fmt(f.cmd)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="inputrow">
            <div
              ref={editorRef}
              className={"editor rich" + (empty ? " empty" : "")}
              contentEditable
              role="textbox"
              aria-multiline="true"
              aria-label="Message"
              data-ph={replyTo ? "Reply…" : "Message…"}
              suppressContentEditableWarning
              onInput={() => setEmpty(isBlank(editorRef.current?.innerHTML ?? ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button className="send" onClick={send} aria-label="Send" disabled={empty}>
              ↑
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
