import { useMemo, useState } from "react";
import { normalizeBoard, useStore } from "../../store/useStore";
import { lastLine } from "../../lib/format";
import { Avatar } from "../Avatar";
import type { Contact } from "../../types";

function Tile({ c }: { c: Contact }) {
  const open = useStore((s) => s.openContact);
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
      <div className="snippet">{c.snippet}</div>
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
  const people = useMemo(() => contacts.filter((c) => c.lane === "people"), [contacts]);
  const byId = useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c])), [contacts]);
  const groups = useMemo(() => normalizeBoard(board, people), [board, people]);
  const [over, setOver] = useState<string | null>(null);

  return (
    <>
      <div className="subcap">Your people, grouped into boards you control. Drag a tile to move it between boards.</div>
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
              // Only clear when the pointer actually leaves this group's box.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((c) => (c === g.name ? null : c));
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
            </div>
            <div className="bgrid">
              {g.ids.map((id) => {
                const c = byId[id];
                return c ? <Tile key={id} c={c} /> : null;
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
