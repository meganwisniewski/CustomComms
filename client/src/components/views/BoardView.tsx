import { useMemo, useState } from "react";
import { normalizeBoard, useStore } from "../../store/useStore";
import { lastLine } from "../../lib/format";
import { Avatar } from "../Avatar";
import type { Contact } from "../../types";

function Tile({ c }: { c: Contact }) {
  const open = useStore((s) => s.openContact);
  const [expanded, setExpanded] = useState(false);
  const ll = lastLine(c);
  return (
    <div
      className="tile"
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", c.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => open(c.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open(c.id);
        }
      }}
    >
      <div className="top">
        <Avatar contact={c} />
        <div className="who">
          <div className="nm">{c.name}</div>
        </div>
        {c.unread && <span className="unread" />}
      </div>
      <div
        className={"snippet" + (expanded ? " expanded" : "")}
        title="Click to expand / collapse"
        onClick={(e) => {
          e.stopPropagation(); // don't open the conversation — just expand
          setExpanded((x) => !x);
        }}
      >
        {c.snippet}
      </div>
      <div className="lastline">
        <span className="arw">{ll.arrow}</span> {ll.text} <span className="t">· {ll.t}</span>
      </div>
    </div>
  );
}

export function BoardView() {
  const board = useStore((s) => s.board);
  const contacts = useStore((s) => s.contacts);
  const moveToGroup = useStore((s) => s.moveToGroup);
  const addGroup = useStore((s) => s.addGroup);
  const removeGroup = useStore((s) => s.removeGroup);
  const people = useMemo(() => contacts.filter((c) => c.lane === "people"), [contacts]);
  const byId = useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c])), [contacts]);
  const groups = useMemo(() => normalizeBoard(board, people), [board, people]);
  const [over, setOver] = useState<string | null>(null);
  const [newCat, setNewCat] = useState("");

  const add = () => {
    const n = newCat.trim();
    if (!n) return;
    addGroup(n);
    setNewCat("");
  };

  return (
    <>
      <div className="subcap">Your people, grouped into boards you control. Drag a tile to move it; add your own categories.</div>
      <div className="boards">
        {groups.map((g) => (
          <div
            key={g.name}
            className={"bgroup" + (over === g.name ? " over" : "")}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (over !== g.name) setOver(g.name);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setOver((c) => (c === g.name ? null : c));
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id) moveToGroup(id, g.name);
              setOver(null);
            }}
          >
            <div className="bhead">
              {g.name} <span className="bcount">{g.ids.length}</span>
              {groups.length > 1 && (
                <button
                  className="brm"
                  aria-label={`Remove ${g.name}`}
                  title={`Remove "${g.name}" — its people move to ${groups[groups.length - 1].name}`}
                  onClick={() => removeGroup(g.name)}
                >
                  ×
                </button>
              )}
            </div>
            <div className="bgrid">
              {g.ids.map((id) => {
                const c = byId[id];
                return c ? <Tile key={id} c={c} /> : null;
              })}
            </div>
          </div>
        ))}

        <div className="addcat">
          <input
            value={newCat}
            placeholder="New category…"
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button onClick={add} disabled={!newCat.trim()}>
            Add category
          </button>
        </div>
      </div>
    </>
  );
}
